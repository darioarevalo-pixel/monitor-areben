/**
 * ERP › Productos y precios › Precios, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §7; tablero 5 del v8,
 * pestaña «Precios»): TODAS las listas de cada producto en una grilla, de sólo lectura, con su oferta o liquidación y el
 * último cambio. Las filas son las de Productos (`armarFilasProductos`): esto sólo arma vistas, columnas y orden.
 *
 * 🔑 Medido 20-oct (`oraculos/precios-medir*-lectura.mjs`): el motor tiene 4 listas (Local · Online · Mayorista · «Tienda Nube
 *    con oferta»); la «Mayorista especial» del v8 ⛔ existe ⇒ ⛔ columna. El historial (`producto_precio`) arranca el 15-oct
 *    con la COPIA de GN y TN y tiene 0 cambios de verdad ⇒ «Cambiados este mes» cuenta sólo un precio distinto del anterior.
 *    Oferta de TN más baja que Online: BDI 30, Zattia 333, Stunned 25. Liquidación en curso: «Feria Online» (Zattia, 235).
 */

import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'
import { normal } from './stock-lista.core.js'

/** Las listas como columna, en el orden del diseño. */
export const LISTAS_PRECIO = ['local', 'online', 'mayorista']

/**
 * La oferta o liquidación del producto: la liquidación en curso del monitor manda; si no, el precio de TN con oferta cuando es
 * MÁS BAJO que Online (igual = ⛔ hay oferta).
 * @param {import('./productos-lista.core.js').FilaProducto} f
 * @returns {{ tipo: 'liquidacion', nombre: string, precio: number | null, hasta: string | null } | { tipo: 'oferta', precio: number, pct: number | null } | null}
 */
export function ofertaDe(f) {
  if (f.liquidacion) return { tipo: 'liquidacion', nombre: f.liquidacion.nombre, precio: f.liquidacion.precio, hasta: f.liquidacion.hasta }
  const { oferta, online } = f.precios
  if (oferta == null || online == null || !(oferta < online)) return null
  return { tipo: 'oferta', precio: oferta, pct: online > 0 ? Math.round((1 - oferta / online) * 100) : null }
}

/** @type {Array<[string, string, (f: import('./productos-lista.core.js').FilaProducto) => boolean]>} */
export const VISTAS_PRECIO = [
  ['todos', 'Todos', () => true],
  ['oferta', 'Con liquidación u oferta', (f) => ofertaDe(f) != null],
  ['cambiados', 'Cambiados este mes', (f) => f.cambiosMes > 0],
  ['sinmay', 'Sin precio mayorista', (f) => f.precios.mayorista == null],
]

/** @param {import('./productos-lista.core.js').FilaProducto[]} filas */
export function contarVistasPrecio(filas) {
  return Object.fromEntries(VISTAS_PRECIO.map(([k, , entra]) => [k, filas.filter(entra).length]))
}

/** La vista sobre lo que ya filtró el buscador de Productos. @param {import('./productos-lista.core.js').FilaProducto[]} filas */
export function filtrarPrecio(filas, vista = 'todos') {
  const entra = VISTAS_PRECIO.find(([k]) => k === vista)?.[2] ?? (() => true)
  return filas.filter(entra)
}

/** El resumen arriba (sobre lo filtrado, ⛔ sobre la vista). @param {import('./productos-lista.core.js').FilaProducto[]} filas */
export function resumenPrecio(filas) {
  let liquidacion = 0, oferta = 0, cambiados = 0, sinMayorista = 0
  for (const f of filas) {
    const o = ofertaDe(f)
    if (o?.tipo === 'liquidacion') liquidacion++
    else if (o) oferta++
    if (f.cambiosMes > 0) cambiados++
    if (f.precios.mayorista == null) sinMayorista++
  }
  return { productos: filas.length, liquidacion, oferta, cambiados, sinMayorista }
}

/**
 * Por columna (↓ ↑); sin orden, por nombre. Un precio que falta va al final al ordenar de mayor a menor (−∞).
 * @param {import('./productos-lista.core.js').FilaProducto[]} filas @param {{ col: string, dir: 'asc' | 'desc' } | null} orden
 */
export function ordenarPrecio(filas, orden) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f) => (LISTAS_PRECIO.includes(k) ? (f.precios[k] ?? -Infinity)
    : k === 'oferta' ? (ofertaDe(f)?.precio ?? -Infinity)
      : k === 'ult' ? (f.ultimoCambio ? Date.parse(f.ultimoCambio.cuando) : -Infinity)
        : k === 'cat' ? normal(f.categoria ?? '') : normal(f.nombre))
  const porNombre = (a, b) => normal(a.nombre).localeCompare(normal(b.nombre))
  return filas.slice().sort((a, b) => {
    if (!k) return porNombre(a, b)
    const x = val(a), y = val(b)
    return (x > y ? 1 : x < y ? -1 : 0) * dir || porNombre(a, b)
  })
}

/**
 * clave → [título, ancho, ordena, fija]. Cada ancho con su MÍNIMO en px (`ListaTrabajo` › `anchoMinimo`).
 * @returns {Record<string, [string, string, boolean, boolean]>}
 */
export function columnasPrecio() {
  return {
    p: ['Producto', 'minmax(220px, 1.6fr)', true, true],
    local: ['Local', '96px', true, false],
    online: ['Online (TN)', '104px', true, false],
    mayorista: ['Mayorista', '96px', true, false],
    oferta: ['Oferta o liquidación', 'minmax(190px, 1fr)', true, false],
    ult: ['Último cambio', 'minmax(170px, 1.2fr)', true, false],
    cat: ['Categoría', 'minmax(120px, 1fr)', true, false],
    linea: ['Línea', '76px', false, false],
  }
}

export function columnasPrecioDeSiempre() {
  return { orden: ['p', 'local', 'online', 'mayorista', 'oferta', 'ult', 'cat', 'linea'], visibles: ['p', 'local', 'online', 'mayorista', 'oferta', 'ult'] }
}

/** @param {unknown} raw */
export const normalizarPrefsPrecio = (raw) => normalizarPrefsDe(columnasPrecio(), columnasPrecioDeSiempre(), raw)
export const alternarColumnaPrecio = (prefs, col) => alternarColumnaDe(columnasPrecio(), prefs, col)
export { moverColumna }
