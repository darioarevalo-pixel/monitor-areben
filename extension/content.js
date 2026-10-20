// El puente. Corre en WhatsApp Web pero en el mundo aislado de la extensión: no ve las variables
// de WhatsApp (por eso existe `pagina.js`), pero sí puede hablar con el panel.
//
// 🔑 **No lee mensajes, no los guarda y no tiene credenciales.** Lo único que cruza por acá es el
// teléfono de la conversación abierta, la lista de teléfonos de la comunidad mayorista y la de los
// chats a los que les escribiste desde ayer (el teléfono y la hora de tu último mensaje, nunca el
// texto).

const FUENTE = 'bdi-crm-panel'

let ultimo = { tel: null, motivo: 'sin-chat' }
let comunidad = null
let escritos = null
/** Pedidos de "abrí este chat" que esperan la respuesta de `pagina.js`, por número de pedido. */
const esperando = new Map()
let nPedido = 0

window.addEventListener('message', (e) => {
  // Sólo lo que mandó nuestro propio script desde esta misma pestaña. Sin este filtro, cualquier
  // cosa embebida en la página podría decirle al panel que abra la ficha de otra persona.
  if (e.source !== window || !e.data || e.data.fuente !== FUENTE) return
  // La respuesta de `pagina.js` a "abrí este chat sin recargar" (ver `abrirAca` más abajo).
  if (e.data.tipo === 'abrir-chat-resultado') {
    const responder = esperando.get(e.data.pedido)
    if (responder) {
      esperando.delete(e.data.pedido)
      responder({ ok: !!e.data.ok })
    }
    return
  }
  if (e.data.tipo === 'abrir-chat-aca') return
  if (e.data.tipo === 'escritos-hoy') {
    escritos = { tels: e.data.tels || [], ultimos: e.data.ultimos || null }
    chrome.runtime.sendMessage({ tipo: 'escritos-hoy', ...escritos }).catch(() => {})
    return
  }
  // La lista de la comunidad: se guarda la última para cuando el panel se abra después.
  if (e.data.tipo === 'comunidad') {
    comunidad = e.data
    chrome.runtime.sendMessage({ tipo: 'comunidad', datos: comunidad }).catch(() => {})
    return
  }
  ultimo = { tel: e.data.tel || null, motivo: e.data.motivo || '', nombre: e.data.nombre || '' }
  // Si el panel está cerrado no hay quien reciba esto, y Chrome lo reporta como error. No es un
  // error: es el estado normal mientras nadie lo abrió.
  chrome.runtime.sendMessage({ tipo: 'chat', ...ultimo }).catch(() => {})
})

// El panel pregunta al abrirse: puede abrirse con un chat ya abierto desde hace rato, o sea sin
// ningún cambio por delante que lo avise.
chrome.runtime.onMessage.addListener((msg, _remitente, responder) => {
  if (msg && msg.tipo === 'que-chat') responder(ultimo)
  if (msg && msg.tipo === 'que-comunidad') responder(comunidad)
  if (msg && msg.tipo === 'que-escritos') responder(escritos)
  // El panel pide abrir un chat. Se le pasa a `pagina.js` —el único que ve a WhatsApp por dentro— y
  // se contesta con lo que pudo. 🔑 Si en 2 s no contestó, se da por no: el panel recarga como antes.
  if (msg && msg.tipo === 'abrir-chat-aca') {
    const pedido = ++nPedido
    esperando.set(pedido, responder)
    setTimeout(() => {
      if (esperando.delete(pedido)) responder({ ok: false })
    }, 2000)
    window.postMessage({ fuente: FUENTE, tipo: 'abrir-chat-aca', tel: msg.tel, pedido }, '*')
    return true
  }
})
