/**
 * 🔔 Los avisos al celular, del lado del teléfono (Darío, 20-oct-2026).
 *
 * En el iPhone, Apple sólo deja pedir avisos al Monitor **agregado a la pantalla de inicio y abierto
 * desde ese ícono**: en una pestaña de Safari `PushManager` ni existe. Por eso el estado distingue
 * «hay que agregarlo a inicio» de «este navegador no puede».
 */
import { anotarTelefono } from './cliente'

/** La clave PÚBLICA de avisos. La privada vive sólo en Vercel. Es la misma de `api/_push.js`. */
const VAPID_PUBLICA = 'BI2EMj1OOTZDDBH2nx5xSCzoUmOjdf1ML94GcBL1BwGh-Pdvk0UTMvCjJ3HdqE9peGjc7dblsZrB1GPkQAh6sOg'

export type EstadoAvisos = 'agregar-a-inicio' | 'no-se-puede' | 'apagados' | 'bloqueados' | 'activados'

function esIphone(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

function abiertoComoApp(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (typeof window === 'undefined') return 'no-se-puede'
  const puede = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!puede) return esIphone() && !abiertoComoApp() ? 'agregar-a-inicio' : 'no-se-puede'
  if (Notification.permission === 'denied') return 'bloqueados'
  if (Notification.permission !== 'granted') return 'apagados'
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = reg && (await reg.pushManager.getSubscription())
  return sub ? 'activados' : 'apagados'
}

function claveEnBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * Pide el permiso (⚠️ tiene que ser dentro del toque del botón: iOS lo exige), saca la dirección de
 * avisos de este teléfono y la anota en el servidor. Si ya estaba, la vuelve a anotar: es idempotente.
 */
export async function activarAvisos(): Promise<EstadoAvisos> {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return permiso === 'denied' ? 'bloqueados' : 'apagados'
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveEnBytes(VAPID_PUBLICA) }))
  await anotarTelefono(sub.toJSON())
  return 'activados'
}
