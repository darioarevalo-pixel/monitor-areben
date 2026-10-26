/**
 * `erp › Configuración › Redondeo` del lado del monitor (puro): a cuánto se redondea el precio de cada canal. El redondeo y su
 * guardado son del motor (`motor/venta/redondeo*.mjs`, sql/029): una fila = línea × canal DESDE un momento, ⛔ se edita, se pone
 * otra, y ⛔ para atrás. Sin fila ⇒ ⛔ se redondea. Lo usan `api/_erp-redondeo.js` y la pantalla (`components/erp/Redondeo.tsx`).
 *
 * 🔑 Bruno (20-oct): «sobre redondeo tiene que generarse configuración, y entre esas configuraciones, una que redondee en 100».
 * Hoy lo usa el pedido mayorista (GN lo redondea al $100 más cercano); la Caja sigue con el suyo (`lib/caja/marcas.core.js`).
 */
import { MODOS, PASOS, redondear } from '../../motor/venta/redondeo.mjs'

export const CANALES_DE_REDONDEO = ['local', 'online', 'mayorista', 'ml']
export const NOMBRE_MODO = { cercano: 'Al más cercano', abajo: 'Hacia abajo', arriba: 'Hacia arriba' }
export { MODOS, PASOS }

/**
 * «Al $100 más cercano» · «Hacia abajo, al $10» · «Sin redondeo».
 * @param {{ paso: number, modo: string } | null | undefined} r
 */
export function textoDeRedondeo(r) {
  if (!r) return 'Sin redondeo'
  const paso = `$${Number(r.paso).toLocaleString('es-AR')}`
  return r.modo === 'cercano' ? `Al ${paso} más cercano` : `${NOMBRE_MODO[r.modo] ?? r.modo}, al ${paso}`
}

/** Lo que haría con un monto de ejemplo, para que se vea antes de guardar. @returns {number} */
export const ejemploDeRedondeo = (monto, r) => redondear(monto, r)

/**
 * Lo que manda la pantalla para poner un redondeo. La marca (la BASE) la pone el servidor; el cuerpo elige una LÍNEA de ella
 * (Stunned en Zattia). Sin `desde` = ahora. Devuelve `{ redondeo }` o `{ error, campo }`; el resto lo valida el motor.
 * @param {any} b @param {{ marca: string, lineas: string[] }} o
 */
export function leerRedondeoDePantalla(b, { marca, lineas }) {
  if (!b || typeof b !== 'object') return { error: 'Falta el redondeo' }
  const linea = b.linea == null || b.linea === '' ? marca : String(b.linea)
  if (!lineas.includes(linea)) return { error: 'Línea inválida', campo: 'linea' }
  if (!CANALES_DE_REDONDEO.includes(b.canal)) return { error: 'Canal inválido', campo: 'canal' }
  const paso = Number(b.paso)
  if (!PASOS.includes(paso)) return { error: 'Paso inválido', campo: 'paso' }
  if (!MODOS.includes(b.modo)) return { error: 'Modo inválido', campo: 'modo' }
  /** @type {{ marca: string, canal: string, paso: number, modo: string, desde?: string }} */
  const redondeo = { marca: linea, canal: b.canal, paso, modo: b.modo }
  if (b.desde != null && b.desde !== '') redondeo.desde = String(b.desde)
  return { redondeo }
}

/**
 * Una fila por canal, en el orden de la pantalla, con el redondeo que vale hoy y el próximo si ya está puesto.
 * @param {Array<{ canal: string, vigente: any, proximo: any }>} lista lo que devuelve `redondeosDe` del motor
 */
export function filasDeRedondeo(lista) {
  const porCanal = new Map((lista || []).map((f) => [f.canal, f]))
  const otros = [...porCanal.keys()].filter((c) => !CANALES_DE_REDONDEO.includes(c))
  return [...CANALES_DE_REDONDEO, ...otros].map((canal) => {
    const f = porCanal.get(canal)
    return { canal, vigente: f?.vigente ?? null, proximo: f?.proximo ?? null }
  })
}
