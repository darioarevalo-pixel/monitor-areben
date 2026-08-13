import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * `api/crear-venta.js` es **la superficie irreversible**: lo que sale de acá crea ventas reales en
 * Gestión Nube y descuenta stock, y GN **no permite anularlas por API** — una venta de más se
 * limpia a mano en la web. El módulo que lo llama lo dice así de claro (`lib/sesionfotos/ventas.ts:2`).
 *
 * Con 300 líneas y esa consecuencia, no lo importaba ningún test. Lo único que existía eran los
 * *bodies* que el legacy hubiera mandado (`tests/legacy-sesionfotos.ts`): se verificaba lo que se
 * le manda al handler, nunca lo que el handler hace con eso.
 *
 * Lo que fija este archivo es una sola cosa, y es la que se rompió: **quién puede llegar a GN con
 * nuestro token**. La rama `accion:'estado'` contestaba ARRIBA del `exigirUsuario`, con el
 * `Access-Control-Allow-Origin: *` que el handler pone en su primera línea. Cualquiera en internet
 * podía preguntar por una venta arbitraria de nuestra cuenta y enumerar por `ventaId`. Que sea de
 * sólo lectura no la hacía pública.
 *
 * `TOKENS` se arma en la carga del módulo desde `process.env`, así que el import va DESPUÉS de
 * poner el entorno — por eso es dinámico.
 */

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    ended: false,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { r.headers[k.toLowerCase()] = String(v) },
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    end() { r.ended = true; return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

const URL_KV = 'https://bdi-catalogo.vercel.app/api/usuarios'
const PERFIL = { name: 'Bruno', admin: true, acceso: {}, funcion: [] }

/**
 * Un `fetch` que distingue las dos salidas: la pregunta de identidad al KV y cualquier cosa que
 * vaya a Gestión Nube. Guarda las URLs de GN aparte, porque el punto de este archivo es que en
 * ciertos casos **esa lista tiene que quedar vacía**.
 */
function redFalsa({ kvDiceQueSi }: { kvDiceQueSi: boolean }) {
  const aGN: string[] = []
  const espia = vi.fn(async (url: string) => {
    if (String(url).startsWith(URL_KV)) {
      return { ok: true, json: async () => (kvDiceQueSi ? { ok: true, perfil: PERFIL } : { ok: false }) }
    }
    aGN.push(String(url))
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { active: true, archived: false, sale_state_id: 3 } }) }
  })
  vi.stubGlobal('fetch', espia)
  return { aGN }
}

/** El handler, importado recién cuando el entorno ya tiene los tokens. */
async function traerHandler() {
  const mod = await import('@/api/crear-venta.js')
  return mod.default as (req: unknown, res: ReturnType<typeof resFalso>) => Promise<unknown>
}

const pedirEstado = (extra: Record<string, unknown> = {}) => ({
  method: 'POST',
  headers: {},
  body: { accion: 'estado', store: 'bdi', ventaId: 12345 },
  ...extra,
})

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('GN_TOKEN_VENTAS', 'token-zattia')
  vi.stubEnv('GN_TOKEN_VENTAS_BDI', 'token-bdi')
})

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('crear-venta: nadie llega a Gestión Nube sin sesión', () => {
  it('🔴 `accion:estado` sin credenciales da 403 y NO toca GN', async () => {
    // La regresión que este test existe para atajar. Si alguien vuelve a subir la rama `estado`
    // por encima del `exigirUsuario` —o "la deja pasar porque es read-only"—, acá se cae.
    const { aGN } = redFalsa({ kvDiceQueSi: false })
    const res = resFalso()
    await (await traerHandler())(pedirEstado(), res)
    expect(res.code).toBe(403)
    expect(aGN).toEqual([])
  })

  it('un perfil falseado en el body tampoco alcanza', async () => {
    const { aGN } = redFalsa({ kvDiceQueSi: false })
    const res = resFalso()
    await (await traerHandler())(
      pedirEstado({ body: { accion: 'estado', store: 'bdi', ventaId: 1, perfil: { admin: true }, admin: true } }),
      res,
    )
    expect(res.code).toBe(403)
    expect(aGN).toEqual([])
  })

  it('con sesión válida sí consulta la venta en GN', async () => {
    const { aGN } = redFalsa({ kvDiceQueSi: true })
    const res = resFalso()
    await (await traerHandler())(
      pedirEstado({ headers: { 'x-monitor-auth': sobre({ user: 'Bruno', pass: 'secreta' }) } }),
      res,
    )
    expect(res.code).toBe(200)
    expect(res.body).toMatchObject({ ok: true, existe: true, active: true })
    expect(aGN).toEqual(['https://www.gestionnube.com/api/v1/ventas/12345'])
  })

  it('con sesión válida pero ventaId basura, 400 y sin salir a GN', async () => {
    const { aGN } = redFalsa({ kvDiceQueSi: true })
    const res = resFalso()
    await (await traerHandler())(
      pedirEstado({ headers: { 'x-monitor-auth': sobre({ user: 'Bruno', pass: 'secreta' }) },
                    body: { accion: 'estado', store: 'bdi', ventaId: 'ninguna' } }),
      res,
    )
    expect(res.code).toBe(400)
    expect(aGN).toEqual([])
  })

  it('crear una venta sin sesión da 403 y no llega ni un POST a GN', async () => {
    // El caso que de verdad no se puede perdonar: acá abajo se crea plata.
    const { aGN } = redFalsa({ kvDiceQueSi: false })
    const res = resFalso()
    await (await traerHandler())(
      { method: 'POST', headers: {}, body: { store: 'bdi', origen: 'fotos', items: [{ product_id: 1, size_id: 2, quantity: 1 }] } },
      res,
    )
    expect(res.code).toBe(403)
    expect(aGN).toEqual([])
  })
})

describe('crear-venta: la forma del endpoint', () => {
  it('el preflight se contesta con 204', async () => {
    redFalsa({ kvDiceQueSi: true })
    const res = resFalso()
    await (await traerHandler())({ method: 'OPTIONS', headers: {} }, res)
    expect(res.code).toBe(204)
    expect(res.ended).toBe(true)
  })

  it('un GET no pasa', async () => {
    redFalsa({ kvDiceQueSi: true })
    const res = resFalso()
    await (await traerHandler())({ method: 'GET', headers: {} }, res)
    expect(res.code).toBe(405)
  })

  it('una marca que no existe se rechaza antes de mirar nada más', async () => {
    const { aGN } = redFalsa({ kvDiceQueSi: true })
    const res = resFalso()
    await (await traerHandler())({ method: 'POST', headers: {}, body: { store: 'inventada' } }, res)
    expect(res.code).toBe(400)
    expect(aGN).toEqual([])
  })
})
