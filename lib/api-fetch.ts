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
 * (sessionStorage, la cachea el login). Cliente-only.
 *
 * Auto-recuperación: la sesión (localStorage) dura 30 días, pero la pass vive solo
 * en sessionStorage y se borra al cerrar el navegador. Al volver, el usuario PARECE
 * logueado (ve todo el Monitor) pero sin pass el header no sale y el endpoint tira
 * 403 "Necesitás estar logueado". Antes eso se veía como un error crudo en cada
 * sección de lectura (Meta Ads, conteos, inventario…). Ahora, si hay usuario pero
 * falta la pass, la re-pedimos una vez y seguimos. El single-flight evita abrir dos
 * prompts cuando varias requests salen a la vez (Meta Ads dispara overview + detalle
 * casi juntas). Mismo modelo que `obtenerPass()` de las secciones de escritura.
 */

import { guardarAdminPass, leerAdminPass, leerSesion } from './sesion'

let pidiendoPass: Promise<void> | null = null

/** Si hay usuario logueado pero la pass no está cacheada, la re-pide una sola vez. */
async function asegurarPass(): Promise<void> {
  if (typeof window === 'undefined') return
  if (leerAdminPass()) return
  if (!leerSesion()?.user) return // ni siquiera hay sesión: que el endpoint conteste su error
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
  await asegurarPass()
  const auth = authHeader()
  const headers = new Headers(opts.headers || {})
  if (auth) headers.set('x-monitor-auth', auth)
  return fetch(url, { ...opts, headers })
}
