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
 * 🔴 El pedido ENTREGADO sin cobrar (`entregadoSinCobrar`, cerrado en TN) ⛔ aparta: la prenda ya se fue. Darío, 15-nov: la
 *    Clear Premium 17 Pro Max daba −3 por 3 pedidos de octubre cobrados en efectivo y nunca marcados en TN. Mismo criterio
 *    que el total de «Pedidos sin pagar» (`pedidos-tn.core.js`) y que el stock que el motor manda a TN (`planStockTN`).
 */

import { lineaDe } from '../lineas.core.js'
import { esEnBolsasTN, esReservaTN } from '../../motor/venta/pago-tn.mjs'
import { depositoDe, NOMBRE_DEPOSITO } from './stock.core.js'
import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'

/** Los depósitos de cada base, en el orden en que se muestran. */
// `evento` (motor sql/058): el depósito activable de Stunned. Sin columna, lo que está en un evento sumaba al Físico sin verse dónde.
// Depósito mayorista APAGADO (Darío 18-nov): viene del sistema viejo, nunca se usó en el ERP y elegirlo por error «perdía» mercadería.
export const DEPOSITOS = { bdi: ['local', 'deposito_minorista'], zattia: ['local', 'deposito', 'evento'] }

const clave = (producto, talle) => `${producto}/${talle}`

/**
 * Bruno 25-nov: «la ubicacion evento esta desactivada pero sigue apareciendo en la lista de stock. si se desactiva deja de
 * aparecer». Las ubicaciones de la base que se ven = las de `DEPOSITOS` que alguna línea tiene ACTIVA según el motor
 * (`depositosDe`, `deposito.activo`, sql/058). El motor sólo deja desactivar en 0 ⇒ esconderla ⛔ esconde stock.
 * @param {'bdi'|'zattia'} marca @param {Array<{ id: string, activo: boolean }>} ubicaciones lo que contesta `depositosDe` por línea
 * @returns {string[]}
 */
export function depositosALaVista(marca, ubicaciones) {
  if (!Array.isArray(ubicaciones)) throw new Error('Faltan las ubicaciones de la base.')
  const activas = new Set(ubicaciones.filter((u) => u.activo === true).map((u) => u.id))
  return DEPOSITOS[marca].filter((d) => activas.has(d))
}

