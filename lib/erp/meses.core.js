/**
 * Los MESES ANTERIORES de las listas del ERP (Bruno 10-nov: «poder cambiar de mes en el erp - no veo como ir para atras en los meses»).
 * Las listas tenían sólo «Este mes» y «El mes pasado»: acá salen los de antes como opciones del MISMO selector de período,
 * con clave `m:AAAA-MM` («Septiembre 2026»), y su rango de días. Núcleo puro (`tests/erp-meses.test.ts`).
 * 🔑 «Este mes» y «El mes pasado» siguen con su clave de siempre: los meses de acá arrancan dos atrás.
 */

const NOMBRES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const z = (n) => String(n).padStart(2, '0')

/** Cuántos meses para atrás se ofrecen (con el actual): un año. */
export const MESES_ATRAS = 12

/** `2026-09` → «Septiembre 2026». */
export function nombreDelMes(ym) {
  return `${NOMBRES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
}

/** `2026-11` y `-2` → `2026-09`. */
export function correrMes(ym, n) {
  const k = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n
  return `${Math.floor(k / 12)}-${z((k % 12) + 1)}`
}

/** El último día del mes: `2026-02` → `2026-02-28`. */
export function ultimoDiaDelMes(ym) {
  const [a, m] = ym.split('-').map(Number)
  return `${ym}-${z(new Date(Date.UTC(a, m, 0)).getUTCDate())}`
}

/** La clave `m:AAAA-MM` ⇒ `AAAA-MM`; cualquier otra cosa ⇒ null. */
export function mesDeClave(clave) {
  const r = /^m:(\d{4})-(\d{2})$/.exec(String(clave ?? ''))
  return r && Number(r[2]) >= 1 && Number(r[2]) <= 12 ? `${r[1]}-${r[2]}` : null
}

/**
 * Los meses de antes del pasado, del más nuevo al más viejo: `[['m:2026-09', 'Septiembre 2026'], …]` hasta completar `MESES_ATRAS`.
 * @param {string} hoy AAAA-MM-DD (día argentino)
 * @returns {Array<[string, string]>}
 */
export function mesesAnteriores(hoy) {
  const actual = hoy.slice(0, 7)
  return Array.from({ length: MESES_ATRAS - 2 }, (_, i) => {
    const ym = correrMes(actual, -(i + 2))
    return [`m:${ym}`, nombreDelMes(ym)]
  })
}

/** Los períodos de una lista + los meses de antes. @param {Array<[string, string]>} base @param {string} hoy */
export function conMesesAnteriores(base, hoy) {
  return [...base, ...mesesAnteriores(hoy)]
}

/** El rango de una clave `m:AAAA-MM` (del 1 al último día; ⛔ pasa de hoy), o null si la clave no es de un mes. */
export function rangoDeMes(clave, hoy) {
  const ym = mesDeClave(clave)
  if (!ym) return null
  const fin = ultimoDiaDelMes(ym)
  return { desde: `${ym}-01`, hasta: fin < hoy ? fin : hoy }
}
