// «Cómo viene»: la ventana actual contra la anterior, para el Panel.
//
//   GET /api/meta-ads?recurso=tendencia[&dias=30|90]
//
// ⚠️ Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby.
//
// # Sale entero de la base, y por eso va ANTES del guard del token
//
// No importa `graph.core.js` y no necesita `META_ADS_TOKEN`. Es la única parte del Panel que sabe
// de historia —Graph no contesta «cómo venía»— y es la que sigue en pie el día que el token se
// venza, igual que los planes, las reglas y los números de la Biblioteca.
//
// # 🔴 Dos consultas y media, no una
//
// Hace falta saber DESDE CUÁNDO hay foto antes de elegir la ventana: con el selector en 90 días los
// 90 anteriores no existen (la foto arrancó el 11-may-2026) y comparar contra eso da un −100% que
// no pasó. Por eso `primeraFecha()` va primero y recién después se lee el tramo. Son dos filas y un
// rango chico: a nivel campaña son ~430 filas en 180 días, medido el 9-ago-2026.
import { lineasQueVe } from '../lib/meta-ads/acciones.core.js';
import { leerSnapshot, primeraFecha, ultimaFecha } from '../lib/meta-ads/leer-snapshot.core.js';
import { NIVEL_TOTALES } from '../lib/meta-ads/snapshot.core.js';
import { comparar, hoyIso, ventanasDe } from '../lib/meta-ads/tendencia.core.js';
import { clienteBdi } from './_meta-lineas.js';

/** Las columnas que necesita la comparación. Explícitas: la tabla tiene 25. */
const COLS = 'fecha,nivel,objeto_id,linea,spend,impresiones,clicks,compras,revenue';

/**
 * Los días que puede pedir el Panel. Son los mismos dos del selector de etapas (`UMBRALES_ETAPA`),
 * y lo que venga de afuera no se cree: un `dias=100000` haría un escaneo de la tabla entera.
 */
const DIAS = new Set([30, 90]);
const DIAS_DEFECTO = 30;

export default async function tendenciaGet(res, perfil, q) {
  const sb = clienteBdi();
  if (!sb) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const visibles = lineasQueVe(perfil);
  if (!visibles.length) return res.status(403).json({ error: 'No tenés acceso a la pauta de ninguna marca.' });

  const pedidos = parseInt(q.dias, 10);
  const dias = DIAS.has(pedidos) ? pedidos : DIAS_DEFECTO;

  // Desde cuándo hay foto A NIVEL CAMPAÑA, que es el nivel del que salen los totales. Preguntar por
  // la tabla entera daría el día en que arrancó el nivel `cuenta`, que es anterior, y prometería una
  // ventana que a este nivel no está.
  const primera = await primeraFecha(sb, NIVEL_TOTALES);
  if (primera.error) return res.status(502).json({ error: 'No se pudo leer la foto diaria.', detalle: primera.error });
  if (!primera.fecha) {
    return res.status(200).json({
      ok: true, ventanas: null, ultimaFoto: null,
      total: null, porLinea: {}, sinLinea: { actual: 0, anterior: null }, serie: [],
    });
  }

  const ventanas = ventanasDe(hoyIso(), dias, primera.fecha);
  const desde = ventanas.anterior ? ventanas.anterior.desde : ventanas.actual.desde;

  const snap = await leerSnapshot(sb, { cols: COLS, desde, hasta: ventanas.actual.hasta, nivel: NIVEL_TOTALES });
  if (snap.error) return res.status(502).json({ error: 'No se pudo leer la foto diaria.', detalle: snap.error });

  const ultima = await ultimaFecha(sb, NIVEL_TOTALES);

  return res.status(200).json({
    ok: true,
    ventanas,
    // Si el cron se cayó, la comparación sigue siendo verdadera pero vieja. La pantalla lo dice.
    ultimaFoto: ultima.error ? null : ultima.fecha,
    ...comparar(snap.filas, { ventanas, visibles }),
  });
}
