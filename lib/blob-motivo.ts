/**
 * ⭐ **El cartel que lee una persona cuando una subida al Blob no salió.**
 *
 * # El problema es una línea del SDK
 *
 * `upload()` de `@vercel/blob/client` le pide el permiso de subida a `/api/blob-upload` y, si la
 * respuesta no es 200, **tira el cuerpo a la basura** y lanza siempre lo mismo:
 *
 *     if (!res.ok) throw new BlobError('Failed to  retrieve the client token')
 *     // node_modules/@vercel/blob/dist/client.js:405 — el doble espacio es del SDK
 *
 * O sea: el motivo que el servidor se tomó el trabajo de escribir —«Ya subiste todo lo que entra»,
 * «pesa más de la cuenta», «No encuentro tu sesión»— **no llega nunca**. Lo que ve la persona es un
 * cartel en inglés que habla de un token que ella no sabe que existe.
 *
 * 🔴 **Ya mordió dos veces, y las dos costaron el mismo tipo de rato:**
 *  - **9-ago-2026** — las piezas de Meta comían un 403 de sesión y el cartel no mencionaba la
 *    sesión por ningún lado; la subida quedó muerta una semana.
 *  - **7-sep-2026** — la creadora de un canje de BDI llegó a las 30 evidencias del tope y sus dos
 *    videos fallaron con ese mismo cartel, **sin una palabra sobre el cupo**. Ella entendió «no se
 *    pueden subir videos», que es lo único que el cartel deja suponer.
 *
 * ⚠️ Los comentarios de `api/blob-upload.js` afirmaban que devolver el motivo del servidor tal cual
 * «es lo que hace que el cartel del browser diga *pesa más de la cuenta*». **No era cierto**: del
 * lado del servidor el mensaje estaba bien escrito y no salía de ahí. Un error que se prueba con el
 * `res.status(...)` de un test del handler y se cree resuelto, mientras la pantalla dice otra cosa.
 *
 * # Qué hace este archivo
 *
 * Cuando el error es **ese** cartel —y sólo entonces— vuelve a pedir el permiso con **nuestro**
 * `fetch`, que sí lee el cuerpo, y devuelve el motivo que contestó el servidor. Una llamada de más
 * en el camino de error; ninguna en el que sale bien.
 *
 * ⛔ **La regla no se copia acá.** El cliente no sabe cuál es el tope de un canje, ni si el link
 * venció, ni qué formatos entran: **pregunta**. El día que el tope cambie, cambia en un solo lugar
 * (`api/_canje-token.js`) y este archivo ni se entera.
 *
 * ⚠️ Pedir el permiso **no escribe nada** en el Blob: firma un permiso de un minuto que nadie usa.
 * Y sólo se pide cuando el servidor ya lo denegó una vez, así que en la práctica ni se firma.
 */

/**
 * La ruta que firma los permisos. La exporta este archivo —y no cada hook con su string— porque es
 * la misma que hay que volver a llamar para preguntar el motivo: dos copias que se separan dejan al
 * cartel preguntándole a una ruta que ya no existe.
 */
export const RUTA_PERMISO = '/api/blob-upload'

/**
 * El cartel del SDK cuando la firma no salió. Se matchea por el final de la frase y no por la
 * frase entera **a propósito**: el SDK la escribe con dos espacios en el caso `!res.ok` y con uno
 * cuando la respuesta no es JSON, y los dos casos son el mismo para nosotros.
 */
const CARTEL_DEL_SDK = /retrieve the client token/i

/** Lo que se dice cuando ni el SDK ni el servidor dijeron algo que una persona pueda leer. */
const GENERICO = 'No se pudo subir el archivo. Probá de nuevo y, si sigue, escribinos.'

/**
 * Lo que hace falta para volver a pedir el permiso: **exactamente lo que el hook ya le pasó a
 * `upload()`**. Si acá se arma distinto, el motivo que vuelve es el de otro pedido.
 */
export type PedidoDePermiso = {
  /** El mismo `pathname` de `upload()`: `carpeta/archivo.ext`. La carpeta decide qué reglas se miran. */
  pathname: string
  /** El sobre del portal de canjes (`canje:<token>`). Sin sesión, es lo único que identifica. */
  clientPayload?: string
  multipart?: boolean
  /** `x-monitor-auth` en los tres caminos que sí tienen sesión del Monitor. */
  headers?: Record<string, string>
}

/**
 * El motivo de una subida fallida, listo para mostrarse.
 *
 * @param e lo que tiró `upload()`.
 * @param pedido el mismo permiso que se pidió, para volver a pedirlo si el error no dice nada.
 */
export async function motivoDeSubida(e: unknown, pedido: PedidoDePermiso): Promise<string> {
  const dijo = ((e as Error)?.message || '').trim()
  // Todo lo que NO es el cartel del token ya habla por sí solo: un corte de red, un archivo que el
  // browser no pudo leer, un abort. Eso se muestra tal cual.
  if (!CARTEL_DEL_SDK.test(dijo)) return dijo || GENERICO
  return (await preguntarElMotivo(pedido)) || GENERICO
}

/** El motivo que contesta el servidor, o `null` si esta vez no lo denegó (o no se pudo preguntar). */
async function preguntarElMotivo(pedido: PedidoDePermiso): Promise<string | null> {
  try {
    const r = await fetch(RUTA_PERMISO, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(pedido.headers || {}) },
      // El sobre que arma el SDK, repetido: `type` es lo que hace que el endpoint entre en la rama
      // del permiso, y `clientPayload` es lo que elige entre la del equipo y la de la creadora.
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: {
          pathname: pedido.pathname,
          clientPayload: pedido.clientPayload,
          multipart: !!pedido.multipart,
        },
      }),
    })
    // Que ahora conteste 200 quiere decir que el permiso no era el problema: el que falló fue el
    // envío de los bytes. Decir el motivo de la firma ahí sería mentir con más palabras.
    if (r.ok) return null
    const cuerpo: unknown = await r.json().catch(() => null)
    const motivo = cuerpo && typeof (cuerpo as { error?: unknown }).error === 'string'
      ? (cuerpo as { error: string }).error.trim()
      : ''
    return motivo || null
  } catch {
    // Preguntar el motivo es un extra: si esto se cae, el cartel genérico sigue siendo mejor que
    // un error adentro del `catch` que lo estaba armando.
    return null
  }
}
