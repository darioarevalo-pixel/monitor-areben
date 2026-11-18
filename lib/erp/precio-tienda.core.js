/**
 * Los PRECIOS DE LA TIENDA en la hoja del pedido (Darío 18-nov): al agregar desde el panel, el mismo precio que ve el cliente
 * en el catálogo mayorista (bdi-catalogo) — pack, oferta, precio por modelo y el descuento por monto — más el precio a mano de
 * Darío. Puro: lo usan la puerta (`api/_erp-pedido.js`, que es la que DECIDE el precio que va al motor) y la hoja (el total
 * en el momento).
 *
 * Las reglas son una COPIA de las del catálogo (`bdi-catalogo/index.html`: `precioVarianteOverride`, `cartItemOferta`,
 * `calcularDescuentos`; `api/proxy.js`: `sinCostos`). Si cambian allá, cambiarlas acá (tests/precio-tienda.test.ts).
 *   - Pack (Marketing › Lotes, `lotes`): cada funda al precio del pack. Con `porLote` se vende de a packs iguales (cantidad por
 *     modelo); con `lotes` (N) es PARCIAL: N packs a la venta (menos los vendidos) y el resto suelto a su precio.
 *   - Oferta: el precio del Cyber (`cyber.json`; el modelo que ya era más barato se queda con el suyo, salvo «todos»), o margen
 *     menor a `ofertaMargen` %. Las ofertas y los packs ⛔ llevan descuento por monto, pero suman para llegar.
 *   - Precio por modelo (`variantPrices`, «pid-size_id»): el 11 / 12 más baratos. Es regular: SÍ lleva descuento por monto.
 *   - Descuento por monto (`descuentos.escala`): sobre TODO el pedido; aparece o se va según el subtotal.
 *   - Promo por cantidad (`descuentos.promos`, ej. 10% llevando 10+ entre smartwatch y auriculares): por categoría o producto,
 *     las unidades de toda la promo se suman; en cada renglón regular manda el mayor entre la promo y el escalón por monto.
 *     La categoría es la de Areben Gestión (`producto.categoria`, la misma que publica el catálogo).
 */

/** @typedef {{ precio: number, porLote?: Record<string, number>|null, lotes?: number|null, sinSueltas?: boolean }} Lote */
/** @typedef {{ id: string, pct: number, desde: number, categorias: string[], productos: string[] }} Promo */
/** @typedef {{ variantPrices: Record<string, number>, cyber: Record<string, { precio: number, todos?: boolean }>, lotes: Record<string, Lote>, umbral: number, escala: Array<{ desde: number, pct: number }>, promos: Promo[], vendidos: Record<string, number> }} Reglas */

/** Hoy en Argentina (AAAA-MM-DD), para las promos con fecha. */
const hoyAR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)

const ESCALA_DE_SIEMPRE = [{ desde: 1000000, pct: 5 }, { desde: 2000000, pct: 10 }]
const positivo = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0 }
export const pesos = (n) => Math.round(Number(n) * 100) / 100

/**
 * Las reglas a partir de lo que publica el catálogo: la config pública (`/api/config`), `cyber.json` y `lotes.json`.
 * Los lotes del panel (`config.lotes.productos`) mandan si existen (los apagados se venden sueltos); si no, `lotes.json`.
 * @param {{ config?: any, cyber?: any, lotesArchivo?: any }} p @returns {Reglas}
 */
export function reglasDeTienda({ config = {}, cyber = {}, lotesArchivo = {}, hoy = hoyAR() } = {}) {
  const c = config || {}
  const lotesCrudos = c.lotes && c.lotes.productos
    ? Object.fromEntries(Object.entries(c.lotes.productos).filter(([, l]) => l && l.activo !== false))
    : ((lotesArchivo && lotesArchivo.productos) || {})
  /** @type {Record<string, Lote>} */
  const lotes = {}
  for (const [id, l] of Object.entries(lotesCrudos)) {
    if (!(positivo(l?.precio) > 0)) continue
    const porLote = l.porLote && typeof l.porLote === 'object'
      ? Object.fromEntries(Object.entries(l.porLote).map(([m, q]) => [m, Math.floor(positivo(q))]).filter(([, q]) => q > 0)) : null
    lotes[String(id)] = { precio: positivo(l.precio), porLote: porLote && Object.keys(porLote).length ? porLote : null, lotes: Math.floor(positivo(l.lotes)) || null, sinSueltas: !!l.sinSueltas }
  }
  const cy = {}
  for (const [id, x] of Object.entries((cyber && cyber.productos) || {})) if (positivo(x?.precio) > 0) cy[String(id)] = { precio: positivo(x.precio), todos: !!x.todos }
  const d = c.descuentos
  const escala = !d || !Array.isArray(d.escala) ? ESCALA_DE_SIEMPRE
    : d.escalaActiva === false ? []
      : d.escala.map((t) => ({ desde: positivo(t?.desde), pct: positivo(t?.pct) })).filter((t) => t.desde > 0 && t.pct > 0).sort((a, b) => a.desde - b.desde)
  const vp = {}
  for (const [k, v] of Object.entries(c.variantPrices || {})) if (positivo(v) > 0) vp[k] = positivo(v)
  const vendidos = {}
  for (const [k, v] of Object.entries(c.lotesVendidos || {})) vendidos[String(k)] = Math.max(0, Math.floor(Number(v) || 0))
  const promos = (d && Array.isArray(d.promos) ? d.promos : [])
    .filter((x) => x && x.activo !== false && positivo(x.pct) > 0 && positivo(x.desde) > 0 && (!x.inicio || x.inicio <= hoy) && (!x.fin || x.fin >= hoy))
    .map((x, i) => ({ id: String(x.id ?? i), pct: positivo(x.pct), desde: positivo(x.desde), categorias: (x.categorias || []).map(String), productos: (x.productos || []).map(String) }))
  return { variantPrices: vp, cyber: cy, lotes, umbral: positivo(c.ofertaMargen), escala, promos, vendidos }
}

