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
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⛔ ABRIR UN CHAT DESDE ACÁ: PROBADO Y NO SE PUEDE (23-ago-2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Tocar un nombre en la lista del día navega a `send?phone=`, y eso recarga WhatsApp Web entero:
// ~5 segundos por cliente. La idea obvia es pedirle a la aplicación que ya está cargada que
// cambie de conversación. **Se intentó y no funciona.** Queda escrito para que nadie lo repita:
//
//   - El identificador se arma bien: `WidFactory.createUserWidOrThrow(<sólo dígitos>)`.
//   - La conversación se encuentra al instante (medido: 0 ms) con `ChatCollection.get(wid)`.
//     ⚠️ `getLatestChatForWid` devuelve un REGISTRO de la base, no el modelo: es truthy y no
//     sirve. Hay que validar que tenga `id` antes de aceptarlo.
//   - **Mostrarla es lo que no se puede.** `Cmd.openChatBottom`, `Cmd.openChatAt` y
//     `Cmd.openChatFromUnread` fallan las tres con *Cannot read properties of undefined* sobre
//     un chat traído de la colección — le falta algo que sólo tiene el que ya está abierto.
//     `getActive()` sí funciona con esas funciones, o sea que el problema no es la puerta.
//
// Si algún día se retoma, el punto exacto donde encalla es ése: qué le falta al modelo para que
// `Cmd` lo pueda mostrar. Todo lo anterior está resuelto.

(() => {
  const FUENTE = 'bdi-crm-panel'
  // Un vistazo cada 400 ms. Es una lectura de memoria —no toca la red ni la pantalla— y al no
  // depender del HTML no hace falta escuchar cambios del documento, que era lo caro y lo frágil.
  //
  // Estuvo en 1000 y se nota: es el retraso entre abrir un chat a mano y ver su ficha. Cuando el
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
    // El nombre con que está agendado (o el que la persona se puso, si no está agendado). Sirve
    // SÓLO para sugerir en el panel de quién puede ser un número que no está en el CRM.
    const nombre = String((c && (c.name || c.pushname)) || '')
    const delModelo = c && c.phoneNumber && (c.phoneNumber._serialized || c.phoneNumber.user || c.phoneNumber)
    const digitos = (x) => String(x || '').replace(/\D/g, '')
    if (digitos(delModelo).length >= 8) return { tel: digitos(delModelo), motivo: '', nombre }

    // 2. Las conversaciones viejas todavía se identifican con el teléfono en vez del LID.
    if (jid.endsWith('@c.us') && digitos(jid).length >= 8) return { tel: digitos(jid), motivo: '', nombre }

    // 3. Un número que no está agendado no tiene contacto, y ahí WhatsApp muestra el teléfono como
    //    título de la conversación. Es justo el caso que abre "guardar como lead".
    const titulo = (chat.formattedTitle || chat.name || '').trim()
    if (/^\+?[\d\s().-]{9,}$/.test(titulo) && digitos(titulo).length >= 8) return { tel: digitos(titulo), motivo: '', nombre }

    return { tel: null, motivo: 'sin-telefono' }
  }

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // LA COMUNIDAD MAYORISTA: quién está adentro
  // ═════════════════════════════════════════════════════════════════════════════════════════
  //
  // Medido el 25-ago-2026 sobre la cuenta de BDI: la comunidad tiene 458 participantes, **los 458
  // vienen con LID** (ninguno con el teléfono a la vista) y **los 458 se traducen a teléfono** con
  // el contacto agendado. Se sostiene porque Darío agenda a cada cliente; con otra cuenta sería
  // otro número.
  //
  // ⚠️ Los participantes están vacíos hasta que la comunidad se abre una vez en la sesión. Eso se
  // avisa como `sin-cargar` y el panel le dice a la persona qué hacer, en vez de decir "no está".
  //
  // 🔑 Sale sólo la lista de teléfonos. Nada de nombres, mensajes ni nada más del grupo.
  const NOMBRE_COMUNIDAD = 'bdi accesorios mayorista'
  const CADA_COMUNIDAD = 60000

  const serial = (id) => String((id && (id._serialized || id)) || '')
  const soloDigitos = (x) => String(x || '').replace(/\D/g, '')

  function participantesDe(g) {
    const p = g.groupMetadata && g.groupMetadata.participants
    if (!p) return []
    if (typeof p.getModelsArray === 'function') return p.getModelsArray()
    return Array.isArray(p) ? p : []
  }

  // Pedirle a WhatsApp que traiga los participantes, una vez por grupo. Es lo que hace la propia
  // aplicación al abrir la info del grupo. Si el módulo no existe o falla, queda el aviso de
  // `sin-cargar` y alcanza con abrir la comunidad a mano.
  const pedidos = new Set()
  function pedirParticipantes(g) {
    const id = serial(g.id)
    if (pedidos.has(id)) return
    pedidos.add(id)
    try {
      const col = window.require('WAWebGroupMetadataCollection')
      const coleccion = col && (col.GroupMetadataCollection || col.default)
      if (coleccion && typeof coleccion.find === 'function') coleccion.find(g.id).catch(() => {})
    } catch {}
  }

  function leerComunidad() {
    let chats, contactos
    try {
      chats = window.require('WAWebChatCollection').ChatCollection.getModelsArray()
      contactos = window.require('WAWebContactCollection').ContactCollection
    } catch {
      return null
    }
    const grupos = chats.filter((c) => {
      const titulo = String(c.formattedTitle || c.name || '').toLowerCase()
      return serial(c.id).endsWith('@g.us') && titulo.includes(NOMBRE_COMUNIDAD)
    })
    if (!grupos.length) return { estado: 'no-encontrada' }

    // La comunidad aparece como más de un grupo (el principal y el de avisos). Vale el que más
    // gente tiene cargada.
    let mejor = null
    for (const g of grupos) {
      const ps = participantesDe(g)
      if (!mejor || ps.length > mejor.ps.length) mejor = { g, ps }
    }
    if (!mejor.ps.length) {
      grupos.forEach(pedirParticipantes)
      return { estado: 'sin-cargar' }
    }

    const tels = []
    let sinTraducir = 0
    for (const p of mejor.ps) {
      const id = serial(p.id)
      if (id.endsWith('@c.us')) {
        tels.push(soloDigitos(id))
        continue
      }
      let c = null
      try {
        c = contactos.get(p.id) || contactos.get(id)
      } catch {}
      const pn = c && c.phoneNumber && serial(c.phoneNumber)
      const t = soloDigitos(pn)
      // ⚠️ Distinto del LID, o no es una traducción: la primera medición contó "tiene 8 dígitos
      // o más" y el LID tiene 15, así que daba 100% aunque no tradujera nada.
      if (t.length >= 8 && t !== soloDigitos(id)) tels.push(t)
      else sinTraducir++
    }
    return {
      estado: 'ok',
      grupo: String(mejor.g.formattedTitle || mejor.g.name || ''),
      participantes: mejor.ps.length,
      tels,
      sinTraducir,
    }
  }

  let firmaComunidad = ''
  function avisarComunidad() {
    const r = leerComunidad()
    if (!r) return
    const firma = r.estado + ':' + (r.tels ? r.tels.slice().sort().join(',') : '')
    if (firma === firmaComunidad) return
    firmaComunidad = firma
    if (r.estado === 'ok') {
      console.log('[BDI] comunidad: ' + r.tels.length + ' teléfonos de ' + r.participantes + ' (sin traducir: ' + r.sinTraducir + ')')
    } else {
      console.log('[BDI] comunidad: ' + r.estado)
    }
    window.postMessage({ fuente: FUENTE, tipo: 'comunidad', ...r }, '*')
  }
  // La primera a los 5 s: antes WhatsApp todavía está armando la lista de chats.
  setTimeout(avisarComunidad, 5000)
  setInterval(avisarComunidad, CADA_COMUNIDAD)

  let ultimo = 'arranque'
  setInterval(() => {
    const r = telefonoDelChatAbierto()
    const firma = r.tel || 'x:' + r.motivo
    if (firma === ultimo) return
    ultimo = firma
    // Viaja por la ventana porque este mundo no tiene acceso a las APIs de la extensión. Lo levanta
    // `content.js`, que sí las tiene.
    window.postMessage({ fuente: FUENTE, tipo: 'chat', tel: r.tel, motivo: r.motivo, nombre: r.nombre || '' }, '*')
  }, CADA)
})()
