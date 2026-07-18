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

/** Respuesta del endpoint al subir/vincular una imagen. */
export type SubirResp = { ok?: boolean; image_id?: string | number; variantesObjetivo?: number; variantesAsignadas?: number; error?: string }

// ── Revisar fotos por variante (card 3, fchk) ───────────────────────────────────
export type VarianteFchk = { color?: string | null; image_url?: string | null }
export type ImagenFchk = { id: string | number; src: string }
export type ProductoFchk = {
  id: string | number
  name: string
  image_count?: number
  imagenes?: ImagenFchk[]
  variantes?: VarianteFchk[]
  variantes_con_foto?: number
}

export type FiltroFchk = 'problema' | 'sinvincular' | 'sinfoto'
