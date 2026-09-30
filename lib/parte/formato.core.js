/**
 * Formatos del parte de la mañana: plata, días, fechas. Los comparten el modelo (`mail.core.js`)
 * y el dibujo (`html.core.js`); viven aparte para que esos dos ⛔ se importen entre sí.
 */

import { ETIQUETA_LINEA } from '../lineas.core.js'
import { variacion } from './ventas.core.js'

export const BASE = 'https://monitorareben.vercel.app'
/** Cuántos renglones por lista, como mucho. El resto se cuenta y lleva al monitor. */
export const TOPE_LISTA = 5
/** La recompra: cuántos proveedores y cuántos productos de cada uno. */
export const TOPE_PROVEEDORES = 5
export const TOPE_POR_PROVEEDOR = 3

const nf = new Intl.NumberFormat('es-AR')
const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

export const plata = (v) => `$ ${nf.format(Math.round(v || 0))}`
/** Plata corta, para lo que se lee de un vistazo: `$ 2,9 M` · `$ 850 mil`. */
export function plataCorta(v) {
  const n = Math.round(v || 0)
  if (Math.abs(n) >= 1e6) return `$ ${nf1.format(n / 1e6)} M`
  if (Math.abs(n) >= 1e3) return `$ ${nf.format(Math.round(n / 1e3))} mil`
  return `$ ${nf.format(n)}`
}
export const entero = (n) => nf.format(Math.round(n || 0))
export const marca = (linea) => ETIQUETA_LINEA[linea] || linea
export function dias(d) {
  if (!Number.isFinite(d)) return 'sin venta'
  if (d < 1) return 'menos de 1 día'
  const n = Math.floor(d)
  return `${nf.format(n)} ${n === 1 ? 'día' : 'días'}`
}

/** `{ pct, texto }` contra la semana pasada; `pct` en `null` si ⛔ hay con qué comparar. */
export function contraSemana(ahora, antes) {
  const v = variacion(ahora, antes)
  if (v == null) return { pct: null, texto: 'sin comparación' }
  const r = Math.round(v)
  return { pct: r, texto: `${r > 0 ? '▲ +' : r < 0 ? '▼ −' : '± '}${Math.abs(r)}%` }
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** `2026-10-01` → `jueves 1 de octubre`. */
export function fechaLarga(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${DIAS_SEMANA[dia]} ${d} de ${MESES[m - 1]}`
}
/** La inicial del día de la semana, para las barritas. */
export function inicialDia(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

