import { describe, it, expect, vi, beforeEach } from 'vitest'
import { COLUMNAS_DEL_PORTAL, DIAS_DEL_LINK, elLinkSigueVivo, nuevoToken } from '@/lib/reclamos/portal.core.js'

/**
 * **Regenerar el link del cliente, y la CUARTA copia de la regla del portal** (30-ago-2026).
 *
 * 🔴 `reemitir-token` decidía con **los tres estados escritos a mano** en un `includes`, al lado de
 * un `select('estado')` que ⛔ no traía `compensacion`. Pero un cambio decidido **vuelve a
 * `borrador` a propósito**, a esperar que el cliente pague ⇒ el verbo acuñaba un token nuevo,
 * contestaba «listo», y **el portal después le daba 404 al cliente**. El link regenerado ⛔ no
 * servía y ⛔ nada lo decía: el que se enteraba era el cliente, del otro lado de WhatsApp.
 *
 * 🔑 Es la misma forma que ya pagó D16 —dos listas, una en cada lado de la puerta— con el agregado
 * de que acá el `select` a mano dejaba **el freno mirando `undefined`**: aunque la regla hubiera
 * estado bien escrita, el dato que necesitaba ⛔ no llegaba.
 */

const mundo = {
  fila: {} as Record<string, unknown>,
  escrito: null as Record<string, unknown> | null,
  selects: [] as unknown[][],
}

function fakeSupabase() {
  const desde = () => {
    const api: Record<string, unknown> = {
      select: (...a: unknown[]) => { mundo.selects.push(a); return api },
      eq: () => api,
      update: (row: Record<string, unknown>) => { mundo.escrito = row; return api },
      insert: () => api,
      maybeSingle: async () => ({ data: mundo.fila, error: null }),
      single: async () => ({ data: mundo.fila, error: null }),
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) =>
        Promise.resolve({ data: mundo.fila, error: null }).then(ok, mal),
    }
    return api
  }
  return { from: desde }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeSupabase() }))

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

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')
const ADMIN = { name: 'Bruno', admin: false, cuenta: null, acceso: { bdi: { reclamos: true } }, funcion: ['administracion'] }

async function reemitir(fila: Record<string, unknown>) {
  mundo.fila = fila
  mundo.escrito = null
  mundo.selects = []
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil: ADMIN }) })))
  const { default: handler } = await import('../api/_reclamos.js')
  const res = resFalso()
  await handler({
    method: 'POST',
    headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'y' }) },
    query: {},
    body: { store: 'bdi', id: 22, action: 'reemitir-token' },
  }, res)
  return res
}

beforeEach(() => {
  vi.resetModules()
  process.env.SUPABASE_URL = 'https://base'
  process.env.SUPABASE_KEY = 'k'
})

describe('🔴 el link de un reclamo YA DECIDIDO ⛔ no se regenera', () => {
  it('un cambio decidido volvió a borrador, y aun así ⛔ no da link', async () => {
    // Éste es el caso que se colaba: el estado dice `borrador` —porque se está esperando el pago—
    // y la compensación dice que ya se decidió.
    const r = await reemitir({ estado: 'borrador', compensacion: 'otro_producto' })
    expect(r.code).toBe(400)
    expect(mundo.escrito).toBe(null)
    expect(String(r.body?.error)).toContain('WhatsApp')
  })

  it('y el portal, del otro lado, dice lo mismo sobre esa misma fila', async () => {
    // 🔑 El cable: las dos puertas contestan igual **porque leen la misma función**. Antes una
    // decía que sí y la otra que no, y en el medio quedaba un link muerto.
    expect(elLinkSigueVivo({ estado: 'borrador', compensacion: 'otro_producto' })).toBe(false)
  })

  it('un reclamo cerrado tampoco', async () => {
    const r = await reemitir({ estado: 'cerrado', compensacion: null })
    expect(r.code).toBe(400)
    expect(mundo.escrito).toBe(null)
  })
})

describe('el que todavía está vivo sí lo regenera', () => {
  it('un borrador sin decidir da token nuevo, de 64 hex', async () => {
    const r = await reemitir({ estado: 'borrador', compensacion: null })
    expect(r.code).toBe(200)
    expect(String(r.body?.token)).toMatch(/^[a-f0-9]{64}$/)
    expect(mundo.escrito?.token).toBe(r.body?.token)
  })

  it('el vencimiento son quince días, contados desde ahora', async () => {
    // ⚠️ El número va **escrito acá**, ⛔ no leído de `DIAS_DEL_LINK`: un test que compara la
    // constante contra sí misma se mueve con ella y ⛔ no fija nada — bajarla a un día lo dejaba
    // verde. Cuánto dura el link es una decisión (un reclamo ⛔ no debería tardar más que esto),
    // así que cambiarla tiene que costar tocar este test a propósito.
    expect(DIAS_DEL_LINK).toBe(15)
    const r = await reemitir({ estado: 'en_revision', compensacion: null })
    const dias = (new Date(String(r.body?.vence)).getTime() - Date.now()) / 86400000
    expect(dias).toBeGreaterThan(14.99)
    expect(dias).toBeLessThan(15.01)
  })
})

describe('🔑 el select trae lo que la regla lee', () => {
  it('pide exactamente las columnas de COLUMNAS_DEL_PORTAL', async () => {
    // 🔴 El modo de falla de un `select` a mano al lado de una regla es dejar el freno mirando
    // `undefined` — o sea dejando pasar justo lo que vino a frenar. Acá pasaba: pedía `estado` y
    // la regla necesita también `compensacion`.
    await reemitir({ estado: 'borrador', compensacion: null })
    expect(mundo.selects[0][0]).toBe(COLUMNAS_DEL_PORTAL.join(', '))
    expect(COLUMNAS_DEL_PORTAL).toContain('compensacion')
  })
})

describe('el token que se acuña', () => {
  it('son 64 hex, y ⛔ no se repite', () => {
    // El largo ⛔ no es decorativo: es la única defensa del portal, porque ⛔ no hay sesión.
    const a = nuevoToken(); const b = nuevoToken()
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(a).not.toBe(b)
  })

  it('lo exige el portal con esa forma', () => {
    // `api/_reclamo.js` rechaza sin consultar lo que no sea `[a-f0-9]{32,128}`.
    expect(/^[a-f0-9]{32,128}$/i.test(nuevoToken())).toBe(true)
  })
})
