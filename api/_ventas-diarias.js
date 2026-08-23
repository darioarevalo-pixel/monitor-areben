// La venta de cada día, por canal, en unidades y en plata (`/api/datos?recurso=ventas-diarias`).
//
//   GET ?recurso=ventas-diarias&store=bdi|zattia&dias=14|30|90
//
// ## Por qué existe una consulta al servidor para esto
//
// 🔑 **Porque el ETL no baja la plata.** Su `select` de `venta_detalles` es `sale_id, product_id,
// size_id, size, quantity` — sin `unit_price` ni `total`. Ampliarlo está descartado y el motivo
// está escrito en `lib/liquidacion/ventas.ts`: es la tabla más grande, el payload de BDI ya pesa
// ~14,7 MB en IndexedDB, y dos columnas más las pagarían las 42 secciones para que las use una.
// Liquidación y el memo resuelven lo mismo con una consulta puntual; ésta es la tercera y sigue el
// mismo molde.
//
// ⛔ **No devuelve las filas: devuelve la serie ya sumada.** 37 días de BDI son 1.016 ventas y 6.766
// renglones (medido el 23-ago-2026); la serie son 37 filas. Mandar las crudas para que el navegador
// sume sería mandar plata renglón por renglón al bundle, que es justo lo que la Fase S sacó de ahí.
//
// ⛔ **No escribe nada.** Sólo GET.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12 funciones
// por deploy y cada archivo de ruta cuenta una.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { leerTodo } from '../lib/supabase/paginar.core.js';
import { serieDiaria, TOPE_DIAS } from '../lib/ventas-diarias/core.js';
import { sumarDias } from '../lib/fechas/dia.core.js';
import { diaArgentino } from '../lib/envios/portal.core.js';

/** Las ventanas que la pantalla puede pedir. `TOPE_DIAS` es hasta dónde el sync relee. */
const VENTANAS = [14, 30, TOPE_DIAS];

/**
 * Los siete días que se piden **de más**, hacia atrás, para poder comparar contra la semana
 * anterior. No se muestran: existen sólo para ser el término de comparación del primer día visible.
 * Sin ellos, la primera semana del gráfico se dibujaría sin comparación y eso se lee como «cayó a
 * cero».
 */
const COLCHON = 7;

/** Mismo `cfgFor` que `_memo.js` y `_liquidacion.js`. */
function clienteDe(store) {
  const cfg = store === 'zattia'
    ? { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY }
    : { url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co', key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY };
  if (!cfg.url || !cfg.key) return null;
  return createClient(cfg.url, cfg.key);
}

/**
 * **Hasta qué día el espejo está lleno de verdad**, como día argentino.
 *
 * 🔴 Es la mitad que hace que el gráfico no mienta. El sync corre a las 6 UTC —las 3 de la mañana
 * acá— y llena las ventas hasta ese momento: todo lo que se vende después no está. Sin este dato,
 * el último día del gráfico es una barra corta al lado de barras enteras y **se lee como una
 * caída**. Con él, la pantalla lo dibuja distinto y lo dice.
 *
 * Se toma **la más reciente** de las filas de `sync_state` porque cualquiera de las dos llena la
 * misma tabla: el sync de la madrugada (`diario`) y el botón «Traer las ventas de hoy» de Ventas de
 * Marketing (`ventas-hoy-mkt`). Devuelve `null` si no se pudo leer —y entonces la pantalla dice que
 * no se sabe, en vez de afirmar que todo está completo.
 */
export async function medidoHastaDe(sb) {
  const { data, error } = await sb.from('sync_state').select('clave, updated_at');
  if (error || !data || !data.length) return null;
  let masReciente = null;
  for (const f of data) {
    const t = Date.parse(f.updated_at);
    if (!Number.isFinite(t)) continue;
    if (masReciente == null || t > masReciente) masReciente = t;
  }
  return masReciente == null ? null : diaArgentino(masReciente);
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' });

  const store = String(req.query.store || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // 🔑 `puedeVerAlguna` y no `puedeVer` pelado: `puedeVer` no aplica la cuenta fija, y acá la
  // `store` la elige el request. Con `puedeVer` alcanzaba con pedir `?store=bdi` desde una cuenta
  // clavada a Zattia. La sección es la misma que dibuja la serie mensual — es su otra pestaña.
  if (!puedeVerAlguna(perfil, store, ['ventas-mensuales'])) {
    return res.status(403).json({ error: 'No tenés acceso a Ventas mensuales en esta marca.' });
  }

  const dias = Number(req.query.dias);
  if (!VENTANAS.includes(dias)) {
    return res.status(400).json({ error: `dias inválido (usá ${VENTANAS.join(', ')})` });
  }

  const sb = clienteDe(store);
  if (!sb) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });

  try {
    // 🔑 **El día lo decide Argentina, no el reloj de la función.** Vercel corre en UTC: a las 21:30
    // de Buenos Aires `new Date().toISOString().slice(0,10)` ya devuelve mañana, y la serie
    // terminaría en un día vacío justo a la hora en que el local cierra. Mismo criterio que
    // `ventanaVentasHoy` en `api/_ventas-hoy.js`.
    const hasta = diaArgentino(Date.now());
    const visible = sumarDias(hasta, -(dias - 1));
    const desde = sumarDias(visible, -COLCHON);

    // ⚠️ `channel_id` sólo se pide en BDI: la tabla de Zattia no tiene esa columna y PostgREST
    // rechaza el select ENTERO por una columna que no existe. `esVentaTecnica` está hecha para eso
    // —en Zattia manda el texto del canal—, y es el mismo recaudo que toma `api/_norte.js`.
    const cols = `id, date_sale, channel, discount, shipping_cost, total_price${store === 'bdi' ? ', channel_id' : ''}`;
    const ventas = await leerTodo(sb, 'ventas', (q) =>
      q.select(cols).gte('date_sale', desde).lte('date_sale', hasta).order('id'));

    let detalles = [];
    if (ventas.length) {
      // `venta_detalles` no tiene fecha propia: el sale_id es el único puente. El rango de ids
      // arrastra ventas de otras fechas, y por eso el núcleo cruza contra el mapa de ventas y no
      // contra el rango. Mismo cruce que `_memo.js` y `ventas-campania`.
      const min = ventas[0].id;
      const max = ventas[ventas.length - 1].id;
      detalles = await leerTodo(sb, 'venta_detalles', (q) =>
        q.select('sale_id, quantity, total').gte('sale_id', min).lte('sale_id', max).order('sale_id'));
    }

    const medidoHasta = await medidoHastaDe(sb);
    const serie = serieDiaria({ ventas, detalles, desde, hasta, medidoHasta });

    return res.status(200).json({ ok: true, desde, hasta, visible, medidoHasta, ...serie });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'error inesperado' });
  }
}
