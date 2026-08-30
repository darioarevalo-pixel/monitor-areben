import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ADMINPASS_KEY, SESSION_KEY } from '@/lib/sesion'

/**
 * **Los dos llamadores que leían una orden de Tienda Nube SIN credencial** (30-ago-2026).
 *
 * 🔴 `bdi-catalogo/api/tiendanube-audit?orden=N` devuelve **nombre del comprador, lo que pagó, la
 * forma de pago, lo que nos cuesta el envío y el número de seguimiento**. El número de orden es
 * **correlativo** —van por el 21.100— y el repo es **público en GitHub**: o sea que el historial de
 * compras entero estaba a un `for` de distancia de cualquiera.
 *
 * 🔑 **No era una decisión, era un olvido.** La migración a `apiFetch` ya se había hecho: el
 * encabezado de `lib/tn-audit.ts` dice «Antes el camino de `useTnImages` iba con `fetch` pelado,
 * sin credencial — **el único que quedaba así**». Se equivocaba: quedaban **dos**, `buscarOrden`
 * (Reclamos y Cambios) y `verificarOrden` (Canjes). Y el `MODO_AVISO` de `_auth.js` de
 * `bdi-catalogo` existe justo para esa transición: mientras esté prendido, una llamada sin
 * credencial **avisa y pasa** — así que del otro lado **⛔ nada se ponía rojo**.
 *
 * ⚠️ **El oráculo es LA LLAMADA, ⛔ no el resultado**: los dos endpoints contestan igual con o sin
 * credencial mientras el modo aviso esté prendido. Lo que se fija acá es que el header viaje.
 */

const pedidas: { url: string; auth: string | null }[] = []

/**
 * ⚠️ **`apiFetch` manda un `Headers`, ⛔ no un objeto pelado** — así que leerlo con `h['x-monitor-auth']`
 * da `undefined` **siempre**, con credencial y sin ella. Un espía escrito así ⛔ no distingue nada y
 * el test se pone rojo (o peor: verde, si la aserción fuera negativa) por el espía y ⛔ no por el código.
 */
function stubFetch() {
  vi.stubGlobal('fetch', vi.fn(async (u: string, init?: RequestInit) => {
    const h = new Headers(init?.headers || {})
    pedidas.push({ url: String(u), auth: h.get('x-monitor-auth') })
    return { ok: true, status: 200, json: async () => ({ ok: true, orden: { number: 21033, total: 0, products: [] } }) }
  }))
}

/**
 * La sesión que `apiFetch` necesita para armar el sobre `x-monitor-auth`.
 *
 * ⚠️ **El `ts` ⛔ no es decorativo**: `leerSesion` compara contra `SESSION_TTL_MS` y una sesión sin
 * fecha cuenta como **vencida de 1970** ⇒ `credencialActual` devuelve `null` y `apiFetch` sale sin
 * header. Sin esta línea, este archivo entero da rojo por el fixture y ⛔ no por el código. Las
 * claves y el TTL se importan de `lib/sesion`, ⛔ no se escriben a mano: copiadas, el día que
 * cambie el nombre de la clave el test seguiría verde mirando una sesión que ya no existe.
 */
function conSesion() {
  const guardado: Record<string, string> = {
    [SESSION_KEY]: JSON.stringify({ user: 'Bruno Arevalo', via: 'pass', ts: Date.now() }),
    [ADMINPASS_KEY]: 'la-pass',
  }
  const almacen = {
    getItem: (k: string) => guardado[k] ?? null,
    setItem: (k: string, v: string) => { guardado[k] = v },
    removeItem: (k: string) => { delete guardado[k] },
  }
  vi.stubGlobal('localStorage', almacen)
  vi.stubGlobal('sessionStorage', almacen)
}

const alAudit = () => pedidas.filter((p) => p.url.includes('tiendanube-audit') && p.url.includes('orden='))

beforeEach(() => { pedidas.length = 0; conSesion(); stubFetch() })
afterEach(() => { vi.unstubAllGlobals() })

describe('leer una orden de Tienda Nube', () => {
  it('🔴 Reclamos/Cambios manda la credencial del Monitor', async () => {
    const { buscarOrden } = await import('@/lib/reclamos/cliente')
    await buscarOrden('bdi', '21033')
    expect(alAudit().length).toBe(1)
    expect(alAudit()[0].auth).toBeTruthy()
  })

  it('🔴 Canjes también: era el segundo que quedaba sin credencial', async () => {
    const { verificarOrden } = await import('@/lib/canjes/cliente')
    await verificarOrden('bdi', '21033')
    expect(alAudit().length).toBe(1)
    expect(alAudit()[0].auth).toBeTruthy()
  })

  /**
   * 🔑 El sobre es `base64({user, pass})` y ⛔ no la pass pelada — si viajara en texto plano, una
   * contraseña con acento haría que `fetch` tire `TypeError` antes de salir (los valores de header
   * son latin-1). Lo documenta `lib/api-fetch.ts`; acá se fija que el sobre sea legible.
   */
  it('el sobre es base64 y lleva el usuario', async () => {
    const { buscarOrden } = await import('@/lib/reclamos/cliente')
    await buscarOrden('bdi', '21033')
    const sobre = JSON.parse(Buffer.from(String(alAudit()[0].auth), 'base64').toString('utf8'))
    expect(sobre.user).toBe('Bruno Arevalo')
  })
})
