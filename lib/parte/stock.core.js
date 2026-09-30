/**
 * **El stock del parte de la mañana**: lo que no puede faltar, la curva rota, lo que hay que subir
 * del depósito y la recompra por proveedor. Puro: recibe filas del espejo y devuelve listas.
 *
 * Lo pidió Bruno el 30-sep-2026 para el mail de las 8 (`docs/secciones/parte-manana.md`).
 *
 * # 🔑 Una sola vara de «se vende»: la venta MINORISTA de los últimos 28 días
 *
 * Todo lo de acá se juzga contra la misma velocidad —unidades vendidas por local, Tienda Nube y
 * otros canales minoristas—, sin mayorista y sin ventas técnicas. 📊 Medido el 30-sep-2026: en BDI
 * los renglones a menos de la mitad del precio de lista son **mayoristas** (CHERRY HEART a $4.190
 * contra $16.990), y contarlos haría que un pedido de un mayorista parezca demanda del local.
 *
 * # 🔴 El depósito se reconoce con `trim()`, y el mayorista ⛔ no es stock
 *
 * Zattia escribe `'Deposito '` con un espacio al final, BDI `'Deposito Minorista'`. Y el
 * `'Deposito Mayorista'` de BDI ⛔ no es de donde se repone el local (1.363 filas): se descarta,
 * como hace el ETL (`lib/etl/computar.ts`, `/mayorista/i`).
 *
 * # 🔑 «A precio lleno» es por RENGLÓN, ⛔ no por orden
 *
 * El `discount` de la venta es el cupón del raspa o el descuento por transferencia —48% de las
 * órdenes de BDI llevan cupón— y eso ⛔ es sale. Lo que dice si la PRENDA estaba rebajada es el
 * `unit_price` del renglón contra el `retailer_price` del producto.
 */

import { canalDe } from '../liquidacion/canal.core.js'
import { esVentaTecnica } from '../etl/tecnica.core.js'
import { lineaDe } from '../lineas.core.js'
import { sumarDias } from '../fechas/dia.core.js'

/** La ventana de la velocidad, en días. La misma para todo el archivo: una sola vara. */
export const DIAS_VELOCIDAD = 28
/** Por debajo de esta cobertura total (local + depósito), se pide al proveedor. */
export const DIAS_PEDIR = 14
/** Por debajo de esta cobertura EN EL LOCAL, y con depósito, se repone al local. */
export const DIAS_REPONER = 7
/** Un renglón cobrado a este % del precio de lista o más cuenta como «precio lleno». */
export const PISO_PRECIO_LLENO = 0.98
/** Cuántos más vendidos se miran para la curva rota. */
export const TOP_CURVA = 30
/** Ventana de la recompra, en días. */
export const DIAS_RECOMPRA = 14

/**
 * **Lo que no puede faltar**, en un solo lugar. Sumar una familia es una línea más.
 *
 * - **BDI · templados**: por la CATEGORÍA de Gestión Nube (`VIDRIOS TEMPLADOS DE CELULAR` y
 *   `… DE CÁMARA`, medido el 30-sep-2026: 14 productos activos) — ⛔ no por la regex del nombre,
 *   que también agarra fundas con «vidrio» en el nombre.
 * - **Zattia · productos Zattia**: los de proveedor `ZATTIA` en Gestión Nube (167 activos), que es
 *   la misma frontera que usa `esProduccionPropia` en `lib/tn-desc/origen.core.js`.
 */
export const CRITICOS = [
  { base: 'bdi', nombre: 'Templados', es: (p) => /^vidrios templados/i.test(String(p.category || '').trim()) },
  { base: 'zattia', nombre: 'Productos Zattia', es: (p) => String(p.proveedor || '').trim().toUpperCase() === 'ZATTIA' },
]

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** `'Local'` · `'deposito'` · `null` (mayorista u otro lugar que ⛔ no cuenta). */
export function ladoDeStore(nombre) {
  const n = String(nombre || '').trim().toLowerCase()
  if (!n || n.includes('mayorista')) return null
  if (n === 'local') return 'local'
  return 'deposito'
}

const claveVariante = (pid, sid) => `${pid}|${sid ?? ''}`

/**
 * Junta todo por variante. Es la única pasada sobre las filas crudas: lo demás lee de acá.
 *
 * @param base       'bdi' | 'zattia'
 * @param productos  `id, name, sku, category, retailer_price, proveedor?`
 * @param inventario `product_id, size_id, size_name, store_name, available_quantity`
 * @param ventas     `id, date_sale, channel, channel_id?`
 * @param detalles   `sale_id, product_id, size_id, size, quantity, unit_price`
 * @param proveedorDe  Map product_id (string) → proveedor, para BDI (sale de las OC); en Zattia se
 *                     usa la columna del producto.
 * @param hoy        día argentino `YYYY-MM-DD`; la ventana termina AYER.
 */
