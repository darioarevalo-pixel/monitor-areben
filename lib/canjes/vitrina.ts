/**
 * De Tienda Nube a la vitrina: qué de la tienda entra, con qué foto y a qué precio.
 *
 * Es el traductor entre el catálogo real y lo que se congela en `canje_vitrina_items`. Vive acá y
 * no en el componente porque es donde están las decisiones que hay que poder defender en seis
 * meses, y porque así se testea sin montar una pantalla.
 *
 * **El monitor no escribe en Tienda Nube.** Ni acá ni en ningún lado del módulo: la tienda se lee,
 * se copia lo que se quiere ofrecer y la venta después se tipea a mano en el admin de TN.
 */

import type { ProductoParaVitrina } from './cliente'
import type { OpcionVitrina } from './tipos'

/**
 * Un producto del payload de `tiendanube-audit` con `?variantes=1`, visto desde la vitrina.
 *
 * Es un subconjunto del mismo objeto que consumen `TnProducto` y `ProductoFchk`. Se declara aparte
 * porque acá hacen falta dos campos que ninguno de los dos tipa (`price` / `promo_price`) y el
 * `id` de cada variante, que es la llave de todo esto.
 */
export type ProductoTn = {
  id: string | number
  name: string
  sku?: string | null
  /** `false` = despublicado en la tienda. `undefined` se asume publicado (default de TN). */
  published?: boolean
  price?: number | null
  promo_price?: number | null
  images?: string[]
  categories?: string[]
  variantes?: VarianteTn[]
}

export type VarianteTn = {
  id?: string | number
  sku?: string | null
  barcode?: string | null
  /** Los valores que definen la variante: `['iPhone 12']`, `['Negro', 'XS']`. */
  valores?: string[]
  color?: string | null
  image_url?: string | null
  /** Stock en TiendaNube. `null` = no gestionado, y eso **no** es lo mismo que cero. */
  stock?: number | null
}

/**
 * El precio que se le muestra: **lo que la tienda cobra hoy**.
 *
 * `promo_price` gana cuando existe. Medido sobre los dos catálogos: 35 productos de BDI y 202 de
 * Zattia están en promo, y en los 237 casos el precio de la variante **es** el de promo — o sea que
 * el de promo es el que la tienda está cobrando de verdad. Cargarle el precio tachado le daría
 * menos productos por el mismo acuerdo que a un cliente con el mismo dinero.
 *
 * Se toma a nivel producto y no de variante porque las variantes de un mismo producto **nunca**
 * tienen precios distintos: 0 de 235 en BDI y 0 de 661 en Zattia.
 */
export function precioDeVitrina(p: ProductoTn): number | null {
  const promo = p.promo_price == null ? null : Number(p.promo_price)
  if (promo != null && Number.isFinite(promo) && promo > 0) return promo
  const lista = p.price == null ? null : Number(p.price)
  return lista != null && Number.isFinite(lista) && lista > 0 ? lista : null
}

/**
 * ¿Se puede ofrecer esta variante?
 *
 * `stock == null` es "TN no gestiona el stock de esto", que no es lo mismo que cero: hay que
 * ofrecerlo, porque quien no lleva el stock en la tienda igual lo tiene. Cero es cero.
 */
export function hayParaOfrecer(v: VarianteTn): boolean {
  return v.stock == null || Number(v.stock) > 0
}

/**
 * Un producto de la tienda, listo para congelarse en la vitrina. `null` si no se puede ofrecer.
 *
 * Se cae por tres motivos, y ninguno se le muestra a nadie como error: está despublicado, no tiene
 * ninguna variante con stock, o TN no le dio id a ninguna. **Lo agotado simplemente no entra**: es
 * la única forma honesta de no ofrecerlo, porque un stock congelado hace dos semanas miente y la
 * palabra "agotado" en la pantalla de ella es peor que no mostrar el producto.
 *
 * ⚠️ Los `valores` van tal como los manda la tienda. No se intenta separar "modelo" de "color": los
 * ejes cambian producto por producto (en BDI 181 productos tienen uno y 19 tienen dos; en Zattia
 * 495 y 42) y ponerle nombre a algo que la mitad de las veces no existe es peor que no ponérselo.
 */
export function paraVitrina(p: ProductoTn): ProductoParaVitrina | null {
  if (p.published === false) return null

  const opciones: OpcionVitrina[] = []
  for (const v of p.variantes || []) {
    if (!hayParaOfrecer(v)) continue
    const id = v.id == null ? '' : String(v.id)
    if (!id) continue
    // El color entra como un valor más cuando TN no lo puso en `valores`: es un eje real y sin él
    // dos variantes distintas se verían con el mismo nombre.
    const valores = (v.valores || []).map((x) => String(x || '').trim()).filter(Boolean)
    const color = String(v.color || '').trim()
    if (color && !valores.includes(color)) valores.push(color)
    opciones.push({
      id,
      valores,
      foto: v.image_url || null,
      sku: v.sku || null,
      barcode: v.barcode || null,
    })
  }
  if (!opciones.length) return null

  return {
    tn_product_id: String(p.id),
    sku: p.sku || null,
    nombre: p.name || '',
    foto_url: (p.images || []).filter(Boolean)[0] || opciones.find((o) => o.foto)?.foto || null,
    pvp: precioDeVitrina(p),
    opciones,
  }
}

export type CategoriaTn = { nombre: string; cuantos: number }

/**
 * Las categorías de la tienda, con cuántos productos ofrecibles tiene cada una.
 *
 * El conteo es de **ofrecibles**, no de productos: una categoría con 40 cosas todas agotadas tiene
 * que verse como lo que es, o se la trae y aparece vacía sin explicación.
 *
 * Se ordenan por tamaño porque es lo que se busca —"traeme SWEATERS, que son 55"— y no alfabético,
 * que en BDI dejaría arriba los veinte modelos de iPhone que también son categorías.
 */
export function categoriasDeLaTienda(productos: ProductoTn[]): CategoriaTn[] {
  const cuenta = new Map<string, number>()
  for (const p of productos) {
    if (!paraVitrina(p)) continue
    for (const c of p.categories || []) {
      const nombre = String(c || '').trim()
      if (!nombre) continue
      cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1)
    }
  }
  return [...cuenta.entries()]
    .map(([nombre, cuantos]) => ({ nombre, cuantos }))
    .sort((a, b) => b.cuantos - a.cuantos || a.nombre.localeCompare(b.nombre))
}

/**
 * Los productos ofrecibles de una categoría, o los que matcheen un texto si no hay categoría.
 *
 * La búsqueda por texto no es un lujo: las categorías de Zattia son prolijas (`SWEATERS`, `JEANS`)
 * pero las de BDI mezclan `FUNDAS` con cada modelo de iPhone, así que ahí se llega antes por el
 * nombre del producto.
 */
export function buscarEnLaTienda(
  productos: ProductoTn[], opts: { categoria?: string | null; texto?: string | null },
): ProductoParaVitrina[] {
  const cat = (opts.categoria || '').trim()
  const q = (opts.texto || '').trim().toLowerCase()
  const out: ProductoParaVitrina[] = []
  for (const p of productos) {
    if (cat && !(p.categories || []).some((c) => String(c).trim() === cat)) continue
    if (q && !`${p.name || ''} ${p.sku || ''}`.toLowerCase().includes(q)) continue
    const listo = paraVitrina(p)
    if (listo) out.push(listo)
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre))
}
