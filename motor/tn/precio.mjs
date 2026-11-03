/**
 * Empujar PRECIO a Tienda Nube (paso 5): qué precio de LISTA y qué PROMOCIONAL le pondría el ERP a cada variante de TN, al
 * lado de lo que TN tiene. Puro. Escribe sólo donde manda `PRECIO_TN_MANDA` (`empuje.mjs`), y SIEMPRE con registro.
 *
 * 🔑 Las listas (sql/011 + 018), por producto: `online` = el precio de LISTA de TN (`price`); `oferta` = lo que TN COBRA
 * (`promotional_price` si es menor que el de lista; si no, el de lista); `local` = la Caja, que sigue a `oferta`. Cada una
 * es una COPIA de TN hasta que alguien la CARGA en el ERP; lo cargado manda y es lo ÚNICO que se escribe (una copia
 * distinta es TN que cambió después de copiar ⇒ ⛔ se pisa).
 * 🎯 Bruno, 28-oct: el ERP pone en TN el precio de lista Y el promocional. ⇒ `oferta` CARGADA menor que el precio de lista
 * ⇒ ese es el promocional; `oferta` cargada igual (o mayor) que el de lista ⇒ SIN promocional (se borra la SALE).
 * El precio es POR PRODUCTO (medido 14-oct: 0 productos con precio distinto por variante) ⇒ el mismo a todas sus variantes.
 * Una variante de TN sin variante en GN, o un producto sin precio online en el motor, ⛔ se empuja: se cuenta.
 * 🔑 Una `oferta` cargada por una CAMPAÑA (Liquidación del monitor, motivo `campaña:<id>`; Bruno 30-oct) es una DECISIÓN,
 * ⛔ un error de carga: ⛔ cuenta para el freno del 15% y el trabajo devuelve, producto por producto, si TN quedó como ella
 * dice (`confirmacion`): es lo que la campaña lee para darse por aplicada.
 */
import { varianteDeLineaTN } from './cruce.mjs'

const pesos = (x) => (x == null || x === '' || !(Number(x) > 0) ? null : Math.round(Number(x) * 100) / 100)

/** El prefijo del `motivo` de una carga hecha por una campaña de Liquidación (el monitor lo escribe; acá sólo se lee). */
export const MOTIVO_CAMPANIA = 'campaña:'
/** El id de la campaña de un motivo, o null. */
export const campaniaDeMotivo = (m) => (typeof m === 'string' && m.startsWith(MOTIVO_CAMPANIA) ? m.slice(MOTIVO_CAMPANIA.length).split(/\s/)[0] || null : null)

/** El promocional que el ERP quiere, dado el precio de lista que va a quedar: null = sin SALE. */
export const promoDeseada = (oferta, lista) => (oferta != null && lista != null && oferta < lista ? oferta : null)

/**
 * @param {object} p
 * @param {Array} p.productos  `GET /products` de TN (crudo, con `variants`)
 * @param {object} p.indice    indiceDeVariantes del inventario
 * @param {Map<number, { precio: number, fuente: string }>} p.online  product_id de GN → precio `online` del motor
 * @param {Map<number, { precio: number, fuente: string, campania?: string }>} [p.oferta] product_id de GN → precio `oferta`
 *   del motor (`campania` = la cargó una campaña)
 * @returns {{ cuenta, cambios, promos, decididas }} `cambios` = el precio de lista (como siempre); `promos` = el promocional,
 *   sólo donde la `oferta` está CARGADA: `{ tn, motor }` con null = sin promocional; `decididas` = TODAS las variantes con
 *   la oferta de una campaña, distintas o ya iguales: `{ product_id, variant_id, tn_product_id, campania, quiere, tn }`.
 */
