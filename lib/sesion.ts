import type { Marca } from './nav.generated'
import type { Perfil } from './permisos'

/**
 * Contrato de sesión COMPARTIDO con el legacy. No cambiar ninguna de estas
 * constantes sin cambiar index.html en el mismo commit.
 *
 * El iframe legacy corre intentarAutoLogin() en su window.onload, que lee esta
 * misma clave de localStorage (mismo origen). Si el shell escribe la sesión con
 * esta forma exacta, el iframe entra solo: no hay doble login ni postMessage.
 * Ver saveSession/loadSession en index.html:9457-9480.
 */
export const SESSION_KEY = 'monitor-areben-session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 días
export const ADMINPASS_KEY = 'monitor_adminpass' // sessionStorage, ver index.html:9328

export type Sesion = {
  user: string
  empresa: Marca
  ts: number
}

export const USU_API = 'https://bdi-catalogo.vercel.app/api/usuarios'

export function guardarSesion(user: string, empresa: Marca): void {
  try {
    const s: Sesion = { user, empresa, ts: Date.now() }
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    /* localStorage lleno: el legacy también lo ignora */
  }
}

/** Port de loadSession (index.html:9468), sin el chequeo contra USERS. */
export function leerSesion(): Sesion | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Sesion
    if (!s?.user) return null
    if (Date.now() - (s.ts || 0) > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

export function borrarSesion(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {}
  try {
    sessionStorage.removeItem(ADMINPASS_KEY)
  } catch {}
}

/**
 * La contraseña vive solo en sessionStorage porque el legacy la necesita para
 * autenticar los guardados que requieren admin (_getAdminPass, index.html:9331).
 * Es el modelo actual, no uno nuevo: la Fase S lo reemplaza junto con RLS.
 */
export function guardarAdminPass(pass: string): void {
  try {
    if (pass) sessionStorage.setItem(ADMINPASS_KEY, pass)
    else sessionStorage.removeItem(ADMINPASS_KEY)
  } catch {}
}

/** Lee la contraseña cacheada en sessionStorage (la deja el login). Port de la lectura de _getAdminPass. */
export function leerAdminPass(): string {
  try {
    return sessionStorage.getItem(ADMINPASS_KEY) || ''
  } catch {
    return ''
  }
}

export type RespuestaLogin =
  | { ok: true; perfil: Perfil }
  | { ok: false; error: string }

/** Port de doLogin (index.html:9500): valida contra el KV, que es quien tiene las contraseñas. */
export async function login(user: string, pass: string): Promise<RespuestaLogin> {
  try {
    const r = await fetch(USU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', user, pass }),
    })
    const d = await r.json()
    if (d?.ok && d.perfil) return { ok: true, perfil: d.perfil as Perfil }
    return { ok: false, error: 'Usuario o contraseña incorrectos.' }
  } catch {
    return { ok: false, error: 'No se pudo conectar para validar. Probá de nuevo.' }
  }
}

/** Trae la lista de perfiles del KV (cargarConfigUsuarios, index.html:9339). */
export async function traerPerfiles(): Promise<Perfil[] | null> {
  try {
    const r = await fetch(USU_API)
    const d = await r.json()
    if (d?.ok && Array.isArray(d.config?.users)) return d.config.users as Perfil[]
    return null
  } catch {
    return null
  }
}
