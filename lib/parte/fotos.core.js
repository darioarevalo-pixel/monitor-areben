/**
 * **Las fotos y los logos del parte de la mañana.** Puro: recibe el catálogo ya bajado.
 *
 * # De dónde salen las fotos
 *
 * Del mismo lugar que las de toda la app: `tiendanube-audit` de bdi-catalogo (una lista por tienda,
 * pública, cacheada 1 h allá). El cruce Gestión Nube → Tienda Nube es `matchTn` —SKU, nombre
 * exacto, palabras—, el MISMO de las pantallas (`lib/tn-match.core.js`). 📊 Medido el 30-sep-2026
 * en BDI con stock: 232 de 245 productos con foto; los que ⛔ matchean son genéricos (cables,
 * «FUNDAS VARIAS»).
 *
 * 🔴 **Tienda Nube sólo sirve la foto de 1024 px (~1,3 MB).** Veinte de ésas en un mail son 25 MB
 * que el celular baja para mostrar un cuadradito. Se achica con weserv, como `lib/tncat/thumb.ts`,
 * pero en **jpg**: hay clientes de mail que ⛔ muestran webp.
 */

import { indexarTn, imagenDe } from '../tn-match.core.js'

const WESERV = 'https://images.weserv.nl/?url='

/**
 * 🔴 **La URL va CON `https://`.** Sin protocolo weserv la pide por http, y el CDN de Tienda Nube
 * contesta 400 (medido el 30-sep-2026 con los logos: 404 de weserv sin protocolo, 200 con él).
 */
const conProtocolo = (u) => (/^https?:\/\//.test(String(u)) ? String(u) : `https://${String(u).replace(/^\/\//, '')}`)

/**
 * Miniatura cuadrada para el mail: 2× el tamaño en que se dibuja, para que en pantallas retina ⛔
 * se vea borrosa.
 */
export function miniatura(url, lado = 48) {
  if (!url) return null
  const px = lado * 2
  return `${WESERV}${encodeURIComponent(conProtocolo(url))}&w=${px}&h=${px}&fit=cover&output=jpg`
}

/**
 * El índice de fotos de una BASE. En la de Zattia van también los productos de la tienda de
 * Stunned: Stunned vive en el Gestión Nube de Zattia pero tiene su propia Tienda Nube.
 */
export function indiceDeFotos(...catalogos) {
  return indexarTn(catalogos.flat().filter(Boolean), { soloConImagenes: true })
}

/** La miniatura de un producto de Gestión Nube (`{ name, sku }`), o `null`. */
export function fotoDe(producto, indice, lado = 48) {
  if (!indice || !producto) return null
  return miniatura(imagenDe({ name: producto.name, sku: producto.sku }, indice), lado)
}

/**
 * **Los logos.** Públicos y verificados el 30-sep-2026 (200 los tres).
 *
 * - **BDI**: el negro que usa el mailer en sus automatizaciones. ⛔ el de Tienda Nube, que es
 *   BLANCO sobre transparente y desaparece sobre el mail.
 * - **Zattia**: la «Z♥» de Tienda Nube. Es sólo el isotipo, así que al lado va el nombre.
 * - **Stunned**: el de Tienda Nube, **blanco** ⇒ va sobre una franja negra.
 *
 * Los de Tienda Nube tienen mucho aire alrededor: `trim` de weserv lo recorta.
 */
export const LOGOS = {
  bdi: {
    url: `${WESERV}${encodeURIComponent('https://80wkelaj24ephh6z.public.blob.vercel-storage.com/mail/cmrw7cxd70000fowas0vhhssy/LOGO-NEGRO-MAS-GRANDE-OuQ82dry3aJql6YPJ0zp7zbnc0p1Ub-K4EGSFllUXNjdPvpLYbhBC7a8uMNKe.png')}&h=56&output=png`,
    alto: 28, ancho: 72, fondo: '#ffffff', tinta: '#111111', nombre: null,
  },
  zattia: {
    url: `${WESERV}${encodeURIComponent('https://d1a9qnv764bsoo.cloudfront.net/stores/004/445/369/themes/common/logo-8741500542496677211-1776278666-44df5c6d590a821c6a2fc4897dfe6d9b1776278667.png')}&trim=10&h=64&output=png`,
    alto: 32, ancho: 29, fondo: '#ffffff', tinta: '#111111', nombre: 'ZATTIA',
  },
  stunned: {
    url: `${WESERV}${encodeURIComponent('https://d1a9qnv764bsoo.cloudfront.net/stores/007/516/263/themes/common/logo-3160831491623850930-1776267098-9fe1c13ab580872ceed4b7fd431d18901776267098.png')}&trim=10&h=40&output=png`,
    alto: 20, ancho: 136, fondo: '#111111', tinta: '#ffffff', nombre: null,
  },
}
