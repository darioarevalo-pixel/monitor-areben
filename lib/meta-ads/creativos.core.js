/**
 * Cómo se lee la PIEZA de un aviso: imagen, título, texto, botón, formato — y el rescate de la
 * miniatura chica. LA implementación, una sola.
 *
 * # Por qué bajó de `api/meta-ads.js`
 *
 * Nació ahí adentro, para `?recurso=creativos` (los avisos de UNA campaña, a demanda). La Biblioteca
 * pregunta lo mismo sobre TODOS los avisos de una cuenta, y su handler
 * (`api/_meta-biblioteca.js`) no puede importar de `api/meta-ads.js` sin cerrar un círculo: es
 * `meta-ads.js` el que lo despacha. Es el mismo camino que ya hicieron `metricasDe` y la plomería
 * de Graph, y por el mismo motivo — dos lecturas distintas del mismo creativo no fallan
 * ruidosamente: dibujan dos veces la misma pieza con dos formatos distintos.
 *
 * Es `.js` plano porque lo importan handlers de `api/*.js`, que corren en Node sin pasar por el
 * compilador de Next. `lib/meta-ads/creativos.ts` es el re-export tipado que usa la app.
 */

import { graph, insightsTodas } from './graph.core.js'
import { destinoDe } from './pieza.core.js'

/**
 * El lado con que se le pide la miniatura a Meta. El default de `thumbnail_url` son **64 px**, y
 * para los avisos que salen de una publicación de Instagram esa miniatura es lo ÚNICO que llega:
 * no traen `image_url` ni `object_story_spec`, así que quedaban como una estampilla de 64 px
 * centrada en un cuadro de 190. La pantalla existe para mirar la pieza; con la foto ilegible no
 * cumple. 600 da margen para el cuadro de 190 en pantalla retina sin pedir un archivo enorme.
 */
export const LADO_MINIATURA = 600

/**
 * Cuántos creatives entran en un `?ids=`. Graph corta arriba de 50 y prefiere números chicos; con
 * más avisos que eso se atienden los primeros, que están ordenados por gasto: si hay que elegir a
 * cuáles verles la cara, son los que se están llevando la plata.
 */
export const TOPE_IDS_GRAPH = 50

/** Los botones de Meta, en castellano. Los que no estén caen al nombre crudo en minúsculas. */
export const ROTULO_CTA = {
  SHOP_NOW: 'Comprar',
  LEARN_MORE: 'Más información',
  SIGN_UP: 'Registrarse',
  BOOK_TRAVEL: 'Reservar',
  ORDER_NOW: 'Pedir ahora',
  GET_OFFER: 'Ver la oferta',
  SEND_MESSAGE: 'Enviar mensaje',
  WHATSAPP_MESSAGE: 'Escribir por WhatsApp',
  SUBSCRIBE: 'Suscribirse',
  CONTACT_US: 'Contactarnos',
  NO_BUTTON: 'sin botón',
}

/** Los formatos que se distinguen, en el orden en que se preguntan. */
export const FORMATOS = ['carrusel', 'video', 'imagen', 'publicacion', 'otro']

/**
 * Qué CLASE de pieza es. Se decide sobre el creativo crudo y no sobre lo que devuelve `piezaDe`,
 * porque después del rescate de miniaturas ya no se puede distinguir: un aviso hecho desde una
 * publicación termina con una `imagen` de 600 px igual que uno con foto propia.
 *
 * 🔑 **`publicacion` no es un detalle cosmético**: es el único formato del que Meta no entrega ni el
 * copy ni el destino, así que una tarjeta suya siempre va a verse más pobre que las otras. Sin el
 * rótulo eso se lee como que el aviso no tiene texto.
 */
export function formatoDe(cr) {
  const spec = (cr && cr.object_story_spec) || {}
  const link = spec.link_data || {}
  const video = spec.video_data || {}
  const hijos = Array.isArray(link.child_attachments) ? link.child_attachments : []
  if (hijos.length > 1) return 'carrusel'
  if (video.video_id || video.image_url) return 'video'
  if ((cr && cr.image_url) || link.picture) return 'imagen'
  if (cr && cr.effective_object_story_id) return 'publicacion'
  return 'otro'
}

