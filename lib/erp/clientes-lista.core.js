/**
 * ERP › Clientes y proveedores › Clientes, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 4
 * del v8): UNA lista con cada cliente, vistas con su número, resumen arriba, columnas a elección y la ficha al costado con
 * el SALDO DE LA CUENTA (decisión 4: pendiente de sus ventas − saldo a favor). Puro: lo lee `api/_erp-clientes.js`.
 *
 * 🔑 Medido 19-oct (`~/Documents/erp-monitor/oraculos/clientes-medir*-lectura.mjs`): el motor todavía ⛔ tiene clientes
 *    (`cliente` 0 filas, 0 de ~1.400 ventas con `cliente_id`, `cuenta_movimiento` vacía) ⇒ la lista sale del ESPEJO DE GN
 *    (`ventas`): BDI por `client_id` (13.453), Zattia sólo por NOMBRE (4.028: su espejo ⛔ trae el id). «Consumidor Final»
 *    ⛔ es un cliente: se saca. La cuenta corriente del motor (§15) se suma cuando haya: hoy cada fila dice «sin cuenta».
 */

import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'
import { normal } from './stock-lista.core.js'

/**
 * @typedef {{ id: string, nombre: string, doc: string | null, compras: number, total: number, primera: string | null,
 *   ultima: string | null, mayorista: boolean, canales: string[], esteMes: boolean, dormido: boolean,
 *   clienteId: string | null, saldo: number | null, aFavor: number, vencido: boolean, soloErp: boolean }} FilaCliente
 */

const dia = (x) => (x == null ? null : typeof x === 'string' ? x.slice(0, 10) : new Date(x).toISOString().slice(0, 10))

