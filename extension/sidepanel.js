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

function mostrar(tel, motivo) {
  const limpio = (tel || '').replace(/\D/g, '')
  if (limpio === actual) return
  actual = limpio
  document.body.classList.toggle('sin-chat', !limpio)
  if (!limpio) {
    aviso.textContent = MOTIVOS[motivo] || MOTIVOS['sin-chat']
    return
  }
  // Sólo se toca `src` cuando el número cambió de verdad. Reasignarlo con el mismo valor recarga
  // el iframe entero, y con él se iría lo que se esté escribiendo en el campo de la nota.
  iframe.src = BASE + limpio
}

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
