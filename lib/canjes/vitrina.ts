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

// ── Revisar el stock: lo único que despega la foto de la realidad ───────────────

/**
 * Qué hacer con cada producto de la vitrina después de volver a mirar la tienda.
 *
 * **Por qué existe.** La vitrina es un espejo *congelado*: se guarda foto, precio y las variantes
 * que tenían stock **el día que se trajeron**, y de ahí en adelante nadie vuelve a preguntarle nada
 * a Tienda Nube (el portal no tiene sesión y no puede). Volver a traer una categoría refresca lo
 * que vuelve en esa importación, pero **un producto agotado del todo ya no vuelve en la lista**:
 * su fila queda intacta y se sigue ofreciendo para siempre. Este es el agujero que tapa.
 *
 * `apagar` NO borra: la fila queda con `activo: false`, que es lo mismo que hace sacar un producto
 * a mano. Que algo se haya caído es información, y lo que alguien ya eligió no se toca — quedó
 * congelado en su canje.
 */
export type RevisionDeStock = {
  /** Los que siguen ofreciéndose, con la foto, el precio y las variantes de hoy. */
  actualizar: ProductoParaVitrina[]
  /** `tn_product_id` de los que dejaron de poder ofrecerse. */
  apagar: string[]
}

/**
 * Compara lo que la vitrina tiene **activo** contra el catálogo de hoy.
 *
 * Se apaga por tres motivos, y los tres significan lo mismo para ella —que no se lo podemos
 * ofrecer—: se agotaron todas sus variantes, lo despublicaron, o el producto ya no está en la
 * tienda. `paraVitrina` decide los dos primeros con las mismas reglas con las que entró.
 *
 * ⚠️ Los que ya están apagados **no se miran**: alguien los apagó a mano y volver a prenderlos
 * porque hoy hay stock sería pisar una decisión con un chequeo automático.
 */
export function revisarStock(
  items: { tn_product_id: string; activo: boolean }[],
  tienda: ProductoTn[],
): RevisionDeStock {
  const porId = new Map(tienda.map((p) => [String(p.id), p]))
  const actualizar: ProductoParaVitrina[] = []
  const apagar: string[] = []

  for (const i of items) {
    if (!i.activo) continue
    const p = porId.get(String(i.tn_product_id))
    const fresco = p ? paraVitrina(p) : null
    if (fresco) actualizar.push(fresco)
    else apagar.push(String(i.tn_product_id))
  }
  return { actualizar, apagar }
}

// ── La faceta: lo único por lo que ella puede filtrar ───────────────────────────

/**
 * Sin tildes, sin espacios de más y en mayúsculas. Para comparar valores de la tienda entre sí:
 * `Único` y `UNICO` son el mismo talle y quien los cargó no lo pensó dos veces.
 */
