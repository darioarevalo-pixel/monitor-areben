// Caja — la venta que GN ya ⛔ tiene queda ANOTADA en `caja_venta.anulada_en_gn` (libro de stock, 12-oct-2026).
//
// GN ⛔ anula por API: la venta anulada a mano en la web de GN deja de venir en `ventas/obtener` (⛔ viene
// con un estado). El cierre del turno ya la detectaba (A12) y ⛔ la guardaba: el libro de stock la seguía
// contando como vendida. La anotan dos caminos, con la MISMA regla (`anuladasAMarcar`, el modelo de
// `scripts/lib/registro-anuladas.mjs`: margen de 15 min y tope de 20):
//   - el cierre del turno (`api/_caja.js`), con lo que ya leyó de GN para el resumen ⇒ `por: 'cierre'`;
//   - el sync diario (`scripts/sync-diario*.js`), con la bajada del tramo de repaso ⇒ `por: 'sync'`.
// 🔑 `estado` ⛔ cambia (sigue `en_gn`): la venta se cobró y la plata del turno es otra cuenta (la foto
// del cierre). Anotada una vez, ⛔ se pisa: la primera que la vio gana.
// ⛔ Un error acá ⛔ frena ni el cierre ni el sync: quien llama lo loguea.

import { anuladasAMarcar, anuladasEnGN } from './cierre.core.js'

/** Medianoche de Argentina (UTC−3) de un YYYY-MM-DD, como ISO. */
const medianocheAR = (fecha) => `${fecha}T03:00:00.000Z`

/** La base ⛔ tiene la columna (o la Caja): ⛔ es un error, ⛔ hay dónde anotar. */
const sinColumna = (error) => /(anulada_en_gn|caja_venta)/.test(error.message || '') && /(does not exist|schema cache|not find)/i.test(error.message || '')

const COLUMNAS = 'id, estado, gn_sale_id, gn_number, creada_en, en_gn_en, anulada_en_gn'

/**
 * Anota las que corresponden de `filas` (ventas que GN ya ⛔ devolvió).
 * @param sb  client de @supabase/supabase-js de la base de la marca
 * @param {any[]} filas  con `COLUMNAS`
 * @param {{ por: 'sync' | 'cierre', corte: Date, tope?: number, ahora?: Date }} opts
 * @returns {Promise<{ anotadas: number, numeros?: Array<number | string>, frenado?: string }>}
 */
async function anotar(sb, filas, { por, corte, tope, ahora = new Date() }) {
  const { ids, frenado } = anuladasAMarcar(filas, corte, { tope })
  if (frenado) return { anotadas: 0, frenado }
  if (!ids.length) return { anotadas: 0 }
  const { error } = await sb.from('caja_venta')
    .update({ anulada_en_gn: { por, en: ahora.toISOString() } })
    .in('id', ids).is('anulada_en_gn', null)
  if (error) throw new Error(error.message)
  const numeros = filas.filter((f) => ids.includes(String(f.id))).map((f) => f.gn_number || f.gn_sale_id)
  return { anotadas: ids.length, numeros }
}

/**
 * El CIERRE: las ventas del turno que el resumen ya dio por anuladas (`resumen.anuladasGN`).
 * @param sb
 * @param {string[]} ids  de `caja_venta`
 * @param {Date} corte  cuándo empezó la lectura fresca de GN del cierre
 */
export async function anotarAnuladasDelCierre(sb, ids, corte, opts = {}) {
  if (!ids.length) return { anotadas: 0 }
  const { data, error } = await sb.from('caja_venta').select(COLUMNAS).in('id', ids)
  if (error) {
    if (sinColumna(error)) return { anotadas: 0, sinColumna: true }
    throw new Error(error.message)
  }
  return anotar(sb, data || [], { ...opts, por: 'cierre', corte })
}

/**
 * El SYNC diario: toda venta `en_gn` de la Caja creada desde el primer día del tramo de repaso (que la
 * bajada recorrió ENTERO) y que GN ⛔ devolvió.
 * @param sb
 * @param {Set<number>} idsGN  lo que GN devolvió para el tramo de repaso
 * @param {string} desde  YYYY-MM-DD, el primer día del tramo
 * @param {Date} corte  cuándo empezó la bajada
 */
export async function anotarAnuladasDeCaja(sb, idsGN, desde, corte, opts = {}) {
  const { data, error } = await sb.from('caja_venta').select(COLUMNAS)
    .eq('estado', 'en_gn').not('gn_sale_id', 'is', null).is('anulada_en_gn', null)
    .gte('creada_en', medianocheAR(desde)).lt('creada_en', corte.toISOString())
    .limit(5000)
  if (error) {
    if (sinColumna(error)) return { anotadas: 0, sinColumna: true }
    throw new Error(error.message)
  }
  const faltan = new Set(anuladasEnGN({ ventas: data || [], idsGN }))
  return anotar(sb, (data || []).filter((v) => faltan.has(String(v.id))), { ...opts, por: 'sync', corte })
}
