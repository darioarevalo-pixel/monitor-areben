// Caja — la CALCULADORA DE BILLETES (plan del 5-oct-2026, fase B): cantidad × billete ⇒ total. Se
// usa al abrir el turno (el fondo), en los conteos intermedios y al cerrarlo (el efectivo contado).
//
// 🔑 EL TOTAL SE CALCULA ACÁ, EN LAS DOS PUNTAS: la pantalla para mostrarlo y el servidor otra vez al
// guardar. Si el conteo ⛔ suma el fondo (o el contado) que mandó la pantalla, el servidor contesta
// 400: el turno ⛔ queda con un conteo que dice una cosa y un fondo que dice otra.
//
// Un conteo es `{ [valor del billete]: cantidad }`: `{ 20000: 3, 1000: 4, 500: 1 }` = $64.500.
// Los billetes son los de `caja_config.reglas.billetes` (los edita un admin); sin la lista, los de
// `BILLETES_INICIALES` (Bruno, 5-oct: sin monedas).

const exigir = (cond, msg) => { if (!cond) throw new Error(msg) }

export const BILLETES_INICIALES = Object.freeze([20000, 10000, 2000, 1000, 500, 200, 100])

/**
 * Los billetes de la Caja: los que circulan en Argentina, ⛔ se configuran (Bruno, 12-oct: «son los billetes
 * que corren en Argentina, no se configura»). Una `reglas.billetes` vieja guardada en la base ⛔ cuenta: la
 * pantalla y el servidor (que rearma el total del conteo) usan esta MISMA lista.
 * @param {unknown} [_reglas] se ignora; queda para no tocar a los que la llaman
 * @returns {number[]}
 */
export function billetesDe(_reglas) {
  return [...BILLETES_INICIALES]
}

/** Un conteo con cero de cada billete. */
export function conteoVacio(billetes) {
  exigir(Array.isArray(billetes), 'Faltan los billetes')
  return Object.fromEntries(billetes.map((v) => [String(v), 0]))
}

/**
 * El conteo limpio: sólo los billetes de la lista, cada uno con su cantidad. Lanza si una cantidad
 * es negativa o ⛔ entera. Un valor que ⛔ está en la lista se ignora (un billete que el admin sacó).
 * @param {Record<string, unknown>} conteo
 * @param {number[]} billetes
 * @returns {Record<string, number>}
 */
export function limpiarConteo(conteo, billetes) {
  exigir(conteo && typeof conteo === 'object' && !Array.isArray(conteo), 'Falta el conteo de billetes')
  exigir(Array.isArray(billetes), 'Faltan los billetes')
  const out = conteoVacio(billetes)
  for (const v of billetes) {
    const c = conteo[String(v)]
    if (c == null || c === '') continue
    const n = Number(c)
    exigir(Number.isInteger(n) && n >= 0, `La cantidad de billetes de $${v} tiene que ser un número entero (0 o más)`)
    out[String(v)] = n
  }
  return out
}

/** Cantidad × valor de cada billete de la lista. Lanza como `limpiarConteo`. */
export function totalDeConteo(conteo, billetes) {
  const limpio = limpiarConteo(conteo, billetes)
  return billetes.reduce((s, v) => s + v * limpio[String(v)], 0)
}
