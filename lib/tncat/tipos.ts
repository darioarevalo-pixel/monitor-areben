/**
 * Tipos de la sección Tienda Nube (tncat): 4 herramientas que ESCRIBEN en la tienda
 * online en vivo vía los endpoints `tn-categorias` y `tn-subir-imagen` (que NO se
 * tocan; el cliente solo los llama con payloads byte-fieles).
 *
 * El grueso del cómputo lo hace el server (diff de categorías, matcheo de nombres,
 * subida y vinculación de imágenes); acá solo se tipa lo que entra y sale.
 */

// ── Categorías por modelo (card 1, BDI) ─────────────────────────────────────────
export type CatDetalle = { nombre: string; agregar: string[]; quitar: string[] }
export type CatRecalc = {
  total_con_cambios: number
  total_agregados: number
  total_quitados: number
  total_productos: number
  detalle: CatDetalle[]
  error?: string
}
export type CatAplicar = { aplicados: number; errores?: unknown[]; error?: string }

// ── Asignar categoría por Excel (card 4, Zattia) ────────────────────────────────
export type Categoria = { id: string | number; name: string }
export type AsigMatched = { id: string | number; nombre: string; nuevas?: unknown }
export type AsigPreview = {
  ok: boolean
  categoria: string
  total: number
  matched: AsigMatched[]
  yaTenian: string[]
  noEncontrados: string[]
  error?: string
}
export type AsigAplicar = { ok: boolean; aplicados?: number; errores?: { nombre?: string; msg?: string; status?: string }[]; error?: string }

// ── Carga de imágenes (card 2) ──────────────────────────────────────────────────
export type ProductoImg = { id: string | number; name: string; sku?: string | null; colores?: string[] }

/** Una foto dentro de un grupo (bloque de un producto). */
export type FotoImg = {
  id: number
  file: File
  /** Data URL para la miniatura (null hasta que el FileReader la carga). */
  url: string | null
  subida: boolean
  /** Nombre de archivo (para el match y el rótulo). */
  fn: string
  color: string
  /** image_id que devuelve TN al subir (para revincular sin re-subir). */
  imageId?: string | number
  /** Aviso si el color no quedó vinculado a todas las variantes. */
  avisoColor?: string | null
}

/** Un grupo = un producto con varias fotos. */
export type GrupoImg = {
  id: number
  productId: string | number | null
  fotos: FotoImg[]
  portadaId?: number
}

/**
 * Respuesta del endpoint al subir/vincular/desvincular una imagen.
 *
 * `variantesAsignadas` / `variantesDesasignadas` son las **comprobadas releyendo TiendaNube**, no
 * las que contestaron 2xx: TN puede aceptar el pedido y no aplicarlo. `linkErrores` trae el
 * detalle de qué falló, que es lo único que hace diagnosticable un "se aplicaron 0 de 1".
 */
export type SubirResp = {
  ok?: boolean
  image_id?: string | number
  variantesObjetivo?: number
  variantesAsignadas?: number
  variantesDesasignadas?: number
  linkErrores?: string[]
  error?: string
}

// ── Revisar fotos por variante (card 3, fchk) ───────────────────────────────────
export type VarianteFchk = {
  color?: string | null
  image_url?: string | null
  /** SKU de la variante (cuando se pide `?variantes=1`): sirve para cruzar el stock con GN. */
  sku?: string | null
  /**
   * Código de barras de la variante. Es lo que se busca con el producto en la mano, y **cuál de
   * los dos códigos está cargado depende de la marca**: en BDI el barcode cubre el 88% de las
   * variantes y el sku el 63%; en Zattia es al revés (sku 90%, barcode 63%). Por eso el buscador
   * mira los dos.
   */
  barcode?: string | null
  /** Stock en TiendaNube (null = no gestionado). El de GN es la fuente de verdad. */
  stock?: number | null
  /**
   * Todos los valores de opción de la variante, incluido el color:
   * `["iPhone 13","AZUL"]` en BDI, `["M","CHOCOLATE"]` en Zattia.
   *
   * Es lo que permite nombrar el **segundo eje** sin adivinarlo. Decir "modelo de teléfono"
   * está bien en fundas y no significa nada en ropa, donde ese eje es el talle. Mostrando el
   * valor tal cual —"iPhone 13", "M"— no hay que elegir una palabra que sirva para las dos.
   */
  valores?: string[]
}
export type ImagenFchk = { id: string | number; src: string }
export type ProductoFchk = {
  id: string | number
  name: string
  /** SKU a nivel producto. Lo busca el buscador; en BDI viene en 153 de 235 productos. */
  sku?: string | null
  /** Arma el link a la ficha pública (`tiendanube.com/productos/<handle>`). Viene siempre. */
  handle?: string
  /** `false` = despublicado en la tienda. Undefined se asume publicado (default de TN). */
  published?: boolean
  image_count?: number
  imagenes?: ImagenFchk[]
  variantes?: VarianteFchk[]
  variantes_con_foto?: number
  variantes_total?: number
  /**
   * Categorías del producto en TiendaNube. El endpoint del audit ya las mandaba —solo
   * faltaba tiparlas— y son lo que permite recorrer la revisión de fotos por categoría en
   * vez de enfrentarse a 200 y pico de productos de una.
   */
  categories?: string[]
  category_ids?: (string | number)[]
}

export type FiltroFchk = 'problema' | 'sinvincular' | 'sinfoto'

// ── Explorar por categoría (card nueva) ─────────────────────────────────────────
/** Un producto de la tienda con sus categorías, para asignarlas o quitarlas. */
export type ProductoCat = {
  id: string | number
  name: string
  sku?: string | null
  published?: boolean
  categories?: string[]
  category_ids?: (string | number)[]
}
