// El service worker. Hace tres cosas y ninguna más.
//
// 1. Que el ícono de la barra abra el panel. Chrome sólo deja abrir el side panel desde un gesto
//    del usuario; con esto, ese gesto es el clic en el ícono.
// 2. Que el panel exista SÓLO en las pestañas de WhatsApp Web (ver abajo).
// 3. Reenviar el número del chat al panel. El mensaje del content script viaja igual aunque el
//    panel esté cerrado: si no hay quien escuche, se pierde, que es lo correcto.
//
// No guarda estado a propósito: un service worker de MV3 se apaga solo a los 30 segundos de
// inactividad, así que cualquier cosa que se guarde acá desaparece sin avisar. Cuando el panel
// necesita saber en qué chat está, se lo pregunta al content script (`que-chat`).

const WA = 'https://web.whatsapp.com/'

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
  repasarTodas()
})

// Al despertar el service worker (se apaga solo a los 30 s), las pestañas que ya estaban
// abiertas nunca dispararon un evento. Sin este repaso, el panel queda habilitado en pestañas
// viejas hasta que se las toca.
chrome.runtime.onStartup.addListener(() => repasarTodas())

async function repasarTodas() {
  try {
    const tabs = await chrome.tabs.query({})
    await Promise.all(tabs.map((t) => ajustar(t.id, t.url)))
  } catch (e) {}
}

/**
 * 🔑 El side panel de Chrome es de la VENTANA, no de la pestaña: abierto una vez, se queda
 * abierto mientras se cambia de pestaña, y la ficha de un cliente aparecería al costado del
 * home banking. Se acota habilitándolo por pestaña: prendido en WhatsApp, apagado en todo lo
 * demás. Chrome cierra el panel solo al pasar a una pestaña donde está apagado, y lo vuelve a
 * mostrar al volver.
 *
 * ⚠️ `tab.url` viene vacío en las pestañas donde la extensión no tiene permiso — que son todas
 * menos WhatsApp. Eso NO es un problema acá: sin url no es WhatsApp, y el panel se apaga, que
 * es exactamente lo que se busca. Por eso esto no pide el permiso `tabs`, que daría la
 * dirección de cada pestaña que el usuario abre.
 */
async function ajustar(tabId, url) {
  const esWA = typeof url === 'string' && url.startsWith(WA)
  try {
    await chrome.sidePanel.setOptions(
      esWA ? { tabId, path: 'sidepanel.html', enabled: true } : { tabId, enabled: false },
    )
  } catch (e) {
    // La pestaña se cerró entre el evento y esta llamada. Pasa y no es un error.
  }
}

// Al cambiar de pestaña y al navegar dentro de una (WhatsApp Web es una sola página que cambia
// la dirección sin recargar, así que `onUpdated` también avisa por `info.url`).
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId)
    await ajustar(tabId, tab.url)
  } catch (e) {}
})

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') ajustar(tabId, tab.url)
})
