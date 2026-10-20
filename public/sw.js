// Avisos del Monitor en el celular (Darío, 20-oct-2026). Sólo hace dos cosas: mostrar el aviso que
// manda el servidor (`api/_push.js`) y, al tocarlo, abrir el Monitor donde dice el aviso.
// ⛔ No guarda nada en caché: el Monitor sigue funcionando igual que en el navegador.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { cuerpo: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Monitor', {
    body: d.cuerpo || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of abiertas) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) await c.navigate(url).catch(() => {}); return }
    }
    await self.clients.openWindow(url)
  })())
})
