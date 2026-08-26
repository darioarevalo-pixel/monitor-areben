// LA ZONA DE RENDIMIENTO: qué apago, qué escalo, qué testeo hoy — de UNA línea.
//
//   GET /api/meta-ads?recurso=rendimiento&linea=bdi[&dias=7|14|30]
//
// ⚠️ Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby.
//
// # 🔑 Sale entero de la BASE, y por eso va ANTES del guard del token
//
// No importa `graph.core.js` y no necesita `META_ADS_TOKEN`. Esa sola decisión es la que deja que
// esto sea una PANTALLA y no un botón: el Parte contesta casi lo mismo, pero se arma con cinco
// llamadas a Graph y el cupo de la Marketing API es un porcentaje que se agota ⇒ no se puede pedir
// solo al entrar, y por eso la decisión terminaba tomándose afuera, con el texto pegado en otro
// lado. Acá se pide sola, es barata, tiene 90 días de historia y **sigue contestando el día que el
// token se venza**, que es justo cuando hay que decidir algo.
//
// ⚠️ Lo que NO puede es el día EN CURSO: la foto se corta ~08:00 y ~20:00. Traer hoy sigue siendo
// el botón del Parte, y eso está dicho en la pantalla.
//
// # 🔴 Es de UNA línea, y no es una comodidad
//
// El techo por compra, los pedidos reales y la meta de Norte son de una línea. Adentro de la misma
// cuenta publicitaria conviven BDI y Zattia: dividir el gasto de las dos por los pedidos de una da
// un costo por pedido que no existe. Sin `linea` se contesta 400 nombrando lo que falta.
//
// # Las tres bases que toca
//
//  - la foto y la rentabilidad viven en la base de **BDI** y son cross-marca (una sola cuenta
//    publicitaria, un solo hecho);
//  - `ventas` y `norte_metas` viven en la base **de la línea** (`baseDeLinea`), porque son de la
//    tienda y cada marca tiene la suya.
import { createClient } from '@supabase/supabase-js';
import { lineasQueVe } from '../lib/meta-ads/acciones.core.js';
import { leerSnapshot } from '../lib/meta-ads/leer-snapshot.core.js';
import { baseDeLinea, esLinea } from '../lib/meta-ads/lineas.core.js';
import { armarZona, COLS_RENDIMIENTO, elegirVentana, ultimoDiaCerrado } from '../lib/meta-ads/rendimiento.core.js';
import { calcularRentabilidad, normalizar } from '../lib/meta-ads/rentabilidad.core.js';
import { clienteBdi } from './_meta-lineas.js';
import { pedidosPorDia } from './_meta-parte.js';

/**
 * Cuántos días de foto se traen hacia atrás.
 *
 * No es la ventana: el desgaste compara dos ventanas y el marginal, dos más, así que con 7 días de
 * datos ninguna de las dos cosas se puede calcular. Se pide el colchón y el núcleo recorta.
 */
const COLCHON = (dias) => Math.max(40, dias * 4 + 2);

function clienteDeLinea(linea) {
  if (baseDeLinea(linea) === 'zattia') {
    const url = process.env.ZATTIA_SUPABASE_URL;
    const key = process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY;
    return url && key ? createClient(url, key) : null;
  }
  return clienteBdi();
}

/**
 * La meta de Norte que viene, con su fecha.
 *
 * 🔑 **La que vale es la PRÓXIMA, no la más grande.** El proyecto vive en la sección Norte con tres
 * escalones (25 · 50 · 100) y comparar los pedidos de hoy contra el de octubre no dice nada que se
 * pueda hacer esta semana. Un fallo acá ⛔ no rompe la zona: se contesta sin objetivo.
 */
async function proximaMeta(sb, hasta) {
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('norte_metas')
      .select('label, objetivo, fecha_objetivo, medidor, canal, activa')
      .eq('activa', true)
      .order('fecha_objetivo', { ascending: true });
    if (error) return null;
    const vivas = (data || []).filter((m) => m.medidor === 'ventas-dia' && m.canal === 'online');
    // La primera cuya fecha todavía no pasó; si todas pasaron, la última — un objetivo vencido
    // sigue siendo el objetivo hasta que alguien cargue el siguiente.
    return vivas.find((m) => !m.fecha_objetivo || String(m.fecha_objetivo) >= hasta) || vivas[vivas.length - 1] || null;
  } catch {
    return null;
  }
}