/** La promo por cantidad del producto (la primera que lo incluye, como el catálogo), o null. */
export function promoDe(R, product_id, categoria) {
  const id = String(product_id)
  const p = (R.promos || []).find((x) => x.productos.includes(id) || (categoria != null && x.categorias.includes(String(categoria))))
  return p ? p.id : null
}

/** El pack del producto, si se vende de a packs iguales (`porLote`). */
const loteArmado = (R, id) => { const l = R.lotes[String(id)]; return l && l.porLote ? l : null }
/** Pack PARCIAL: N packs separados y el resto suelto. */
const lotePar = (R, id) => { const l = loteArmado(R, id); return l && l.lotes ? l : null }
/** ¿Se vende SÓLO en pack? (el diseño entero, o armado sin cantidad de packs). */
export const soloPack = (R, id) => !!R.lotes[String(id)] && !lotePar(R, id)

/**
 * El precio de la tienda de UNA funda suelta, y qué es: `lista`, `modelo` (precio por modelo, regular), `oferta` o `pack`
 * (el diseño se vende sólo en pack: todas al precio del pack). `precio: null` = sin precio mayorista ⇒ ⛔ se vende.
 * @param {Reglas} R @param {{ product_id: number|string, size_id: number|string|null, lista: number|null, costo?: number|null }} v
 * @returns {{ precio: number|null, tipo: 'lista'|'modelo'|'oferta'|'pack' }}
 */
export function precioDeTienda(R, { product_id, size_id, lista, costo = null }) {
  const id = String(product_id)
  if (soloPack(R, id)) return { precio: R.lotes[id].precio, tipo: 'pack' }
  const propio = size_id == null ? 0 : positivo(R.variantPrices[`${id}-${size_id}`])
  const c = R.cyber[id]
  if (c) return { precio: propio && !c.todos ? Math.min(c.precio, propio) : c.precio, tipo: 'oferta' }
  const precio = propio || (positivo(lista) || null)
  if (precio == null) return { precio: null, tipo: 'lista' }
  const k = positivo(costo)
  const bajo = R.umbral > 0 && k > 0 && ((precio - k) / precio) * 100 < R.umbral
  return { precio, tipo: bajo ? 'oferta' : propio ? 'modelo' : 'lista' }
}

const norm = (s) => String(s ?? '').trim().toUpperCase()

/**
 * El PACK de un producto con sus talles: precio por funda, qué lleva de cada modelo (con su `size_id`) y cuántos quedan a la
 * venta (parcial: N − vendidos; si no, `null` = los que alcance el stock). `alcanza` = packs enteros con el stock dado.
 * null ⇒ el producto ⛔ tiene pack armado, o algún modelo del pack ⛔ está entre sus talles.
 * @param {Reglas} R @param {number|string} product_id @param {Array<{ size_id: number, talle: string|null, stock?: number|null }>} variantes
 */
export function packDe(R, product_id, variantes) {
  const id = String(product_id)
  const l = loteArmado(R, id)
  if (!l) return null
  const modelos = []
  for (const [modelo, q] of Object.entries(l.porLote)) {
    const v = variantes.find((x) => norm(x.talle) === norm(modelo))
    if (!v) return null
    modelos.push({ size_id: Number(v.size_id), talle: v.talle ?? modelo, cantidad: q, stock: v.stock ?? null })
  }
  const fundas = modelos.reduce((s, m) => s + m.cantidad, 0)
  const quedan = l.lotes ? Math.max(0, l.lotes - (R.vendidos[id] || 0)) : null
  const alcanza = modelos.every((m) => m.stock != null) ? Math.min(...modelos.map((m) => Math.floor(Math.max(0, m.stock) / m.cantidad))) : null
  return { precio: l.precio, fundas, modelos, quedan, alcanza, soloPack: soloPack(R, id), sinSueltas: !!l.sinSueltas }
}

