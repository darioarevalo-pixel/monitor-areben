/**
 * Las tarjetas de un carrusel que Meta NO manda junto con el aviso.
 *
 * # El agujero que tapa
 *
 * `piezaDe` (en `api/meta-ads.js`) saca las tarjetas de
 * `object_story_spec.link_data.child_attachments`, que es donde viven cuando el carrusel se armó
 * **en Ads Manager**. Un aviso que sale de **una publicación de Instagram** no trae nada de eso:
 * referencia un `effective_object_story_id` y el creativo llega prácticamente vacío. Medido el
 * 6-ago-2026 sobre las respuestas reales: los dos avisos llamados `SWEATERS - CARROUSEL RAYADOS`
 * daban `piezas: 0` **siendo carruseles**, así que el chip `⧉ N` de la grilla no se dibujaba nunca.
 *
 * La única forma de contarlas es preguntarle **a la publicación**, no al aviso:
 * `GET /<object_story_id>?fields=attachments{subattachments}`.
 *
 * # Por qué acá y en JS plano
 *
 * Mismo motivo que `lineas.core.js`: `api/meta-ads.js` corre en Node sin pasar por el compilador de
 * Next y no puede importar TypeScript. Lo que queda del otro lado, en el handler, es sólo el viaje
 * a Meta; todo lo que se puede equivocar sin que Meta se entere —a quién hay que rescatar, cómo se
 * lee la respuesta— vive acá, donde un test lo puede mirar.
 *
 * # Una llamada, no una por aviso
 *
 * Graph acepta `?ids=a,b,c&fields=…`, que es el mismo truco con el que `rescatarMiniaturas` rescata
 * las miniaturas de 600 px. Así el rescate entero es **un viaje más**, no uno por aviso — y sólo
 * sale cuando hay a quién rescatar.
 */

/** El tope de tarjetas de un carrusel de Meta. El mismo que ya aplica `piezaDe`. */
export const TOPE_TARJETAS = 10

/**
 * A quién hay que preguntarle: las publicaciones de los avisos que quedaron sin tarjetas.
 *
 * 🔑 **Devuelve una lista de avisos por publicación, no un aviso.** Dos avisos distintos —de dos
 * conjuntos, o uno pausado y su copia— pueden apuntar a la MISMA publicación, y con un
 * `Map<historia, aviso>` el segundo pisaba al primero y se quedaba sin tarjetas por un motivo que
 * no tiene nada que ver con él.
 *
 * El filtro es «no tiene tarjetas **y** sale de una publicación». No intenta adivinar si la
 * publicación es un carrusel: eso es justamente lo que se viene a averiguar, y preguntar de más no
 * cuesta ninguna llamada extra porque todas viajan juntas.
 */
export function historiasARescatar(ads, historiaPorId, tope) {
  const porHistoria = new Map()
  for (const a of ads) {
    if (a.piezas && a.piezas.length) continue
    const historia = String(historiaPorId.get(a.id) || '')
    if (!historia) continue
    const ya = porHistoria.get(historia)
    if (ya) {
      ya.push(a)
      continue
    }
    // El tope corta publicaciones nuevas, nunca un aviso que comparte una que ya entró: los avisos
    // vienen ordenados por gasto, así que lo que queda afuera es lo que menos plata se lleva.
    if (porHistoria.size >= tope) continue
    porHistoria.set(historia, [a])
  }
  return porHistoria
}

/** La foto de una tarjeta. En un carrusel de videos es el póster, que es lo que se mira igual. */
function fotoDeTarjeta(hija) {
  const media = (hija && hija.media) || {}
  const image = media.image || {}
  return image.src || null
}

/**
 * Las fotos de las tarjetas de UNA publicación.
 *
 * Un posteo trae `attachments.data` (normalmente uno solo) y el carrusel cuelga de sus
 * `subattachments`. Se recorren los adjuntos y se toma el primero que tenga tarjetas: un posteo con
 * dos adjuntos, uno de ellos con carrusel, tiene un carrusel.
 *
 * ⚠️ **Devuelve fotos, no un conteo**, y por eso filtra las que no tengan `src` — igual que
 * `piezaDe` con `child_attachments`. Si alguna vez apareciera una tarjeta sin imagen, el chip
 * contaría de menos; se prefiere eso a meter un hueco en una lista que la pantalla puede terminar
 * dibujando.
 */
export function tarjetasDeHistoria(nodo) {
  const adjuntos = (nodo && nodo.attachments && nodo.attachments.data) || []
  for (const adj of adjuntos) {
    const hijas = (adj && adj.subattachments && adj.subattachments.data) || []
    const fotos = hijas.map(fotoDeTarjeta).filter(Boolean).slice(0, TOPE_TARJETAS)
    if (fotos.length) return fotos
  }
  return []
}

/**
 * De la respuesta de `?ids=` al mapa `publicación → fotos`.
 *
 * Meta contesta el batch como un objeto con un nodo por id pedido. Las publicaciones que no son
 * carrusel vienen igual, sin `subattachments`, y quedan afuera del mapa: no hay nada que aplicar.
 */
export function tarjetasPorHistoria(data) {
  const out = new Map()
  if (!data || typeof data !== 'object') return out
  for (const [id, nodo] of Object.entries(data)) {
    const fotos = tarjetasDeHistoria(nodo)
    if (fotos.length) out.set(String(id), fotos)
  }
  return out
}
