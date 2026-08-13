import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * El gate de `api/_meta-rentabilidad.js`.
 *
 * Mismo aparato y mismo criterio que `tests/handlers-autorizacion.test.ts` —el 403 tiene que salir
 * **antes de tocar la base**, y por eso `createClient` está mockeado para explotar—, en archivo
 * aparte porque este handler no entra en la tabla `PUERTAS` de allá: su eje no es `?store=` sino
 * `?linea=`, así que las tres tandas de casos de aquel archivo le pasarían el request equivocado.
 *
 * 🔴 **Lo que de verdad fija este archivo es la cuenta fija.** El gate nació con `puedeVer` pelado,
 * que es exactamente el agujero que se cerró el 13-ago-2026 en otros cinco handlers: del lado del
 * servidor la línea la elige el request, así que alguien clavado a Zattia pide `?linea=bdi` a mano
 * y `puedeVer` le dice que sí. En la pantalla no se ve nunca —quien tiene cuenta fija no puede
 * cambiar de marca— y por eso se lee como código correcto.
 */

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('LLEGÓ A LA BASE — el gate no cortó') },
}))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() {},
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

/** Un pedido con sesión válida. La línea la elige quien llama, que es justamente el punto. */
const pedido = (extra: Record<string, unknown> = {}) => ({
  method: 'GET',
  headers: { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) },
  query: { linea: 'bdi' },
  body: {},
  ...extra,
})

/** El KV contesta que sí con este perfil: la identidad es válida, el permiso es lo que se prueba. */
function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (
    String(url).includes('bdi-catalogo.vercel.app/api/usuarios')
      ? { ok: true, json: async () => ({ ok: true, perfil }) }
      : { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [] }), text: async () => '{"data":[]}' }
  )))
}

async function llamar(req: unknown) {
  const mod = await import('@/api/_meta-rentabilidad.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

/** Llega hasta la base = el gate lo dejó pasar. Es la mitad que evita el falso "prohibir todo". */
async function dejaPasar(req: unknown): Promise<boolean> {
  try {
    return (await llamar(req)).code !== 403
  } catch (e) {
    expect(String(e)).toContain('LLEGÓ A LA BASE')
    return true
  }
}

const SIN_NADA = { name: 'Depósito', admin: false, cuenta: null, acceso: {}, funcion: [] }
const CON_META = { name: 'Quien Sea', admin: false, cuenta: null, acceso: { bdi: { 'meta-ads': true } }, funcion: [] }
const ADMIN = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] }

beforeEach(() => {
  vi.resetModules()
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) vi.stubEnv(v, 'puesto-para-que-no-corte-antes')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('quién puede LEER el umbral', () => {
  it('sin la sección tildada: 403, y sin tocar la base', async () => {
    sesionDe(SIN_NADA)
    expect((await llamar(pedido())).code).toBe(403)
  })

  it('con «meta-ads» en BDI, pasa', async () => {
    sesionDe(CON_META)
    expect(await dejaPasar(pedido())).toBe(true)
  })

  it('🔴 clavado a Zattia y con «meta-ads» en las dos, NO ve la línea de BDI', async () => {
    // Con `puedeVer` pelado esto daba 200: la línea la elige el request y `puedeVer` sólo mira la
    // marca que le pasan. Es el mismo agujero que ya se cerró en `_liquidacion`, `_calendario`,
    // `_atencion` y `_meta-funnel`.
    sesionDe({
      name: 'Local Zattia',
      admin: false,
      cuenta: 'zattia',
      acceso: { bdi: { 'meta-ads': true }, zattia: { 'meta-ads': true } },
      funcion: [],
    })
    expect((await llamar(pedido())).code).toBe(403)
  })

  it('el mismo perfil SÍ ve su propia línea: el que corta es el clavado, no el permiso', async () => {
    sesionDe({
      name: 'Local Zattia',
      admin: false,
      cuenta: 'zattia',
      acceso: { bdi: { 'meta-ads': true }, zattia: { 'meta-ads': true } },
      funcion: [],
    })
    expect(await dejaPasar(pedido({ query: { linea: 'zattia' } }))).toBe(true)
  })

  it('Stunned cuelga de Zattia para los permisos, y entra derecho', async () => {
    sesionDe({ name: 'Quien Sea', admin: false, cuenta: null, acceso: { zattia: { 'meta-ads': true } }, funcion: [] })
    expect(await dejaPasar(pedido({ query: { linea: 'stunned' } }))).toBe(true)
  })
})

describe('quién puede GUARDARLO', () => {
  const guardar = (perfil: unknown, linea = 'bdi') => {
    sesionDe(perfil)
    return llamar(pedido({ method: 'POST', query: {}, body: { linea, supuestos: { precio: 1 } } }))
  }

  it('🔴 quien ve la sección pero no es admin: 403, y no escribe', async () => {
    // El umbral es lo que TODAS las otras pantallas leen como «rinde». Ver no es decidir.
    const res = await guardar(CON_META)
    expect(res.code).toBe(403)
    expect(String(res.body?.error)).toContain('admin')
  })

  it('un admin llega a escribir', async () => {
    let llego = false
    try {
      const res = await guardar(ADMIN)
      llego = res.code !== 403
    } catch (e) {
      expect(String(e)).toContain('LLEGÓ A LA BASE')
      llego = true
    }
    expect(llego).toBe(true)
  })

  it('sin sesión no entra nadie, ni para leer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: false }) })))
    expect((await llamar(pedido())).code).toBe(403)
  })
})

describe('la línea que no existe', () => {
  it('se rechaza con 400 antes de preguntar por permisos', async () => {
    sesionDe(SIN_NADA)
    for (const linea of ['', 'BDI2', 'todas', 'bdi;drop']) {
      const res = await llamar(pedido({ query: { linea } }))
      expect(res.code, linea).toBe(400)
    }
  })

  it('pero la línea buena entra en cualquier capitalización', async () => {
    sesionDe(CON_META)
    expect(await dejaPasar(pedido({ query: { linea: 'BDI' } }))).toBe(true)
  })
})
