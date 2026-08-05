// Liquidación — tablas `liquidaciones` y `liquidacion_items` (ver sql/migrate-liquidacion.sql).
//
//   GET  ?recurso=liquidacion&store=bdi|zattia            → las campañas, con sus conteos
//   GET  ?recurso=liquidacion&store=…&liq=<id>            → los ítems de una campaña
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
const ESTADOS_ITEM = ['pendiente', 'definido', 'descartado', 'aplicado'];

// El tope de un "Mandar a liquidación". No es capricho: son N inserts en un request, y esta es la
// primera acción del módulo con costo O(N). Con la tabla de Análisis paginada de a 50, mandar 200
// productos de una es raro; el cartel lo dice en vez de recortar en silencio.
const TOPE_SUMAR = 200;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txtOrNull = (v) => (v == null || v === '' ? null : String(v));

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
    conteo: conteo || { total: 0, pendientes: 0, definidos: 0, descartados: 0, aplicados: 0 },
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
    aplicacion: {
      aplicadoEn: a.aplicadoEn == null ? null : num(a.aplicadoEn),
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
        const k = conteos[it.liq_id] || (conteos[it.liq_id] = { total: 0, pendientes: 0, definidos: 0, descartados: 0, aplicados: 0 });
        k.total += 1;
        if (it.estado === 'pendiente') k.pendientes += 1;
        else if (it.estado === 'definido') k.definidos += 1;
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
      if (!ESTADOS_ITEM.includes(estado) || estado === 'aplicado') {
        return res.status(400).json({ error: `estado inválido (usá ${ESTADOS_ITEM.filter((e) => e !== 'aplicado').join(', ')})` });
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

    // ── Sacar un producto de la campaña. ⚠️ Distinto de descartarlo. ───────────────────────────
    if (b.action === 'quitar-item') {
      const pid = String(b.pid || '');
      if (!pid) return res.status(400).json({ error: 'falta el producto' });
      const { error } = await supabase.from('liquidacion_items')
        .delete().eq('store', store).eq('liq_id', id).eq('pid', pid);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
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
