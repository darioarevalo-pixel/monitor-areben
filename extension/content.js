// Lo único que corre adentro de WhatsApp Web.
//
// 🔑 **No lee datos, no guarda nada y no tiene credenciales.** Su trabajo entero es contestar una
// pregunta —¿qué número tiene abierto el chat?— y avisar cuando la respuesta cambia. Todo lo demás
// (la ficha, los botones, el guardado) vive en el panel, que es una página del propio monitor
// corriendo en su origen, con su sesión y sus permisos.
//
// Esa división es a propósito: WhatsApp Web cambia su HTML cada tanto, así que este archivo es el
// que se va a romper. Cuanto menos haga, más barato es arreglarlo — y mientras tanto no hay ningún
// dato de clientes pasando por acá.

/**
 * El número del chat abierto, o null.
 *
 * Sale de los `data-id` que WhatsApp le pone a cada mensaje:
 *
 *     false_5493834270554@c.us_3EB0…        ← chat con una persona
 *     false_120363…@g.us_3EB0…_549…@c.us    ← grupo (el @c.us del final es QUIEN escribió)
 *
 * ⚠️ **El `@g.us` se chequea primero y no es un detalle.** En un grupo, el `@c.us` que aparece
 * después es el autor del mensaje: quedarse con ése abriría la ficha de cualquiera que haya
 * escrito recién, y encima cambiaría sola con cada mensaje nuevo. Los grupos no tienen ficha.
 *
 * Un chat sin ningún mensaje todavía no tiene `data-id` y devuelve null. Es correcto: es un chat
 * que se acaba de abrir desde el buscador y todavía no pasó nada.
 */
function numeroDelChat() {
  const main = document.querySelector('#main')
  if (!main) return null
  const nodos = main.querySelectorAll('[data-id]')
  for (const n of nodos) {
    const id = n.getAttribute('data-id') || ''
    if (id.includes('@g.us')) return null
    const m = id.match(/(?:^|_)(\d{6,})@c\.us/)
    if (m) return m[1]
  }
  return null
}

let ultimo = null

function mirar() {
  const tel = numeroDelChat()
  if (tel === ultimo) return
  ultimo = tel
  // Si el panel está cerrado no hay quien reciba esto, y Chrome lo reporta como error. No es un
  // error: es el estado normal mientras nadie abrió el panel.
  chrome.runtime.sendMessage({ tipo: 'chat', tel }).catch(() => {})
}

// El observer mira el documento entero y no `#main`: al cambiar de chat, WhatsApp **reemplaza**
// ese nodo, así que un observer colgado del viejo se queda mirando algo que ya no está en la
// página. El debounce existe porque escribir un mensaje dispara decenas de mutaciones por segundo.
let pendiente = null
new MutationObserver(() => {
  clearTimeout(pendiente)
  pendiente = setTimeout(mirar, 300)
}).observe(document.documentElement, { childList: true, subtree: true })

// El panel pregunta al abrirse: puede abrirse con un chat ya abierto desde hace rato, o sea sin
// ninguna mutación por delante que lo avise.
chrome.runtime.onMessage.addListener((msg, _remitente, responder) => {
  if (msg && msg.tipo === 'que-chat') responder({ tel: numeroDelChat() })
})

mirar()