export default async function rendimientoGet(res, perfil, q) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });

  const visibles = lineasQueVe(perfil);
  if (!visibles.length) return res.status(403).json({ error: 'No tenés acceso a la pauta de ninguna marca.' });

  const linea = String(q.linea || '').toLowerCase();
  if (!linea) return res.status(400).json({ error: 'Falta «linea»: la zona de rendimiento es de una sola línea de pauta.' });
  if (!esLinea(linea)) return res.status(400).json({ error: `«${linea}» no es una línea de pauta.` });
  // 🔑 El corte por permiso se hace ACÁ, no confiando en que la pantalla no lo pida: un selector
  // puede quedar viejo, el servidor no.
  if (!visibles.includes(linea)) {
    return res.status(403).json({ error: `No tenés acceso a la pauta de «${linea}».` });
  }

  const v = elegirVentana(q.dias);
  if (v.error) return res.status(400).json({ error: v.error });
  const dias = v.dias;

  const hoyish = new Date().toISOString().slice(0, 10);
  const desdeCrudo = new Date(Date.parse(`${hoyish}T00:00:00Z`) - COLCHON(dias) * 86400000).toISOString().slice(0, 10);

  const sbLinea = clienteDeLinea(linea);
  const [snap, rentRes] = await Promise.all([
    leerSnapshot(sb, { cols: COLS_RENDIMIENTO, desde: desdeCrudo, lineas: [linea] }),
    sb.from('meta_ads_rentabilidad').select('linea, supuestos, updated_at').eq('linea', linea).maybeSingle(),
  ]);
  if (snap.error) return res.status(502).json({ error: 'No se pudo leer la foto diaria.', detalle: snap.error });

  const filas = snap.filas || [];
  const cierre = ultimoDiaCerrado(filas);
  if (!cierre) {
    // ⛔ No se contesta media zona con el día en curso: un día parcial leído como entero muestra la
    // mitad del gasto contra la mitad de las compras y el costo sale plausible.
    return res.status(200).json({
      ok: true, linea, dias, zona: null, techo: null,
      motivo: filas.length
        ? 'La foto todavía no tiene ningún día cerrado: el corte de la mañana es el que cierra el anterior.'
        : 'La foto no tiene ni una fila de esta línea. ¿Corrió el snapshot?',
    });
  }

  // El techo, de la fila guardada. ⛔ Sin fila NO hay techo y la zona lo dice: un techo inventado se
  // lee igual que uno medido y decide plata.
  let techo = 0;
  let techoCaja = null;
  let ficha = null;
  const fila = rentRes && rentRes.data;
  if (fila) {
    try {
      const r = calcularRentabilidad(normalizar(fila.supuestos || {}));
      techo = r.costoMax;
      techoCaja = r.costoMaxCaja !== r.costoMax ? r.costoMaxCaja : null;
      ficha = { cargadaEl: fila.updated_at || null, ticket: r.ticket };
    } catch {
      /* una fila ilegible es una línea sin techo, no un 500 */
    }
  }

  const problemas = [];
  let porDia = {};
  if (sbLinea) {
    const r = await pedidosPorDia(sbLinea, desdeCrudo);
    if (r.error) problemas.push(`pedidos de la tienda: ${r.error}`);
    else porDia = r.porDia || {};
  } else {
    problemas.push('no hay credenciales de la base de esta marca: la zona sale sin los pedidos reales');
  }

  const meta = await proximaMeta(sbLinea, cierre);
  const zona = armarZona({
    filas, techo, techoCaja, pedidosPorDia: porDia, hasta: cierre,
    objetivoPedidos: meta ? Number(meta.objetivo) || 0 : 0, ventana: dias,
  });

  return res.status(200).json({
    ok: true,
    linea,
    dias,
    zona,
    techo: techo || null,
    techoCaja,
    // 🔴 La ficha viaja con su FECHA y con su ticket, y la pantalla los contrasta contra el ticket
    // real de la ventana. El 25-ago-2026 el monitor imprimía un techo con cara de certeza que estaba
    // cargado a precio de LISTA con la tienda en liquidación, y se le creyó toda una tarde: **una
    // regla no protege de una ficha mal cargada**.
    ficha,
    meta: meta ? { label: meta.label, objetivo: Number(meta.objetivo) || 0, fecha: meta.fecha_objetivo } : null,
    // Lo que faltó va en la respuesta y no en un 502: media zona con el motivo al lado sirve; una
    // pantalla en blanco porque la tienda no contestó, no.
    problemas,
  });
}
