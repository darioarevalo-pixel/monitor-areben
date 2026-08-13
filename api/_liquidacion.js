// Liquidación — tablas `liquidaciones` y `liquidacion_items` (ver sql/migrate-liquidacion.sql).
//
//   GET  ?recurso=liquidacion&store=bdi|zattia            → las campañas, con sus conteos
//   GET  ?recurso=liquidacion&store=…&liq=<id>            → los ítems de una campaña
//   GET  ?recurso=liquidacion&store=…&liq=<id>&solo=pids  → qué pid ya está y en qué estado
//   POST { recurso:'liquidacion', store, action:'crear',       campania:{id,nombre,desde,hasta,nota} }
//   POST { recurso:'liquidacion', store, action:'renombrar',   id, nombre?, desde?, hasta?, nota? }
//   POST { recurso:'liquidacion', store, action:'estado',      id, estado }
//   POST { recurso:'liquidacion', store, action:'sumar-items', id, items:[…] }
//   POST { recurso:'liquidacion', store, action:'guardar-item',id, item }
//   POST { recurso:'liquidacion', store, action:'estado-item', id, pid, estado }
//   POST { recurso:'liquidacion', store, action:'quitar-item', id, pid }
//   POST { recurso:'liquidacion', store, action:'borrar',      id }
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12 funciones
// por deploy y cada archivo de ruta cuenta una; hay 9 usadas y un archivo nuevo en `api/` frena
// todos los deploys **sin error visible**.
//
// ⚠️ **La lista de campañas NO baja los ítems.** Los conteos se arman con un `select` de dos
// columnas sobre `liquidacion_items` y se agrupan acá. Una campaña de cuarenta productos son
// cuarenta fotos congeladas con ventas, stock y costo: bajarlas todas para dibujar cinco renglones
// sería pagar el payload entero para mostrar un número.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, puedeSub, puedeVer } from '../lib/permisos.core.js';

function cfgFor(store) {
  if (store === 'zattia') {
    return {
      url: process.env.ZATTIA_SUPABASE_URL,
      key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
    };
  }
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS_CAMPANIA = ['borrador', 'en_curso', 'aplicada', 'cerrada'];
const ESTADOS_ITEM = ['pendiente', 'definido', 'confirmado', 'descartado', 'aplicado'];

// El tope de un "Mandar a liquidación". No es capricho: son N inserts en un request, y esta es la
// primera acción del módulo con costo O(N). Con la tabla de Análisis paginada de a 50, mandar 200
// productos de una es raro; el cartel lo dice en vez de recortar en silencio.
const TOPE_SUMAR = 200;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txtOrNull = (v) => (v == null || v === '' ? null : String(v));

// ── Escribirle el precio a Gestión Nube ───────────────────────────────────────────────────────────
//
// El precio de liquidación rige en el local Y online, y **la conexión es GN → TN**: se escribe en
// Gestión Nube y GN lo propaga a Tienda Nube. Escribirlo derecho en TN es ir contra la corriente
// —el sync de GN lo pisa— aunque el token de TN pueda hacerlo.
const GN_BASE = 'https://www.gestionnube.com/api/v1';
const GN_TOKENS = { bdi: process.env.GN_TOKEN, zattia: process.env.GN_TOKEN_ZATTIA };

// Cuántos productos por viaje. Lo fija el tope de GN, no el gusto: son 2 consultas por segundo, y
// con la pausa de 1200 ms cinco tardan ~7 s, que entra cómodo en el tiempo de una función. Espejo
// de `TOPE_APLICAR` en `lib/liquidacion/core.ts`.
const TOPE_APLICAR = 5;

// El masivo de precios no toca Gestión Nube —sólo escribe en nuestra base—, así que el tope no lo
// fija el rate limit sino el tamaño del payload: 50 ítems con su foto congelada.
const TOPE_MASIVO = 50;

// 🔑 **Dos topes distintos, y el que muerde es el segundo.** GN limita 60 consultas por minuto *y*
// 2 por segundo, contadas por segundo de reloj: con 600 ms de pausa el PATCH rebota `429`. Van 1200.
const PAUSA_GN = 1200;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `fetch` a GN que respeta el rate limit.
 *
 * 🔑 **Se le hace caso al `retry-after` que manda GN**, que es correcto (medido: dice 15 y el
 * `x-ratelimit-reset` cae 15 s después). Esperar de más es peor que esperar de menos: un backoff de
 * 62 s se come tres ventanas enteras y encuentra la cuota igual de vacía, porque el tope está
 * **compartido con los otros sistemas de la casa** y puede estar en `remaining: 0` sin que nosotros
 * hayamos consultado nada.
 */
async function gnFetch(url, opts, tries = 3) {
  let last;
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok || (r.status !== 429 && r.status < 500)) return r;
      last = r;
      if (a < tries) {
        const esperar = Math.min(Math.max(Number(r.headers.get('retry-after')) || 15, 5), 30);
        await dormir(esperar * 1000);
        continue;
      }
      return r;
    } catch (e) { last = e; if (a < tries) { await dormir(900 * a); continue; } throw e; }
  }
  return last;
}

