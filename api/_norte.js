// Norte (Dirección) — tablas `compras_condiciones` y `norte_metas` (ver sql/migrate-norte.sql).
//
//   GET  ?recurso=norte&store=bdi|zattia            → condiciones + contribución + P&L (sin metas)
//   GET  ?recurso=norte&store=bdi|zattia|stunned&metas=1  → SÓLO los objetivos, por LÍNEA
//   POST { recurso:'norte', store, condiciones:{ingresoId, fechaFactura, moneda, cuotas:[{dias,pct,fecha?}],
//                                               costos:[{bloqueId,nombre,costo,unidades}], nota,
//                                               confirmado, fechaIngreso, cotizacion} }
//   POST { recurso:'norte', store, action:'borrar-condiciones', ingresoId }
//   POST { recurso:'norte', store, meta:{key, label, medidor, canal, objetivo, fechaObjetivo, orden, activa} }
//   POST { recurso:'norte', store, action:'borrar-meta', key }
//
// ## Qué guarda y qué NO
//
// Guarda **la economía de una importación** —costo, moneda, plazos— que es lo único que Norte
// agrega al dato que ya existe. Las unidades, los modelos, el proveedor y la fecha de llegada
// siguen viviendo en `ingresos` (el KV de bdi-catalogo) y no se duplican acá: se cruzan por
// `ingreso_id` al mirar.
//
// ⛔ **No guarda lo medido.** Ni el ritmo de salida, ni el avance de una meta, ni el stock
// proyectado: todo eso se calcula al abrir la pantalla, contra las ventas reales. Un avance
// congelado en la base es un número que miente el día que nadie lo actualiza, y ese día llega.
//
// ## Por qué escribir es de admin
//
// Mismo criterio que `_meta-rentabilidad.js`: acá se firma **cuánto se debe y cuándo**. Un plazo
// mal cargado no se ve raro en la tabla —se ve como un vencimiento— y recién se nota cuando alguien
// decidió contra él. Leer, en cambio, lo puede hacer cualquiera que tenga la sección.
//
// 🔑 El permiso va por `puedeVerAlguna` y no por `puedeVer` pelado: `puedeVer` **no aplica la
// cuenta fija**, y acá la `store` la elige el request. Con `puedeVer` alcanzaba con pedir
// `?store=bdi` desde una cuenta clavada a Zattia. Es el mismo agujero que Darío cerró en otros
// cinco handlers.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12
// funciones por deploy y cada archivo de ruta cuenta una.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, puedeVerAlguna } from '../lib/permisos.core.js';
import { baseDeLinea, esLinea } from '../lib/lineas.core.js';
import { contribucionPorCanal, ventanaUltimos } from '../lib/norte/contribucion.core.js';
import { pylPorLinea } from '../lib/norte/pyl.core.js';
import { canalDeMeta, esMedidor, medidorDe } from '../lib/norte/medidores.core.js';
import { sanearCostos } from '../lib/norte/costos.core.js';
import { esVentaTecnica } from '../lib/etl/tecnica.core.js';
import { leerTodo } from '../lib/supabase/paginar.core.js';

/**
 * Las credenciales de la base. ⚠️ **Toma una MARCA, no una línea**: Stunned no tiene base propia y
 * un `store` crudo acá caería al `else` —o sea a la de BDI— sin que nada avise. La marca la saca
 * `baseDeLinea` en el handler.
 */
