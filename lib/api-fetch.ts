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

import { credencialActual, guardarAdminPass, leerAdminPass, leerSesion } from './sesion'

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

async function authHeader(): Promise<string | null> {
  const cred = await credencialActual()
  if (!cred) return null
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(cred))
    let bin = ''
    bytes.forEach((b) => (bin += String.fromCharCode(b)))
    return btoa(bin)
  } catch {
    return null
  }
}

export async function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  await asegurarPass()
  const auth = await authHeader()
  const headers = new Headers(opts.headers || {})
  if (auth) headers.set('x-monitor-auth', auth)
  return fetch(url, { ...opts, headers })
}