export function armarUniverso({ base, productos, inventario, ventas, detalles, proveedorDe, hoy }) {
  const ayer = sumarDias(hoy, -1)
  const desde28 = sumarDias(hoy, -DIAS_VELOCIDAD)
  const desde14 = sumarDias(hoy, -DIAS_RECOMPRA)
  const desde7 = sumarDias(hoy, -7)

  const prod = new Map((productos || []).map((p) => [String(p.id), p]))
  const variantes = new Map()

  const variante = (pid, sid, talle) => {
    const k = claveVariante(pid, sid)
    let v = variantes.get(k)
    if (!v) {
      const p = prod.get(String(pid)) || {}
      const proveedor = String(p.proveedor || (proveedorDe && proveedorDe.get(String(pid))) || '').trim() || null
      v = {
        pid: String(pid), sid: sid == null ? null : String(sid), talle: talle || '',
        nombre: p.name || `producto ${pid}`, categoria: p.category || null, proveedor,
        linea: lineaDe(base, p.sku), producto: p,
        local: 0, deposito: 0,
        u28: 0, u14: 0, uLocal7: 0, lleno28: 0, rebajado28: 0,
      }
      variantes.set(k, v)
    }
    if (talle && !v.talle) v.talle = talle
    return v
  }

  for (const f of inventario || []) {
    const lado = ladoDeStore(f.store_name)
    if (!lado) continue
    const v = variante(f.product_id, f.size_id, f.size_name)
    v[lado] += Math.max(0, num(f.available_quantity))
  }

  const venta = new Map()
  for (const s of ventas || []) {
    const fecha = String(s.date_sale || '').slice(0, 10)
    if (fecha < desde28 || fecha > ayer) continue
    if (esVentaTecnica(s)) continue
    const canal = canalDe(s.channel)
    if (canal === 'mayorista' || canal === 'tecnica') continue
    venta.set(String(s.id), { fecha, canal })
  }

  for (const d of detalles || []) {
    const s = venta.get(String(d.sale_id))
    if (!s) continue
    const q = num(d.quantity)
    const v = variante(d.product_id, d.size_id, d.size)
    v.u28 += q
    if (s.fecha >= desde14) v.u14 += q
    if (s.fecha >= desde7 && s.canal === 'local') v.uLocal7 += q
    // Sólo las que salieron: una devolución ⛔ dice nada del precio al que se vende.
    if (q > 0) {
      const lista = num(v.producto.retailer_price)
      if (lista > 0 && num(d.unit_price) >= lista * PISO_PRECIO_LLENO) v.lleno28 += q
      else v.rebajado28 += q
    }
  }

  return [...variantes.values()]
}

/** Días que dura `stock` al ritmo de `u` unidades en `dias`. `Infinity` si no se vende. */
export function cobertura(stock, u, dias = DIAS_VELOCIDAD) {
  const porDia = u / dias
  if (porDia <= 0) return Infinity
  return stock / porDia
}

/**
 * **Lo que no puede faltar**: de las familias de `CRITICOS`, las variantes que se vendieron en la
 * ventana y se están quedando sin stock.
 *
 * Tres cajones, y una variante cae en uno solo —el más grave—:
 * - `sinStock`: 0 en el local y 0 en el depósito. Ya se está perdiendo venta.
 * - `pedir`: la cobertura total da menos de `DIAS_PEDIR`.
 * - `reponer`: el local tiene menos de `DIAS_REPONER` días (o nada) y el depósito tiene.
 *
 * ⚠️ Una variante que ⛔ se vendió en 28 días queda afuera aunque esté en 0: sin venta no hay
 * forma de distinguir «se agotó» de «se discontinuó», y 167 productos Zattia con todos sus talles
 * llenarían el mail de modelos muertos.
 */
export function criticos(base, universo) {
  const out = []
  for (const fam of CRITICOS.filter((c) => c.base === base)) {
    const sinStock = []
    const pedir = []
    const reponer = []
    for (const v of universo) {
      if (!fam.es(v.producto) || v.u28 <= 0) continue
      const total = v.local + v.deposito
      const fila = { ...v, dias: cobertura(total, v.u28), diasLocal: cobertura(v.local, v.u28) }
      if (total <= 0) sinStock.push(fila)
      else if (fila.dias < DIAS_PEDIR) pedir.push(fila)
      else if (v.deposito > 0 && (v.local <= 0 || fila.diasLocal < DIAS_REPONER)) reponer.push(fila)
    }
    const porVenta = (a, b) => b.u28 - a.u28
    out.push({ nombre: fam.nombre, sinStock: sinStock.sort(porVenta), pedir: pedir.sort((a, b) => a.dias - b.dias), reponer: reponer.sort(porVenta) })
  }
  return out
}

