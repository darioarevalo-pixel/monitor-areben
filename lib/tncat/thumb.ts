/**
 * Fotos de TiendaNube a tamaño de miniatura.
 *
 * TiendaNube **solo sirve el original**: las URLs terminan en `-1024-1024.jpg` y pedirle
 * `-240-240.jpg` devuelve 403. Medido sobre una foto real de Zattia, ese original pesa **1,3 MB**
 * — y la pantalla de fotos lo bajaba entero para dibujarlo a 132 px, por cada color de cada
 * producto de la lista.
 *
 * Se pasan por `images.weserv.nl`, que las achica y las sirve en WebP: la misma foto a 240 px
 * queda en **9,8 KB**. Es seguro por lo mismo que en el catálogo (`bdi-catalogo/index.html`, de
 * donde sale este port): solo rutea imágenes de `mitiendanube.com`, son imágenes —no ejecutan
 * nada ni llevan datos nuestros— y si el optimizador falla, `FotoTn` cae sola a la original.
 *
 * La foto ampliada NO pasa por acá: ahí se quiere nitidez, que es justamente de lo que depende
 * poder decir de qué color es.
 */

/** La URL liviana de `src` a `w` píxeles de ancho. Lo que no sea de TiendaNube vuelve intacto. */
export function thumbTN(src: string | null | undefined, w: number): string {
  if (!src || typeof src !== 'string') return ''
  if (!/mitiendanube\.com/i.test(src)) return src
  const sinProto = src.replace(/^https?:\/\//, '')
  return `https://images.weserv.nl/?url=${encodeURIComponent(sinProto)}&w=${w}&output=webp&q=80`
}
