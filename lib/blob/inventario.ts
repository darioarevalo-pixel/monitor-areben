/**
 * El inventario del Blob, del lado tipado.
 *
 * ⚠️ La regla **no vive acá**: vive en `lib/blob/inventario.core.js`, en JS plano, porque
 * `api/blob-upload.js` la necesita para validar el borrado en lote y no puede importar TypeScript.
 * Este archivo aporta los tipos y es de donde come la pantalla `components/archivos`.
 */

import {
  agrupar as agruparJs,
  CARPETAS as CARPETAS_JS,
  carpetaDe as carpetaDeJs,
  claveDeUrl as claveDeUrlJs,
  estadoDeArchivo as estadoDeArchivoJs,
  GRACIA_HORAS as GRACIA_HORAS_JS,
  rotuloDeCarpeta as rotuloDeCarpetaJs,
  sePuedeEliminarEnLote as sePuedeEliminarEnLoteJs,
  totalDe as totalDeJs,
} from './inventario.core.js'

/** Un archivo del store, tal cual lo informa el Blob. */
export type ArchivoBlob = {
  pathname: string
  url: string
  size: number
  subidoEn: string | null
}

/** Ver el docblock del núcleo: son cuatro y `no-verificable` ⛔ no es «sin dueño». */
export type EstadoArchivo = 'usado' | 'reciente' | 'sin-dueno' | 'no-verificable' | 'copia-en-meta'

export type ArchivoConEstado = ArchivoBlob & { estado: EstadoArchivo }

export type CarpetaInventario = {
  carpeta: string
  label: string
  quien: string | null
  archivos: ArchivoConEstado[]
  bytes: number
  bytesEliminables: number
  eliminables: number
  /** Alguna de sus fuentes no se pudo leer ⇒ ⛔ no se ofrece borrado en lote. */
  sinVerificar: boolean
}

export type ContextoInventario = {
  usadas: Map<string, string>
  /** Las piezas que Meta ya tiene subidas, del `pathname` al id de allá. */
  enMeta?: Map<string, string>
  sinVerificar: string[]
  ahora?: number
}

export const CARPETAS = CARPETAS_JS as Record<string, { label: string; quien: string }>
export const GRACIA_HORAS = GRACIA_HORAS_JS as number

export const carpetaDe = carpetaDeJs as (pathname: string) => string
/** El `pathname` decodificado de una URL del Blob, o `null` si no es de un store nuestro. */
export const claveDeUrl = claveDeUrlJs as (url: string) => string | null
export const rotuloDeCarpeta = rotuloDeCarpetaJs as (carpeta: string) => string
export const estadoDeArchivo = estadoDeArchivoJs as (a: ArchivoBlob, ctx: ContextoInventario) => EstadoArchivo
export const sePuedeEliminarEnLote = sePuedeEliminarEnLoteJs as (estado: EstadoArchivo) => boolean
export const agrupar = agruparJs as (archivos: ArchivoBlob[], ctx: ContextoInventario) => CarpetaInventario[]
export const totalDe = totalDeJs as (archivos: ArchivoBlob[]) => { archivos: number; bytes: number }
