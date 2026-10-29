/**
 * ERP › Stock › Stock, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 3 del v8): UNA lista
 * con cada prenda (variante) y lo que hay de ella por depósito, vistas con su número, resumen arriba, columnas a elección y
 * la ficha al costado con el historial. Puro: el handler (`api/_erp-stock.js`) lee las filas y esto las arma.
 *
 * 🔑 Las palabras del diseño (Bruno ✅ 18-oct):
 *  - **En estantería** = lo que dice el LIBRO de stock (`stock_movimiento`, la suma: es inmutable), en todos los depósitos.
 *  - **En pedidos** = lo que apartan los pedidos de Tienda Nube SIN PAGAR (Bruno, 12-oct: el stock se aparta cuando entra
 *    el pedido). El libro todavía ⛔ lo descontó: se descuenta cuando se cobra.
 *  - **Disponible** = en estantería − en pedidos: lo que se puede vender. Es el número que manda.
 * ⚠️ La reserva del MOTOR (`reservasTN`, areben-libro-stock `lib/tn/reserva.mjs`) además VENCE a las 72 h; mientras GN
 *    viva eso es seco (⛔ suelta nada) ⇒ acá cuentan todos los sin pagar abiertos, como en «Pedidos sin pagar».
 */

import { lineaDe } from '../lineas.core.js'
import { depositoDe, NOMBRE_DEPOSITO } from './stock.core.js'
import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'

/** Los depósitos de cada base, en el orden en que se muestran. */
// `evento` (motor sql/058): el depósito activable de Stunned. Sin columna, lo que está en un evento sumaba al Físico sin verse dónde.
export const DEPOSITOS = { bdi: ['local', 'deposito_minorista', 'deposito_mayorista'], zattia: ['local', 'deposito', 'evento'] }

const clave = (producto, talle) => `${producto}/${talle}`