/** El día `n` días antes de `hoy` (AAAA-MM-DD). */
function diasAntes(hoy, n) {
  const d = new Date(`${hoy}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * Una fila por cliente: los del espejo de GN y, encima, la cuenta del motor (por `gn_client_id`, o por nombre en Zattia).
 * Un cliente del motor sin compras en GN igual aparece (`soloErp`).
 * @param {{ gn: any[], erp?: Array<{ id: string, nombre: string, doc: string | null, gn_client_id: string | number | null }>,
 *   cuentas?: Array<{ cliente_id: string, saldo: number, a_favor: number, vencido: number | boolean }>, hoy: string }} x
 * @returns {FilaCliente[]}
 */
export function armarFilasClientes({ gn, erp = [], cuentas = [], hoy }) {
  const mes = `${hoy.slice(0, 7)}-01`
  const hace90 = diasAntes(hoy, 90)
  const cuenta = new Map(cuentas.map((c) => [c.cliente_id, c]))
  const filas = new Map()
  for (const g of gn) {
    const ultima = dia(g.ultima)
    filas.set(String(g.clave), {
      id: String(g.clave), nombre: String(g.nombre ?? '').trim() || 'Sin nombre', doc: null,
      compras: Number(g.compras) || 0, total: Number(g.total) || 0, primera: dia(g.primera), ultima,
      mayorista: Number(g.mayorista) > 0, canales: (g.canales || []).filter((c) => c && c !== 'Ninguno'),
      esteMes: !!ultima && ultima >= mes, dormido: !!ultima && ultima < hace90,
      clienteId: null, saldo: null, aFavor: 0, vencido: false, soloErp: false,
    })
  }
  for (const c of erp) {
    const k = c.gn_client_id != null ? String(c.gn_client_id) : `n:${normal(c.nombre)}`
    const f = filas.get(k) ?? filas.get(`n:${normal(c.nombre)}`)
    const cta = cuenta.get(c.id)
    const suma = { doc: c.doc ?? null, clienteId: c.id, saldo: cta ? Number(cta.saldo) : 0, aFavor: cta ? Number(cta.a_favor) || 0 : 0, vencido: !!cta?.vencido }
    if (f) Object.assign(f, suma)
    else filas.set(`erp:${c.id}`, { id: `erp:${c.id}`, nombre: c.nombre, compras: 0, total: 0, primera: null, ultima: null, mayorista: false, canales: [], esteMes: false, dormido: false, soloErp: true, ...suma })
  }
  return [...filas.values()]
}

/**
 * Cómo viaja cada cliente de GN (una tupla: BDI son 13.000 y con objetos pesaba 3,7 MB) y cómo se vuelve a armar.
 * @param {any} g @returns {any[]}
 */
export const aTupla = (g) => [String(g.clave), g.nombre, g.compras, g.total, g.primera, g.ultima, g.mayorista, (g.canales || []).filter((c) => c && c !== 'Ninguno')]
/** @param {any[]} t */
export const deTupla = ([clave, nombre, compras, total, primera, ultima, mayorista, canales]) => ({ clave, nombre, compras, total, primera, ultima, mayorista, canales })

/** Las vistas, con su número arriba. @type {Array<[string, string, (f: FilaCliente) => boolean]>} */
export const VISTAS = [
  ['todos', 'Todos', () => true],
  ['mes', 'Compraron este mes', (f) => f.esteMes],
  ['mayoristas', 'Mayoristas', (f) => f.mayorista],
  ['saldo', 'Con saldo', (f) => (f.saldo ?? 0) !== 0],
  ['dormidos', 'Sin comprar hace +90 días', (f) => f.dormido],
]

/** Cuántos hay en cada vista (sobre lo que ya filtró el buscador). @param {FilaCliente[]} filas */
export function contarVistas(filas) {
  return Object.fromEntries(VISTAS.map(([k, , entra]) => [k, filas.filter(entra).length]))
}

/** La vista y el buscador (nombre o DNI/CUIT). @param {FilaCliente[]} filas @param {{ vista?: string, q?: string }} o */
export function filtrar(filas, { vista = 'todos', q = '' } = {}) {
  const entra = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q)
  return filas.filter((f) => entra(f) && (!t || normal(`${f.nombre} ${f.doc ?? ''}`).includes(t)))
}

/** El resumen de lo filtrado, ARRIBA. Por cobrar = lo que deben − lo que tienen a favor (siempre cierra). @param {FilaCliente[]} filas */
export function resumen(filas) {
  let compraron = 0, mayoristas = 0, porCobrar = 0, conCuenta = 0, total = 0
  for (const f of filas) {
    if (f.esteMes) compraron++
    if (f.mayorista) mayoristas++
    if (f.clienteId) conCuenta++
    porCobrar += f.saldo ?? 0
    total += f.total
  }
  return { clientes: filas.length, compraron, mayoristas, porCobrar, conCuenta, total }
}

/**
 * Por columna (↓ ↑); sin orden elegido, el que compró último primero (como se lo busca en el local).
 * @param {FilaCliente[]} filas @param {{ col: string, dir: 'asc' | 'desc' } | null} orden
 */
export function ordenar(filas, orden) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'c' ? normal(f.nombre) : k === 'compras' ? f.compras : k === 'total' ? f.total : k === 'saldo' ? (f.saldo ?? -Infinity)
    : k === 'primera' ? (f.primera ?? '') : (f.ultima ?? ''))
  return filas.slice().sort((a, b) => {
    const x = val(a), y = val(b)
    return (x > y ? 1 : x < y ? -1 : 0) * (k ? dir : -1) || normal(a.nombre).localeCompare(normal(b.nombre))
  })
}

/**
 * Las columnas: clave → [título, ancho, ordena, fija]. 🔴 Cada ancho con su MÍNIMO en px (`ListaTrabajo`).
 * @returns {Record<string, [string, string, boolean, boolean]>}
 */
export function columnasDe() {
  return {
    c: ['Cliente', 'minmax(200px, 2fr)', true, true],
    tipo: ['Tipo', '104px', false, false],
    doc: ['DNI / CUIT', '118px', false, false],
    compras: ['Compras', '84px', true, false],
    total: ['Comprado', '120px', true, false],
    ultima: ['Última compra', '112px', true, false],
    primera: ['Primera compra', '116px', true, false],
    canales: ['Canales', 'minmax(150px, 1.2fr)', false, false],
    saldo: ['Saldo de la cuenta', '140px', true, true],
  }
}

export function columnasDeSiempre() {
  return { orden: ['c', 'tipo', 'doc', 'compras', 'total', 'ultima', 'primera', 'canales', 'saldo'], visibles: ['c', 'tipo', 'compras', 'total', 'ultima', 'canales', 'saldo'] }
}

/** @param {unknown} raw */
export const normalizarPrefs = (raw) => normalizarPrefsDe(columnasDe(), columnasDeSiempre(), raw)
export const alternarColumna = (prefs, col) => alternarColumnaDe(columnasDe(), prefs, col)
export { moverColumna }
