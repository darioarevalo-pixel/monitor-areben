// El puente. Corre en WhatsApp Web pero en el mundo aislado de la extensión: no ve las variables
// de WhatsApp (por eso existe `pagina.js`), pero sí puede hablar con el panel.
//
// 🔑 **No lee mensajes, no los guarda y no tiene credenciales.** Lo único que cruza por acá es el
// teléfono de la conversación abierta, y el de la que el panel pide abrir.

const FUENTE = 'bdi-crm-panel'

let ultimo = { tel: null, motivo: 'sin-chat' }
// Los pedidos de abrir un chat que están esperando respuesta de la página, por número de pedido.
const esperando = new Map()
let proximoPedido = 1

window.addEventListener('message', (e) => {
  // Sólo lo que mandó nuestro propio script desde esta misma pestaña. Sin este filtro, cualquier
  // cosa embebida en la página podría decirle al panel que abra la ficha de otra persona.
  if (e.source !== window || !e.data || e.data.fuente !== FUENTE) return

  // La respuesta a un pedido de abrir chat. ⚠️ Va ANTES del camino del chat activo: aquel mensaje
  // no lleva `tipo`, así que sin esta salida temprana una respuesta se leería como "cambió el
  // chat, y el teléfono es undefined".
  if (e.data.tipo === 'abrir-chat-listo') {
    const resolver = esperando.get(e.data.pedido)
    if (resolver) {
      esperando.delete(e.data.pedido)
      resolver(!!e.data.ok)
    }
    return
  }
  // El pedido que este mismo archivo publicó para la página: no es para nosotros.
  if (e.data.tipo) return

  ultimo = { tel: e.data.tel || null, motivo: e.data.motivo || '' }
  // Si el panel está cerrado no hay quien reciba esto, y Chrome lo reporta como error. No es un
  // error: es el estado normal mientras nadie lo abrió.
  chrome.runtime.sendMessage({ tipo: 'chat', ...ultimo }).catch(() => {})
})

/**
 * Le pide a la página que abra una conversación, y contesta si pudo.
 *
 * ⚠️ **El timeout no es paranoia**: `pagina.js` corre en el mundo de WhatsApp y puede no estar
 * cargado todavía (o haberse roto contra un cambio de WhatsApp). Sin plazo, el panel se quedaría
 * esperando una respuesta que no llega y el clic no haría nada. Con plazo, el que pidió cae a la
 * navegación de siempre: más lenta, pero funciona.
 */
function pedirAbrirChat(tel) {
  return new Promise((resolve) => {
    const pedido = proximoPedido++
    esperando.set(pedido, resolve)
    window.postMessage({ fuente: FUENTE, tipo: 'abrir-chat', tel, pedido }, '*')
    setTimeout(() => {
      if (esperando.delete(pedido)) resolve(false)
    }, 1500)
  })
}

chrome.runtime.onMessage.addListener((msg, _remitente, responder) => {
  // El panel se abre con un chat ya abierto desde hace rato, o sea sin ningún cambio por delante
  // que lo avise: pregunta.
  if (msg && msg.tipo === 'que-chat') {
    responder(ultimo)
    return
  }
  if (msg && msg.tipo === 'abrir-chat') {
    pedirAbrirChat(msg.tel).then((ok) => responder({ ok }))
    return true // la respuesta llega después: hay que dejar el canal abierto.
  }
})
