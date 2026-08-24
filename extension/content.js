// El puente. Corre en WhatsApp Web pero en el mundo aislado de la extensión: no ve las variables
// de WhatsApp (por eso existe `pagina.js`), pero sí puede hablar con el panel.
//
// 🔑 **No lee mensajes, no los guarda y no tiene credenciales.** Lo único que cruza por acá es el
// teléfono de la conversación abierta.

const FUENTE = 'bdi-crm-panel'

let ultimo = { tel: null, motivo: 'sin-chat' }

window.addEventListener('message', (e) => {
  // Sólo lo que mandó nuestro propio script desde esta misma pestaña. Sin este filtro, cualquier
  // cosa embebida en la página podría decirle al panel que abra la ficha de otra persona.
  if (e.source !== window || !e.data || e.data.fuente !== FUENTE) return
  ultimo = { tel: e.data.tel || null, motivo: e.data.motivo || '' }
  console.log('[BDI] content: recibí de la página', ultimo.tel || '(sin número)', '· se lo mando al panel')
  // Si el panel está cerrado no hay quien reciba esto, y Chrome lo reporta como error. No es un
  // error: es el estado normal mientras nadie lo abrió.
  chrome.runtime.sendMessage({ tipo: 'chat', ...ultimo }).catch(() => {})
})

// El panel pregunta al abrirse: puede abrirse con un chat ya abierto desde hace rato, o sea sin
// ningún cambio por delante que lo avise.
chrome.runtime.onMessage.addListener((msg, _remitente, responder) => {
  if (msg && msg.tipo === 'que-chat') {
    console.log('[BDI] content: me preguntaron y contesto', ultimo.tel || '(sin número: ' + ultimo.motivo + ')')
    responder(ultimo)
  }
})