function cfgFor(marca) {
  if (marca === 'zattia') {
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

/**
 * El dashboard, que es de dónde salen **las reglas** de la contribución: qué cuenta de cobro
 * factura (⇒ IVA) y cuánto cobra cada medio de pago.
 *
 * 🔑 **No se copian acá.** Son 18 cuentas y 8 medios que alguien mantiene en una pantalla del
 * dashboard (`/settings/cuentas-cobro` y `/settings/comisiones`); una segunda copia en este repo
 * es exactamente lo que diverge, y el día que Bruno agregue una cuenta nueva en Gestión Nube la
 * copia vieja la daría por no facturable — o sea, 21% de contribución de más, en silencio.
 */
function cfgDashboard() {
  return {
    url: process.env.DASHBOARD_SUPABASE_URL,
    key: process.env.DASHBOARD_SUPABASE_SERVICE_KEY,
  };
}

/**
 * Las dos tablas de reglas. Devuelve `{ error }` en vez de tirar: que el dashboard no conteste
 * tiene que dejar a Norte sin la columna de plata, no sin pantalla.
 */
async function reglasDelDashboard() {
  const cfg = cfgDashboard();
  if (!cfg.url || !cfg.key) {
    return { error: 'Falta conectar el dashboard (DASHBOARD_SUPABASE_URL / _SERVICE_KEY).' };
  }
  try {
    const sb = createClient(cfg.url, cfg.key);
    const [cc, com] = await Promise.all([
      sb.from('cuentas_cobro_gn').select('nombre, tipo'),
      sb.from('comision_medio_pago').select('medio, porcentaje, activo'),
    ]);
    if (cc.error) return { error: `cuentas de cobro: ${cc.error.message}` };
    const cuentas = {};
    for (const r of cc.data || []) cuentas[r.nombre] = r.tipo;
    if (!Object.keys(cuentas).length) return { error: 'El dashboard no tiene ninguna cuenta de cobro clasificada.' };
    const comisiones = {};
    // Una comisión desactivada es un 0 explícito, no un dato ausente: el que la apagó decidió.
    for (const r of com.data || []) comisiones[r.medio] = r.activo === false ? 0 : Number(r.porcentaje) || 0;
    return { cuentas, comisiones };
  } catch (e) {
    return { error: `dashboard: ${e.message}` };
  }
}

/**
 * El SKU de cada producto que aparece en estos renglones.
 *
 * 🔑 **Sólo hace falta en Zattia**, que es la base donde conviven Zattia y Stunned: la línea sale
 * del prefijo del SKU. En BDI la respuesta ya se sabe —todo es `bdi`— y pedirlo sería una consulta
 * entera para una pregunta contestada. Mismo criterio y mismo código que `api/_memo.js`.
 */
async function skusDe(supabase, store, detalles) {
  if (store !== 'zattia') return null;
  const pids = [...new Set(detalles.map((d) => Number(d.product_id)).filter((n) => Number.isInteger(n) && n > 0))];
  const skuPor = new Map();
  for (let i = 0; i < pids.length; i += 200) {
    const grupo = pids.slice(i, i + 200);
    const prods = await leerTodo(supabase, 'productos', (q) => q.select('id, sku').in('id', grupo).order('id'));
    for (const p of prods) skuPor.set(String(p.id), p.sku);
  }
  return skuPor;
}

/**
 * La plata de los últimos 30 días con venta, en sus **dos cortes**: por canal (por dónde conviene
 * sacar el stock) y por línea (cuánto deja cada negocio).
 *
 * 🔑 **Los dos salen del MISMO viaje y de la MISMA ventana.** Son dos lecturas de la misma plata:
 * si cada una pidiera sus ventas por su cuenta, dos pantallas pegadas mostrarían totales que no
 * cierran entre sí y no habría forma de saber cuál mirar. Lo único que agrega el P&L es la consulta
 * de SKUs, y sólo en Zattia.
 *
 * La ventana la fija `ventanaUltimos` sobre las fechas que volvieron, **no el reloj**: el día en
 * curso está a medio hacer y meterlo baja el promedio sin que haya pasado nada. Se piden 45 días
 * para tener de dónde recortar los 30 aunque el local haya estado cerrado unos días.
 *
 * ⚠️ Los detalles se piden por rango de `sale_id` porque `venta_detalles` no tiene fecha propia —
 * el id es el único puente—, y ese rango arrastra ventas de otras fechas. El filtro por fecha real
 * lo hace el núcleo. Mismo cruce que `api/_memo.js`.
 */
async function contribucionDe(supabase, store, reglas) {
  const hace45 = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  // ⚠️ `channel_id` sólo se pide en BDI: la tabla de Zattia no tiene esa columna y PostgREST
  // rechaza el select entero por una columna que no existe. `esVentaTecnica` está hecha para eso —
  // en Zattia manda el texto del canal, que es el criterio que ya usa el ETL ahí.
  const cols = `id, date_sale, channel, payment_method, account_display, discount, shipping_cost, total_cost${store === 'bdi' ? ', channel_id' : ''}`;
  const crudas = await leerTodo(supabase, 'ventas', (q) => q.select(cols).gte('date_sale', hace45).order('id'));

  // 🔴 Las técnicas (Sesión de Fotos y Fallas) se sacan ACÁ porque el ETL las saca del payload que
  // mira el navegador. Si el servidor las contara, el ritmo en unidades y la plata quedarían
  // medidos sobre poblaciones distintas — y multiplicar uno por otro daría un número que no
  // existe. Medido el 18-ago: en BDI son 11 unidades que aportan −$15.608 de contribución, porque
  // salen con descuento del 100% y el costo es real.
  const ventas = crudas.filter((v) => !esVentaTecnica(v));

  const ventana = ventanaUltimos(ventas.map((v) => v.date_sale), 30);
  if (!ventana) return sinPlata('No hay ventas en los últimos 45 días.', null);

  const enVentana = ventas.filter((v) => {
    const f = String(v.date_sale || '').slice(0, 10);
    return f >= ventana.desde && f <= ventana.hasta;
  });
  if (!enVentana.length) return sinPlata('No hay ventas en la ventana.', ventana);

  const min = enVentana[0].id;
  const max = enVentana[enVentana.length - 1].id;
  const detalles = await leerTodo(supabase, 'venta_detalles', (q) =>
    q.select('sale_id, product_id, quantity, total').gte('sale_id', min).lte('sale_id', max).order('sale_id'));

  const comun = {
    ventas: enVentana,
    detalles,
    cuentas: reglas.cuentas,
    comisiones: reglas.comisiones,
    desde: ventana.desde,
    hasta: ventana.hasta,
  };
  const { canales, cobertura } = contribucionPorCanal(comun);
  const skuPor = await skusDe(supabase, store, detalles);
  const pyl = pylPorLinea({ ...comun, store, skuPor });

  return {
    contribucion: { disponible: true, motivo: null, ventana, canales, cobertura },
    pyl: { disponible: true, motivo: null, ventana, lineas: pyl.lineas, total: pyl.total, cobertura: pyl.cobertura },
  };
}

/**
 * Los dos cortes cuando no hay plata que mostrar.
 *
 * 🔑 **El motivo va en los dos, con el mismo texto.** Que una pantalla diga por qué no tiene el
 * número y la de al lado se quede muda es el modo de falla que ya está documentado: callarse
 * también miente.
 */
function sinPlata(motivo, ventana) {
  return {
    contribucion: { disponible: false, motivo, ventana },
    pyl: { disponible: false, motivo, ventana },
  };
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MONEDAS = ['USD', 'ARS'];

/** Un número de verdad, o `null`. `Number(null)` y `Number([])` valen 0 y son finitos. */
function aNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Una fecha ISO válida, o `null` (que en la base significa "todavía no se sabe"). */
function aFecha(v) {
  const s = String(v || '').trim();
  return ES_FECHA.test(s) ? s : null;
}

/**
 * Las cuotas, saneadas.
 *
 * ⚠️ Se valida el reparto pero **no se exige que sume 100**: una compra puede tener un anticipo
 * suelto cargado antes que el resto, y rechazarla obligaría a inventar una cuota falsa para poder
 * guardar. La pantalla avisa cuando no cierra; el servidor no lo impide.
 */
function sanearCuotas(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      const dias = aNumero(c?.dias);
      const pct = aNumero(c?.pct);
      if (dias === null || pct === null) return null;
      const cuota = { dias: Math.max(0, Math.round(dias)), pct: Math.min(100, Math.max(0, pct)) };
      const fecha = aFecha(c?.fecha);
      if (fecha) cuota.fecha = fecha;
      return cuota;
    })
    .filter(Boolean)
    .slice(0, 24);
}

/**
 * Una fila de `norte_metas` como la lee la app. **Una sola vez**: la sirven las dos ramas del GET
 * (Norte entero y `?metas=1`), y dos mapeos del mismo registro se despegan en el campo que uno
 * agregue y el otro no.
 *
 * La unidad la manda el **medidor** y no la columna: la columna es un espejo para poder leer la
 * fila en `psql` sin tener el catálogo al lado, y puede quedar vieja.
 */
function aMeta(r) {
  return {
    key: r.key,
    label: r.label,
    medidor: r.medidor || 'unidades-dia',
    canal: r.canal || null,
    objetivo: Number(r.objetivo) || 0,
    fechaObjetivo: r.fecha_objetivo || '',
    orden: r.orden || 0,
    activa: r.activa !== false,
  };
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // 🔑 **Acá `store` es una LÍNEA, y la marca sale de ella.** Stunned no tiene base ni permisos
  // propios (`docs/lineas.md`): sus filas de `norte_metas` viven en la base de **Zattia** con
  // `store='stunned'`, exactamente como las de `solicitudes`. La PK es `(key, store)`, así que las
  // dos rampas conviven sin pisarse.
  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!esLinea(store)) return res.status(400).json({ error: 'store inválido (usá bdi, zattia o stunned)' });
  // La marca manda para **credenciales y permisos**; la línea, sólo para elegir las filas.
  const marca = baseDeLinea(store);

  // 🔑 **La segunda llave de este handler, con el molde de las cuatro de `api/_liquidacion.js`.**
  // La sección que hay que poder ver se elige **antes** del `puedeVerAlguna`, no con un segundo
  // `if` que lo saltee: duplicar el chequeo adentro de una rama es lo que dejó a todo el equipo sin
  // ver el padrón de Canjes.
  //
  // 🔑 **Qué abre y qué NO**: `?metas=1` contesta **sólo `norte_metas`** —el nombre del objetivo,
  // su número y su fecha—. Ni las condiciones de compra, ni la contribución, ni el P&L: o sea ni un
  // peso. Ése es el contrato que la deja salir del área de Dirección, y una columna que lo vuelva
  // falso tiene que salir por otra puerta. Exige `GET`, así que **ninguna `action` del POST se
  // alcanza jamás con esta llave**: la rama corta con `return` antes de que se mire un `action`.
  const soloMetas = req.method === 'GET' && String(req.query.metas || '') === '1';
  const secciones = soloMetas ? ['norte', 'mkt-ventas'] : ['norte'];

  // 🔴 **La línea abre SÓLO los objetivos, y el resto sigue siendo de la marca.** Ni la
  // contribución ni el P&L ni las condiciones de compra saben de líneas: `contribucionDe` mira la
  // venta ENTERA de la base y `skusDe` sólo reparte en Zattia. Dejar pasar `stunned` por esas
  // ramas devolvería la plata de Zattia con el rótulo de Stunned — que es exactamente el defecto
  // que la línea vino a matar en la pantalla de Ventas. El P&L por línea ya existe y sale por
  // `pylPorLinea`, adentro del pedido de la marca.
  const esDeMetas = soloMetas || (req.method === 'POST' && !!(req.body || {}).meta) ||
    (req.method === 'POST' && (req.body || {}).action === 'borrar-meta');
  if (store !== marca && !esDeMetas) {
    return res.status(400).json({ error: `${store} es una línea: sólo tiene objetivos propios, no P&L ni compras.` });
  }

  if (!puedeVerAlguna(perfil, marca, secciones)) {
    const que = soloMetas ? 'los objetivos' : 'Norte';
    return res.status(403).json({ error: `No tenés acceso a ${que} en esta marca.` });
  }

  const cfg = cfgFor(marca);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${marca}.` });
  const supabase = createClient(cfg.url, cfg.key);

  const admin = esAdmin(perfil);
  const yo = perfil.name || null;
  const ahora = new Date().toISOString();

  try {
    // Corta acá: lo único que contesta con la llave de los objetivos. Sin condiciones, sin
    // contribución, sin P&L — y sin `puede`, que sólo sirve para dibujar los botones de Norte.
    if (soloMetas) {
      const m = await supabase
        .from('norte_metas')
        .select('key, label, medidor, canal, objetivo, fecha_objetivo, orden, activa')
        .eq('store', store)
        .order('orden', { ascending: true });
      return res.status(200).json({ ok: true, metas: m.error ? [] : (m.data || []).map(aMeta) });
    }

    if (req.method === 'GET') {
      // Los dos cortes de la plata salen en el mismo viaje que el resto, y **no pueden tumbar la
      // sección**: si el dashboard no contesta o la venta no se puede leer, Norte pierde la columna
      // de plata y el P&L, y lo dice en los dos. Mismo criterio que las metas.
      const [c, plata] = await Promise.all([
        supabase
          .from('compras_condiciones')
          .select('ingreso_id, fecha_factura, costos, moneda, cotizacion, cuotas, nota, confirmado, fecha_ingreso, actualizado_por, actualizado_en')
          .eq('store', store),
        (async () => {
          const reglas = await reglasDelDashboard();
          if (reglas.error) return sinPlata(reglas.error, null);
          try {
            return await contribucionDe(supabase, store, reglas);
          } catch (e) {
            return sinPlata(`no se pudo leer la venta: ${e.message}`, null);
          }
        })(),
      ]);
      if (c.error) throw new Error(c.error.message);

      return res.status(200).json({
        ok: true,
        condiciones: (c.data || []).map((r) => ({
          ingresoId: r.ingreso_id,
          fechaFactura: r.fecha_factura || '',
          costos: Array.isArray(r.costos) ? r.costos : [],
          moneda: r.moneda || 'USD',
          cuotas: Array.isArray(r.cuotas) ? r.cuotas : [],
          nota: r.nota || '',
          confirmado: r.confirmado === true,
          fechaIngreso: r.fecha_ingreso || '',
          // 🔑 `null` NO se normaliza a 0: «todavía no se emitieron los cheques» y «se pesificó a
          // cero» son cosas distintas, y la segunda no existe. Un 0 acá pondría toda la deuda en $0.
          cotizacion: r.cotizacion === null || r.cotizacion === undefined ? null : Number(r.cotizacion),
          actualizadoPor: r.actualizado_por,
          actualizadoEn: r.actualizado_en,
        })),
        // ⛔ **Las metas ya no viajan acá** (23-ago-2026): la única puerta es `?metas=1`, que ahora
        // toma una LÍNEA. Mandarlas por los dos caminos daba dos fuentes para la misma tabla, y la
        // del viaje grande no sabe de líneas — la pantalla de Norte habría tenido que elegir cuál
        // creerle según qué pestaña esté abierta.
        contribucion: plata.contribucion,
        // El mismo viaje, el otro corte: cuánto deja cada línea, hasta la contribución.
        pyl: plata.pyl,
        puede: { admin },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
    if (!admin) return res.status(403).json({ error: 'Cargar la economía de una compra es de administradores.' });

    const b = req.body || {};

    if (b.action === 'borrar-condiciones') {
      const ingresoId = String(b.ingresoId || '');
      if (!ingresoId) return res.status(400).json({ error: 'falta ingresoId' });
      const { error } = await supabase.from('compras_condiciones').delete().eq('store', store).eq('ingreso_id', ingresoId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'borrar-meta') {
      const key = String(b.key || '');
      if (!key) return res.status(400).json({ error: 'falta key' });
      const { error } = await supabase.from('norte_metas').delete().eq('store', store).eq('key', key);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (b.meta) {
      const key = String(b.meta.key || '').trim();
      const label = String(b.meta.label || '').trim();
      if (!key || !label) return res.status(400).json({ error: 'la meta necesita key y label' });

      // 🔑 El medidor y el canal se validan contra el catálogo del motor, no se guardan como
      // vinieron. Una meta con un medidor que `medirMeta` no conoce se guarda sin ruido y después
      // no mide nunca: la pantalla la muestra en blanco para siempre y nada avisa.
      const medidor = String(b.meta.medidor || '').trim();
      if (!esMedidor(medidor)) {
        return res.status(400).json({ error: `medidor desconocido: ${medidor || '(vacío)'}` });
      }
      const canal = canalDeMeta(b.meta.canal);
      if (canal === undefined) return res.status(400).json({ error: `canal desconocido: ${b.meta.canal}` });

      const { error } = await supabase.from('norte_metas').upsert(
        {
          key,
          store,
          label,
          medidor,
          canal,
          // Espejo del catálogo, para poder leer la fila suelta. La pantalla usa el medidor.
          unidad: medidorDe(medidor).unidad,
          objetivo: aNumero(b.meta.objetivo) ?? 0,
          fecha_objetivo: aFecha(b.meta.fechaObjetivo),
          orden: aNumero(b.meta.orden) ?? 0,
          activa: b.meta.activa !== false,
          actualizado_por: yo,
          actualizado_en: ahora,
        },
        { onConflict: 'key,store' },
      );
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    const c = b.condiciones;
    if (!c) return res.status(400).json({ error: 'falta condiciones (o meta, o action)' });

    const ingresoId = String(c.ingresoId || '').trim();
    if (!ingresoId) return res.status(400).json({ error: 'falta ingresoId' });

    const moneda = MONEDAS.includes(c.moneda) ? c.moneda : 'USD';

    const { error } = await supabase.from('compras_condiciones').upsert(
      {
        ingreso_id: ingresoId,
        store,
        fecha_factura: aFecha(c.fechaFactura),
        costos: sanearCostos(c.costos),
        moneda,
        // A cuánto se pesificó la deuda: el dólar al que se emitieron los cheques. ⛔ `null` mientras
        // no se sepa, y por eso no va `|| 0` — ver el docblock de `Condiciones.cotizacion`.
        cotizacion: moneda === 'USD' ? aNumero(c.cotizacion) : null,
        cuotas: sanearCuotas(c.cuotas),
        nota: String(c.nota || ''),
        // 🔑 El tilde y su fecha son lo que convierte una proyección en deuda. Se guardan como los
        // mandaron —no se deducen del estado de la importación, que lo mueve otra pantalla.
        confirmado: c.confirmado === true,
        fecha_ingreso: aFecha(c.fechaIngreso),
        actualizado_por: yo,
        actualizado_en: ahora,
      },
      { onConflict: 'ingreso_id,store' },
    );
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'error' });
  }
}