/** La fila de la base → la campaña que espera el cliente. `conteo` lo pega el llamador. */
function aCampania(row, conteo) {
  const d = row.datos || {};
  return {
    id: row.id,
    nombre: row.nombre,
    estado: row.estado,
    desde: d.desde || null,
    hasta: d.hasta || null,
    nota: d.nota || null,
    creadoPor: d.creadoPor || null,
    creado: d.creado || null,
    conteo: conteo || { total: 0, pendientes: 0, definidos: 0, confirmados: 0, descartados: 0, aplicados: 0 },
  };
}

/**
 * Normaliza un ítem que llega del cliente.
 *
 * ⛔ **Es lista blanca a propósito.** Guardar `req.body.item` tal cual deja que el navegador
 * escriba cualquier cosa en `datos jsonb` —incluido un `estado` que la pantalla nunca muestra— y
 * hace imposible saber qué hay adentro dentro de seis meses. Un campo nuevo se agrega acá o **no
 * viaja**, y eso se nota al primer intento en vez de perderse en silencio.
 */
function itemDelBody(raw) {
  if (!raw || !raw.pid) return null;
  const f = raw.foto || {};
  const d = raw.decision || {};
  const a = raw.aplicacion || {};
  const r = raw.revision || {};
  const estado = ESTADOS_ITEM.includes(raw.estado) ? raw.estado : 'pendiente';
  return {
    pid: String(raw.pid),
    estado,
    foto: {
      nombre: String(f.nombre || ''),
      sku: txtOrNull(f.sku),
      costo: num(f.costo),
      sinCosto: !!f.sinCosto,
      precioNormal: num(f.precioNormal),
      promoPrevia: f.promoPrevia == null ? null : num(f.promoPrevia),
      stock: num(f.stock),
      ventas7: num(f.ventas7),
      ventas30: num(f.ventas30),
      ventas90: num(f.ventas90),
      vidaUtil: f.vidaUtil == null ? null : num(f.vidaUtil),
      ultimaVenta: txtOrNull(f.ultimaVenta),
      diasSinVender: num(f.diasSinVender),
      imagen: txtOrNull(f.imagen),
    },
    decision: {
      precioSale: d.precioSale == null ? null : num(d.precioSale),
      pctDesc: d.pctDesc == null ? null : num(d.pctDesc),
      markup: d.markup == null ? null : num(d.markup),
      margen: d.margen == null ? null : num(d.margen),
      nota: txtOrNull(d.nota),
      porQuien: txtOrNull(d.porQuien),
      cuando: d.cuando == null ? null : num(d.cuando),
    },
    revision: {
      porQuien: txtOrNull(r.porQuien),
      cuando: r.cuando == null ? null : num(r.cuando),
      objecion: txtOrNull(r.objecion),
      precioAnterior: r.precioAnterior == null ? null : num(r.precioAnterior),
    },
    aplicacion: {
      aplicadoEn: a.aplicadoEn == null ? null : num(a.aplicadoEn),
      precioEscrito: a.precioEscrito == null ? null : num(a.precioEscrito),
      variantesEscritas: a.variantesEscritas == null ? null : num(a.variantesEscritas),
      categoriaSaleAgregada: !!a.categoriaSaleAgregada,
    },
  };
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const b = req.method === 'POST' ? (req.body || {}) : {};
  const store = String((req.method === 'POST' ? b.store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // El chequeo vive acá arriba y no se copia adentro de ningún `if`: duplicarlo es lo que dejó al
  // equipo sin ver el padrón de Canjes. `liquidacion.aplicar` es aparte y lo mira la tanda 3.
  if (!puedeVer(perfil, store, 'liquidacion')) {
    return res.status(403).json({ error: 'No tenés acceso a Liquidación en esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  const yo = perfil.name || null;
  const ahora = new Date().toISOString();
  const puede = { aplicar: puedeSub(perfil, store, 'liquidacion', 'aplicar'), admin: esAdmin(perfil) };

  try {
    if (req.method === 'GET') {
      const liq = String(req.query.liq || '');

      // Análisis pregunta "de estos productos, ¿cuáles ya mandé a esta campaña?". La respuesta son
      // dos columnas por ítem, no la foto congelada entera: la tabla de productos sólo necesita
      // atenuar la fila y decir en qué estado quedó. Mismo criterio que los conteos de acá abajo.
      if (liq && String(req.query.solo || '') === 'pids') {
        const [c, i] = await Promise.all([
          supabase.from('liquidaciones').select('id, nombre, estado')
            .eq('store', store).eq('id', liq).maybeSingle(),
          supabase.from('liquidacion_items').select('pid, estado').eq('store', store).eq('liq_id', liq),
        ]);
        if (c.error) throw new Error(c.error.message);
        if (i.error) throw new Error(i.error.message);
        if (!c.data) return res.status(404).json({ error: 'La campaña no existe.' });
        const pids = {};
        for (const it of i.data || []) pids[it.pid] = it.estado;
        return res.status(200).json({ ok: true, campania: c.data, pids, puede });
      }

      if (liq) {
        const { data, error } = await supabase.from('liquidacion_items')
          .select('datos').eq('store', store).eq('liq_id', liq);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, items: (data || []).map((r) => r.datos), puede });
      }

      const [c, i] = await Promise.all([
        supabase.from('liquidaciones').select('id, nombre, estado, datos')
          .eq('store', store).order('created_at', { ascending: false }),
        supabase.from('liquidacion_items').select('liq_id, estado').eq('store', store),
      ]);
      if (c.error) throw new Error(c.error.message);
      if (i.error) throw new Error(i.error.message);

      const conteos = {};
      for (const it of i.data || []) {
        const k = conteos[it.liq_id] || (conteos[it.liq_id] = { total: 0, pendientes: 0, definidos: 0, confirmados: 0, descartados: 0, aplicados: 0 });
        k.total += 1;
        if (it.estado === 'pendiente') k.pendientes += 1;
        else if (it.estado === 'definido') k.definidos += 1;
        else if (it.estado === 'confirmado') k.confirmados += 1;
        else if (it.estado === 'descartado') k.descartados += 1;
        else if (it.estado === 'aplicado') k.aplicados += 1;
      }

      return res.status(200).json({
        ok: true,
        campanias: (c.data || []).map((r) => aCampania(r, conteos[r.id])),
        puede,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    // ── Crear una campaña. ─────────────────────────────────────────────────────────────────────
    if (b.action === 'crear') {
      const c = b.campania || {};
      const id = String(c.id || '');
      const nombre = String(c.nombre || '').trim();
      if (!id) return res.status(400).json({ error: 'falta el id de la campaña' });
      if (!nombre) return res.status(400).json({ error: 'la campaña necesita un nombre' });
      for (const [k, v] of [['desde', c.desde], ['hasta', c.hasta]]) {
        if (v && !ES_FECHA.test(String(v))) return res.status(400).json({ error: `"${k}" va como YYYY-MM-DD` });
      }
      // Al revés no es un detalle: con las fechas dadas vuelta, la campaña nunca está vigente y el
      // día que la tanda 3 las mande a GN como vigencia, el precio no toma nunca.
      if (c.desde && c.hasta && String(c.hasta) < String(c.desde)) {
        return res.status(400).json({ error: 'la fecha de fin es anterior a la de inicio' });
      }

      const datos = {
        desde: c.desde ? String(c.desde) : null,
        hasta: c.hasta ? String(c.hasta) : null,
        nota: txtOrNull(c.nota),
        creadoPor: yo,
        creado: Date.now(),
      };
      const { error } = await supabase.from('liquidaciones')
        .insert([{ id, store, nombre, estado: 'borrador', datos, updated_at: ahora }]);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, campania: aCampania({ id, nombre, estado: 'borrador', datos }) });
    }

    // A partir de acá todo pide id de campaña. Se valida una sola vez.
    const id = String(b.id || '');
    if (!id) return res.status(400).json({ error: 'falta el id de la campaña' });

    // ── Cambiar nombre, fechas o nota. ─────────────────────────────────────────────────────────
    if (b.action === 'renombrar') {
      const { data: previo, error: e0 } = await supabase.from('liquidaciones')
        .select('nombre, estado, datos').eq('store', store).eq('id', id).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!previo) return res.status(404).json({ error: 'esa campaña no existe' });

      const nombre = b.nombre === undefined ? previo.nombre : String(b.nombre || '').trim();
      if (!nombre) return res.status(400).json({ error: 'la campaña necesita un nombre' });
      const d = previo.datos || {};
      const desde = b.desde === undefined ? d.desde || null : (b.desde ? String(b.desde) : null);
      const hasta = b.hasta === undefined ? d.hasta || null : (b.hasta ? String(b.hasta) : null);
      for (const [k, v] of [['desde', desde], ['hasta', hasta]]) {
        if (v && !ES_FECHA.test(v)) return res.status(400).json({ error: `"${k}" va como YYYY-MM-DD` });
      }
      if (desde && hasta && hasta < desde) return res.status(400).json({ error: 'la fecha de fin es anterior a la de inicio' });

      const datos = { ...d, desde, hasta, nota: b.nota === undefined ? d.nota || null : txtOrNull(b.nota) };
      const { error } = await supabase.from('liquidaciones')
        .update({ nombre, datos, updated_at: ahora }).eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, campania: aCampania({ id, nombre, estado: previo.estado, datos }) });
    }

    // ── Mover el estado de la campaña. ─────────────────────────────────────────────────────────
    if (b.action === 'estado') {
      const estado = String(b.estado || '');
      if (!ESTADOS_CAMPANIA.includes(estado)) {
        return res.status(400).json({ error: `estado inválido (usá ${ESTADOS_CAMPANIA.join(', ')})` });
      }
      // 🔑 **`aplicada` la marca una persona, y es un cambio de criterio respecto de la tanda 1.**
      // Nació rechazada acá: la iba a poner el aplicador al terminar de escribir en Gestión Nube, y
      // marcarla a mano habría dicho que los precios están puestos cuando no lo están. Pero ese
      // aplicador no existe — `PATCH /api/v1/productos/{id}` contesta 403 «Invalid ability provided»
      // con el token del Monitor, así que los precios se cargan a mano. Si nadie más lo va a
      // escribir, el único que puede decirlo es quien lo cargó.
      //
      // Lo que sostiene la honestidad del dato ya no es esta guarda sino la pestaña Resultado, que
      // contrasta la marca contra `venta_detalles.unit_price`: si se vendió a precio de lista, la
      // pantalla lo dice aunque la campaña figure aplicada. Por eso pide el sub-permiso `aplicar` —
      // es una afirmación sobre Gestión Nube, no un rótulo cosmético.
      if (estado === 'aplicada' && !puede.aplicar) {
        return res.status(403).json({ error: 'Marcar los precios como cargados pide el permiso «Puede escribir los precios en Gestión Nube».' });
      }
      // 🔑 **La revisión frena acá, no sólo en el botón.** Deshabilitar el botón es una comodidad;
      // la puerta tiene que estar del lado del servidor o alcanza con recargar en otro estado para
      // saltearla. Es una consulta de una columna y sólo en esta acción, que se aprieta una vez por
      // campaña. Los objetados también son `definido`: siguen sin resolverse.
      if (estado === 'aplicada') {
        const { data: sinRevisar, error: e0 } = await supabase.from('liquidacion_items')
          .select('pid').eq('store', store).eq('liq_id', id).eq('estado', 'definido');
        if (e0) throw new Error(e0.message);
        const n = (sinRevisar || []).length;
        if (n > 0) {
          return res.status(400).json({
            error: `Faltan revisar ${n} ${n === 1 ? 'precio' : 'precios'}. Miralos en la pestaña Revisión antes de marcarla como cargada.`,
          });
        }
      }
      const { error } = await supabase.from('liquidaciones')
        .update({ estado, updated_at: ahora }).eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Sumar productos (desde Análisis). ──────────────────────────────────────────────────────
    //
    // Los que ya están **no se pisan**: la selección de Análisis sobrevive a filtros y páginas, así
    // que mandar dos veces el mismo producto es lo normal, y pisarlo le borraría el precio que
    // alguien ya decidió. Por eso se leen los pid existentes y se insertan sólo los nuevos, en vez
    // de un upsert.
    if (b.action === 'sumar-items') {
      const crudos = Array.isArray(b.items) ? b.items : [];
      if (!crudos.length) return res.status(400).json({ error: 'no vino ningún producto' });
      if (crudos.length > TOPE_SUMAR) {
        return res.status(400).json({ error: `Son ${crudos.length} productos y el tope por vez es ${TOPE_SUMAR}. Mandalos en dos tandas.` });
      }
      const { data: existe, error: e0 } = await supabase.from('liquidaciones')
        .select('id').eq('store', store).eq('id', id).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!existe) return res.status(404).json({ error: 'esa campaña no existe' });

      const items = crudos.map(itemDelBody).filter(Boolean);
      if (!items.length) return res.status(400).json({ error: 'ninguno de los productos traía id' });

      const { data: ya, error: e1 } = await supabase.from('liquidacion_items')
        .select('pid').eq('store', store).eq('liq_id', id);
      if (e1) throw new Error(e1.message);
      const tengo = new Set((ya || []).map((r) => r.pid));

      // Un mismo pid repetido dentro del propio pedido rompería el insert por PK duplicada.
      const nuevos = [];
      for (const i of items) {
        if (tengo.has(i.pid)) continue;
        tengo.add(i.pid);
        nuevos.push(i);
      }

      if (nuevos.length) {
        const { error } = await supabase.from('liquidacion_items').insert(
          nuevos.map((i) => ({ liq_id: id, store, pid: i.pid, estado: i.estado, datos: i, updated_at: ahora })),
        );
        if (error) throw new Error(error.message);
      }
      return res.status(200).json({ ok: true, sumados: nuevos.length, yaEstaban: items.length - nuevos.length });
    }

    // ── Guardar un ítem (cada "Definir" toca UNA fila). ────────────────────────────────────────
    if (b.action === 'guardar-item') {
      const item = itemDelBody(b.item);
      if (!item) return res.status(400).json({ error: 'falta el producto (o no tiene id)' });
      // `aplicado` lo escribe el aplicador contra Gestión Nube, nunca la pantalla: que un ítem diga
      // que su precio está puesto sin que nadie lo haya escrito es la mentira más cara del módulo.
      if (item.estado === 'aplicado') {
        return res.status(400).json({ error: 'Un producto pasa a "aplicado" solo, cuando se le escribe el precio.' });
      }
      // 🔴 **`confirmado` NO entra por acá, y es la guarda que sostiene toda la revisión.** Este
      // handler lo puede llamar cualquiera con acceso a la sección; si el estado viajara en el body,
      // el que pone el precio se confirma a sí mismo y la segunda mirada deja de existir sin que
      // nada falle. Se confirma por `action:'revisar'`, que pide admin.
      if (item.estado === 'confirmado') {
        return res.status(400).json({ error: 'Confirmar un precio va por la pestaña Revisión.' });
      }
      const { error } = await supabase.from('liquidacion_items').upsert(
        [{ liq_id: id, store, pid: item.pid, estado: item.estado, datos: item, updated_at: ahora }],
        { onConflict: 'store,liq_id,pid' },
      );
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, item });
    }

    // ── Sólo el estado de un ítem (descartar, volver a la pila). ───────────────────────────────
    if (b.action === 'estado-item') {
      const pid = String(b.pid || '');
      const estado = String(b.estado || '');
      if (!pid) return res.status(400).json({ error: 'falta el producto' });
      // `aplicado` y `confirmado` no se ponen a mano desde acá: el primero lo escribe el aplicador,
      // el segundo va por `action:'revisar'` porque pide admin (ver la guarda de `guardar-item`).
      const A_MANO = ESTADOS_ITEM.filter((e) => e !== 'aplicado' && e !== 'confirmado');
      if (!A_MANO.includes(estado)) {
        return res.status(400).json({ error: `estado inválido (usá ${A_MANO.join(', ')})` });
      }
      const { data: previo, error: e0 } = await supabase.from('liquidacion_items')
        .select('datos').eq('store', store).eq('liq_id', id).eq('pid', pid).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!previo) return res.status(404).json({ error: 'ese producto no está en la campaña' });

      const datos = { ...previo.datos, estado };
      const { error } = await supabase.from('liquidacion_items')
        .update({ estado, datos, updated_at: ahora }).eq('store', store).eq('liq_id', id).eq('pid', pid);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── La segunda mirada: confirmar u objetar un precio. Sólo admin. ──────────────────────────
    //
    // Va aparte de `guardar-item` justamente por el permiso: aquel lo puede llamar cualquiera con
    // acceso a la sección, y si `confirmado` pudiera viajar en ese body, quien pone el precio se
    // confirmaría a sí mismo. El ítem llega armado por `confirmarItem`/`objetarItem` (mismo patrón
    // que el resto del módulo: la lógica pura vive en `lib/liquidacion/core.ts` y se testea sola).
    if (b.action === 'revisar') {
      if (!puede.admin) {
        return res.status(403).json({ error: 'Confirmar u objetar un precio lo puede hacer un admin.' });
      }
      const item = itemDelBody(b.item);
      if (!item) return res.status(400).json({ error: 'falta el producto (o no tiene id)' });
      if (item.estado !== 'confirmado' && item.estado !== 'definido') {
        return res.status(400).json({ error: 'una revisión deja el producto en "confirmado" o en "definido"' });
      }
      // Objetar sin motivo es lo mismo que no contestar: el que puso el precio ve que volvió y no
      // sabe por qué. El cliente lo exige y acá se vuelve a exigir, que es donde no se puede saltear.
      if (item.estado === 'definido' && !item.revision.objecion) {
        return res.status(400).json({ error: 'devolver un precio pide un motivo' });
      }
      const { data: previo, error: e0 } = await supabase.from('liquidacion_items')
        .select('pid').eq('store', store).eq('liq_id', id).eq('pid', item.pid).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!previo) return res.status(404).json({ error: 'ese producto no está en la campaña' });

      const { error } = await supabase.from('liquidacion_items')
        .update({ estado: item.estado, datos: item, updated_at: ahora })
        .eq('store', store).eq('liq_id', id).eq('pid', item.pid);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, item });
    }

    // ── Sacar un producto de la campaña. ⚠️ Distinto de descartarlo. ───────────────────────────
    if (b.action === 'quitar-item') {
      const pid = String(b.pid || '');
      if (!pid) return res.status(400).json({ error: 'falta el producto' });
      const { error } = await supabase.from('liquidacion_items')
        .delete().eq('store', store).eq('liq_id', id).eq('pid', pid);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Escribir (o borrar) el precio de sale en Gestión Nube. ─────────────────────────────────
    //
    // 🔑 **El cliente manda pids, no precios.** El precio se relee de la base acá adentro: uno que
    // viaje desde el navegador es un precio que se puede alterar, y este handler escribe en la
    // tienda de verdad. Por lo mismo sólo entran los `confirmado` — los que pasaron por la segunda
    // mirada— y el estado se pone acá, no lo dice el cliente.
    //
    // 🔑 **Va de a cinco y el bucle vive en el cliente.** Una campaña de 260 productos son ~6
    // minutos contra el tope de GN: no entra en el tiempo de una función. De paso se gana la
    // reanudación —lo aplicado sale de la lista— y una barra de progreso en vez de una espera muda.
    // ── Cambiarle el precio a muchos ítems de una. ─────────────────────────────────────────────
    //
    // 🔑 **Es `guardar-item` de a muchos, y por eso el precio SÍ viene del cliente** — al revés que
    // en `aplicar`. La diferencia no es de confianza sino de destino: acá se guarda una decisión en
    // nuestra base (lo mismo que hace cada "Definir"), allá se le escribe a la tienda. Además el
    // redondeo a 90 vive en `lib/comisiones/core.ts`, que este handler no puede importar (es TS), y
    // copiarlo acá sería tener dos reglas de plata que pueden discrepar.
    //
    // Los ítems entran por `itemDelBody`, la misma lista blanca de siempre: un campo que no esté ahí
    // no viaja.
    if (b.action === 'decidir-masivo') {
      const crudos = Array.isArray(b.items) ? b.items : [];
      if (!crudos.length) return res.status(400).json({ error: 'no vino ningún producto' });
      if (crudos.length > TOPE_MASIVO) {
        return res.status(400).json({ error: `Son ${crudos.length} y el tope por vez es ${TOPE_MASIVO}.` });
      }
      const items = crudos.map(itemDelBody).filter(Boolean);
      if (!items.length) return res.status(400).json({ error: 'ningún producto válido' });
      const ahora = new Date().toISOString();
      const { error } = await supabase.from('liquidacion_items').upsert(
        items.map((i) => ({ liq_id: id, store, pid: i.pid, estado: i.estado, datos: i, updated_at: ahora })),
        { onConflict: 'store,liq_id,pid' },
      );
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, guardados: items.length });
    }

    if (b.action === 'aplicar') {
      const modo = b.modo === 'sacar' ? 'sacar' : 'poner';
      // A dónde vuelve el precio al sacar. `lista` le saca la oferta; `previa` le devuelve la que
      // tenía cuando entró a la campaña (44 de los 261 de agosto ya estaban en oferta, y dejarlos a
      // precio de lista les subiría el precio MÁS de lo que estaba antes del sale).
      const destino = b.destino === 'previa' ? 'previa' : 'lista';
      // Es una escritura sobre precios en producción: el mismo permiso que marcar la campaña como
      // cargada. La puerta va en el handler porque deshabilitar el botón no impide nada.
      if (!puede.aplicar) {
        return res.status(403).json({ error: 'Escribir los precios en Gestión Nube pide el permiso «Puede escribir los precios en Gestión Nube».' });
      }
      const token = GN_TOKENS[store];
      if (!token) return res.status(500).json({ error: `Falta el token de Gestión Nube de ${store} en el servidor.` });

      const pids = (Array.isArray(b.pids) ? b.pids : []).map(String).filter(Boolean);
      if (!pids.length) return res.status(400).json({ error: 'no vino ningún producto' });
      if (pids.length > TOPE_APLICAR) {
        return res.status(400).json({ error: `Son ${pids.length} productos y el tope por vez es ${TOPE_APLICAR}.` });
      }

      const { data: filas, error: e0 } = await supabase.from('liquidacion_items')
        .select('pid, estado, datos').eq('store', store).eq('liq_id', id).in('pid', pids);
      if (e0) throw new Error(e0.message);

      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
      const ahoraMs = Date.now();
      const resultados = [];

      for (const pid of pids) {
        const fila = (filas || []).find((f) => String(f.pid) === pid);
        if (!fila) { resultados.push({ pid, ok: false, error: 'no está en la campaña' }); continue; }
        const item = itemDelBody({ ...(fila.datos || {}), pid, estado: fila.estado });
        const precio = item.decision.precioSale;

        // El estado que corresponde a cada modo. `aplicado` quiere decir "su precio está puesto en
        // GN **ahora**": por eso sacar la oferta lo devuelve a `confirmado` en vez de dejarlo
        // aplicado, que sería la pantalla afirmando que hay un precio puesto que ya no está.
        if (modo === 'poner') {
          if (fila.estado !== 'confirmado') { resultados.push({ pid, ok: false, error: `está en «${fila.estado}», no confirmado` }); continue; }
          if (!(precio > 0)) { resultados.push({ pid, ok: false, error: 'no tiene precio de sale' }); continue; }
        } else if (fila.estado !== 'aplicado') {
          resultados.push({ pid, ok: false, error: `está en «${fila.estado}», no aplicado` }); continue;
        }

        // Al sacar con destino `previa`, el valor es la oferta congelada — y si el producto no
        // tenía ninguna, queda a precio de lista, que ES su estado anterior.
        const previa = item.foto.promoPrevia;
        const valor = modo === 'poner'
          ? precio
          : (destino === 'previa' && previa > 0 ? previa : null);
        let r;
        try {
          r = await gnFetch(`${GN_BASE}/productos/${encodeURIComponent(pid)}`, {
            method: 'PATCH', headers, body: JSON.stringify({ tiendanube_promotional_price: valor }),
          });
        } catch (err) {
          resultados.push({ pid, ok: false, error: `no se pudo hablar con Gestión Nube: ${err.message}` });
          await dormir(PAUSA_GN);
          continue;
        }
        const cuerpo = await r.text();
        if (!r.ok) {
          resultados.push({ pid, ok: false, error: `Gestión Nube contestó ${r.status}: ${cuerpo.slice(0, 120)}` });
          await dormir(PAUSA_GN);
          continue;
        }

        // 🔑 **No alcanza con el 200: se mira el valor que devuelve el propio PATCH.** GN contesta
        // con el producto actualizado, así que la confirmación es gratis y no cuesta una relectura
        // por producto (que duplicaría las consultas contra un tope de 60 por minuto). Un 200 que
        // no movió el precio es el modo de falla clásico de esta integración: "lo cargué y se
        // revirtió solo".
        let escrito;
        try { escrito = (JSON.parse(cuerpo).data || {}).tiendanube_promotional_price; } catch { escrito = undefined; }
        const quedoBien = valor == null
          ? escrito == null
          : Math.round(num(escrito)) === Math.round(valor);
        if (!quedoBien) {
          resultados.push({ pid, ok: false, error: `Gestión Nube aceptó pero devolvió ${JSON.stringify(escrito)}` });
          await dormir(PAUSA_GN);
          continue;
        }

        const nuevo = {
          ...item,
          estado: modo === 'poner' ? 'aplicado' : 'confirmado',
          aplicacion: modo === 'poner'
            ? { ...item.aplicacion, aplicadoEn: ahoraMs, precioEscrito: precio }
            : { ...item.aplicacion, aplicadoEn: null, precioEscrito: null },
        };
        const { error: eU } = await supabase.from('liquidacion_items')
          .update({ estado: nuevo.estado, datos: nuevo, updated_at: new Date().toISOString() })
          .eq('store', store).eq('liq_id', id).eq('pid', pid);
        // El precio YA está escrito en Gestión Nube: si falla el guardado nuestro, lo que quedó mal
        // es el registro, no la tienda. Se dice cuál de los dos falló en vez de un "no se pudo".
        if (eU) { resultados.push({ pid, ok: false, error: `se escribió en Gestión Nube pero no se pudo anotar acá: ${eU.message}` }); }
        else { resultados.push({ pid, ok: true, precio: valor }); }

        await dormir(PAUSA_GN);
      }

      return res.status(200).json({ ok: true, modo, resultados });
    }

    // ── Borrar la campaña entera. ──────────────────────────────────────────────────────────────
    //
    // Los ítems se borran a mano: no hay FK con `on delete cascade` porque las dos tablas viven en
    // dos bases distintas por marca y la convención del repo es `store` + PK compuesta, sin
    // relaciones declaradas. Van primero, para que una falla en el medio deje la campaña visible y
    // no cuarenta filas huérfanas que nadie ve ni puede borrar.
    if (b.action === 'borrar') {
      const { data: previo, error: e0 } = await supabase.from('liquidaciones')
        .select('estado, datos').eq('store', store).eq('id', id).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!previo) return res.status(200).json({ ok: true });
      if (previo.estado === 'aplicada' && !esAdmin(perfil)) {
        return res.status(403).json({ error: 'Esta campaña ya tiene precios escritos en Gestión Nube: pedile a un admin que la borre.' });
      }
      if (!esAdmin(perfil) && String(previo.datos?.creadoPor || '') !== String(yo || '')) {
        return res.status(403).json({ error: 'Esa campaña la armó otra persona: pedile a un admin que la borre.' });
      }
      const { error: e1 } = await supabase.from('liquidacion_items').delete().eq('store', store).eq('liq_id', id);
      if (e1) throw new Error(e1.message);
      const { error } = await supabase.from('liquidaciones').delete().eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `acción desconocida: ${b.action || '(ninguna)'}` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