export function planPrecioTN({ productos, indice, online, oferta = new Map() }) {
  const variante = varianteDeLineaTN(indice)
  const cuenta = { variantes: 0, sin_variante: 0, sin_precio: 0, con_promo: 0, igual: 0, distinto_cargado: 0, distinto_copia: 0, promo_cargada: 0, promo_distinta: 0, oferta_sobre_lista: 0 }
  const cambios = []
  const promos = []
  const decididas = []
  for (const p of productos) {
    for (const tv of p.variants || []) {
      cuenta.variantes++
      const v = variante({ variant_id: tv.id, sku: tv.sku, barcode: tv.barcode })
      if (!v) { cuenta.sin_variante++; continue }
      const m = online.get(Number(v.product_id))
      if (!m || pesos(m.precio) == null) { cuenta.sin_precio++; continue }
      const promoTN = pesos(tv.promotional_price)
      if (promoTN != null) cuenta.con_promo++
      const tn = pesos(tv.price)
      const motor = pesos(m.precio)
      const base = { tn_product_id: Number(p.id), variant_id: Number(tv.id), sku: tv.sku ?? null, product_id: Number(v.product_id) }
      if (tn === motor) cuenta.igual++
      else {
        // Lo CARGADO en el ERP es lo que el motor empujaría de verdad; una copia distinta es TN que cambió después de copiar.
        if (m.fuente === 'carga') cuenta.distinto_cargado++
        else cuenta.distinto_copia++
        cambios.push({ ...base, tn, motor, fuente: m.fuente, promo: promoTN })
      }
      // El promocional: sólo con la `oferta` CARGADA, contra el precio de lista que VA a quedar (el cargado, o el de TN).
      const o = oferta.get(Number(v.product_id))
      if (o?.fuente !== 'carga') continue
      cuenta.promo_cargada++
      const lista = m.fuente === 'carga' ? motor : tn
      if (pesos(o.precio) != null && lista != null && pesos(o.precio) > lista) cuenta.oferta_sobre_lista++
      const quiere = promoDeseada(pesos(o.precio), lista)
      if (o.campania) decididas.push({ product_id: base.product_id, variant_id: base.variant_id, tn_product_id: base.tn_product_id, campania: o.campania, quiere, tn: promoTN })
      if (quiere === promoTN) continue
      cuenta.promo_distinta++
      promos.push({ ...base, tn: promoTN, motor: quiere, lista, fuente: 'carga', ...(o.campania ? { campania: o.campania } : {}) })
    }
  }
  return { cuenta, cambios, promos, decididas }
}

/**
 * Cómo se BORRA el promocional en TN (sin SALE): el texto VACÍO. Medido en la tienda viva el 28-oct con el producto oculto
 * 913520 (`tn.mjs precio --probar-sin-promo`, run 40743461029): `null` contesta 200 y ⛔ borra nada; `""` lo deja en null.
 */
export const SIN_PROMO = ''

/**
 * Lo que se escribe, UNA entrada por variante (el precio de lista y el promocional van en el MISMO pedido: si se bajara el
 * de lista por debajo del promocional en dos pedidos, TN quedaría un rato con una SALE más cara que la lista).
 * Sólo lo CARGADO en el ERP. @param {{ cambios, promos? }} plan
 * @returns {Array<{ tn_product_id, variant_id, sku, product_id, precio?: { tn, motor }, promo?: { tn, motor, lista } }>}
 */
export function escrituras({ cambios, promos = [] }) {
  const por = new Map()
  const de = (c) => por.get(c.variant_id) ?? por.set(c.variant_id, { tn_product_id: c.tn_product_id, variant_id: c.variant_id, sku: c.sku, product_id: c.product_id }).get(c.variant_id)
  for (const c of preciosAEscribir(cambios)) de(c).precio = { tn: c.tn, motor: c.motor }
  for (const c of promos.filter((x) => x.fuente === 'carga')) de(c).promo = { tn: c.tn, motor: c.motor, lista: c.lista, ...(c.campania ? { campania: c.campania } : {}) }
  return [...por.values()]
}

/**
 * El pedido a TN de UNA variante: `price` y/o `promotional_price` (null = sin SALE), con 2 decimales.
 * Acepta también la forma vieja de un cambio de lista (`{ tn_product_id, variant_id, motor }`).
 */
export function pedidoDePrecio(e) {
  const body = {}
  if (e.precio) body.price = e.precio.motor.toFixed(2)
  else if (e.motor != null) body.price = e.motor.toFixed(2)
  if (e.promo) body.promotional_price = e.promo.motor == null ? SIN_PROMO : e.promo.motor.toFixed(2)
  return { method: 'PUT', path: `/products/${e.tn_product_id}/variants/${e.variant_id}`, body }
}

/**
 * 🔑 La llave de «el ERP manda el PRECIO»: `PRECIO_TN_MANDA=stunned` (Vercel de `areben-erp`). Sin la variable, ninguna: el
 * empuje sigue SECO. Es APARTE de `STOCK_TN_MANDA` (Bruno 26-oct: Stunned lleva stock Y precio, pero se prenden por separado).
 * Una tienda que ⛔ existe hace fallar (un typo ⛔ deja la llave apagada callada).
 */
