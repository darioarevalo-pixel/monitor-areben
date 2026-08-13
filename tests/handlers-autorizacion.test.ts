import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Los handlers que **autenticaban pero no autorizaban**.
 *
 * Hasta el 13-ago-2026 estos nueve llamaban a `exigirUsuario` y nada más. Tener sesión no es tener
 * permiso: cualquier cuenta válida del Monitor —incluidos los puestos compartidos `Depósito`,
 * `Local` y `bdilocal`, cuya contraseña conoce medio equipo— leía y escribía en las dos marcas sin
 * importar qué decía su perfil. Se bajaba el stock vivo completo, el mapeo de SKU de las tres
 * marcas, el padrón de clientes que reclamaron, y hasta **el token del portal público de cualquier
 * reclamo**, que es la llave para hacerse pasar por ese cliente.
 *
 * `lib/permisos.core.js` ya tenía todo lo necesario; el problema era la cobertura, no el diseño.
 *
 * Lo que fija este archivo es lo que no se ve en una pantalla: que el 403 salga **antes de tocar la
 * base**. Un gate que contesta 403 después de leer ya filtró los datos al proceso, y el día que
 * alguien mueva un `return` no se va a romper ninguna vista.
 */

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('LLEGÓ A LA BASE — el gate no cortó') },
}))

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
const conSesion = (extra: Record<string, unknown> = {}) => ({
  method: 'GET',
  headers: { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) },
  query: { store: 'bdi' },
  body: {},
  ...extra,
})

/**
 * El KV contesta que sí, con el perfil que le pasemos. La identidad es válida; el permiso, no.
 *
 * A todo lo que NO es el KV se le contesta una **página vacía y exitosa**. Importa que sea así y
 * no un error: `_inventario-vivo` pagina Gestión Nube contra un presupuesto de 10 s y reintenta
 * los fallos, así que con un 500 se quedaba dando vueltas ~29 s — al filo del `testTimeout` de 30,
 * o sea un test que iba a empezar a flakear solo. Con una página vacía la paginación termina en la
 * primera vuelta. Acá no interesa qué devuelve GN, sólo si el gate dejó llegar hasta ahí.
 */
function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (
    String(url).includes('bdi-catalogo.vercel.app/api/usuarios')
      ? { ok: true, json: async () => ({ ok: true, perfil }) }
      : { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: [], meta: {} }), text: async () => '{"data":[]}' }
  )))
}

/** Alguien real del equipo: entra al Monitor, pero no tiene ninguna de las secciones de abajo. */
const SIN_NADA = { name: 'Depósito', admin: false, cuenta: null, acceso: {}, funcion: [] }

/**
 * Cada handler con la sección que lo abre. La clave elegida importa: una de más deja el endpoint
 * casi abierto, una de menos deja a alguien sin poder trabajar y se ve como "no anda".
 */
const PUERTAS = [
  { archivo: '_conteos-deposito', llave: 'conteo-deposito', que: 'los conteos del depósito' },
  { archivo: '_inventario-vivo', llave: 'conteo', que: 'el stock vivo de GN' },
  { archivo: '_disenos', llave: 'disenos', que: 'el tablero de diseños' },
  { archivo: '_solicitudes', llave: 'solicitudes', que: 'las solicitudes' },
  { archivo: '_tn-ignorados', llave: 'tncat', que: 'los productos apartados de la revisión' },
  { archivo: '_tn-fotos-verificadas', llave: 'tncat', que: 'las fotos ya verificadas' },
  { archivo: '_fallas', llave: 'postventa-deposito', que: 'las fallas' },
  { archivo: '_reclamos', llave: 'reclamos-local', que: 'los reclamos y sus tokens' },
  { archivo: 'sku-map', llave: 'integraciones', que: 'el mapeo de SKU' },
] as const

/** El perfil que SÍ tiene una sección tildada en BDI. */
const conLlave = (key: string) => ({ name: 'Quien Sea', admin: false, cuenta: null, acceso: { bdi: { [key]: true } }, funcion: [] })

beforeEach(() => {
  vi.resetModules()
  for (const v of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ZATTIA_SUPABASE_URL', 'ZATTIA_SUPABASE_SERVICE_KEY']) {
    vi.stubEnv(v, 'puesto-para-que-no-corte-antes')
  }
  vi.stubEnv('GN_TOKEN', 'x')
  vi.stubEnv('GN_TOKEN_ZATTIA', 'x')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function llamar(archivo: string, req: unknown) {
  const mod = await import(`@/api/${archivo}.js`)
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

describe('sesión sin permiso: 403 y sin tocar la base', () => {
  for (const { archivo, que } of PUERTAS) {
    it(`${archivo} no sirve ${que}`, async () => {
      sesionDe(SIN_NADA)
      // Si el gate no cortara, el `createClient` mockeado tira y el test se cae con un mensaje
      // que dice exactamente qué pasó. Un 403 tardío tampoco pasa: el throw llega primero.
      const res = await llamar(archivo, conSesion())
      expect(res.code).toBe(403)
    })
  }
})

describe('con la sección tildada, pasa', () => {
  for (const { archivo, llave, que } of PUERTAS) {
    it(`${archivo} deja ver ${que} a quien tiene «${llave}»`, async () => {
      sesionDe(conLlave(llave))
      // Ahora el gate NO tiene que cortar: se espera llegar a la base (o al token de GN), o sea
      // cualquier cosa MENOS un 403. Es la mitad que evita el falso positivo de "prohibir todo".
      let code = 0
      try { code = (await llamar(archivo, conSesion())).code } catch (e) {
        expect(String(e)).toContain('LLEGÓ A LA BASE')
        return
      }
      expect(code).not.toBe(403)
    })
  }
})

describe('el admin entra a todo', () => {
  it('ninguna puerta le contesta 403', async () => {
    for (const { archivo } of PUERTAS) {
      sesionDe({ name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: [] })
      let code = 0
      try { code = (await llamar(archivo, conSesion())).code } catch (e) {
        expect(String(e)).toContain('LLEGÓ A LA BASE'); continue
      }
      expect(code, archivo).not.toBe(403)
    }
  })
})

describe('la cuenta fija sigue mandando', () => {
  it('quien está clavado a Zattia no ve los conteos de BDI, aunque tenga el permiso tildado', async () => {
    // `marcasConAcceso` hace que la cuenta fija le gane incluso al permiso: es lo que ya hacía el
    // cliente y lo que evita que alguien de un local vea el stock del otro.
    sesionDe({ name: 'Local Zattia', admin: false, cuenta: 'zattia', acceso: { bdi: { conteo: true }, zattia: { conteo: true } }, funcion: [] })
    const res = await llamar('_conteos-deposito', conSesion())
    expect(res.code).toBe(403)
  })
})