/**
 * De lo que devuelve Meta a lo que se dibuja: imagen, título, texto y botón.
 *
 * La cadena de respaldos no es paranoia: el mismo campo vive en un lugar distinto según el formato.
 * Un aviso de imagen trae `image_url` arriba; uno de video, el póster adentro de `video_data`; uno
 * armado desde una publicación, sólo `link_data.picture`. Sin la cadena, la mitad de la grilla sale
 * sin foto y parece que los avisos no tienen creativo.
 */
export function piezaDe(cr) {
  const spec = cr.object_story_spec || {}
  const link = spec.link_data || {}
  const video = spec.video_data || {}
  const hijos = Array.isArray(link.child_attachments) ? link.child_attachments : []
  const cta = (link.call_to_action && link.call_to_action.type) || (video.call_to_action && video.call_to_action.type) || null
  const historia = cr.effective_object_story_id ? `https://www.facebook.com/${cr.effective_object_story_id}` : null
  return {
    imagen: cr.image_url || video.image_url || link.picture || (hijos[0] && hijos[0].picture) || cr.thumbnail_url || null,
    // La miniatura viaja aparte: es la única que Meta garantiza, así que sirve de red si la grande
    // no carga (las URLs de `scontent` caducan). Va la CHICA a propósito: la grande ya es el último
    // eslabón de `imagen`, y usarla también de red haría que las dos fallen juntas.
    thumb: cr.thumbnail_url || null,
    titulo: cr.title || link.name || video.title || null,
    texto: cr.body || link.message || video.message || null,
    cta: cta ? ROTULO_CTA[cta] || String(cta).toLowerCase().replace(/_/g, ' ') : null,
    // `destinoDe` y no `link.link`: en un aviso de video el destino está adentro del botón. Ver
    // el porqué —y los 18 avisos que salían sin destino— en `pieza.core.js`.
    destino: destinoDe(spec),
    // Un carrusel se piensa distinto que una foto sola, así que las tarjetas se cuentan y se
    // muestran. Tope de 10, que es el de Meta.
    piezas: hijos.map((h) => h && h.picture).filter(Boolean).slice(0, 10),
    esVideo: !!(video.video_id || video.image_url),
    formato: formatoDe(cr),
    permalink: cr.instagram_permalink_url || historia || null,
  }
}

/**
 * Los avisos que quedaron con la estampilla de 64 px, rescatados en UNA llamada.
 *
 * 🔑 **El problema es de quién tiene la foto, no de la pantalla.** Un aviso armado desde una
 * publicación de Instagram no trae `image_url` ni `object_story_spec`: referencia un
 * `effective_object_story_id` y lo único que llega es el `thumbnail_url`, que por defecto son 64 px.
 * Eran 5 de 11 avisos en Zattia y 3 de 5 en BDI — casi la mitad de la grilla dibujada con una
 * estampilla centrada en un cuadro de 190.
 *
 * 🔴 **Pedir el tamaño en la llamada de los avisos NO funciona** (medido en prod el 6-ago-2026: Meta
 * ignora los params en silencio sobre un `creative{}` anidado). Contra el creative directo sí son de
 * primer nivel, y con `?ids=` entran todos en UNA llamada en vez de una por aviso.
 *
 * Va después y no en el `Promise.all` porque necesita los `creative.id`. Cuesta un viaje más de
 * latencia y sólo cuando hay a quién rescatar: si todos los avisos tienen su foto propia —lo normal
 * en los armados desde Ads Manager— no sale ninguna llamada extra.
 *
 * `creativeIdDe` es una función y no un mapa porque los dos llamadores tienen el `creative.id` en
 * lugares distintos: `?recurso=creativos` en el índice de la llamada rica, la Biblioteca pegado al
 * aviso. Nunca rompe nada: si Meta rechaza, los avisos se quedan con la miniatura que ya tenían.
 */
