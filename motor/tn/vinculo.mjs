/**
 * Los vínculos de Tienda Nube: qué variante del ERP es cada variante de TN, por el id de TN (sql/076).
 *
 * 🔑 Bruno, 3-nov: «a veces un producto sirve para dos variantes, con el mismo stock» (iPhone 17 Pro y 18 Pro), y sobre la
 * regla: el grupo comparte stock sólo si difiere el modelo o el talle; con colores distintos frena y lo revisa una persona
 * (en GN hay `CAMISA TAOS` S bordó vinculada a S blanco). Medido contra GN el 3-nov: BDI 139 de 139 grupos comparten,
 * Zattia 0 de 4.
 */

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

/** El texto de un valor de variante de TN: `{ es: 'x' }` en la API, o el texto solo. */
const textoDe = (x) => (x && typeof x === 'object' ? x.es ?? Object.values(x)[0] ?? '' : x ?? '')

/** Los valores de una variante de TN, de la API (`values`) o del espejo (`valores`). */
export const valoresDe = (tv) => {
  const v = tv?.values ?? tv?.valores
  return Array.isArray(v) ? v.map(textoDe) : v == null ? [] : [textoDe(v)]
}

const MODELO = /\b(IPHONE|SAMSUNG|GALAXY|MOTOROLA|MOTO|XIAOMI|REDMI)\b/

/** ¿Este valor es el modelo del celular? Es lo único que puede cambiar dentro de un grupo que comparte stock. */
export const esModelo = (valor) => MODELO.test(norm(valor))

/**
 * ¿Estas variantes de TN, vinculadas a UNA del ERP, pueden llevar el mismo stock? Sí, si sólo cambia el modelo. Puro.
 * 🔴 Si cambia otra cosa (un color) ⛔: compartir stock mezclaría mercadería distinta.
 * @param {Array<any>} variantes variantes de TN, con `values` o `valores`
 */
export function comparteStock(variantes) {
  const restos = new Set(variantes.map((tv) => valoresDe(tv).filter((v) => !esModelo(v)).map(norm).join('|')))
  return restos.size === 1
}

/**
 * ¿Este grupo de variantes de TN, sobre UNA del ERP, lleva el mismo stock? Todas vinculadas y sólo cambia el modelo.
 * Una sola regla: la usa el envío de stock (`planStockTN`) y la pantalla «Vincular».
 * @param {Array<any>} variantes variantes de TN con `id`, y `values` o `valores`
 */
export const grupoComparte = (variantes, indice) => variantes.every((tv) => indice.porVarianteTN?.(tv.id)) && comparteStock(variantes)

/**
 * Lo que una persona tiene que resolver en «Vincular». Puro.
 * - `sin_par`: la variante de TN ⛔ cruza con ninguna del ERP (por vínculo, código o SKU).
 * - `trabados`: varias variantes de TN caen en una del ERP y ⛔ pueden llevar el mismo stock.
 * 🔴 Una variante de TN sin control de stock (`stock` null) ⛔ traba un grupo: el envío ⛔ la toca. Sin par sí aparece: una venta igual
 * tiene que cruzar.
 * @param {object} p
 * @param {Array<any>} p.variantes variantes de TN: `id`, `sku`, `barcode`, `valores`, `stock`
 * @param {object} p.indice `indiceDeVariantes`
 * @returns {{ sin_par: any[], trabados: Array<{ product_id:number, size_id:number, variantes:any[] }> }}
 */
export function vinculosPendientes({ variantes, indice }) {
  const sin_par = []
  const porVariante = new Map()
  for (const tv of variantes) {
    const v = indice.porVarianteTN?.(tv.id) ?? indice.porBarcode?.(tv.barcode) ?? indice.porSku?.(tv.sku)
    if (!v) { sin_par.push(tv); continue }
    if (tv.stock == null) continue
    const k = `${v.product_id}:${v.size_id}`
    if (!porVariante.has(k)) porVariante.set(k, { product_id: v.product_id, size_id: v.size_id, variantes: [] })
    porVariante.get(k).variantes.push(tv)
  }
  const trabados = [...porVariante.values()].filter((g) => g.variantes.length > 1 && !grupoComparte(g.variantes, indice))
  return { sin_par, trabados }
}

/**
 * Las filas a cargar desde la tabla leída de GN. Puro.
 * 🔴 `product_size_id` de GN ⛔ es el `size_id` del ERP: se traduce por producto + nombre del talle, sin aproximar.
 * @param {object} p
 * @param {Array} p.filas      la tabla de GN (`tn_variante`, `gn_product_id`, `gn_size_id`, `gn_texto`)
 * @param {Array} p.inventario `{ product_id, size_id, size_name }` de GN
 * @returns {{ cargar: Array<{variant_id:number, product_id:number, size_id:number}>, sin_vinculo: number[], sin_traducir: any[], ambiguas: any[] }}
 */
export function vinculosDeGN({ filas, inventario }) {
  const talles = new Map()
  for (const f of inventario) {
    const k = `${f.product_id}|${norm(f.size_name)}`
    if (!talles.has(k)) talles.set(k, new Set())
    talles.get(k).add(Number(f.size_id))
  }
  const salida = { cargar: [], sin_vinculo: [], sin_traducir: [], ambiguas: [] }
  const vistas = new Set()
  for (const f of filas) {
    const variant_id = Number(f.tn_variante)
    if (vistas.has(variant_id)) continue // GN repite algunas filas al paginar
    vistas.add(variant_id)
    if (f.gn_size_id == null || f.gn_size_id === 'null' || f.gn_size_id === '') { salida.sin_vinculo.push(variant_id); continue }
    const talle = String(f.gn_texto ?? '').split(' Cambiar')[0].split(' | ').pop()
    const s = talles.get(`${f.gn_product_id}|${norm(talle)}`)
    if (!s) salida.sin_traducir.push({ variant_id, producto: f.producto, talle: f.talle, gn: f.gn_texto })
    else if (s.size > 1) salida.ambiguas.push({ variant_id, producto: f.producto, talle: f.talle, gn: f.gn_texto })
    else salida.cargar.push({ variant_id, product_id: Number(f.gn_product_id), size_id: [...s][0] })
  }
  return salida
}

/** Carga los vínculos copiados de GN. ⛔ pisa lo elegido en el ERP (`origen = 'erp'`). @returns {Promise<number>} filas cargadas o cambiadas */
export async function guardarVinculosDeGN(db, { tienda, cargar, empresa = 'areben' }) {
  let n = 0
  for (const f of cargar) {
    const r = await db.q(
      `insert into tn_vinculo (empresa_id, tienda, variant_id, product_id, size_id, origen) values ($1, $2, $3, $4, $5, 'gn')
       on conflict (empresa_id, tienda, variant_id) do update set product_id = excluded.product_id, size_id = excluded.size_id, actualizado_en = now()
        where tn_vinculo.origen = 'gn' and (tn_vinculo.product_id, tn_vinculo.size_id) is distinct from (excluded.product_id, excluded.size_id)
       returning variant_id`,
      [empresa, tienda, f.variant_id, f.product_id, f.size_id],
    )
    n += r.length
  }
  return n
}
