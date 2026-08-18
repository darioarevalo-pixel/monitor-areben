// Norte (Dirección) — tablas `compras_condiciones` y `norte_metas` (ver sql/migrate-norte.sql).
//
//   GET  ?recurso=norte&store=bdi|zattia
//   POST { recurso:'norte', store, condiciones:{ingresoId, fechaFactura, costoUnitario, moneda,
//                                               unidades, cuotas:[{dias,pct,fecha?}], nota} }
//   POST { recurso:'norte', store, action:'borrar-condiciones', ingresoId }
//   POST { recurso:'norte', store, meta:{key, label, unidad, objetivo, fechaObjetivo, orden, activa} }
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
import { contribucionPorCanal, ventanaUltimos } from '../lib/norte/contribucion.core.js';
import { leerTodo } from '../lib/supabase/paginar.core.js';

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
 * La contribución por canal de los últimos 30 días con venta.
 *
 * La ventana la fija `ventanaUltimos` sobre las fechas que volvieron, **no el reloj**: el día en
 * curso está a medio hacer y meterlo baja el promedio sin que haya pasado nada. Se piden 45 días
 * para tener de dónde recortar los 30 aunque el local haya estado cerrado unos días.
 *
 * ⚠️ Los detalles se piden por rango de `sale_id` porque `venta_detalles` no tiene fecha propia —
 * el id es el único puente—, y ese rango arrastra ventas de otras fechas. El filtro por fecha real
 * lo hace el núcleo. Mismo cruce que `api/_memo.js`.
 */
async function contribucionDe(supabase, reglas) {
  const hace45 = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
  const ventas = await leerTodo(supabase, 'ventas', (q) =>
    q
      .select('id, date_sale, channel, payment_method, account_display, discount, shipping_cost, total_cost')
      .gte('date_sale', hace45)
      .order('id'));

  const ventana = ventanaUltimos(ventas.map((v) => v.date_sale), 30);
  if (!ventana) return { disponible: false, motivo: 'No hay ventas en los últimos 45 días.', ventana: null };

  const enVentana = ventas.filter((v) => {
    const f = String(v.date_sale || '').slice(0, 10);
    return f >= ventana.desde && f <= ventana.hasta;
  });
  if (!enVentana.length) return { disponible: false, motivo: 'No hay ventas en la ventana.', ventana };

  const min = enVentana[0].id;
  const max = enVentana[enVentana.length - 1].id;
  const detalles = await leerTodo(supabase, 'venta_detalles', (q) =>
    q.select('sale_id, quantity, total').gte('sale_id', min).lte('sale_id', max).order('sale_id'));

  const { canales, cobertura } = contribucionPorCanal({
    ventas: enVentana,
    detalles,
    cuentas: reglas.cuentas,
    comisiones: reglas.comisiones,
    desde: ventana.desde,
    hasta: ventana.hasta,
  });
  return { disponible: true, motivo: null, ventana, canales, cobertura };
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

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  if (!puedeVerAlguna(perfil, store, ['norte'])) {
    return res.status(403).json({ error: 'No tenés acceso a Norte en esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  const admin = esAdmin(perfil);
  const yo = perfil.name || null;
  const ahora = new Date().toISOString();

  try {
    if (req.method === 'GET') {
      // La contribución sale en el mismo viaje que el resto, y **no puede tumbar la sección**: si el
      // dashboard no contesta o la venta no se puede leer, Norte pierde la columna de plata y lo
      // dice. Mismo criterio que las metas.
      const [c, m, contrib] = await Promise.all([
        supabase
          .from('compras_condiciones')
          .select('ingreso_id, fecha_factura, costo_unitario, moneda, unidades, cuotas, nota, actualizado_por, actualizado_en')
          .eq('store', store),
        supabase
          .from('norte_metas')
          .select('key, label, unidad, objetivo, fecha_objetivo, orden, activa')
          .eq('store', store)
          .order('orden', { ascending: true }),
        (async () => {
          const reglas = await reglasDelDashboard();
          if (reglas.error) return { disponible: false, motivo: reglas.error, ventana: null };
          try {
            return await contribucionDe(supabase, reglas);
          } catch (e) {
            return { disponible: false, motivo: `no se pudo leer la venta: ${e.message}`, ventana: null };
          }
        })(),
      ]);
      if (c.error) throw new Error(c.error.message);

      return res.status(200).json({
        ok: true,
        condiciones: (c.data || []).map((r) => ({
          ingresoId: r.ingreso_id,
          fechaFactura: r.fecha_factura || '',
          costoUnitario: Number(r.costo_unitario) || 0,
          moneda: r.moneda || 'USD',
          unidades: r.unidades === null ? null : Number(r.unidades),
          cuotas: Array.isArray(r.cuotas) ? r.cuotas : [],
          nota: r.nota || '',
          actualizadoPor: r.actualizado_por,
          actualizadoEn: r.actualizado_en,
        })),
        // Las metas NO tumban Norte si la tabla todavía no está migrada en esta marca: se pierden
        // los objetivos y el resto (stock, pagos, ritmo) sigue sirviendo. Mismo criterio que el
        // calendario con las decisiones.
        metas: m.error
          ? []
          : (m.data || []).map((r) => ({
              key: r.key,
              label: r.label,
              unidad: r.unidad || '',
              objetivo: Number(r.objetivo) || 0,
              fechaObjetivo: r.fecha_objetivo || '',
              orden: r.orden || 0,
              activa: r.activa !== false,
            })),
        contribucion: contrib,
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
      const { error } = await supabase.from('norte_metas').upsert(
        {
          key,
          store,
          label,
          unidad: String(b.meta.unidad || ''),
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
    // ⚠️ `unidades` distingue "no lo cargaron" (null ⇒ se usa el total vivo del KV) de "cargaron
    // cero". Por eso NO se puede usar `|| 0`: un cero legítimo se perdería y un null se guardaría
    // como cero, que es peor — parecería una compra sin unidades.
    const unidades = c.unidades === null || c.unidades === undefined || c.unidades === '' ? null : aNumero(c.unidades);

    const { error } = await supabase.from('compras_condiciones').upsert(
      {
        ingreso_id: ingresoId,
        store,
        fecha_factura: aFecha(c.fechaFactura),
        costo_unitario: aNumero(c.costoUnitario) ?? 0,
        moneda,
        unidades,
        cuotas: sanearCuotas(c.cuotas),
        nota: String(c.nota || ''),
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
