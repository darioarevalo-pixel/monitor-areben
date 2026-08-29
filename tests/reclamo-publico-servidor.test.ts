import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { COLUMNAS_DEL_PORTAL, elLinkSigueVivo, ESTADOS_CON_LINK } from '@/lib/reclamos/portal.core.js'

/**
 * **El portal del cliente, con el handler corriendo de verdad** (D16 de la auditoría del
 * 28-ago-2026).
 *
 * 🔴 **Lo único de todo el módulo abierto a internet**, y la regla de cuándo contesta estaba
 * escrita **dos veces**: `ESTADOS_CON_LINK` en `botones.ts` y `ABIERTO` en `api/_reclamo.js`, con
 * un comentario que decía *«tiene que ser el mismo conjunto»*. Ya habían dejado de coincidir: la
 * lista dejó de ofrecer el link de un cambio decidido y el servidor se quedó mirando **sólo el
 * estado**.
 *
 * 🔑 Y `borrador` significa dos cosas: un **cambio decidido vuelve a `borrador` a propósito**, a
 * esperar que el cliente pague ⇒ un link mandado antes seguía abriendo. Y ⛔ no sólo para mirar:
 * `accion: 'enviar'` le ponía `estado: 'en_revision'`, o sea que **el cliente podía mover para
 * atrás una fila ya resuelta**, desde afuera y sin sesión. Eso es lo que se fija acá.
 */

const mundo = {
  fila: null as Record<string, unknown> | null,
  escrito: null as Record<string, unknown> | null,
}

function fakeSupabase() {
  const desde = () => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      update: (row: Record<string, unknown>) => { mundo.escrito = row; return api },
      maybeSingle: async () => ({ data: mundo.fila, error: null }),
      single: async () => ({ data: mundo.fila, error: null }),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))
vi.mock('@/api/_blob.js', () => ({ subirDataUrl: async () => ({ ok: true, url: 'https://blob/x.jpg' }) }))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() { /* no importa acá */ },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const TOKEN = 'a'.repeat(64)

async function pegar(req: Record<string, unknown>) {
  const { default: handler } = await import('../api/_reclamo.js')
  const res = resFalso()
  await handler({ headers: {}, query: {}, body: null, ...req }, res)
  return res
}

const abrir = () => pegar({ method: 'GET', query: { token: TOKEN } })
const enviar = () => pegar({ method: 'POST', body: { token: TOKEN, accion: 'enviar', relato: 'hola' } })

/** Un reclamo abierto de verdad: el cliente todavía tiene que cargar sus fotos. */
const ABIERTO_DE_VERDAD = {
  id: 42, store: 'bdi', orden_tn: '20700', estado: 'esperando_cliente', motivo: 'falla',
  compensacion: null, items: [], fotos: [], relato_cliente: '', token_vence: null, historial: [],
}

/**
 * 🔴 **El caso de D16**: un cambio ya decidido. `decidir` lo deja en `borrador` a propósito, a
 * esperar el pago — el estado dice «abierto» y la fila dice «resuelto».
 */
const CAMBIO_DECIDIDO = { ...ABIERTO_DE_VERDAD, estado: 'borrador', compensacion: 'otro_producto' }

