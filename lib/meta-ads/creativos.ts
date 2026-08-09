/**
 * La pieza de un aviso — la cara tipada.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/meta-ads/creativos.core.js`**, en JS plano, porque la
 * importan `api/meta-ads.js` y `api/_meta-biblioteca.js`, que corren en Node sin pasar por el
 * compilador de Next. El porqué de cada decisión (la cadena de respaldos de la imagen, por qué el
 * rescate de la miniatura es una llamada aparte) está en el docblock del core.
 *
 * Acá arriba viven además los rótulos de los formatos, que son de la pantalla.
 */

import { FORMATOS as FORMATOS_JS, formatoDe as formatoDeJs } from './creativos.core.js'

/** Qué clase de pieza es. `otro` es el que no encajó en ninguno, no un error. */
export type FormatoCreativo = 'carrusel' | 'video' | 'imagen' | 'publicacion' | 'otro'

export const FORMATOS = FORMATOS_JS as readonly FormatoCreativo[]
export const formatoDe = formatoDeJs as (creativo: Record<string, unknown>) => FormatoCreativo

/**
 * Cómo se llama cada formato en pantalla.
 *
 * 🔑 «Publicación» no es un adorno: es el único formato del que Meta no entrega ni el copy ni el
 * destino, porque el aviso referencia un posteo que ya existía. Sin el rótulo, su tarjeta se lee
 * como un aviso al que le falta el texto.
 */
export const ROTULO_FORMATO: Record<FormatoCreativo, string> = {
  carrusel: 'Carrusel',
  video: 'Video',
  imagen: 'Imagen',
  publicacion: 'Publicación',
  otro: 'Otro',
}
