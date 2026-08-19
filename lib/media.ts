/**
 * La tabla de formatos de media, del lado tipado.
 *
 * ⚠️ La tabla **no vive acá**: vive en `lib/media.core.js`, en JS plano, porque `api/blob-upload.js`
 * la necesita y no puede importar TypeScript. Este archivo aporta los tipos, y es de donde comen las
 * pantallas que suben archivos (piezas de Meta Ads, galería de Ingresos).
 */

import {
  claseDeArchivo as claseDeArchivoJs,
  CLASE_POR_EXTENSION as CLASE_POR_EXTENSION_JS,
  EXTENSIONES_MEDIA as EXTENSIONES_MEDIA_JS,
  extensionDe as extensionDeJs,
  mimeDeArchivo as mimeDeArchivoJs,
  MIME_POR_EXTENSION as MIME_POR_EXTENSION_JS,
  TIPOS_MEDIA as TIPOS_MEDIA_JS,
} from './media.core.js'

/** De qué clase es un archivo. `null` = no se reconoció la extensión y no se sube nada. */
export type ClaseMedia = 'video' | 'imagen'

export const MIME_POR_EXTENSION = MIME_POR_EXTENSION_JS as Record<string, string>
export const CLASE_POR_EXTENSION = CLASE_POR_EXTENSION_JS as Record<string, ClaseMedia>
/** Los MIME que el permiso de subida deja pasar. Es lo que usa `api/blob-upload.js`. */
export const TIPOS_MEDIA = TIPOS_MEDIA_JS as string[]
export const EXTENSIONES_MEDIA = EXTENSIONES_MEDIA_JS as string[]

export const extensionDe = extensionDeJs as (nombre: string) => string
export const claseDeArchivo = claseDeArchivoJs as (nombre: string) => ClaseMedia | null
/** El `contentType` con el que sube este archivo, o `null` si la extensión no está en la tabla. */
export const mimeDeArchivo = mimeDeArchivoJs as (nombre: string) => string | null