/**
 * **La curva rota a precio lleno** (lo sumó Bruno el 30-sep-2026): los más vendidos SIN
 * descuento que tienen alguna variante en 0 entre local y depósito. Es demanda real —se pagó el
 * precio de lista— que se está perdiendo.
 *
 * - El ranking es por unidades a precio lleno, por PRODUCTO.
 * - Una variante «rota» es una que **se vendió en la ventana** y hoy está en 0: mismo motivo que
 *   en `criticos` — un talle que ⛔ se vendió nunca ⛔ se puede distinguir de uno discontinuado.
 * - `yaListados`: las variantes que ya salieron como «sin stock» en lo que no puede faltar, para
 *   que el mail diga cada cosa UNA vez.
 * - Devuelve también cuántas unidades se excluyeron por rebajadas: con una Feria en curso casi
 *   todo sale con descuento, y un bloque vacío tiene que decir POR QUÉ está vacío.
 */
export function curvaRota(universo, top = TOP_CURVA, yaListados = new Set()) {
  const porProducto = new Map()
  let rebajadas = 0
  for (const v of universo) {
    rebajadas += v.rebajado28
    let p = porProducto.get(v.pid)
    if (!p) {
      p = { pid: v.pid, nombre: v.nombre, proveedor: v.proveedor, linea: v.linea, lleno28: 0, u28: 0, variantes: [] }
      porProducto.set(v.pid, p)
    }
    p.lleno28 += v.lleno28
    p.u28 += v.u28
    p.variantes.push(v)
  }
  const ranking = [...porProducto.values()].filter((p) => p.lleno28 > 0).sort((a, b) => b.lleno28 - a.lleno28).slice(0, top)
  const rotos = ranking
    .map((p, i) => ({
      ...p,
      puesto: i + 1,
      rotas: p.variantes.filter((v) => v.u28 > 0 && v.local + v.deposito <= 0 && !yaListados.has(claveVariante(v.pid, v.sid))).sort((a, b) => b.u28 - a.u28),
    }))
    .filter((p) => p.rotas.length)
    .map(({ variantes: _v, ...p }) => p)
  return { rotos, rebajadas, mirados: ranking.length }
}

/**
 * **Subilo hoy** (lo sumó Bruno el 30-sep-2026): se vendió en el LOCAL en los últimos 7 días, hoy
 * hay 0 en el local y el depósito tiene. ⛔ Repite lo que ya está en `reponer` de los críticos —
 * pasale las claves en `yaListados`.
 */
export function paradoEnDeposito(universo, yaListados = new Set()) {
  return universo
    .filter((v) => v.uLocal7 > 0 && v.local <= 0 && v.deposito > 0 && !yaListados.has(claveVariante(v.pid, v.sid)))
    .sort((a, b) => b.uLocal7 - a.uLocal7)
}

/** La clave de una variante, para cruzar listas. */
export const claveDe = (v) => claveVariante(v.pid, v.sid)

/**
 * **La recompra por proveedor**: lo más vendido de `DIAS_RECOMPRA` días, agrupado por proveedor,
 * con el stock de hoy y cuántos días le quedan. Es la lista que se tiene a mano al llamar al
 * proveedor.
 *
 * 🔴 **BDI ⛔ tiene proveedor en Gestión Nube** (medido el 30-sep-2026: la columna sólo existe en
 * Zattia). El que se conoce sale de las órdenes de compra que entraron por el webhook, y el resto
 * va a `sin proveedor` — dicho, ⛔ escondido.
 */
export function recompra(universo, { porProveedor = 5, proveedores = 8 } = {}) {
  const prods = new Map()
  for (const v of universo) {
    let p = prods.get(v.pid)
    if (!p) {
      p = { pid: v.pid, nombre: v.nombre, proveedor: v.proveedor || 'sin proveedor', u14: 0, stock: 0 }
      prods.set(v.pid, p)
    }
    p.u14 += v.u14
    p.stock += v.local + v.deposito
  }
  const grupos = new Map()
  for (const p of prods.values()) {
    if (p.u14 <= 0) continue
    const g = grupos.get(p.proveedor) || { proveedor: p.proveedor, u14: 0, productos: [] }
    g.u14 += p.u14
    g.productos.push({ ...p, dias: cobertura(p.stock, p.u14, DIAS_RECOMPRA) })
    grupos.set(p.proveedor, g)
  }
  return [...grupos.values()]
    .sort((a, b) => b.u14 - a.u14)
    .slice(0, proveedores)
    .map((g) => ({ ...g, productos: g.productos.sort((a, b) => b.u14 - a.u14).slice(0, porProveedor) }))
}
