import type { Marca } from './nav.datos'
import type { Perfil } from './permisos'
import { salirDeGoogle, tokenActual } from './identidad'

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
  /**
   * Cómo entró esta persona. Ausente = `pass`, que es como quedaron guardadas todas las
   * sesiones anteriores a Google: el default preserva a quien ya estaba logueado.
   * Lo consume `apiFetch`, para saber si la credencial de esta sesión es el token del
   * proveedor o la contraseña cacheada.
   */
  via?: Via
}

export type Via = 'google' | 'pass'

export const USU_API = 'https://bdi-catalogo.vercel.app/api/usuarios'

export function guardarSesion(user: string, empresa: Marca, via: Via = 'pass'): void {
  try {
    const s: Sesion = { user, empresa, ts: Date.now(), via }
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
      try { localStorage.removeItem(ADMINPASS_KEY) } catch {}
      try { sessionStorage.removeItem(ADMINPASS_KEY) } catch {}
      return null
    }
    return s
  } catch {
    return null
  }
}

export function borrarSesion(): void {
  // La sesión del proveedor también se cierra: si quedara viva, el próximo "Entrar con
  // Google" volvería a entrar sin preguntar nada y "Salir" no se sentiría como salir.
  void salirDeGoogle()
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {}
  try {
    sessionStorage.removeItem(ADMINPASS_KEY)
  } catch {}
  try {
    localStorage.removeItem(ADMINPASS_KEY)
  } catch {}
}

/**
 * La contraseña se cachea en localStorage (persiste al cerrar el navegador, igual
 * que la sesión de 30 días) y se espeja en sessionStorage para que el legacy la
 * lea dentro de la sesión (_getAdminPass, index.html:9365). Antes vivía solo en
 * sessionStorage y se perdía al cerrar el navegador: la sesión seguía viva pero el
 * header x-monitor-auth no salía y todo daba 403, con un re-pedido de pass molesto
 * en cada vuelta. Persistirla acá lo elimina. Sigue siendo el modelo de pass en el
 * cliente; la Fase S (Supabase Auth / token firmado) lo reemplaza junto con RLS.
 */
export function guardarAdminPass(pass: string): void {
  try {
    if (pass) {
      localStorage.setItem(ADMINPASS_KEY, pass)
      sessionStorage.setItem(ADMINPASS_KEY, pass)
    } else {
      localStorage.removeItem(ADMINPASS_KEY)
      sessionStorage.removeItem(ADMINPASS_KEY)
    }
  } catch {}
}

/** Lee la pass cacheada: sessionStorage primero (lo que deja el legacy), luego localStorage (persistente). */
export function leerAdminPass(): string {
  try {
    return sessionStorage.getItem(ADMINPASS_KEY) || localStorage.getItem(ADMINPASS_KEY) || ''
  } catch {
    return ''
  }
}

/**
 * Con qué se identifica esta sesión ante los endpoints que escriben.
 *
 * Es EL cambio de fondo del SSO en el monitor: hasta ahora la credencial era la
 * contraseña, que viajaba en cada request y se cacheaba en el navegador. Ahora hay dos
 * formas y conviven — quien tiene casilla manda el token del proveedor, y los puestos
 * compartidos (Depósito, Local, bdilocal) siguen mandando usuario y contraseña.
 */
export type Credencial = { user: string; pass: string } | { token: string }

/** Cómo consigue una pantalla su credencial (puede abrir un prompt, así que es async). */
export type ObtenerCred = () => Promise<Credencial | null>

/**
 * La credencial de la sesión actual, o null si no hay con qué identificarse.
 *
 * Para las sesiones de Google el token se pide en cada llamada a propósito: `getSession()`
 * lo refresca solo cuando está por vencer, así que pedirlo tarde es lo que garantiza que
 * salga uno vigente. Un access_token dura una hora y la sesión del monitor dura 30 días.
 */
export async function credencialActual(pedirPass?: () => string): Promise<Credencial | null> {
  const s = leerSesion()
  if (!s) return null

  if (s.via === 'google') {
    const token = await tokenActual()
    return token ? { token } : null
  }

  const pass = leerAdminPass() || (pedirPass ? pedirPass() : '')
  return pass ? { user: s.user, pass } : null
}