/** Sin tildes ni mayúsculas, para buscar. */
export function normal(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Las unidades que apartan los pedidos sin pagar, por variante: el renglón de TN trae el SKU y el SKU se busca en el
 * espejo de GN (`inventario`). Un SKU que GN ⛔ tiene ⇒ `sinVariante` (se dice, ⛔ se adivina).
 * @param {Array<{ prendas: Array<{ sku: string | null, cantidad: number }> }>} pedidos
 * @param {Array<{ product_id: number|string, size_id: number|string, sku: string | null }>} inventario
 */
export function reservadoPorVariante(pedidos, inventario) {
  const porSku = new Map()
  for (const r of inventario) if (r.sku) porSku.set(String(r.sku).trim().toUpperCase(), clave(r.product_id, r.size_id))
  const reservado = new Map()
  let sinVariante = 0
  for (const p of pedidos) {
    for (const l of p.prendas || []) {
      const k = l.sku ? porSku.get(String(l.sku).trim().toUpperCase()) : null
      if (!k) { sinVariante += Number(l.cantidad || 0); continue }
      reservado.set(k, (reservado.get(k) || 0) + Number(l.cantidad || 0))
    }
  }
  return { reservado, sinVariante }
}

/**
 * @typedef {{ id: string, producto: string, talle: string, nombre: string, talleNombre: string, sku: string | null,
 *   barcode: string | null, linea: string, deps: Record<string, number>, estanteria: number, enPedidos: number,
 *   disponible: number, gn: number | null, negativo: boolean,
 *   ultimo: { tipo: string, origen: string, ref: string | null, cuando: string } | null }} FilaStock
 */

/**
 * Una fila por variante: las del espejo de GN (nombre, SKU) y las que el libro tiene aunque GN ya ⛔ (se ven con el id).
 * @param {{ marca: 'bdi'|'zattia', niveles: any[], ultimos: any[], inventario: any[], reservado?: Map<string, number> }} x
 * @returns {FilaStock[]}
 */
export function armarFilasStock({ marca, niveles, ultimos, inventario, reservado = new Map() }) {
  const filas = new Map()
  const fila = (producto, talle) => {
    const k = clave(producto, talle)
    let f = filas.get(k)
    if (!f) {
      f = { id: k, producto: String(producto), talle: String(talle), nombre: null, talleNombre: null, sku: null, barcode: null, linea: null,
        deps: Object.fromEntries(DEPOSITOS[marca].map((d) => [d, 0])), gn: null, ultimo: null }
      filas.set(k, f)
    }
    return f
  }
  for (const r of inventario) {
    const f = fila(r.product_id, r.size_id)
    f.nombre ??= r.product_name ?? null
    f.talleNombre ??= r.size_name ?? null
    f.sku ??= r.sku ?? null
    f.barcode ??= r.barcode ?? null
    if (depositoDe(marca, r.store_name)) f.gn = (f.gn ?? 0) + Number(r.available_quantity || 0)
  }
  for (const n of niveles) {
    const f = fila(n.product_id, n.size_id)
    f.deps[n.deposito] = (f.deps[n.deposito] ?? 0) + Number(n.nivel || 0)
    if (n.linea) f.linea ??= n.linea
  }
  for (const u of ultimos) {
    const f = filas.get(clave(u.product_id, u.size_id))
    if (f) f.ultimo = { tipo: u.tipo, origen: u.origen, ref: u.origen_ref ?? null, cuando: u.ocurrido_en }
  }
  return [...filas.values()].map((f) => {
    const estanteria = Object.values(f.deps).reduce((a, n) => a + n, 0)
    const enPedidos = reservado.get(f.id) || 0
    const disponible = estanteria - enPedidos
    return {
      ...f,
      nombre: f.nombre ?? `Producto ${f.producto}`,
      talleNombre: f.talleNombre ?? `Variante ${f.talle}`,
      linea: f.linea ?? lineaDe(marca, f.sku),
      estanteria, enPedidos, disponible,
      negativo: disponible < 0 || Object.values(f.deps).some((n) => n < 0),
    }
  })
}

/**
 * Las vistas, en el orden del diseño: [clave, nombre, ¿entra la fila?]. «Sin stock en el Local» = hay en otro depósito y
 * en el Local ⛔ (lo que hay que reponer); «Todo» trae también las que ya no tienen nada.
 * @type {Array<[string, string, (f: FilaStock) => boolean]>}
 */
export const VISTAS = [
  ['constock', 'Con stock', (f) => f.disponible > 0],
  ['local0', 'Sin stock en el Local', (f) => f.deps.local <= 0 && f.estanteria > 0],
  ['neg', 'Negativos', (f) => f.negativo],
  ['ped', 'Con pedidos', (f) => f.enPedidos > 0],
  ['todo', 'Todo', () => true],
]

/** Cuántas hay en cada vista (sobre lo que ya filtró el buscador y la línea). @param {FilaStock[]} filas */
export function contarVistas(filas) {
  return Object.fromEntries(VISTAS.map(([k, , entra]) => [k, filas.filter(entra).length]))
}

/**
 * La vista y el buscador. El buscador lee nombre, talle y SKU; un código de barras entero, exacto.
 * @param {FilaStock[]} filas @param {{ vista?: string, q?: string, linea?: string }} o
 */
export function filtrar(filas, { vista = 'todo', q = '', linea = '' } = {}) {
  const entra = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q)
  return filas.filter((f) => entra(f) && (!linea || f.linea === linea)
    && (!t || f.barcode === q.trim() || normal(`${f.nombre} ${f.talleNombre} ${f.sku ?? ''}`).includes(t)))
}

/** El resumen de lo filtrado, ARRIBA de la lista. @param {FilaStock[]} filas */
export function resumen(filas) {
  let disponible = 0, estanteria = 0, enPedidos = 0, negativos = 0
  for (const f of filas) {
    // Lo que una prenda debe ⛔ resta de lo que hay de otra: una negativa suma 0 al disponible y se cuenta aparte.
    disponible += Math.max(0, f.disponible)
    estanteria += Math.max(0, f.estanteria)
    enPedidos += f.enPedidos
    if (f.negativo) negativos++
  }
  return { disponible, estanteria, enPedidos, negativos, prendas: filas.length }
}

