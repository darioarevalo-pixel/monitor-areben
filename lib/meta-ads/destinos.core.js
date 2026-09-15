/**
 * Adónde lleva un aviso: **las páginas de la tienda que pueden ser destino, y el guard del destino
 * elegido a mano.**
 *
 * # Qué problema resuelve
 *
 * Hasta el «aviso de cero» el destino salía SIEMPRE de un aviso modelo (`copyDeCreativo`). El 15-sep-2026
 * mordió: los videos de la MOODS COLLECTION necesitaban `/fundas/moods-collection/`, **ningún aviso
 * de la cuenta apuntaba ahí**, y la tanda salió a `/new-in/` —la única página con las fundas del
 * video— porque la de girlhood (el modelo de la tanda anterior) no tenía ni una.
 *
 * # Por qué del menú público y no de la API de Tienda Nube
 *
 * Mismo criterio que `lib/atencion/modelos.core.js`: las colecciones ya están en el menú, con el
 * mismo link que ve la clienta, y la escritura de la tienda vive en otro repo (`bdi-catalogo`). Una
 * colección nueva cargada en la tienda aparece sola, sin token y sin lista a mano.
 *
 * # 🔴 El guard del destino vive ACÁ, y es el núcleo
 *
 * Abrir el destino a un campo libre convierte un formulario en un editor de «a dónde manda la plata»
 * de la pauta. Por eso `validarDestino()` sólo deja pasar **una URL `https` del dominio de la tienda
 * de esa línea** (`TIENDA_BASE`), y el llamador no puede saltearlo: el servidor lo corre al armar el
 * plan, no la pantalla.
 *
 * Es PURO: no habla con la tienda ni con Meta. Traer el HTML lo hace el handler.
 */

import { TIENDA_BASE } from '../tienda.core.js'

const err = (status, error) => ({ ok: false, status, error })

const RE_ANCHOR = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi

/**
 * Las rutas del menú que NUNCA son un destino de pauta: la cuenta, el carrito, la búsqueda, las
 * páginas institucionales y los productos sueltos (un producto es otro destino, no una colección).
 */
const RUTAS_NO_DESTINO = /^\/(productos|account|cuenta|cart|carrito|checkout|search|buscar|contacto|politica|terminos|como-comprar|preguntas|devoluciones|cambios|envios|legales)\b/i

function soloTexto(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `apex` sin `www.`: la tienda se sirve igual por los dos, y `TIENDA_BASE` guarda el apex. */
const hostSinWww = (h) => String(h || '').toLowerCase().replace(/^www\./, '')

/** El host de la tienda de una línea, o `null` si la línea no tiene tienda. */
export function hostDeTienda(linea) {
  const base = TIENDA_BASE[linea]
  if (!base) return null
  try { return hostSinWww(new URL(base).host) } catch { return null }
}

/**
 * ¿Se puede mandar un aviso de esta línea a esta URL?
 *
 * - ⛔ Sólo `https`: un `http` o un `javascript:` no es un destino.
 * - ⛔ Sólo el dominio de la tienda **de esa línea**: una tanda de BDI no puede mandar a zattia.com.ar
 *   ni a cualquier otro sitio. Es el mismo 409 de «entre marcas» del motor.
 * - Se normaliza: sin query ni hash que no se hayan pedido, con `/` al final en las rutas de
 *   colección —la tienda redirige sin ella, y una redirección le come el primer segundo al click—.
 */
export function validarDestino(url, linea) {
  const host = hostDeTienda(linea)
  if (!host) return err(409, `La línea «${linea || 'sin línea'}» no tiene tienda: no se le puede elegir destino.`)
  const crudo = String(url || '').trim()
  if (!crudo) return err(400, 'Falta el destino: un aviso sin destino no lleva a ningún lado.')
  let u
  try { u = new URL(crudo) } catch { return err(400, `«${crudo}» no es una dirección.`) }
  if (u.protocol !== 'https:') return err(400, 'El destino tiene que empezar con https://.')
  if (hostSinWww(u.host) !== host) {
    return err(409, `El destino tiene que ser de la tienda de la línea (${host}), y «${u.host}» no lo es.`)
  }
  const ruta = u.pathname.endsWith('/') || /\.[a-z0-9]+$/i.test(u.pathname) ? u.pathname : `${u.pathname}/`
  return { ok: true, destino: `https://${host}${ruta}${u.search}` }
}

/**
 * Las páginas del menú que sirven de destino, en el orden del menú y sin repetidas.
 *
 * Devuelve `[]` si no encuentra ninguna; no tira. Que la tienda cambie el tema no puede dejar la
 * pantalla sin poder elegir: el llamador deja escribir la URL a mano, que igual pasa por el guard.
 */
export function destinosDelMenu(html, linea) {
  const host = hostDeTienda(linea)
  if (!host) return []
  const vistos = new Set()
  const salida = []
  let m
  RE_ANCHOR.lastIndex = 0
  while ((m = RE_ANCHOR.exec(String(html || '')))) {
    const href = m[1]
    let u
    try { u = new URL(href, `https://${host}/`) } catch { continue }
    if (hostSinWww(u.host) !== host) continue
    const ruta = u.pathname
    if (ruta === '/' || RUTAS_NO_DESTINO.test(ruta)) continue
    const v = validarDestino(`https://${host}${ruta}`, linea)
    if (!v.ok || vistos.has(v.destino)) continue
    vistos.add(v.destino)
    const nombre = soloTexto(m[2]) || ruta.split('/').filter(Boolean).pop().replace(/-/g, ' ')
    salida.push({ url: v.destino, ruta: new URL(v.destino).pathname, nombre })
  }
  return salida
}

/**
 * Cuántos productos distintos muestra una página de la tienda (su primera página).
 *
 * 🔑 Es el chequeo que faltó el 15-sep: una página de colección **sin la funda del video** entrega,
 * gasta y no vende. Cero productos es un destino roto o vacío, y se avisa antes de armar.
 */
export function productosEnPagina(html, linea) {
  const host = hostDeTienda(linea)
  if (!host) return { cantidad: 0, handles: [] }
  const re = new RegExp(`href\\s*=\\s*["'](?:https?://(?:www\\.)?${host.replace(/\./g, '\\.')})?/productos/([^/"'?#]+)`, 'gi')
  const handles = []
  const vistos = new Set()
  let m
  while ((m = re.exec(String(html || '')))) {
    const h = m[1].toLowerCase()
    if (vistos.has(h)) continue
    vistos.add(h)
    handles.push(h)
  }
  return { cantidad: handles.length, handles }
}
