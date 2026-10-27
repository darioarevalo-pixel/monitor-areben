/**
 * Empujar stock a Tienda Nube (paso 4): qué stock le pondría el motor a cada variante de TN, al lado de lo que TN tiene y
 * de lo que dice GN (que es quien lo empuja hoy). Puro. Escribe sólo en la tienda donde «el libro MANDA» (`mandaEn`).
 *
 * 🔑 Qué depósitos suman al stock de cada tienda — MEDIDO el 15-oct (stock de TN = suma de esos depósitos de GN,
 * sobre las variantes de TN con SKU): BDI = Depósito Minorista (88,6%) · Zattia = Local (91,0%) · Stunned =
 * Depósito + Local (99,4%; ⛔ igual que Zattia). El resto de la diferencia era el espejo de TN viejo (el stock
 * cambia sin mover el `updated_at` del producto) ⇒ acá TN se lee EN VIVO.
 * Un nivel negativo se empuja como 0 (TN ⛔ acepta negativo). Una variante con `stock: null` en TN es «sin
 * límite»: ⛔ se toca. Una variante de TN sin SKU/código o sin variante en GN ⛔ se puede empujar: se cuenta.
 */
import { varianteDeLineaTN } from './cruce.mjs'

export const DEPOSITOS_TN = { bdi: ['deposito_minorista'], zattia: ['local'], stunned: ['deposito', 'local'] }

/** @param {Map<string, number>} niveles 'pid:sid:deposito' → unidades @returns {(pid:number, sid:number) => number} */
export function nivelDe(niveles, depositos) {
  return (pid, sid) => Math.max(0, depositos.reduce((s, d) => s + (Number(niveles.get(`${pid}:${sid}:${d}`)) || 0), 0))
}

/**
 * @param {object} p
 * @param {'bdi'|'zattia'|'stunned'} p.tienda
 * @param {Array} p.productos  `GET /products` de TN (crudo, con `variants`)
 * @param {object} p.indice    indiceDeVariantes del inventario
 * @param {Map<string, number>} p.libro  nivel del libro por 'pid:sid:deposito'
 * @param {Map<string, number>} p.gn     nivel de GN (inventario) por 'pid:sid:deposito'
 * @param {Map<string, number>} [p.reservado] 'pid:sid' → unidades de los pedidos de TN sin pagar con la reserva
 *   VIGENTE (`reservasTN`): TN ya las apartó ⇒ el motor empuja el libro MENOS eso (si no, se venden dos veces).
 */
export function planStockTN({ tienda, productos, indice, libro, gn, reservado = new Map() }) {
  const deps = DEPOSITOS_TN[tienda]
  if (!deps) throw new Error(`tienda desconocida: ${tienda}`)
  const variante = varianteDeLineaTN(indice)
  const deLibro = nivelDe(libro, deps)
  const deGN = nivelDe(gn, deps)
  const cuenta = { variantes: 0, sin_limite: 0, sin_variante: 0, tn_igual_gn: 0, libro_igual_tn: 0, libro_igual_gn: 0 }
  const cambios = []
  const vistas = new Map()
  for (const p of productos) {
    for (const tv of p.variants || []) {
      cuenta.variantes++
      if (tv.stock == null) { cuenta.sin_limite++; continue }
      const v = variante({ sku: tv.sku, barcode: tv.barcode })
      if (!v) { cuenta.sin_variante++; continue }
      const k = `${v.product_id}:${v.size_id}`
      vistas.set(k, (vistas.get(k) || 0) + 1)
      const tn = Number(tv.stock)
      const l = Math.max(0, deLibro(v.product_id, v.size_id) - (reservado.get(k) || 0))
      const g = deGN(v.product_id, v.size_id)
      if (tn === g) cuenta.tn_igual_gn++
      if (l === tn) cuenta.libro_igual_tn++
      if (l === g) cuenta.libro_igual_gn++
      if (l !== tn) cambios.push({ tn_product_id: Number(p.id), variant_id: Number(tv.id), sku: tv.sku ?? null, product_id: v.product_id, size_id: v.size_id, tn, libro: l, gn: g })
    }
  }
  // La misma variante de GN en dos variantes de TN (SKU repetido): empujar las dos con el mismo número la duplica ⇒ se
  // marcan y ⛔ se escriben (`aEscribir`).
  const repetidas = [...vistas.values()].filter((n) => n > 1).length
  for (const c of cambios) if (vistas.get(`${c.product_id}:${c.size_id}`) > 1) c.repetida = true
  return { cuenta: { ...cuenta, repetidas }, cambios }
}

