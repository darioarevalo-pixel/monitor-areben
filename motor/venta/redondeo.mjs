/**
 * El REDONDEO como configuración (sql/029). Puro: lo usan la puerta del catálogo mayorista (`api/pedido-mayorista.js`)
 * y, cuando la pantalla exista, `erp › Configuración`.
 *
 * 🔑 Bruno (20-oct): «sobre redondeo tiene que generarse configuración, y entre esas configuraciones, una que redondee
 * en 100». Una fila = marca × canal DESDE una fecha (como `ruta_cobro`: ⛔ se edita, se pone otra). Sin fila ⇒ ⛔ se
 * redondea. Medido 20-oct: GN redondea el mayorista al $100 MÁS CERCANO (un $50 sube) ⇒ la semilla de la 029.
 */

export const PASOS = Object.freeze([1, 10, 100, 1000])
export const MODOS = Object.freeze(['cercano', 'abajo', 'arriba'])

const centavos = (n) => Math.round(n * 100) / 100

/**
 * Redondea `monto` con `{ paso, modo }`; sin configuración devuelve el monto (a centavos).
 * @param {number} monto  @param {{ paso: number, modo: string } | null | undefined} r
 */
export function redondear(monto, r) {
  const m = Number(monto)
  if (!Number.isFinite(m)) throw new Error(`monto inválido: ${monto}`)
  if (!r) return centavos(m)
  const paso = Number(r.paso)
  if (!PASOS.includes(paso)) throw new Error(`paso de redondeo inválido: ${r.paso}`)
  if (!MODOS.includes(r.modo)) throw new Error(`modo de redondeo inválido: ${r.modo}`)
  // A centavos antes de dividir: 111.849,999… ⛔ tiene que caer del lado equivocado por la coma flotante.
  const x = centavos(m) / paso
  const n = r.modo === 'abajo' ? Math.floor(x + 1e-9) : r.modo === 'arriba' ? Math.ceil(x - 1e-9) : Math.floor(x + 0.5 + 1e-9)
  return centavos(n * paso)
}

/**
 * El redondeo que vale para una marca × canal en una fecha: el de `desde` más nuevo que ya empezó.
 * @param {Array<{ marca: string, canal: string, paso: any, modo: string, desde: any }>} filas
 * @param {{ marca: string, canal: string, en?: Date | string }} q
 */
export function redondeoVigente(filas, { marca, canal, en = new Date() }) {
  const t = new Date(en).getTime()
  let mejor = null
  for (const r of filas) {
    if (r.marca !== marca || r.canal !== canal) continue
    const d = new Date(r.desde).getTime()
    if (d <= t && (!mejor || d > new Date(mejor.desde).getTime())) mejor = r
  }
  return mejor ? { paso: Number(mejor.paso), modo: mejor.modo, desde: mejor.desde } : null
}
