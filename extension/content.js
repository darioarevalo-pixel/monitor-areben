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
  if (e.data.tipo === 'abrir-chat-ack') {
    const p = esperando.get(e.data.pedido)
    if (p) p.acusado = true
    return
  }
  if (e.data.tipo === 'abrir-chat-listo') {
    const p = esperando.get(e.data.pedido)
    if (p) {
      esperando.delete(e.data.pedido)
      p.resolver(!!e.data.ok)
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
 * 🔑 **Dos plazos, y esa es toda la gracia.**
 *
 * - **`PLAZO_ACK` (300 ms)**: cuánto se espera a saber si hay alguien atendiendo. `pagina.js` corre
 *   en el mundo de WhatsApp y puede no estar cargado (una pestaña abierta desde antes de actualizar
 *   la extensión) o haberse roto contra un cambio de WhatsApp. El acuse llega apenas recibe el
 *   pedido, así que 300 ms alcanzan de sobra.
 * - **`PLAZO_ABRIR` (8 s)**: una vez que se sabe que alguien atiende, se lo espera de verdad.
 *   Buscar una conversación que no está en memoria tarda lo suyo.
 *
 * ⚠️ **Un solo plazo corto es peor que ninguno.** Con 1,5 s para todo, una búsqueda lenta se daba
 * por fallada, se navegaba —recargando WhatsApp entero— y encima el chat terminaba abriéndose por
 * el otro camino: las dos cosas, una arriba de la otra. Eso eran 4 segundos.
 */
const PLAZO_ACK = 300
const PLAZO_ABRIR = 8000

function pedirAbrirChat(tel) {
  return new Promise((resolve) => {
    const pedido = proximoPedido++
    const entrada = { resolver: resolve, acusado: false }
    esperando.set(pedido, entrada)
    window.postMessage({ fuente: FUENTE, tipo: 'abrir-chat', tel, pedido }, '*')

    setTimeout(() => {
      // Nadie atendió: no hay nadie del otro lado, así que el que pidió tiene que navegar.
      if (!entrada.acusado && esperando.delete(pedido)) {
        console.log('[BDI] nadie atendió el pedido de abrir el chat: se navega (recarga WhatsApp)')
        resolve(false)
      }
    }, PLAZO_ACK)

    setTimeout(() => {
      // Atendió pero nunca contestó. Raro, y aun así hay que soltar al que espera.
      if (esperando.delete(pedido)) resolve(false)
    }, PLAZO_ABRIR)
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