/**
 * Qué es un renglón que YA está en el pedido, por su precio guardado: si coincide con el precio de la tienda (con o sin algún
 * escalón de descuento), es regular y su `base` es el de la tienda (el descuento se recalcula); si coincide con el del pack, es
 * pack; si no, es un precio FIJO (oferta que ya terminó, precio a mano, lista vieja): se respeta tal cual (Darío 18-nov: lo que
 * compró a precio especial se mantiene). Tolerancia medio peso (el precio se guarda con centavos).
 * @param {Reglas} R @param {{ product_id: number|string, size_id: number|string|null, lista: number|null, costo?: number|null }} v @param {number} guardado
 * @returns {{ base: number, tipo: 'lista'|'modelo'|'oferta'|'pack'|'fijo' }}
 */
export function renglonGuardado(R, v, guardado) {
  const g = Number(guardado)
  const cerca = (a) => Math.abs(g - a) <= 0.5
  const l = R.lotes[String(v.product_id)]
  if (l && cerca(l.precio)) return { base: g, tipo: 'pack' }
  const t = precioDeTienda(R, v)
  if (t.precio != null) {
    if (t.tipo === 'oferta' || t.tipo === 'pack') { if (cerca(t.precio)) return { base: g, tipo: t.tipo } }
    else if ([0, ...R.escala.map((e) => e.pct), ...(R.promos || []).map((x) => x.pct)].some((pct) => cerca(pesos(t.precio * (1 - pct / 100))))) return { base: t.precio, tipo: t.tipo }
  }
  return { base: g, tipo: 'fijo' }
}

/** ¿Lleva descuento por monto? Sólo lo regular (lista y precio por modelo). */
export const regular = (tipo) => tipo === 'lista' || tipo === 'modelo'

/**
 * La CUENTA del pedido como en la tienda: subtotal (lo de lista + ofertas + packs + fijos, todo suma para llegar), el escalón
 * que alcanza, y el precio FINAL de cada renglón (regular: base − %; el resto: su base). `proximo`: cuánto falta para el
 * siguiente escalón.
 * Con promo por cantidad (`promo`: id), la unidades de toda la promo se suman y el renglón regular lleva el mayor de los dos %.
 * @template {{ base: number, tipo: string, cantidad: number, promo?: string|null }} T
 * @param {Reglas|{ escala: Array<{ desde: number, pct: number }>, promos?: Array<{ id: string, pct: number, desde: number }> }} R @param {T[]} renglones
 */
export function cuentaDelPedido(R, renglones) {
  const subtotal = pesos(renglones.reduce((s, r) => s + r.base * r.cantidad, 0))
  let esc = null
  for (const e of R.escala) if (subtotal >= e.desde) esc = e
  const pct = esc ? esc.pct : 0
  const unidades = {}
  for (const r of renglones) if (r.promo) unidades[r.promo] = (unidades[r.promo] || 0) + r.cantidad
  const promoPct = (r) => { const x = r.promo && (R.promos || []).find((p) => p.id === r.promo); return x && unidades[x.id] >= x.desde ? x.pct : 0 }
  let conPromo = false
  const lineas = renglones.map((r) => {
    if (!regular(r.tipo)) return { ...r, precio: pesos(r.base) }
    const pp = promoPct(r)
    if (pp > pct) conPromo = true
    const p = Math.max(pct, pp)
    return { ...r, precio: p ? pesos(r.base * (1 - p / 100)) : pesos(r.base) }
  })
  const total = pesos(lineas.reduce((s, r) => s + r.precio * r.cantidad, 0))
  const prox = R.escala.find((e) => subtotal < e.desde) || null
  return { lineas, subtotal, pct, conPromo, descuento: pesos(subtotal - total), total, proximo: prox ? { pct: prox.pct, falta: pesos(prox.desde - subtotal) } : null }
}

/** Cuántos packs ENTEROS forman unos renglones de un producto (los de precio de pack), según su armado; null si no cierran. */
export function packsEnRenglones(pack, renglones) {
  if (!pack) return null
  const de = new Map(renglones.map((r) => [Number(r.size_id), Number(r.cantidad)]))
  const ks = pack.modelos.map((m) => (de.get(m.size_id) ?? 0) / m.cantidad)
  const extra = [...de.keys()].some((s) => !pack.modelos.some((m) => m.size_id === s))
  if (extra || !ks.length || ks.some((k) => k !== ks[0] || !Number.isInteger(k))) return null
  return ks[0]
}
