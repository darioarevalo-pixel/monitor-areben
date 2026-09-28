// El puente. Corre en WhatsApp Web pero en el mundo aislado de la extensión: no ve las variables
// de WhatsApp (por eso existe `pagina.js`), pero sí puede hablar con el panel.
//
// 🔑 **No lee mensajes, no los guarda y no tiene credenciales.** Lo único que cruza por acá es el
// teléfono de la conversación abierta y la lista de teléfonos de la comunidad mayorista.

const FUENTE = 'bdi-crm-panel'

let ultimo = { tel: null, motivo: 'sin-chat' }
let comunidad = null

window.addEventListener('message', (e) => {
  // Sólo lo que mandó nuestro propio script desde esta misma pestaña. Sin este filtro, cualquier
  // cosa embebida en la página podría decirle al panel que abra la ficha de otra persona.
  if (e.source !== window || !e.data || e.data.fuente !== FUENTE) return
  // La lista de la comunidad: se guarda la última para cuando el panel se abra después.
  if (e.data.tipo === 'comunidad') {
    comunidad = e.data
    chrome.runtime.sendMessage({ tipo: 'comunidad', datos: comunidad }).catch(() => {})
    return
  }
  ultimo = { tel: e.data.tel || null, motivo: e.data.motivo || '' }
  // Si el panel está cerrado no hay quien reciba esto, y Chrome lo reporta como error. No es un
  // error: es el estado normal mientras nadie lo abrió.
  chrome.runtime.sendMessage({ tipo: 'chat', ...ultimo }).catch(() => {})
})

// El panel pregunta al abrirse: puede abrirse con un chat ya abierto desde hace rato, o sea sin
// ningún cambio por delante que lo avise.
chrome.runtime.onMessage.addListener((msg, _remitente, responder) => {
  if (msg && msg.tipo === 'que-chat') responder(ultimo)
  if (msg && msg.tipo === 'que-comunidad') responder(comunidad)
})
