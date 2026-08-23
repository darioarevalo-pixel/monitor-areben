// El service worker. Hace dos cosas y ninguna más.
//
// 1. Que el panel exista SÓLO en las pestañas de WhatsApp Web (ver abajo).
// 2. Reenviar el número del chat al panel. El mensaje del content script viaja igual aunque el
//    panel esté cerrado: si no hay quien escuche, se pierde, que es lo correcto.
//
// No guarda estado a propósito: un service worker de MV3 se apaga solo a los 30 segundos de
// inactividad, así que cualquier cosa que se guarde acá desaparece sin avisar. Cuando el panel
// necesita saber en qué chat está, se lo pregunta al content script (`que-chat`).

const WA = 'https://web.whatsapp.com/'
const PANEL = 'sidepanel.html'

const esWA = (url) => typeof url === 'string' && url.startsWith(WA)

/**
 * 🔴 **El side panel de Chrome es de la VENTANA, no de la pestaña**, y tiene DOS niveles: uno
 * global y uno por pestaña. El manifest declaraba `side_panel.default_path`, que es el global:
 * con eso puesto, el panel se muestra en todas las pestañas y **apagarlo por pestaña no
 * alcanza**. Fue el intento fallido de la v0.2.1 — la ficha seguía apareciendo al costado de
 * cualquier sitio, con el código de apagado corriendo bien.
 *
 * Lo que funciona es al revés: el manifest ya NO declara panel, el global se apaga acá de
 * entrada, y cada pestaña de WhatsApp enciende el suyo con su propio `path`. Así no hay nada
 * que mostrar en las demás, en vez de haber algo que hay que apagar a tiempo.
 *
 * 🔑 **Lo que `setOptions` deja escrito SOBREVIVE al service worker.** No es estado de este
 * archivo: es del navegador. Por eso el panel abre bien aunque el worker esté dormido en el
 * momento del clic — la pestaña ya quedó habilitada antes.
 */

// Va en el nivel de arriba, no adentro de `onInstalled`: se aplica cada vez que el worker
// despierta. La v0.2.2 lo puso en `false` para manejar el clic a mano y el panel dejó de abrir
// — `sidePanel.open()` sólo vale como respuesta INMEDIATA a un gesto del usuario, y consultar
// la pestaña antes ya rompe esa ventana. El comportamiento nativo no tiene ese problema.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})

async function ajustar(tabId, url) {
  if (tabId == null) return
  try {
    await chrome.sidePanel.setOptions(esWA(url) ? { tabId, path: PANEL, enabled: true } : { tabId, enabled: false })
  } catch (e) {
    // La pestaña se cerró entre el evento y esta llamada. Pasa y no es un error.
  }
}

/**
 * ⚠️ `tab.url` viene vacío en las pestañas donde la extensión no tiene permiso — que son todas
 * menos WhatsApp. Eso NO es un problema: sin url no es WhatsApp y el panel se apaga, que es
 * exactamente lo que se busca. Por eso esto no pide el permiso `tabs`, que daría la dirección de
 * cada pestaña que se abre.
 */
async function repasarTodas() {
  try {
    await chrome.sidePanel.setOptions({ enabled: false }) // el global, apagado
  } catch (e) {}
  try {
    const tabs = await chrome.tabs.query({})
    await Promise.all(tabs.map((t) => ajustar(t.id, t.url)))
  } catch (e) {}
}

// Al instalar y al despertar: las pestañas que ya estaban abiertas nunca dispararon un evento.
chrome.runtime.onInstalled.addListener(() => repasarTodas())
chrome.runtime.onStartup.addListener(() => repasarTodas())
repasarTodas()

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId)
    await ajustar(tabId, tab.url)
  } catch (e) {}
})

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') ajustar(tabId, tab.url)
})

/**
 * ⚠️ **Cambiar de VENTANA no dispara `tabs.onActivated`.** Con dos ventanas de Chrome abiertas,
 * la pestaña activa de la otra nunca pasaba por el ajuste y el panel se quedaba como estaba.
 */
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    if (tab) await ajustar(tab.id, tab.url)
  } catch (e) {}
})
