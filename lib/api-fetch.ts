/**
 * `apiFetch`: el equivalente Next de `_apiFetch` (index.html:9413). Los endpoints
 * propios del Monitor (`/api/inventario-vivo`, `/api/conteos-deposito`,
 * `/api/observaciones`) validan credenciales server-side vía `api/_auth.js`, que
 * lee el header `x-monitor-auth`.
 *
 * El header es `base64(JSON {user, pass})` en UTF-8 (port de `_apiAuthHeader`,
 * index.html:9403). Va en base64 y no en dos headers de texto plano a propósito:
 * los valores de header son latin-1, y una contraseña con "ñ"/acento haría que
 * `fetch` tire TypeError antes de salir (lo documenta `api/_auth.js`).
 *
 * El user sale de la sesión (localStorage) y la pass del cache de admin
 * (sessionStorage, la cachea el login). Si falta alguno, no se manda el header y el
 * endpoint responde el error de auth correspondiente. Cliente-only.
 */

import { leerAdminPass, leerSesion } from './sesion'

function authHeader(): string | null {
  const user = leerSesion()?.user
  const pass = leerAdminPass()
  if (!user || !pass) return null
  try {
    const bytes = new TextEncoder().encode(JSON.stringify({ user, pass }))
    let bin = ''
    bytes.forEach((b) => (bin += String.fromCharCode(b)))
    return btoa(bin)
  } catch {
    return null
  }
}

export async function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const auth = authHeader()
  const headers = new Headers(opts.headers || {})
  if (auth) headers.set('x-monitor-auth', auth)
  return fetch(url, { ...opts, headers })
}