/**
 * 🔑 La llave de «el libro MANDA»: `STOCK_TN_MANDA=bdi,zattia,stunned` (Vercel de `areben-erp`). Sin la variable, ninguna:
 * el empuje sigue SECO. 🔴 Bruno (18-oct): el ERP manda TODO JUNTO, ⛔ por partes. Desde el 26-oct los cortes son por
 * marca (Stunned → BDI → Zattia) ⇒ cada tienda se prende el día de SU corte, con todo lo suyo a la vez (stock, precio,
 * libro) y con el sync GN↔TN de esa tienda pausado (si GN sigue empujando, los dos se pisan). Una tienda que ⛔ existe
 * hace fallar (un typo ⛔ deja la llave apagada callada).
 */
export function mandaEn(tienda, env = process.env) {
  const lista = String(env.STOCK_TN_MANDA ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  for (const t of lista) if (!DEPOSITOS_TN[t]) throw new Error(`STOCK_TN_MANDA: tienda desconocida «${t}»`)
  return lista.includes(tienda)
}

/** Si el plan quiere cambiar más que esto de las variantes que se pueden empujar, el libro está mal: ⛔ se escribe. */
export const FRENO_STOCK = 0.15

/**
 * El freno del empuje real: el texto del porqué, o null. Medido el 18-oct (seco): BDI cambiaría 3% · Zattia 7% · Stunned 5%.
 * Lo que cambia de golpe una porción grande de la tienda es un libro roto (una fuente que faltó, una apertura), ⛔ ventas.
 */
export function frenoStock({ cuenta, cambios }, max = FRENO_STOCK) {
  const empujables = cuenta.variantes - cuenta.sin_limite - cuenta.sin_variante
  if (!empujables) return null
  const parte = cambios.length / empujables
  return parte > max ? `el libro cambiaría ${cambios.length} de ${empujables} variantes (${Math.round(parte * 100)}%, el freno es ${Math.round(max * 100)}%)` : null
}

/** Los cambios que SÍ se escriben: sin las variantes de SKU repetido. */
export const aEscribir = (cambios) => cambios.filter((c) => !c.repetida)

/** Lo que se le manda a TN por un cambio (la forma de `pedidoDePrecio`). */
export function pedidoDeStock(c) {
  return { method: 'PUT', path: `/products/${c.tn_product_id}/variants/${c.variant_id}`, body: { stock: c.libro } }
}

/**
 * La PRUEBA de escritura de stock sobre productos puntuales (Bruno, 26-oct: «probemos el stock a TN en el producto oculto»).
 * `STOCK_TN_MANDA` es de la tienda ENTERA (empujaría las 27 variantes que hoy difieren), así que la prueba va por otro
 * camino: sólo los productos pedidos Y que están OCULTOS en TN (`published` false), ⛔ la llave. Los ids son los del ERP/GN
 * (`product_id`, el de «Precios» y «Stock»: 913520), no los de TN. Puro.
 * @param {{cambios:Array<{product_id:any, tn_product_id:number}>, productos:Array<{id:any, published?:boolean}>, ids:Array<number|string>}} p
 * @returns {Array} los cambios de esos productos; lanza si el id es inválido o algún producto de TN está publicado.
 */
export function cambiosDeProductosOcultos({ cambios, productos, ids }) {
  const pedidos = [...new Set((ids || []).map(Number))]
  if (!pedidos.length || pedidos.some((n) => !Number.isInteger(n) || n <= 0)) throw new Error('Pasá el id del producto oculto: --producto 913520 (el del ERP; varios, con coma).')
  const mios = cambios.filter((c) => pedidos.includes(Number(c.product_id)))
  for (const id of new Set(mios.map((c) => Number(c.tn_product_id)))) {
    const p = productos.find((x) => Number(x.id) === id)
    if (!p || p.published !== false) throw new Error(`El producto de TN ${id} está PUBLICADO (o no se pudo leer): la prueba de stock sólo va sobre productos ocultos.`)
  }
  return mios
}
