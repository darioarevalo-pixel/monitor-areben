// Este archivo corre DENTRO del mundo de WhatsApp (el manifest lo inyecta con `world: "MAIN"`),
// que es lo único que lo distingue de `content.js`. Es el que sabe con quién estás hablando.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// POR QUÉ NO ALCANZA CON MIRAR EL HTML (lo que hacía la primera versión, y no andaba)
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Hasta hace poco cada mensaje de WhatsApp Web venía marcado con el teléfono de la conversación:
// `data-id="false_5493834270554@c.us_3EB0…"`. De ahí lo sacaba la primera versión.
//
// **Eso ya no existe.** Medido el 23-ago-2026 sobre la cuenta de BDI (WhatsApp Business, build de
// 2026 con el ocultamiento de teléfonos ya migrado — `PhoneNumberHidingThreadPromotionMigration
// State: "migrated"`):
//
//   - `data-id` de un mensaje ahora es sólo el id del mensaje: `3EB0E65E341B647932F5`.
//   - **No queda un solo teléfono en ningún atributo de la página.** Se revisaron todos.
//   - Las conversaciones ya no se identifican con el teléfono sino con un **LID**, un número
//     interno de 15 dígitos (`…@lid`) que no es el teléfono de nadie.
//
// O sea que ninguna cantidad de retoques al selector iba a funcionar: el dato no está en el HTML.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// DE DÓNDE SALE ENTONCES
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// De la memoria de la propia aplicación: `require('WAWebChatCollection').ChatCollection.getActive()`
// devuelve la conversación abierta, y de ahí cuelga el contacto con su teléfono. Verificado punta
// a punta el 23-ago-2026 contra el chat propio: el número que devuelve es exactamente el de la
// cuenta.
//
// ⚠️ **Esto es una puerta interna de WhatsApp, no una API pública**: puede cambiar sin aviso. Es
// el precio de que el dato ya no esté en la página. Cuando cambie, lo que hay que buscar es un
// reemplazo de `getActive()`, y todo lo demás sigue igual.
//
// 🔑 **A cambio, esto es MÁS robusto que antes para lo de todos los días**: ya no depende del HTML,
// así que los rediseños de WhatsApp —que son frecuentes— dejan de romperlo.

(() => {
  const FUENTE = 'bdi-crm-panel'
  // Un vistazo cada 400 ms. Es una lectura de memoria —no toca la red ni la pantalla— y al no
  // depender del HTML no hace falta escuchar cambios del documento, que era lo caro y lo frágil.
  //
  // Estaba en 1000 y se nota: es el retraso entre abrir un chat a mano y ver su ficha. Cuando el
  // chat se abre desde la lista del día no importa —la ficha ya se pidió por id, sin esperar esto—,
  // pero abriendo conversaciones a mano es todo lo que hay.
  const CADA = 400

  /** El teléfono del chat abierto, o null. Nunca tira: si algo cambió, devuelve null. */
  function telefonoDelChatAbierto() {
    let chat
    try {
      chat = window.require('WAWebChatCollection').ChatCollection.getActive()
    } catch {
      // Todavía no cargó la aplicación, o WhatsApp movió el módulo de lugar.
      return { tel: null, motivo: 'sin-api' }
    }
    if (!chat) return { tel: null, motivo: 'sin-chat' }

    const jid = String((chat.id && (chat.id._serialized || chat.id)) || '')
    // Los grupos no tienen ficha: adentro hay muchas personas y ninguna es "el cliente".
    if (jid.endsWith('@g.us')) return { tel: null, motivo: 'grupo' }

    // 1. El teléfono que cuelga del contacto de la conversación. Es el camino normal.
    const c = chat.contact
    const delModelo = c && c.phoneNumber && (c.phoneNumber._serialized || c.phoneNumber.user || c.phoneNumber)
    const digitos = (x) => String(x || '').replace(/\D/g, '')
    if (digitos(delModelo).length >= 8) return { tel: digitos(delModelo), motivo: '' }

    // 2. Las conversaciones viejas todavía se identifican con el teléfono en vez del LID.
    if (jid.endsWith('@c.us') && digitos(jid).length >= 8) return { tel: digitos(jid), motivo: '' }

    // 3. Un número que no está agendado no tiene contacto, y ahí WhatsApp muestra el teléfono como
    //    título de la conversación. Es justo el caso que abre "guardar como lead".
    const titulo = (chat.formattedTitle || chat.name || '').trim()
    if (/^\+?[\d\s().-]{9,}$/.test(titulo) && digitos(titulo).length >= 8) return { tel: digitos(titulo), motivo: '' }

    return { tel: null, motivo: 'sin-telefono' }
  }

  /**
   * Abrir la conversación de un número SIN recargar WhatsApp.
   *
   * 🔑 **Por qué no alcanza con `send?phone=`.** Esa dirección abre bien el chat, pero es una
   * navegación: WhatsApp Web se recarga entero, y eso son varios segundos por cada cliente de la
   * lista del día. Pedirle a la aplicación que ya está cargada que cambie de conversación es
   * instantáneo.
   *
   * Verificado en la cuenta de BDI el 23-ago-2026: se toma el chat abierto, se saca su número, se
   * busca desde cero por ese número y se lo vuelve a abrir — `encontrado true`, sin recarga.
   *
   * ⚠️ Son puertas internas, igual que `getActive()`. Si alguna cambia, esto devuelve `false` y la
   * extensión cae a la navegación de siempre: más lenta, pero nunca deja de funcionar. Por eso
   * cada paso está envuelto y no se da nada por sentado.
   */
  async function abrirChatDe(numero) {
    const digitos = String(numero || '').replace(/\D/g, '')
    if (digitos.length < 8) return false
    try {
      const wid = window.require('WAWebWidFactory').createUserWidOrThrow(digitos)
      const Chats = window.require('WAWebChatCollection').ChatCollection
      // `get` resuelve el caso normal —la conversación ya existe en memoria— sin esperar nada.
      let chat = typeof Chats.get === 'function' ? Chats.get(wid) : null
      if (!chat && typeof Chats.getLatestChatForWid === 'function') chat = await Chats.getLatestChatForWid(wid)
      if (!chat && typeof Chats.find === 'function') chat = await Chats.find(wid)
      if (!chat) return false
      window.require('WAWebCmd').Cmd.openChatAt(chat)
      return true
    } catch {
      return false
    }
  }

  // El pedido llega de `content.js`, que lo recibió del panel. Se contesta siempre —con `ok` en
  // true o false— para que del otro lado se sepa si hay que caer a la navegación.
  window.addEventListener('message', async (e) => {
    if (e.source !== window) return
    const d = e.data
    if (!d || d.fuente !== FUENTE || d.tipo !== 'abrir-chat') return
    const ok = await abrirChatDe(d.tel)
    window.postMessage({ fuente: FUENTE, tipo: 'abrir-chat-listo', ok, pedido: d.pedido }, '*')
  })

  let ultimo = 'arranque'
  setInterval(() => {
    const r = telefonoDelChatAbierto()
    const firma = r.tel || 'x:' + r.motivo
    if (firma === ultimo) return
    ultimo = firma
    // Viaja por la ventana porque este mundo no tiene acceso a las APIs de la extensión. Lo levanta
    // `content.js`, que sí las tiene.
    window.postMessage({ fuente: FUENTE, tel: r.tel, motivo: r.motivo }, '*')
  }, CADA)
})()