/** Sin tildes ni mayúsculas, para buscar. */
export function normal(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * 🔑 Bruno, 16-nov (escrito): después del corte la funda se mueve por el ARMADO del pedido, ⛔ por el pago. La regla es la del
 * MOTOR (`esReservaTN`, `esEnBolsasTN` de `motor/venta/pago-tn.mjs`), la misma con que el motor le manda el stock a TN:
 *  - **Reservado**: pedido abierto, ⛔ devuelto, que todavía ⛔ salió del estante (después del corte: pagado o no; antes, sólo
 *    lo que todavía ⛔ es venta). Lo preparado ya bajó del Físico.
 *  - **En bolsas**: pedido CANCELADO que se había preparado y todavía ⛔ se desarmó. ⛔ está en el Físico (está en la bolsa) pero
 *    se puede vender ⇒ suma al Disponible. Las unidades salen del libro de ese pedido (`tn_pedido_libro`, motor sql/086).
 * Un SKU que GN ⛔ tiene ⇒ `sinVariante` (se dice, ⛔ se adivina).
 * @param {{ ordenes: any[], lineas: Array<{ tienda: string, tn_id: any, sku: string | null, cantidad: number }>,
 *   netos: Array<{ tienda: string, tn_id: any, product_id: any, size_id: any, neto: number }>, cortes: Record<string, string>,
 *   inventario: Array<{ product_id: number|string, size_id: number|string, sku: string | null }> }} x
 * @returns {{ reservado: Map<string, number>, enBolsas: Map<string, number>, sinVariante: number, sinVariantePorTienda: Record<string, number> }}
 */
export function reservaDePedidos({ ordenes, lineas, netos, cortes, inventario }) {
  if (!cortes || typeof cortes !== 'object') throw new Error('reservaDePedidos: faltan los cortes (erp_corte)')
  const porSku = new Map()
  for (const r of inventario) if (r.sku) porSku.set(String(r.sku).trim().toUpperCase(), clave(r.product_id, r.size_id))
  const porOrden = new Map()
  for (const l of lineas) {
    const k = `${l.tienda}/${l.tn_id}`
    porOrden.set(k, [...(porOrden.get(k) || []), l])
  }
  const reservado = new Map()
  const enBolsas = new Map()
  const sinVariantePorTienda = {}
  let sinVariante = 0
  for (const o of ordenes) {
    const corte = cortes[o.tienda] ?? null
    if (esReservaTN(o, { corte })) {
      for (const l of porOrden.get(`${o.tienda}/${o.tn_id}`) || []) {
        const k = l.sku ? porSku.get(String(l.sku).trim().toUpperCase()) : null
        if (!k) { sinVariante += Number(l.cantidad || 0); sinVariantePorTienda[o.tienda] = (sinVariantePorTienda[o.tienda] || 0) + Number(l.cantidad || 0); continue }
        reservado.set(k, (reservado.get(k) || 0) + Number(l.cantidad || 0))
      }
    }
    if (esEnBolsasTN(o, { corte })) {
      for (const n of netos) {
        if (n.tienda !== o.tienda || String(n.tn_id) !== String(o.tn_id) || !(Number(n.neto) < 0)) continue
        const k = clave(n.product_id, n.size_id)
        enBolsas.set(k, (enBolsas.get(k) || 0) - Number(n.neto))
      }
    }
  }
  return { reservado, enBolsas, sinVariante, sinVariantePorTienda }
}

/**
 * @typedef {{ id: string, producto: string, talle: string, nombre: string, talleNombre: string, sku: string | null,
 *   barcode: string | null, linea: string, deps: Record<string, number>, estanteria: number, enPedidos: number, enBolsas: number,
 *   disponible: number, gn: number | null, negativo: boolean,
 *   ultimo: { tipo: string, origen: string, ref: string | null, cuando: string } | null }} FilaStock
 */

/**
 * Una fila por variante: las del espejo de GN (nombre, SKU) y las que el libro tiene aunque GN ya ⛔ (se ven con el id).
 * @param {{ marca: 'bdi'|'zattia', depositos: string[], niveles: any[], ultimos: any[], inventario: any[], reservado?: Map<string, number>, enBolsas?: Map<string, number> }} x
 * @returns {FilaStock[]}
 */
export function armarFilasStock({ marca, depositos, niveles, ultimos, inventario, reservado = new Map(), enBolsas = new Map() }) {
  if (!Array.isArray(depositos)) throw new Error('Faltan las ubicaciones activas de la lista de stock.')
  const filas = new Map()
  const fila = (producto, talle) => {
    const k = clave(producto, talle)
    let f = filas.get(k)
    if (!f) {
      f = { id: k, producto: String(producto), talle: String(talle), nombre: null, talleNombre: null, sku: null, barcode: null, linea: null,
        deps: Object.fromEntries(depositos.map((d) => [d, 0])), gn: null, ultimo: null }
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
    if (!depositos.includes(n.deposito)) continue // un depósito apagado (el mayorista de BDI, el Evento desactivado) ⛔ suma ni marca negativos
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
    // Lo EN BOLSAS ⛔ está en el Físico pero se puede vender (Bruno 16-nov): suma al Disponible.
    const bolsas = enBolsas.get(f.id) || 0
    const disponible = estanteria + bolsas - enPedidos
    return {
      ...f,
      nombre: f.nombre ?? `Producto ${f.producto}`,
      talleNombre: f.talleNombre ?? `Variante ${f.talle}`,
      linea: f.linea ?? lineaDe(marca, f.sku),
      estanteria, enPedidos, enBolsas: bolsas, disponible,
      negativo: disponible < 0 || Object.values(f.deps).some((n) => n < 0),
    }
  })
}

/**
 * Las vistas: [clave, nombre, ¿entra la fila?]. «Sin stock en el Local» = hay en otro depósito y en el Local ⛔ (lo que hay
 * que reponer). 🔑 Bruno 25-nov: «que se pueda ver todo el stock completo y luego que se vean los filtros de con stock y sin
 * stock, pero inicialmente que se vean todos» ⇒ «Todo» va primero y es con la que abre (`VISTA_INICIAL`).
 * @type {Array<[string, string, (f: FilaStock) => boolean]>}
 */
export const VISTAS = [
  ['todo', 'Todo', () => true],
  ['constock', 'Con stock', (f) => f.disponible > 0],
  ['sinstock', 'Sin stock', (f) => f.disponible <= 0],
  ['local0', 'Sin stock en el Local', (f) => f.deps.local <= 0 && f.estanteria > 0],
  ['neg', 'Negativos', (f) => f.negativo],
  ['ped', 'Con reservado', (f) => f.enPedidos > 0],
  ['bol', 'En bolsas', (f) => f.enBolsas > 0],
]

/** Con la que abre la lista (Bruno 25-nov: «inicialmente que se vean todos»). */
export const VISTA_INICIAL = 'todo'

/** Cuántas hay en cada vista (sobre lo que ya filtró el buscador y la línea). @param {FilaStock[]} filas */
export function contarVistas(filas) {
  return Object.fromEntries(VISTAS.map(([k, , entra]) => [k, filas.filter(entra).length]))
}

/**
 * La vista y el buscador. El buscador lee nombre, talle y SKU; un código de barras entero, exacto.
 * @param {FilaStock[]} filas @param {{ vista?: string, q?: string, linea?: string }} o
 */
export function filtrar(filas, { vista = VISTA_INICIAL, q = '', linea = '' } = {}) {
  const entra = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q)
  return filas.filter((f) => entra(f) && (!linea || f.linea === linea)
    && (!t || f.barcode === q.trim() || normal(`${f.nombre} ${f.talleNombre} ${f.sku ?? ''}`).includes(t)))
}