/**
 * La credencial de la sesión, pidiendo la contraseña si hace falta.
 *
 * Estaba copiada en cuatro pantallas (Usuarios, Ingresos, Comisiones, Sesión de fotos),
 * cada una con su `obtenerPass` local y su texto. Con dos formas de identificarse habrían
 * sido cuatro lugares donde acordarse de la segunda, así que vive acá. Devuelve null si
 * no hay con qué identificarse (nadie logueado, o cancelaron el prompt).
 */
export function credencialConPrompt(motivo = 'de administrador'): Promise<Credencial | null> {
  return credencialActual(() => {
    const p = (window.prompt(`Ingresá tu contraseña ${motivo} (te la pido una sola vez):`) || '').trim()
    if (p) guardarAdminPass(p)
    return p
  })
}

/** Los campos con los que viaja una credencial en el body de los endpoints admin. */
export function camposAdmin(c: Credencial | null): { adminUser?: string; adminPass?: string; adminToken?: string } {
  if (!c) return {}
  return 'token' in c ? { adminToken: c.token } : { adminUser: c.user, adminPass: c.pass }
}

export type RespuestaLogin =
  | { ok: true; perfil: Perfil }
  | { ok: false; error: string }

/**
 * Login con el token del proveedor: la identidad la puso Google, el acceso lo pone el KV.
 *
 * El mapeo es por **mail**, que es la única clave que cruza los sistemas de Areben (la
 * misma persona es `Candela Luis` acá y `candela` en producción). Autenticar bien y no
 * tener fila en el KV no es un error del sistema sino una respuesta: esa cuenta no tiene
 * acceso a ESTE sistema, y el login lo dice con esas palabras.
 *
 * Sirve para las dos cosas: para el ingreso, y para rehidratar el perfil al volver con
 * una sesión ya guardada (el mismo papel que `traerPerfiles` cumple para la contraseña).
 */
export async function loginGoogle(token: string): Promise<RespuestaLogin> {
  try {
    const r = await fetch(USU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login-google', token }),
    })
    const d = await r.json()
    if (d?.ok && d.perfil) return { ok: true, perfil: d.perfil as Perfil }
    if (d?.error === 'sin-acceso') {
      return {
        ok: false,
        error: `La cuenta ${d.email || ''} no tiene acceso al Monitor. Pedile a un administrador que te dé de alta.`.replace('  ', ' '),
      }
    }
    return { ok: false, error: 'No se pudo validar tu cuenta de Google. Probá de nuevo.' }
  } catch {
    return { ok: false, error: 'No se pudo conectar para validar. Probá de nuevo.' }
  }
}

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

/**
 * La config COMPLETA (con contraseñas) para la pantalla de gestión de usuarios.
 * Admin-gated: POST `{action:'config', adminUser, adminPass}`. Port de usuariosAbrir
 * (index.html:9422). `prohibido` = 403 (contraseña equivocada) → el llamador olvida
 * la pass cacheada, como `_olvidarAdminPass`.
 */
export type ConfigAdmin<T> = { ok: true; users: T[] } | { ok: false; prohibido?: boolean; error: string }

export async function traerConfigAdmin<T = unknown>(cred: Credencial | null): Promise<ConfigAdmin<T>> {
  try {
    const r = await fetch(USU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'config', ...camposAdmin(cred) }),
    })
    if (r.status === 403) return { ok: false, prohibido: true, error: 'Contraseña de administrador incorrecta.' }
    const d = await r.json()
    if (d?.ok && Array.isArray(d.config?.users)) return { ok: true, users: d.config.users as T[] }
    return { ok: false, error: d?.error || 'No se pudo leer la configuración.' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error de conexión' }
  }
}

/**
 * Guarda la config de usuarios (solo admin). El server valida adminUser/adminPass y
 * responde `{ok:true}` (sin config). Port del POST de usuariosGuardar (index.html:9504).
 */
export async function guardarConfigAdmin<T>(cred: Credencial | null, users: T[]): Promise<{ ok: boolean; prohibido?: boolean; error?: string }> {
  try {
    const r = await fetch(USU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...camposAdmin(cred), config: { users } }),
    })
    if (r.status === 403) return { ok: false, prohibido: true, error: 'Contraseña de administrador incorrecta.' }
    const d = await r.json()
    if (d?.ok) return { ok: true }
    return { ok: false, error: d?.error || 'No se pudo guardar.' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error de conexión' }
  }
}