export async function rescatarMiniaturas(avisos, creativeIdDe) {
  // Quedó con la estampilla el que terminó usando su propia miniatura como foto grande: la cadena
  // de respaldos de `piezaDe` ya probó todos los lugares donde podría haber una imagen de verdad.
  const flacos = avisos.filter((a) => a.imagen && a.imagen === a.thumb)
  if (!flacos.length) return

  const porCreative = new Map()
  for (const a of flacos) {
    const cid = String(creativeIdDe(a) || '')
    if (cid && porCreative.size < TOPE_IDS_GRAPH) porCreative.set(cid, a)
  }
  if (!porCreative.size) return

  const ids = [...porCreative.keys()].join(',')
  const r = await graph(`?ids=${ids}&fields=thumbnail_url&thumbnail_width=${LADO_MINIATURA}&thumbnail_height=${LADO_MINIATURA}`)
  if (!r.ok || !r.data) return

  for (const [cid, aviso] of porCreative) {
    const grande = r.data[cid] && r.data[cid].thumbnail_url
    // El `thumb` no se toca: sigue siendo la chica, que es la red si esta URL no carga.
    if (grande) aviso.imagen = grande
  }
}

/**
 * Las piezas de TODOS los avisos de una cuenta, indexadas por `ad_id`.
 *
 * Dos llamadas y la segunda es un enriquecimiento AISLADO, exactamente como en
 * `?recurso=creativos`: la primera lleva sólo campos que ya están probados en prod contra esta
 * cuenta, y los que podrían no existir van todos en la segunda. Un nombre de campo equivocado
 * anula la respuesta ENTERA de Graph —pasó con `business{name}` en julio de 2026—, así que separar
 * las dos es la diferencia entre «la grilla sale sin copy» y «la grilla no sale».
 *
 * Devuelve también el `creativeId` de cada aviso, que es lo que necesita `rescatarMiniaturas`, y el
 * `estado` VIVO: la foto diaria sólo escribe el estado en la fila del día en que se sacó, así que
 * dentro de una ventana que no incluya hoy no hay ninguno. Acá viene de Meta, que es donde está.
 *
 * ⚠️ **No rescata las miniaturas**, y es a propósito: el rescate tiene tope de 50 y hay que gastarlo
 * en los avisos que se van a MOSTRAR, ordenados por gasto. Acá todavía no se sabe cuáles son —esta
 * lista es la cuenta entera, incluidos los que nunca entregaron—. Lo hace el llamador, al final.
 */
export async function piezasDeCuenta(cuentaId) {
  const campos = 'id,name,effective_status,status,adset_id,campaign_id'
  // 🔴 **Paginado, y no un `limit` grande.** `?recurso=creativos` pide `limit=200` sin seguir el
  // cursor y le alcanza porque pregunta por UNA campaña. Acá la pregunta es por la CUENTA ENTERA, y
  // ahí el tope se toca: los avisos que quedaran en la página 2 volverían sin pieza, y sin pieza la
  // Biblioteca los dibuja como **«Ya no está en Meta»** — o sea que un tope silencioso no se vería
  // como un dato faltante sino como un aviso borrado. Es la peor forma de fallar: creíble.
  const [baseRes, ricoRes] = await Promise.all([
    insightsTodas(`act_${cuentaId}/ads?fields=${campos},creative{thumbnail_url,effective_object_story_id,instagram_permalink_url}&limit=200`),
    insightsTodas(`act_${cuentaId}/ads?fields=id,creative{id,image_url,body,title,object_story_spec}&limit=200`),
  ])
  // `insightsTodas` ya devuelve el motivo pasado por `mensajeError`: es un string, no un resultado
  // de Graph. Quien lo reciba no tiene que volver a pasarlo, y por eso viaja con el nombre `motivo`.
  if (!baseRes.ok) return { ok: false, motivo: baseRes.error }

  const ricoPorId = new Map()
  if (ricoRes.ok) {
    for (const a of ricoRes.rows) ricoPorId.set(String(a.id), a.creative || {})
  }

  const piezas = baseRes.rows.map((a) => {
    const id = String(a.id)
    const cr = { ...(a.creative || {}), ...(ricoPorId.get(id) || {}) }
    return {
      id,
      nombre: a.name || null,
      estado: a.effective_status || null,
      configurado: a.status || null,
      creativeId: (ricoPorId.get(id) || {}).id ? String(ricoPorId.get(id).id) : null,
      ...piezaDe(cr),
    }
  })

  // Si la rica falló, las piezas salen con la miniatura de 64 px y sin una palabra de copy. Se dice:
  // callarlo dejaría concluir «estos avisos no tienen texto» sobre un dato que no se pudo leer.
  return { ok: true, piezas, sinRico: ricoRes.ok ? null : ricoRes.error }
}