export function precioMandaEn(tienda, env = process.env) {
  const lista = String(env.PRECIO_TN_MANDA ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  for (const t of lista) if (!['bdi', 'zattia', 'stunned'].includes(t)) throw new Error(`PRECIO_TN_MANDA: tienda desconocida «${t}»`)
  return lista.includes(tienda)
}

/** Si el plan quiere cambiar más que esto de las variantes con precio, algo vino roto: ⛔ se escribe (salvo MASIVO autorizado). */
export const FRENO_PRECIO = 0.15
/** Un precio nuevo fuera de [mitad, doble] del que TN tiene es casi seguro un error de carga (un cero de más). */
export const RAZON_PRECIO = 2
/** Un promocional por debajo de esta parte del precio de lista (más de 80% de descuento) es casi seguro un error de carga. */
export const PISO_PROMO = 0.2

/** Lo que se escribe: sólo lo CARGADO en el ERP. Una diferencia de la copia es TN que cambió después de copiar ⇒ ⛔ se pisa. */
export const preciosAEscribir = (cambios) => cambios.filter((c) => c.fuente === 'carga')

/**
 * El texto del porqué NO escribir, o null. El 15% lo saltea sólo un ajuste MASIVO autorizado a mano (`masivo`: Bruno, 28-oct,
 * «luego hay que hacer los ajustes»); el doble/mitad y el piso del promocional ⛔ se saltean nunca: son errores de carga.
 * @param {{ cuenta, cambios, promos? }} plan
 */
export function frenoPrecio(plan, max = FRENO_PRECIO, { masivo = false } = {}) {
  const { cuenta } = plan
  const aEsc = escrituras(plan)
  const empujables = cuenta.variantes - cuenta.sin_variante - cuenta.sin_precio
  // 🔑 Lo que decidió una CAMPAÑA (sólo el promocional) ⛔ cuenta: el 15% caza datos rotos en masa, ⛔ una decisión. Si se
  // cuela cualquier otra cosa (una lista cargada, una oferta sin campaña), cuenta como siempre.
  const cuentan = aEsc.filter((e) => e.precio || !e.promo?.campania).length
  if (!masivo && empujables > 0 && cuentan / empujables > max) return `el ERP cambiaría el precio de ${cuentan} de ${empujables} variantes (${Math.round((cuentan / empujables) * 100)}%, el freno es ${Math.round(max * 100)}%)${cuentan < aEsc.length ? `, sin contar ${aEsc.length - cuentan} de campañas` : ''}`
  const loco = aEsc.find((e) => e.precio && e.precio.tn > 0 && (e.precio.motor > e.precio.tn * RAZON_PRECIO || e.precio.motor < e.precio.tn / RAZON_PRECIO))
  if (loco) return `${loco.sku ?? loco.variant_id}: de $${loco.precio.tn} a $${loco.precio.motor} es más del doble o menos de la mitad`
  // Bajar la lista por debajo de una SALE de TN sin decir qué pasa con la SALE: TN mostraría una promo MÁS CARA que la lista.
  const promoTN = new Map(plan.cambios.map((c) => [c.variant_id, c.promo ?? null]))
  const tapa = aEsc.find((e) => e.precio && !e.promo && promoTN.get(e.variant_id) != null && promoTN.get(e.variant_id) >= e.precio.motor)
  if (tapa) return `${tapa.sku ?? tapa.variant_id}: la lista nueva ($${tapa.precio.motor}) queda por debajo del promocional de TN ($${promoTN.get(tapa.variant_id)}): cargá también la oferta`
  const regalo = aEsc.find((e) => e.promo && e.promo.motor != null && e.promo.motor < e.promo.lista * PISO_PROMO)
  if (regalo) return `${regalo.sku ?? regalo.variant_id}: promocional de $${regalo.promo.motor} con lista de $${regalo.promo.lista} es más de ${Math.round((1 - PISO_PROMO) * 100)}% de descuento`
  return null
}

/**
 * Lo que la campaña lee para darse por aplicada: por producto, el promocional que quiere y el que TN TIENE, leído DESPUÉS de
 * escribir (`releidas`: variant_id → promocional de una lectura NUEVA de TN; la variante que ⛔ se releyó queda con la
 * lectura del principio de la corrida, que también es de TN en vivo). `ok` = TODAS sus variantes como la campaña dice.
 * @param {Array} decididas  las de `planPrecioTN`
 * @param {Map<number, number|null>} [releidas]
 * @returns {Record<string, { campania: string, quiere: number|null, tn: Array<number|null>, ok: boolean }>}
 */
export function confirmacion(decididas = [], releidas = new Map()) {
  const out = {}
  for (const d of decididas) {
    const tn = releidas.has(d.variant_id) ? releidas.get(d.variant_id) : d.tn
    const k = String(d.product_id)
    const p = out[k] ?? (out[k] = { campania: d.campania, quiere: d.quiere, tn: [], ok: true })
    if (!p.tn.includes(tn)) p.tn.push(tn)
    if (tn !== d.quiere || d.quiere !== p.quiere) p.ok = false
  }
  return out
}

/** El promocional de cada variante de los productos crudos de TN (`GET /products/{id}`), como lo compara el plan. */
export const promosDe = (productos) => new Map(productos.flatMap((p) => (p.variants || []).map((v) => [Number(v.id), pesos(v.promotional_price)])))
