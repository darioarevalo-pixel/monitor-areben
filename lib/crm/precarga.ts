/**
 * Las lecturas del panel de WhatsApp, adelantadas al primer instante (Darío, 25-oct-2026: «va muy
 * lento»).
 *
 * Medido ese día, la solapa «Hoy» tardaba 2,8 s (6,5 s la primera vez) en tres tandas EN FILA:
 * quién sos (`/api/usuarios`, 0,6 s) → el cuaderno (`crmseg`/`crmtel`/`crmleads`, 0,7 s) → la lista,
 * los pedidos del catálogo, los contactados y Logística (0,8 s). Las dos últimas tandas esperaban a la
 * anterior sin necesitarla: el cuaderno no depende del perfil, y los pedidos no dependen del cuaderno.
 * Esto las larga a todas juntas apenas se abre `/panel`, y cada pantalla toma lo que ya está en camino.
 *
 * 🔴 **Una lectura adelantada que falló NO se usa: se vuelve a pedir.** Sale antes de confirmar la
 * sesión, así que puede fallar sin que nada esté mal, y el cuaderno leído como `{}` es exactamente el
 * error de «no hay nadie para contactar» con 300 vencidos adentro (ver la ficha del CRM).
 *
 * ⚠️ Cada lectura se toma UNA vez y vence a los 20 s: las siguientes (el pase de día, el refresco de
 * cada 2 minutos) van siempre al servidor, como antes.
 */
import { leerMapa } from '@/lib/kv/cliente'
import { leerSesion } from '@/lib/sesion'
import { pendientesLogistica } from './logistica'
import { leerContactados, traerPedidosCatalogo } from './pedidos-catalogo'

const VIGENCIA_MS = 20_000

const enCamino = new Map<string, { p: Promise<unknown>; t: number }>()

/** Larga la lectura ya y la deja a mano para el primero que la pida. */
export function adelantar(clave: string, fn: () => Promise<unknown>, ahora = Date.now()): void {
  const p = fn()
  p.catch(() => {})
  enCamino.set(clave, { p, t: ahora })
}

/**
 * La lectura adelantada si hay una fresca y salió bien (`sirve`); si no, la pide de nuevo con `fn`.
 * Se consume: la segunda vez siempre va al servidor.
 */
export async function tomar<T>(clave: string, fn: () => Promise<T>, sirve: (x: T) => boolean, ahora = Date.now()): Promise<T> {
  const e = enCamino.get(clave)
  enCamino.delete(clave)
  if (e && ahora - e.t < VIGENCIA_MS) {
    try {
      const x = (await e.p) as T
      if (sirve(x)) return x
    } catch {}
  }
  return fn()
}

/** Sólo para los tests: el mapa es de módulo y se arrastra entre casos. */
export function _olvidarPrecarga() {
  enCamino.clear()
}

let largada = false

/** Lo que pide «Hoy» al abrir. Sin sesión guardada no larga nada: va a aparecer el login. */
export function precargarPanel(): void {
  if (largada || typeof window === 'undefined') return
  if (!leerSesion()?.user) return
  largada = true
  adelantar('crmseg', () => leerMapa('crmseg', 'bdi'))
  adelantar('crmtel', () => leerMapa('crmtel', 'bdi'))
  adelantar('crmleads', () => leerMapa('crmleads', 'bdi'))
  adelantar('catalogo', () => traerPedidosCatalogo())
  adelantar('contactados', () => leerContactados())
  adelantar('logistica', () => pendientesLogistica())
}
