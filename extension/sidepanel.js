// El panel: un iframe del monitor y nada más.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUÉ UN IFRAME Y NO UNA PANTALLA PROPIA
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Adentro del iframe corre `https://monitorareben.vercel.app/panel/<telefono>`, o sea el monitor
// **en su propio origen**: ya tiene la sesión, los permisos y el acceso a Supabase y al KV. Una
// pantalla propia de la extensión tendría que pedir todo eso cruzando de dominio, con CORS y con
// un token nuevo viviendo en el navegador. No hay ninguna ventaja a cambio: la ficha la sabe
// dibujar el monitor.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUÉ EL SIDE PANEL DE CHROME Y NO UN IFRAME METIDO EN LA PÁGINA
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Un iframe inyectado adentro de web.whatsapp.com lo gobierna **la CSP de WhatsApp**, no la
// nuestra: para que cargue habría que borrarle la cabecera `Content-Security-Policy` a WhatsApp con
// una regla de red, o sea apagarle a la aplicación de mensajería su principal defensa contra que
// le inyecten código. Y además habría que pelearse con su layout cada vez que lo cambian.
//
// El side panel es una ventana del navegador, aparte de la página: la CSP que manda es la de la
// extensión. WhatsApp queda intacto y el panel sigue estando al costado del chat.
//
// ⚠️ **La sesión de acá adentro es aparte de la de la pestaña del monitor.** Chrome le da al
// monitor un `localStorage` propio por estar embebido en otro sitio, así que la primera vez hay que
// entrar una vez más. Después queda, como en cualquier pestaña.

const BASE = 'https://monitorareben.vercel.app/panel/'
const ORIGEN = 'https://monitorareben.vercel.app'

const iframe = document.getElementById('panel')
const aviso = document.getElementById('aviso')
let actual = null

/**
 * Qué decir cuando no hay número.
 *
 * Cada motivo es una situación distinta y la primera versión las mostraba todas iguales ("abrí un
 * chat"), que fue exactamente lo que hizo difícil entender por qué no aparecía nada: el panel decía
 * "abrí un chat" con un chat abierto. Un cartel que distingue vale más que cualquier explicación
 * escrita en otro lado.
 */
const MOTIVOS = {
  'sin-chat': 'Abrí el chat de una persona en WhatsApp Web.',
  grupo: 'Los grupos no tienen ficha. Abrí el chat de una persona.',
  'sin-telefono': 'Este chat no muestra el teléfono, así que no puedo buscar la ficha.',
  'sin-api': 'No puedo leer con quién estás hablando. Probá recargando WhatsApp Web; si sigue igual, WhatsApp cambió algo y hay que ajustar la extensión.',
}

/**
 * 🔑 **Sin chat abierto el panel se carga igual, sin número.** Antes mostraba un cartel y nada
 * más; desde que el panel tiene la solapa "Hoy" —la lista de a quién contactar— esa es justamente
 * la pantalla con la que se empieza el día, y esconderla hasta que se abra un chat dejaba al que
 * todavía no sabe a quién abrir mirando un cartel que le dice que abra un chat.
 */
// ¿Ya cargó el panel alguna vez? Mientras no haya cargado, el único camino es el `src`.
let cargado = false
iframe.addEventListener('load', () => {
  cargado = true
})

/**
 * 🔑 **Cambiar de chat NO recarga el panel.**
 *
 * Antes cada chat reasignaba el `src` del iframe, o sea que por cada cliente el panel volvía a
 * bajar el bundle del monitor, revalidar la sesión y releer las 771 entradas del KV — segundos,
 * cada vez, para cambiar de cliente. Ahora el número se le pasa por `postMessage` y adentro sólo
 * cambia un estado: lo único que se pide es la ficha nueva.
 *
 * El `src` queda para la primera carga y para el caso en que el panel todavía no esté listo.
 */
function mostrar(tel, motivo) {
  const limpio = (tel || '').replace(/\D/g, '')
  // El cartel se actualiza SIEMPRE, aunque el número no haya cambiado: pasar de un chat sin
  // teléfono a un grupo no cambia el panel pero sí el motivo, y el cartel es lo único que lo dice.
  aviso.textContent = limpio ? '' : MOTIVOS[motivo] || MOTIVOS['sin-chat']
  aviso.style.display = limpio ? 'none' : ''
  if (limpio === actual) return
  actual = limpio
  if (!cargado || !iframe.contentWindow) {
    iframe.src = BASE + limpio
    return
  }
  iframe.contentWindow.postMessage({ fuente: 'bdi-crm-panel', tipo: 'chat', tel: limpio }, ORIGEN)
}

/**
 * Abrir el chat de alguien que se tocó en la lista del panel.
 *
 * 🔴 **Se acepta SÓLO lo que viene del origen del monitor.** Sin ese filtro, cualquier página
 * embebida podría hacer que la pestaña de WhatsApp navegue a donde quiera. Y el teléfono se
 * limpia a dígitos antes de armar la URL: es lo único que se toma de afuera.
 *
 * `send?phone=` abre la conversación con ese número —la que ya existe, si existe— y no manda
 * nada: es la misma URL con la que se verificó la lectura del teléfono en agosto.
 */
window.addEventListener('message', (e) => {
  if (e.origin !== ORIGEN) return
  const d = e.data
  if (!d || d.fuente !== 'bdi-crm-panel' || d.tipo !== 'abrir-chat') return
  const numero = String(d.tel || '').replace(/\D/g, '')
  if (!numero) return
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0]
    if (!tab || !tab.id) return
    // ⚠️ Esto RECARGA WhatsApp Web (~5 s por cliente) y no hay forma de evitarlo desde acá:
    // pedirle a la aplicación cargada que cambie de conversación está probado y no se puede
    // — el porqué está escrito en `pagina.js`, para que nadie lo vuelva a intentar a ciegas.
    // A cambio, la ficha del panel NO espera a esto: sale por su lado, apenas se toca el nombre.
    chrome.tabs.update(tab.id, { url: 'https://web.whatsapp.com/send?phone=' + numero })
  })
})

// Arranca en la lista: el panel se abre y ya hay algo que hacer, sin esperar a ningún chat.
mostrar('', 'sin-chat')

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.tipo === 'chat') mostrar(msg.tel, msg.motivo)
})

// Al abrirse, preguntar en qué chat está. El panel se abre con un clic en el ícono, y ese clic no
// mueve nada en la página: sin esta pregunta se quedaría en blanco hasta el próximo cambio de chat.
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs && tabs[0]
  if (!tab || !tab.id) return
  chrome.tabs.sendMessage(tab.id, { tipo: 'que-chat' }, (r) => {
    // `lastError` hay que TOCARLO aunque no se use: si no, Chrome lo escupe en la consola. Pasa
    // siempre que el panel se abre en una pestaña que no es WhatsApp, que no tiene content script.
    if (chrome.runtime.lastError) return
    if (r) mostrar(r.tel, r.motivo)
  })
})
