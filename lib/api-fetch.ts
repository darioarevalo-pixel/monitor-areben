/**
 * `apiFetch`: el equivalente Next de `_apiFetch` (index.html:9413). Los endpoints
 * propios del Monitor (`/api/deposito`, `/api/postventa`, `/api/datos`…) validan
 * credenciales server-side vía `api/_auth.js`, que lee el header `x-monitor-auth`.
 *
 * El header es `base64(JSON …)` en UTF-8 (port de `_apiAuthHeader`, index.html:9403).
 * Va en base64 y no en headers de texto plano a propósito: los valores de header son
 * latin-1, y una contraseña con "ñ"/acento haría que `fetch` tire TypeError antes de
 * salir (lo documenta `api/_auth.js`).
 *
 * **Adentro del sobre viaja una de dos cosas**, según cómo entró la persona:
 *   - `{user, pass}` — el modelo de siempre, para los puestos compartidos (Depósito,
 *     Local, bdilocal), que no pueden tener casilla de Workspace.
 *   - `{token}` — un token del proveedor de identidad de Areben, para quien entró con
 *     Google. Es la misma cuenta con la que entra a producción y al dashboard.
 * El servidor acepta las dos y resuelve el mismo perfil del KV; el resto de la app no
 * se entera de cuál se usó.
 *
 * Auto-recuperación (red de seguridad): si hay sesión de contraseña pero la pass no está
 * cacheada, la re-pedimos una vez y seguimos, en vez de mandar la request sin header y
 * comerse un 403 crudo (pasaba en Meta Ads, conteos, inventario, observaciones). Desde
 * que la pass persiste en localStorage (ver `guardarAdminPass`) casi no dispara — solo si
 * la sesión de 30 días expiró o nunca se cacheó en este navegador. El single-flight evita
 * abrir dos prompts cuando salen varias requests a la vez (Meta Ads dispara overview y
 * detalle casi juntas). A las sesiones de Google esto NO les aplica: no tienen contraseña
 * que pedir, y preguntarles una sería exactamente el paso que el SSO viene a sacar.
 */

import type { Perfil } from './permisos'
import {
  credencialActual,
  guardarAdminPass,
  guardarSesionFirmada,
  leerAdminPass,
  leerSesion,
  leerSesionFirmada,
} from './sesion'
import { tokenRenovado } from './identidad'

let pidiendoPass: Promise<void> | null = null

/** Si hay sesión de contraseña pero no está cacheada, la re-pide una sola vez. */
async function asegurarPass(): Promise<void> {
  if (typeof window === 'undefined') return
  const s = leerSesion()
  if (!s?.user) return // ni siquiera hay sesión: que el endpoint conteste su error
  if (s.via === 'google') return // entró con Google: no hay contraseña en juego
  if (leerAdminPass()) return
  if (!pidiendoPass) {
    pidiendoPass = (async () => {
      try {
        const p = (window.prompt('Tu sesión sigue activa, pero por seguridad la contraseña no se guarda al cerrar el navegador. Reingresala:') || '').trim()
        if (p) guardarAdminPass(p)
      } finally {
        pidiendoPass = null
      }
    })()
  }
  await pidiendoPass
}

/**
 * El sobre `base64(JSON)` con la sesión, listo para viajar.
 *
 * 🔑 **Se exporta porque no siempre viaja en un header.** `upload()` de `@vercel/blob/client` hace
 * su propia llamada a `/api/blob-upload` y no admite headers nuestros: ahí el mismo sobre va como
 * `clientPayload`. Del otro lado lo abre `sobreDeCredenciales()` de `api/_auth.js`, que es también
 * el que abre el header — una sola forma de decir quién sos, viaje por donde viaje.
 */
export async function sobreDeAuth(paraElMonitor = true): Promise<string | null> {
  await asegurarPass()
  return authHeader(paraElMonitor)
}

/**
 * 🔑 La sesión FIRMADA viaja dentro del mismo sobre, al lado de la credencial (login propio,
 * 21-oct-2026): si bdi-catalogo no contesta, el Monitor la verifica solo y la pantalla sigue.
 * ⛔ reemplaza a la credencial: el mismo sobre va también a bdi-catalogo, que no la entiende —
 * por eso a una URL de afuera la firma ⛔ se manda (`conSesion` false).
 */
async function authHeader(conSesion: boolean): Promise<string | null> {
  const cred = await credencialActual()
  const sesion = conSesion ? leerSesionFirmada() : ''
  if (!cred && !sesion) return null
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(sesion ? { ...cred, sesion } : cred))
    let bin = ''
    bytes.forEach((b) => (bin += String.fromCharCode(b)))
    return btoa(bin)
  } catch {
    return null
  }
}

/** Propia = relativa (`/api/...`): las de bdi-catalogo y `crear-venta` van con URL absoluta. */
const esPropia = (url: string) => url.startsWith('/') && !url.startsWith('//')

async function fetchConAuth(url: string, opts: RequestInit): Promise<Response> {
  const propia = esPropia(url)
  const auth = await authHeader(propia)
  const headers = new Headers(opts.headers || {})
  if (auth) headers.set('x-monitor-auth', auth)
  const r = await fetch(url, { ...opts, headers })
  // El servidor renueva la firma cada vez que bdi-catalogo le confirma quién sos.
  const firma = propia ? r.headers?.get?.('x-monitor-sesion') : null
  if (firma) guardarSesionFirmada(firma)
  return r
}

/**
 * Quién soy según el MONITOR (`?recurso=sesion`), para recargar la página cuando bdi-catalogo no
 * contesta: antes esa caída cerraba la sesión en medio del turno. Null si tampoco alcanza.
 */
export async function perfilDelMonitor(): Promise<Perfil | null> {
  if (!leerSesionFirmada()) return null
  try {
    const r = await fetchConAuth('/api/datos?recurso=sesion', {})
    if (!r.ok) return null
    const d = await r.json()
    return d?.ok && d.perfil ? (d.perfil as Perfil) : null
  } catch {
    return null
  }
}

/** Sólo se reintenta lo que se puede mandar dos veces igual: sin cuerpo o con cuerpo de texto. */
const reenviable = (opts: RequestInit) => opts.body == null || typeof opts.body === 'string'

/**
 * **Un 403 a una sesión de Google se reintenta UNA vez con un token recién pedido** (16-oct-2026).
 *
 * El token de Google dura una hora y se renueva solo; si la renovación cae justo en un corte de
 * conexión, la pantalla queda sin token y el servidor contesta «Necesitás estar logueado» con la
 * sesión de 30 días viva. Pedir uno nuevo y reintentar lo resuelve sin que la persona se entere.
 * Si tampoco se puede, vuelve el 403 original y la pantalla avisa como siempre.
 * ⛔ No aplica a las sesiones de contraseña: ahí no hay nada que renovar.
 */
export async function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  await asegurarPass()
  const r = await fetchConAuth(url, opts)
  if (r.status !== 403 || !reenviable(opts) || leerSesion()?.via !== 'google') return r
  if (!(await tokenRenovado())) return r
  return fetchConAuth(url, opts)
}