/**
 * Por columna (↓ ↑); sin orden elegido, por nombre y talle (como se buscan en el local).
 * @param {FilaStock[]} filas @param {{ col: string, dir: 'asc' | 'desc' } | null} orden
 */
export function ordenar(filas, orden) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'disp' ? f.disponible : k === 'est' ? f.estanteria : k === 'ped' ? f.enPedidos : k === 'gn' ? (f.gn ?? -Infinity)
    : k === 'ult' ? (f.ultimo ? Date.parse(f.ultimo.cuando) : 0) : k?.startsWith('dep:') ? (f.deps[k.slice(4)] ?? 0) : normal(`${f.nombre} ${f.talleNombre}`))
  const porNombre = (a, b) => normal(a.nombre).localeCompare(normal(b.nombre)) || normal(a.talleNombre).localeCompare(normal(b.talleNombre))
  return filas.slice().sort((a, b) => {
    if (!k) return porNombre(a, b)
    const x = val(a), y = val(b)
    return (x > y ? 1 : x < y ? -1 : 0) * dir || porNombre(a, b)
  })
}

/**
 * Las columnas de la lista de esa base: clave → [título, ancho, ordena, fija]. Un depósito es `dep:<depósito>`.
 * 🔴 Cada ancho lleva su MÍNIMO en px (`ListaTrabajo` › `anchoMinimo`). Mínimos de `diseno.md` §9: las 8 de siempre ≈ 1.070 px (entran en 1.440);
 *    si no entran, la lista scrollea de costado ADENTRO. Se estiran sólo las de texto; las numéricas son px fijos.
 * @param {'bdi'|'zattia'} marca
 * @returns {Record<string, [string, string, boolean, boolean]>}
 */
export function columnasDe(marca) {
  const deps = Object.fromEntries(DEPOSITOS[marca].map((d) => [`dep:${d}`, [d === 'local' ? 'Local' : marca === 'bdi' ? NOMBRE_DEPOSITO[d].replace('Depósito', 'Dep.') : NOMBRE_DEPOSITO[d], d === 'local' ? '64px' : marca === 'bdi' ? '104px' : '80px', true, false]]))
  return {
    p: ['Producto', 'minmax(240px, 2fr)', true, true],
    t: ['Variante', 'minmax(104px, 0.7fr)', false, true],
    sku: ['código', '110px', false, false],
    disp: ['Disponible', '96px', true, true],
    est: ['Físico', '76px', true, false],
    ...deps,
    ped: ['Reservado', '88px', true, false],
    gn: ['Gestión Nube', '120px', true, false],
    ult: ['Último movimiento', 'minmax(150px, 1.2fr)', true, false],
    linea: ['Línea', '80px', false, false],
  }
}

/** Las de siempre: el orden y cuáles se ven al entrar (o con «Volver a las de siempre»). @param {'bdi'|'zattia'} marca */
export function columnasDeSiempre(marca) {
  const deps = DEPOSITOS[marca].map((d) => `dep:${d}`)
  // El Evento se ofrece en el selector de columnas pero ⛔ se ve de entrada: casi siempre está en 0 (se usa en una feria).
  const fijos = deps.filter((d) => d !== 'dep:evento')
  return { orden: ['p', 't', 'sku', 'disp', 'est', ...deps, 'ped', 'gn', 'ult', 'linea'], visibles: ['p', 't', 'disp', 'est', ...fijos, 'ped', 'ult'] }
}

/** @param {'bdi'|'zattia'} marca @param {unknown} raw */
export const normalizarPrefs = (marca, raw) => normalizarPrefsDe(columnasDe(marca), columnasDeSiempre(marca), raw)
/** @param {'bdi'|'zattia'} marca */
export const alternarColumna = (marca, prefs, col) => alternarColumnaDe(columnasDe(marca), prefs, col)
export { moverColumna }
