/**
 * **¿Esta LÍNEA ya está en el ERP?** — la regla, una sola, para conteos, fallas, solicitudes y canjes (erp-stunned §8.4, Bruno 30-oct).
 *
 * «Está en el ERP» = la línea tiene fila en `erp_corte` (motor sql/063, inmutable, una por línea) **y el instante ya pasó**. La
 * escribe el alineo del corte (`libro.mjs alinear --linea X --corte`); la leen el proyector y el lector del dashboard del motor
 * (`cargarCortes`, `gnYaNoManda`) ⇒ el monitor lee la MISMA tabla, ⛔ una llave aparte (`LECTURAS_STUNNED_ERP` era la de Stunned
 * y se desincronizaba). Sin corte ⇒ el camino de GN de siempre. Desde el corte ⇒ el libro manda y la salida mueve el libro.
 * 🎯 Cortes: Stunned 28-oct, BDI 15/16-nov, Zattia 23-nov.
 *
 * 🔑 La línea sale del PRODUCTO (`productos.sku` del espejo, en el servidor), ⛔ de la pantalla ni del cajón.
 * Puro: la lectura de la base vive en `api/_erp-corte.js`.
 */
import { lineasDeMarca } from '../lineas.core.js'

export const SQL_CORTES = 'select linea, instante from erp_corte'

/**
 * Las filas de `erp_corte` como `{ linea: ISO }`.
 * @param {Array<{ linea: string, instante: string | Date }>} rows @returns {Record<string, string>}
 */
export function cortesDeFilas(rows) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const r of rows || []) {
    if (!r || !r.linea || r.instante == null) continue
    out[String(r.linea)] = r.instante instanceof Date ? r.instante.toISOString() : String(r.instante)
  }
  return out
}

/**
 * ¿La línea ya pasó al ERP en `ahora`? `cortes` es OBLIGATORIO: ⛔ un default que olvide el corte callado (mismo contrato que
 * `gnYaNoManda` del motor).
 * @param {Record<string, string>} cortes @param {string} linea @param {Date} [ahora]
 */
export function lineaEnErp(cortes, linea, ahora = new Date()) {
  if (!cortes || typeof cortes !== 'object') throw new Error('lineaEnErp: faltan los cortes (erp_corte).')
  const c = cortes[linea]
  if (!c) return false
  const t = Date.parse(c)
  if (!Number.isFinite(t)) throw new Error(`erp_corte: instante inválido para ${linea}`)
  return ahora.getTime() >= t
}

/** Las líneas de una base del monitor (`bdi` | `zattia`) que ya están en el ERP. */
export function lineasEnErp(cortes, base, ahora = new Date()) {
  return lineasDeMarca(base).filter((l) => lineaEnErp(cortes, l, ahora))
}

/**
 * Las bases cuyo GN SIGUE VENDIENDO aunque todas sus líneas hayan cortado. Vacía desde el 22-nov: BDI salió (estuvo por «bdi
 * mayorista tiene un mes más», Bruno 18-nov, corregido el 19-nov: todo está en el ERP; medido 22-nov: 0 ventas cargadas en GN
 * de BDI desde su corte, las 212 filas del espejo son copias del ERP). Bruno 22-nov: «no hay que comparar nada con gestion nube,
 * a partir de hoy, estamos todo dentro de areben gestion».
 */
export const GN_SIGUE_DESPUES_DEL_CORTE = []

/**
 * Un día de gracia después del corte: el sync de GN corre una vez más para traer lo vendido en GN el día del corte, antes de
 * la hora (el diario de las 06:00 UTC del día siguiente). Después ⛔ se lee: la baja de GN (Zattia, 24-nov) lo dejaría en rojo.
 */
export const GRACIA_GN_MS = 24 * 60 * 60 * 1000

/**
 * **¿Los syncs dejan de leer el GN de esta base?** Sí ⇔ TODAS sus líneas cortaron hace más de `GRACIA_GN_MS` y la base ⛔ está
 * en `GN_SIGUE_DESPUES_DEL_CORTE`. Lo que viene de GN ya ⛔ tiene ventas ni stock de esa base: lo escribe el libro
 * (`erp-inventario-espejo.mjs`, `erp-ventas-espejo.mjs`), que corre igual.
 * @param {Record<string, string>} cortes @param {string} base @param {Date} [ahora]
 */
export function gnSeSaltea(cortes, base, ahora = new Date()) {
  if (!cortes || typeof cortes !== 'object') throw new Error('gnSeSaltea: faltan los cortes (erp_corte).')
  if (GN_SIGUE_DESPUES_DEL_CORTE.includes(base)) return false
  const todas = lineasDeMarca(base)
  if (!todas.length) return false
  const antes = new Date(ahora.getTime() - GRACIA_GN_MS)
  return lineasEnErp(cortes, base, antes).length === todas.length
}