beforeEach(() => {
  mundo.fila = { ...ABIERTO_DE_VERDAD }
  mundo.escrito = null
  vi.stubEnv('SUPABASE_URL', 'https://ejemplo.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'llave-de-mentira')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('el portal contesta', () => {
  it('sobre un reclamo que sigue esperando al cliente', async () => {
    const res = await abrir()
    expect(res.code).toBe(200)
    expect((res.body?.reclamo as Record<string, unknown>)?.numero).toBe('R-0042')
  })

  it('y el cliente puede mandar su relato', async () => {
    const res = await enviar()
    expect(res.code).toBe(200)
    expect(mundo.escrito?.estado).toBe('en_revision')
  })
})

describe('🔴 un cambio ya decidido, que vive en «borrador»', () => {
  beforeEach(() => { mundo.fila = { ...CAMBIO_DECIDIDO } })

  it('🔴 el link ⛔ NO abre: 404, igual que un token inventado', async () => {
    const res = await abrir()
    expect(res.code).toBe(404)
  })

  /**
   * 🔴 **Lo más caro del defecto**: `enviar` escribe `estado: 'en_revision'`. Sobre un cambio
   * decidido eso lo saca de la pestaña donde lo está esperando el Local y lo devuelve a la cola de
   * los que hay que decidir — **movido desde afuera, sin sesión, por quien tenga el link viejo**.
   */
  it('🔴 y `enviar` ⛔ NO lo mueve para atrás: 404 y la fila queda intacta', async () => {
    const res = await enviar()
    expect(res.code).toBe(404)
    expect(mundo.escrito).toBeNull()
  })

  it('🔴 tampoco acepta fotos', async () => {
    const res = await pegar({ method: 'POST', body: { token: TOKEN, accion: 'foto', dataUrl: 'data:image/png;base64,x' } })
    expect(res.code).toBe(404)
    expect(mundo.escrito).toBeNull()
  })
})

describe('el resto de las puertas sigue igual', () => {
  it('un reclamo resuelto tampoco abre', async () => {
    mundo.fila = { ...ABIERTO_DE_VERDAD, estado: 'resuelto', compensacion: 'plata_total' }
    expect((await abrir()).code).toBe(404)
  })

  it('un token vencido tampoco', async () => {
    mundo.fila = { ...ABIERTO_DE_VERDAD, token_vence: '2020-01-01T00:00:00Z' }
    expect((await abrir()).code).toBe(404)
  })

  it('un token con forma inválida ni se consulta', async () => {
    const res = await pegar({ method: 'GET', query: { token: 'no-es-un-token' } })
    expect(res.code).toBe(404)
  })
})

/**
 * **La regla, sola.** Las dos mitades y la mitad negativa de cada una: sin la segunda el portal
 * queda abierto, y sin la primera contestaría sobre un reclamo cerrado.
 */
describe('elLinkSigueVivo', () => {
  it('los tres estados abiertos, sin decisión: sí', () => {
    for (const estado of ESTADOS_CON_LINK) expect(elLinkSigueVivo({ estado, compensacion: null })).toBe(true)
  })

  it('🔴 los mismos tres estados CON decisión: no', () => {
    for (const estado of ESTADOS_CON_LINK) expect(elLinkSigueVivo({ estado, compensacion: 'otro_producto' })).toBe(false)
  })

  it('fuera de esos estados: no, aunque no haya decisión', () => {
    for (const estado of ['resuelto', 'en_transito', 'recibido', 'cerrado', 'anulado']) {
      expect(elLinkSigueVivo({ estado, compensacion: null })).toBe(false)
    }
  })

  it('sin fila: no', () => {
    expect(elLinkSigueVivo(null)).toBe(false)
  })
})

/**
 * 🔴 🔑 **El modo de falla que se trae puesto todo freno que lee la fila con un `select`.**
 *
 * Una columna que la regla mira y el `select` ⛔ no trae deja el freno mirando `undefined` — o sea
 * **dejando pasar justo lo que vino a frenar**, callado y en verde. Acá eso sería dejar abierto a
 * internet un reclamo ya decidido. Se tapa con **una sola lista** (`COLUMNAS_DEL_PORTAL`, como
 * `COLUMNAS_PARA_CERRAR` y `ENTRADAS_DEL_COSTO`) y con el oráculo que sirve para toda la familia:
 * **recortar la fila al `select` ⛔ no cambia la respuesta**.
 */
describe('la lista de columnas y la regla', () => {
  it('🔴 recortar la fila a `COLUMNAS_DEL_PORTAL` ⛔ no cambia la respuesta', () => {
    const casos = [
      { estado: 'borrador', compensacion: null },
      { estado: 'borrador', compensacion: 'otro_producto' },
      { estado: 'en_revision', compensacion: null },
      { estado: 'resuelto', compensacion: 'plata_total' },
    ]
    for (const entera of casos) {
      const conRuido = { ...entera, cliente: 'Ana', token: 'secreto', items: [], fotos: [] }
      const recorte = Object.fromEntries(
        COLUMNAS_DEL_PORTAL.map((c) => [c, (conRuido as Record<string, unknown>)[c]]),
      )
      expect(elLinkSigueVivo(recorte)).toBe(elLinkSigueVivo(conRuido))
    }
    // Que el caso de prueba ejerza las dos respuestas, y no sólo una.
    expect(new Set(casos.map((c) => elLinkSigueVivo(c))).size).toBe(2)
  })

  it('y el handler arma su `select` con esa lista, ⛔ no a mano', () => {
    const handler = readFileSync(new URL('../api/_reclamo.js', import.meta.url), 'utf8')
    expect(handler).toContain('.concat(COLUMNAS_DEL_PORTAL)')
  })
})
