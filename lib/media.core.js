/**
 * ⭐ **La tabla única de archivos de media**: qué extensiones se aceptan y con qué tipo MIME sube
 * cada una. La comparten los dos lugares que suben un archivo del browser al Blob — las **piezas**
 * de Meta Ads (`lib/meta-ads/pieza.core.js`) y la **galería** de Ingresos proyectados
 * (`components/ingresos/useSubirGaleria.ts`).
 *
 * # Por qué vive acá y no adentro de Meta Ads, que fue donde nació
 *
 * Los dos caminos necesitan exactamente lo mismo: la clase (imagen o video), el `contentType` con
 * el que sube el archivo y la lista que el permiso de subida deja pasar (`allowedContentTypes`).
 * Cuando la tabla vivía adentro de `pieza.core.js`, la segunda pantalla que subiera algo tenía dos
 * opciones y las dos malas: importar «pieza de Meta» desde una sección que no tiene nada que ver, o
 * escribir su propia lista. Lo segundo es lo que ya había costado caro **adentro** de Meta —tres
 * listas sueltas donde agregar un formato en una sola dejaba un archivo que la pantalla acepta y el
 * servidor rechaza—: repetirlo entre secciones es el mismo error un piso más arriba.
 *
 * `pieza.core.js` sigue exportando `MIME_POR_EXTENSION`, `CLASE_POR_EXTENSION`, `TIPOS_PIEZA`,
 * `extensionDe`, `claseDePieza` y `mimeDePieza` con los mismos nombres de siempre: lo que cambió es
 * de dónde salen, no qué valen.
 *
 * 🔑 **La clase se decide por la extensión y no por el `type` que informa el browser**: un archivo
 * que llega de Drive puede venir con `application/octet-stream` y ahí el `type` no dice nada. La
 * extensión la puso quien exportó el video y es lo único que viaja igual por todos los caminos.
 *
 * Es `.js` plano porque lo importa `api/blob-upload.js`, que corre en Node sin pasar por el
 * compilador de Next y no puede importar TypeScript. `lib/media.ts` es el re-export tipado.
 */

/** Extensión → tipo MIME. Todo lo demás de este archivo se deriva de acá. */
export const MIME_POR_EXTENSION = {
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', avi: 'video/x-msvideo',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
}

/** La clase sale del MIME, que ya la dice: `video/…` o `image/…`. */
export const CLASE_POR_EXTENSION = Object.fromEntries(
  Object.entries(MIME_POR_EXTENSION).map(([ext, mime]) => [ext, mime.startsWith('video/') ? 'video' : 'imagen']),
)

/** Los MIME que un permiso de subida deja pasar (`allowedContentTypes`), sin repetidos. */
export const TIPOS_MEDIA = [...new Set(Object.values(MIME_POR_EXTENSION))]

/** La extensión, en minúscula y sin punto. `''` si el nombre no tiene una. */
export function extensionDe(nombre) {
  const s = String(nombre || '').toLowerCase()
  // Sin punto, `split('.').pop()` devuelve el nombre entero y `sin-extension` pasaría por extensión.
  return s.includes('.') ? s.split('.').pop() : ''
}

/** `'video' | 'imagen' | null`. `null` es «no sé qué es esto», que se rechaza antes de subir nada. */
export function claseDeArchivo(nombre) {
  return CLASE_POR_EXTENSION[extensionDe(nombre)] || null
}

/** Con qué `contentType` sube este archivo, o `null` si la extensión no está en la tabla. */
export function mimeDeArchivo(nombre) {
  return MIME_POR_EXTENSION[extensionDe(nombre)] || null
}

/** Las extensiones aceptadas, para escribirlas en un cartel de error. */
export const EXTENSIONES_MEDIA = Object.keys(MIME_POR_EXTENSION)