export function normalizarValor(v: string): string {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * ¿Este valor es un modelo de celular?
 *
 * Se reconoce **por la forma del valor y no por su posición**: medido sobre los catálogos reales,
 * en BDI hay 11 modelos que caen en la posición 1 y en Zattia los talles aparecen en las dos, así
 * que "el primer valor es el modelo" es falso.
 */
export function esModeloDeCelular(v: string): boolean {
  const n = normalizarValor(v)
  return /\b(IPHONE|IPAD|SAMSUNG|GALAXY|MOTOROLA|MOTO|XIAOMI|REDMI|HUAWEI|HONOR|POCO)\b/.test(n)
}

/** El orden en el que se prueba la ropa, no el alfabético: `L` va después de `M`, no antes. */
const TALLES_LETRA = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

/**
 * ¿Este valor es un talle? Las tres formas que aparecen de verdad: la letra (`XS…XXXL`), el número
 * (`34…42`, y también los de calzado) y el talle único.
 */
export function esTalle(v: string): boolean {
  const n = normalizarValor(v).replace(/^TALLE /, '')
  if (!n) return false
  return TALLES_LETRA.includes(n) || /^(U|UNICO)$/.test(n) || /^\d{1,3}$/.test(n)
}

export type ClaseDeFaceta = 'modelo' | 'talle'
export type Faceta = { clase: ClaseDeFaceta; valores: string[] }

export function esDeLaClase(v: string, clase: ClaseDeFaceta): boolean {
  return clase === 'modelo' ? esModeloDeCelular(v) : esTalle(v)
}

/** Un item de la vitrina visto desde el filtro: sólo hacen falta los valores de cada opción. */
export type ItemFiltrable = { opciones: { valores: string[] }[] }

function ordenDeTalle(v: string): [number, number, string] {
  const n = normalizarValor(v).replace(/^TALLE /, '')
  const letra = TALLES_LETRA.indexOf(n)
  if (letra >= 0) return [0, letra, n]
  if (/^\d{1,3}$/.test(n)) return [1, Number(n), n]
  // El único va al final: no compite con los otros, es la ausencia de talle.
  if (/^(U|UNICO)$/.test(n)) return [3, 0, n]
  return [2, 0, n]
}

/** Lo que hay antes del primer número (`IPHONE`, `SAMSUNG GALAXY S`) y ese número. */
function ordenDeModelo(v: string): { marca: string; numero: number; texto: string } {
  const texto = normalizarValor(v)
  const m = texto.match(/\d+/)
  if (!m) return { marca: texto, numero: -1, texto }
  return { marca: texto.slice(0, m.index).trim(), numero: Number(m[0]), texto }
}

function comparaModelos(a: string, b: string): number {
  const A = ordenDeModelo(a)
  const B = ordenDeModelo(b)
  // Los que no traen número no se pueden ordenar por generación: van al final, alfabéticos.
  if ((A.numero < 0) !== (B.numero < 0)) return A.numero < 0 ? 1 : -1
  if (A.numero < 0) return A.texto.localeCompare(B.texto)
  // La marca primero para que los iPhone no queden intercalados con los Samsung por el número.
  if (A.marca !== B.marca) return A.marca.localeCompare(B.marca)
  // Del más nuevo al más viejo: el suyo lo busca arriba, no en el medio de una lista de veinte.
  if (A.numero !== B.numero) return B.numero - A.numero
  return A.texto.localeCompare(B.texto)
}

/**
 * El eje por el que se puede filtrar esta vitrina, o `null` si no se reconoce ninguno.
 *
 * Los dos ejes **nunca conviven en una misma tienda** (BDI: 181 productos con modelo y 0 con talle;
 * Zattia: 201 con talle y 0 con modelo), así que gana el que tenga más valores distintos. Hacen
 * falta **dos**: un filtro con una sola opción no filtra nada y ocupa la mitad de la pantalla.
 *
 * ⚠️ Esto **no contradice** la regla de no ponerle nombre a las opciones de adentro de un producto:
 * ahí el eje es desconocido y se muestra la palabra de la tienda. Acá la faceta se nombra sólo
 * cuando se la reconoce por la forma, y cuando no se reconoce **no hay filtro**, no un filtro con
 * un nombre inventado.
 */
export function facetaDeLaVitrina(items: ItemFiltrable[]): Faceta | null {
  /** normalizado → cómo lo escribe la tienda, que es lo que se le muestra a ella. */
  const modelos = new Map<string, string>()
  const talles = new Map<string, string>()
  for (const item of items || []) {
    for (const o of item.opciones || []) {
      for (const v of o.valores || []) {
        const texto = String(v || '').trim()
        if (!texto) continue
        const clave = normalizarValor(texto)
        if (esModeloDeCelular(texto)) {
          if (!modelos.has(clave)) modelos.set(clave, texto)
        } else if (esTalle(texto) && !talles.has(clave)) {
          talles.set(clave, texto)
        }
      }
    }
  }
  const clase: ClaseDeFaceta = modelos.size >= talles.size ? 'modelo' : 'talle'
  const gana = clase === 'modelo' ? modelos : talles
  if (gana.size < 2) return null
  const valores = [...gana.values()]
  valores.sort(clase === 'modelo'
    ? comparaModelos
    : (a, b) => {
      const A = ordenDeTalle(a)
      const B = ordenDeTalle(b)
      return A[0] - B[0] || A[1] - B[1] || A[2].localeCompare(B[2])
    })
  return { clase, valores }
}

/**
 * ¿Esta opción sobrevive al filtro?
 *
 * **Lo que no participa de la faceta se queda visible**: una opción sin ningún valor de esa clase
 * —los accesorios de BDI que sólo tienen color— no es de otro modelo, es de ninguno. Filtrar
 * esconde lo del **otro** modelo, no lo neutro.
 */
export function opcionPasa(valores: string[], faceta: Faceta | null, elegido: string | null): boolean {
  if (!faceta || !elegido) return true
  const propios = (valores || []).filter((v) => esDeLaClase(v, faceta.clase))
  if (!propios.length) return true
  const buscado = normalizarValor(elegido)
  return propios.some((v) => normalizarValor(v) === buscado)
}

/** Un producto pasa si le queda al menos una opción para elegir. */
export function itemPasa(item: ItemFiltrable, faceta: Faceta | null, elegido: string | null): boolean {
  if (!faceta || !elegido) return true
  return (item.opciones || []).some((o) => opcionPasa(o.valores, faceta, elegido))
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
