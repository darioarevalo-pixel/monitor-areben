/**
 * Las ventas que creó el monitor y que Gestión Nube ya no devuelve: se anotan como ANULADAS en el
 * registro (`gn_venta_monitor`, ver sql/migrate-gn-venta-monitor.sql).
 *
 * POR QUÉ EXISTE (libro de stock, 13-oct-2026)
 * GN ⛔ anula por API: una venta se anula a mano en la web de GN y simplemente deja de venir en
 * `ventas/obtener` (⛔ viene con un estado). Ninguna fuente del monitor se enteraba —medido el 12-oct:
 * 7 ventas de prueba de la Caja seguían `en_gn` y GN ya no las tenía—. En vez de ponerle un «anular»
 * a cada pantalla, se usa la lista que el sync YA bajó: toda venta del registro creada antes de la
 * bajada y que no está en la lista, GN la anuló. Cubre fallas, canjes, reclamos, sesiones de fotos,
 * solicitudes y el import de TN de Stunned de una vez, sin gastar cupo de GN.
 *
 * ⚠️ Sólo mira lo que la bajada recorrió entera (el tramo de repaso) y lo creado hasta 15 minutos
 * antes de empezarla: una venta creada durante la bajada puede no haber venido y ⛔ está anulada.
 * TOPE: más de `tope` anuladas de golpe es una respuesta rara de GN, ⛔ anulaciones: no se anota nada.
 */

const MARGEN_MS = 15 * 60e3

/** Medianoche de Argentina (UTC−3) de un YYYY-MM-DD, como ISO. */
const medianocheAR = (fecha) => `${fecha}T03:00:00.000Z`

/**
 * Las filas del registro que GN ya no tiene. Pura (la prueba `tests/registro-anuladas.test.ts`).
 * @param {Array<{gn_venta_id:number|string, creada_en:string}>} filas  sin anular, del tramo de repaso
 * @param {Set<number>} idsGN
 * @param {Date} corte  cuándo empezó la bajada de GN
 */
export function anuladasEnGN(filas, idsGN, corte) {
  const limite = corte.getTime() - MARGEN_MS
  return filas.filter((f) => new Date(f.creada_en).getTime() < limite && !idsGN.has(Number(f.gn_venta_id)))
}

/**
 * @param supabase  client de @supabase/supabase-js (service key)
 * @param {Set<number>} idsGN  lo que GN devolvió para el tramo de repaso
 * @param {string} desde  YYYY-MM-DD, el primer día del tramo de repaso
 * @param {Date} corte  cuándo empezó la bajada
 * @returns {Promise<{anotadas:number, frenado?:string}>}
 */
export async function anotarAnuladasDelRegistro(supabase, idsGN, desde, corte, { tope = 20, ahora = new Date() } = {}) {
  const { data, error } = await supabase.from('gn_venta_monitor')
    .select('gn_venta_id, gn_number, creada_en')
    .is('anulada_en', null).gte('creada_en', medianocheAR(desde)).lt('creada_en', corte.toISOString())
    .limit(5000)
  if (error) {
    // Base sin la migración: no hay registro que anotar.
    if (/gn_venta_monitor/.test(error.message || '') && /(does not exist|schema cache|not find)/i.test(error.message || '')) return { anotadas: 0 }
    throw new Error(error.message)
  }
  const faltan = anuladasEnGN(data || [], idsGN, corte)
  if (!faltan.length) return { anotadas: 0 }
  if (faltan.length > tope) {
    return { anotadas: 0, frenado: `${faltan.length} ventas del monitor no vinieron de GN (tope ${tope}): parece una respuesta incompleta, no se anotó ninguna` }
  }
  const ids = faltan.map((f) => Number(f.gn_venta_id))
  const { error: e2 } = await supabase.from('gn_venta_monitor')
    .update({ anulada_en: ahora.toISOString(), anulada_por: 'sync', anulada_nota: 'Gestión Nube ya no la devuelve (sync diario)' })
    .in('gn_venta_id', ids).is('anulada_en', null)
  if (e2) throw new Error(e2.message)
  console.log(`[registro] ${ids.length} venta(s) del monitor anuladas en GN: ${faltan.map((f) => f.gn_number || f.gn_venta_id).join(', ')}`)
  return { anotadas: ids.length }
}
