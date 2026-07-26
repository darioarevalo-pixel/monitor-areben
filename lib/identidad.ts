import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Ingreso con Google contra el proveedor de identidad de Areben.
 *
 * El proveedor es el proyecto Supabase del **dashboard** — no es ninguna de las dos
 * cuentas de datos de `lib/cuentas.ts`. Ahí viven las personas de la empresa; acá solo
 * se les pregunta "¿quién sos?". Qué puede hacer cada una lo sigue diciendo el KV de
 * bdi-catalogo, con el mismo modelo de función/área de `lib/permisos.ts`, que no cambia.
 *
 * **Por qué las claves van literales.** Mismo criterio que `lib/cuentas.ts`: la
 * publishable key viaja en el browser en cualquier flujo de OAuth, así que moverla a
 * `NEXT_PUBLIC_*` no esconde nada (Next la inlinea en el bundle igual) y solo agrega un
 * modo de falla: si la env var falta en Vercel, la app deploya y nadie puede entrar.
 * El proyecto vive en el Vercel de Darío, una razón más para no depender de que alguien
 * cargue una variable. La misma pareja está en `bdi-catalogo/api/usuarios.js`, que es
 * quien valida los tokens del lado servidor: si se cambia una, se cambian las dos.
 */
export const IDP_URL = 'https://tysdjzbaskfankmpreqe.supabase.co'
export const IDP_KEY = 'sb_publishable_He6-ikWyPxobbqg1AgrXng_Jw9bT5Iq'

/**
 * La sesión del proveedor QUEDA VIVA en el navegador, y es a propósito.
 *
 * Producción hace lo contrario (canjea, lee el mail y desloguea) porque emite una cookie
 * propia que le sirve de credencial. El monitor no tiene cookie propia: su credencial
 * ante `api/*` era la contraseña, y ahora pasa a ser este token. Un access_token dura una
 * hora, así que si lo guardáramos suelto, a la hora las escrituras empezarían a dar 403
 * con la sesión de 30 días todavía viva. Dejando la sesión, `getSession()` lo refresca
 * solo con el refresh_token y `apiFetch` siempre manda uno vigente.
 *
 * `storageKey` propia para no pisar nada del resto de la app.
 */
const STORAGE_KEY = 'monitor-areben-idp'

let cliente: SupabaseClient | null = null

export function clienteIdentidad(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(IDP_URL, IDP_KEY, {
      auth: {
        storageKey: STORAGE_KEY,
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        // El canje lo dispara SesionProvider a mano: la vuelta de Google cae en la home
        // (el monitor es un catch-all, no tiene ruta de callback), y queremos controlar
        // en qué momento se limpia el `?code=` de la URL.
        detectSessionInUrl: false,
      },
    })
  }
  return cliente
}

/**
 * Manda a Google. Vuelve a la home con `?code=…`, que canjea `canjearCodigo()`.
 *
 * `redirectTo` sale de `window.location.origin` para que ande igual en local, en la URL
 * de Vercel y en `monitor.arebensrl.com` el día que exista el subdominio. Cada uno de
 * esos orígenes tiene que estar en la allow-list de redirects del proyecto de Supabase.
 */
export async function entrarConGoogle(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await clienteIdentidad().auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      // La pantalla de consentimiento ya es Interna (solo cuentas de la organización);
      // `hd` evita además que el selector ofrezca cuentas personales.
      queryParams: { hd: 'arebensrl.com' },
    },
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** ¿La URL actual es la vuelta de Google? */
export function hayCodigoEnLaUrl(): boolean {
  if (typeof window === 'undefined') return false
  const p = new URLSearchParams(window.location.search)
  return p.has('code') || p.has('error_description')
}

/**
 * Canjea el `code` de la vuelta de Google por una sesión y devuelve el access_token.
 *
 * Limpia la query en los dos caminos (con `replaceState`, sin recargar): un `code` ya
 * usado en la barra de direcciones solo sirve para que un F5 muestre un error confuso.
 */
export async function canjearCodigo(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const errorGoogle = params.get('error_description')
  limpiarUrl()

  if (errorGoogle) return { ok: false, error: 'google' }
  if (!code) return { ok: false, error: 'sin-codigo' }

  try {
    const { data, error } = await clienteIdentidad().auth.exchangeCodeForSession(code)
    const token = data?.session?.access_token
    if (error || !token) return { ok: false, error: 'google' }
    return { ok: true, token }
  } catch {
    return { ok: false, error: 'google' }
  }
}

function limpiarUrl(): void {
  try {
    const u = new URL(window.location.href)
    u.search = ''
    window.history.replaceState({}, '', u.toString())
  } catch {
    /* no es crítico: solo deja el ?code= a la vista */
  }
}

/**
 * Token vigente del proveedor, refrescado si hacía falta, o null si no hay sesión de
 * Google (el caso normal de quien entra con contraseña).
 */
export async function tokenActual(): Promise<string | null> {
  try {
    const { data } = await clienteIdentidad().auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

/** Cierra la sesión del proveedor. Se llama junto con `borrarSesion()` del monitor. */
export async function salirDeGoogle(): Promise<void> {
  try {
    await clienteIdentidad().auth.signOut()
  } catch {
    /* si falla, la sesión del monitor se borra igual */
  }
}
