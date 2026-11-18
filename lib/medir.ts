/**
 * **Medir el panel donde se usa** (Darío 18-nov-2026: Pedidos tarda ~15 s y Logística en la ficha ~7 s ADENTRO de WhatsApp;
 * afuera, 1–3 s). La sesión del panel de la extensión es aparte y no se puede abrir desde otra pestaña, así que el panel
 * anota cada pedido al servidor (`anotarPedido`, desde `apiFetch`) y, al terminar de dibujar una pantalla, manda lo que
 * pasó en ese rato (`enviarMedicion`). Quedan en `api/_crm.js` → `medicionesPanel`.
 *
 * Sólo tiempos y qué se pidió (recurso + acción/vista): nada de clientes.
 */
type Pedido = { k: string; ini: number; fin: number; st: number }

const TOPE = 300
const pedidos: Pedido[] = []

const ahora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Qué se pidió, sin datos: «crm/panel», «erp/cuenta-panel», «logistica/pendientes», «bdi-catalogo/pedido». */
function claveDe(url: string, body: unknown): string {
  try {
    const u = new URL(url, 'https://x.invalid')
    const recurso = u.searchParams.get('recurso')
    let accion = u.searchParams.get('vista') || u.searchParams.get('action') || ''
    if (!accion && typeof body === 'string' && body.length < 50_000) {
      try {
        accion = String(JSON.parse(body)?.action || '')
      } catch {}
    }
    const base = recurso || (u.host === 'x.invalid' ? u.pathname : `${u.host.split('.')[0]}${u.pathname}`)
    return accion ? `${base}/${accion}` : base
  } catch {
    return '?'
  }
}

/** Lo llama `apiFetch` alrededor de cada pedido. */
export async function anotarPedido(url: string, body: unknown, hacer: () => Promise<Response>): Promise<Response> {
  const p: Pedido = { k: claveDe(url, body), ini: ahora(), fin: 0, st: 0 }
  pedidos.push(p)
  if (pedidos.length > TOPE) pedidos.splice(0, pedidos.length - TOPE)
  try {
    const r = await hacer()
    p.st = r.status
    return r
  } catch (e) {
    p.st = -1
    throw e
  } finally {
    p.fin = ahora()
  }
}

/** El momento desde el que se mide una pantalla (al montarla). */
export const marca = ahora

const enviadas = new Set<string>()

/**
 * Manda lo que tardó una pantalla: desde `desde` hasta ahora, con los pedidos de ese rato. `una` evita mandar la misma
 * dos veces (la misma ficha redibujada). Nunca falla hacia afuera.
 */
export function enviarMedicion(que: string, desde: number, extra: Record<string, unknown> = {}, una = que): void {
  if (typeof window === 'undefined' || enviadas.has(una)) return
  enviadas.add(una)
  const hasta = ahora()
  const enRato = pedidos
    .filter((p) => p.fin === 0 || p.fin >= desde - 50)
    .filter((p) => p.ini <= hasta)
    .map((p) => ({ k: p.k, ini: Math.round(p.ini - desde), fin: p.fin ? Math.round(p.fin - desde) : null, st: p.st }))
  let enIframe = false
  try {
    enIframe = window.self !== window.top
  } catch {
    enIframe = true
  }
  const medicion = {
    que,
    ms: Math.round(hasta - desde),
    desdeAbrir: Math.round(desde),
    enIframe,
    ancho: window.innerWidth,
    visible: document.visibilityState,
    ...extra,
    pedidos: enRato.slice(-80),
  }
  // Tarde y sin apuro: que medir no compita con lo que se mide.
  setTimeout(() => {
    import('./api-fetch')
      .then(({ apiFetch }) =>
        apiFetch('/api/datos?recurso=crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'medicion', medicion }) }),
      )
      .catch(() => {})
  }, 1500)
}