/** El resumen de lo filtrado, ARRIBA de la lista. @param {FilaStock[]} filas */
export function resumen(filas) {
  let disponible = 0, estanteria = 0, enPedidos = 0, enBolsas = 0, negativos = 0
  for (const f of filas) {
    // Lo que una prenda debe ⛔ resta de lo que hay de otra: una negativa suma 0 al disponible y se cuenta aparte.
    disponible += Math.max(0, f.disponible)
    estanteria += Math.max(0, f.estanteria)
    enPedidos += f.enPedidos
    enBolsas += f.enBolsas || 0
    if (f.negativo) negativos++
  }
  return { disponible, estanteria, enPedidos, enBolsas, negativos, prendas: filas.length }
}

/**
 * Por columna (↓ ↑); sin orden elegido, por nombre y talle (como se buscan en el local).
 * @param {FilaStock[]} filas @param {{ col: string, dir: 'asc' | 'desc' } | null} orden
 */
export function ordenar(filas, orden) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'disp' ? f.disponible : k === 'est' ? f.estanteria : k === 'ped' ? f.enPedidos : k === 'bol' ? (f.enBolsas || 0) : k === 'gn' ? (f.gn ?? -Infinity)
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
 * @param {'bdi'|'zattia'} marca @param {string[]} [depositos] las activas (`depositosALaVista`); sin leer todavía, las de la base
 * @returns {Record<string, [string, string, boolean, boolean]>}
 */
export function columnasDe(marca, depositos = DEPOSITOS[marca]) {
  const deps = Object.fromEntries(depositos.map((d) => [`dep:${d}`, [d === 'local' ? 'Local' : marca === 'bdi' ? NOMBRE_DEPOSITO[d].replace('Depósito', 'Dep.') : NOMBRE_DEPOSITO[d], d === 'local' ? '64px' : marca === 'bdi' ? '104px' : '80px', true, false]]))
  return {
    p: ['Producto', 'minmax(240px, 2fr)', true, true],
    t: ['Variante', 'minmax(104px, 0.7fr)', false, true],
    sku: ['SKU', '110px', false, false],
    disp: ['Disponible', '96px', true, true],
    est: ['Físico', '76px', true, false],
    ...deps,
    ped: ['Reservado', '88px', true, false],
    bol: ['En bolsas', '88px', true, false],
    ult: ['Último movimiento', 'minmax(150px, 1.2fr)', true, false],
    linea: ['Línea', '80px', false, false],
  }
}

/** Las de siempre: el orden y cuáles se ven al entrar (o con «Volver a las de siempre»). @param {'bdi'|'zattia'} marca @param {string[]} [depositos] */
export function columnasDeSiempre(marca, depositos = DEPOSITOS[marca]) {
  const deps = depositos.map((d) => `dep:${d}`)
  // El Evento se ofrece en el selector de columnas pero ⛔ se ve de entrada: casi siempre está en 0 (se usa en una feria).
  const fijos = deps.filter((d) => d !== 'dep:evento')
  return { orden: ['p', 't', 'sku', 'disp', 'est', ...deps, 'ped', 'bol', 'ult', 'linea'], visibles: ['p', 't', 'disp', 'est', ...fijos, 'ped', 'bol', 'ult'] }
}

/** @param {'bdi'|'zattia'} marca @param {unknown} raw @param {string[]} [depositos] */
export const normalizarPrefs = (marca, raw, depositos = DEPOSITOS[marca]) => normalizarPrefsDe(columnasDe(marca, depositos), columnasDeSiempre(marca, depositos), raw)
/** @param {'bdi'|'zattia'} marca @param {string[]} [depositos] */
export const alternarColumna = (marca, prefs, col, depositos = DEPOSITOS[marca]) => alternarColumnaDe(columnasDe(marca, depositos), prefs, col)
export { moverColumna }
