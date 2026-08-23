// El service worker. Hace dos cosas y ninguna más.
//
// 1. Que el ícono de la barra abra el panel. Chrome sólo deja abrir el side panel desde un gesto
//    del usuario; con esto, ese gesto es el clic en el ícono.
// 2. Reenviar el número del chat al panel. El mensaje del content script viaja igual aunque el
//    panel esté cerrado: si no hay quien escuche, se pierde, que es lo correcto.
//
// No guarda estado a propósito: un service worker de MV3 se apaga solo a los 30 segundos de
// inactividad, así que cualquier cosa que se guarde acá desaparece sin avisar. Cuando el panel
// necesita saber en qué chat está, se lo pregunta al content script (`que-chat`).

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})
