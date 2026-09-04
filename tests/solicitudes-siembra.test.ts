import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **El 2º disparador entra por acá: crear una sesión de fotos siembra sus pasos en la Agenda.**
 *
 * El del ingreso lo avisa un sistema de afuera y por eso tiene puerta con secreto. Éste no: la
 * sesión se arma en el Monitor, así que el hecho que dispara es **que alguien la haya creado**, y
 * el único lugar donde eso se sabe es el guardado de `api/_solicitudes.js`.
 *
 * Lo que se prueba es **cuándo NO siembra**, que es donde están los tres accidentes caros:
 *
 *  1. **Editar no es crear.** La pantalla guarda la solicitud entera en cada cambio; sembrar en
 *     cada guardado le tiraría nueve pendientes encima a tres personas cada vez que alguien agrega
 *     una prenda.
 *  2. **El lote es la migración**, y ahí «no existe todavía» es verdad de todas las sesiones de dos
 *     años atrás.
 *  3. **Sin origen no hay dueña.** El borrador puede quedar sin origen a propósito (el botón de
 *     Marketing sirve para una campaña y para un faltante), y sembrar «igual» pone la dueña
 *     equivocada, que es peor que no sembrar.
 */

type Sembrado = Record<string, unknown>
const sembrados: Sembrado[] = []
let respuestaSiembra: Record<string, unknown> = { creados: 9, ya: false }

vi.mock('@/api/_agenda.js', () => ({
  sembrarEnMaestra: async (opts: Sembrado) => { sembrados.push(opts); return respuestaSiembra },
}))

/** Lo que la tabla ya tiene. El `select().in()` del handler contesta con esto. */
let existentes: string[] = []
let fallaLaLectura = false
const upserts: Record<string, unknown>[][] = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.order = () => q
    q.limit = async () => ({ data: [], error: null })
    q.in = async () => (fallaLaLectura
      ? { data: null, error: { message: 'la base no contesta' } }
      : { data: existentes.map((id) => ({ id })), error: null })
    q.upsert = async (filas: Record<string, unknown>[]) => { upserts.push(filas); return { data: null, error: null } }
    q.delete = () => q
    return { from: () => q }
  },
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
const ADMIN = { name: 'Sofia Facello', admin: true, cuenta: null, acceso: {}, funcion: [] }

const sesion = (over: Record<string, unknown> = {}) => ({
  id: 's99',
  fecha: '2026-09-10',
  creado: 1_780_000_000_000,
  creadoPor: 'Sofia Facello',
  descripcion: 'Cápsula primavera',
  estado: 'pendiente',
  items: [],
  motivo: 'Sesión de fotos',
  disparador: 'campania',
  ...over,
})

async function guardar(body: Record<string, unknown>) {
  const mod = await import('@/api/_solicitudes.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    {
      method: 'POST',
      headers: { 'x-monitor-auth': sobre({ user: 'sofi', pass: 'p' }), 'content-type': 'application/json' },
      query: {},
      body,
    },
    res,
  )
  return res
}

const guardarSesion = (over: Record<string, unknown> = {}, store = 'bdi') =>
  guardar({ store, kind: 'sesionfotos', solicitud: sesion(over) })

beforeEach(() => {
  sembrados.length = 0
  upserts.length = 0
  existentes = []
  fallaLaLectura = false
  respuestaSiembra = { creados: 9, ya: false }
  vi.stubEnv('SUPABASE_URL', 'https://bdi.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'k')
  vi.stubEnv('ZATTIA_SUPABASE_URL', 'https://zattia.supabase.co')
  vi.stubEnv('ZATTIA_SUPABASE_SERVICE_KEY', 'k')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil: ADMIN }) })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('crear una sesión de fotos siembra sus pasos', () => {
  it('siembra con la fecha, el origen y la marca de la sesión, y la clave es su ID', async () => {
    const res = await guardarSesion()
    expect(res.code).toBe(200)
    expect(sembrados).toHaveLength(1)
    expect(sembrados[0]).toMatchObject({
      plantilla: 'sesion-fotos',
      nombre: 'Cápsula primavera',
      fecha: '2026-09-10',
      eje: 'campania',
      marca: 'bdi',
      clave: 'sesion-fotos·s99',
    })
    // Y la sesión se guardó igual: sembrar es la consecuencia, no la condición.
    expect(upserts[0]).toHaveLength(1)
  })

  it('🔴 Stunned es una LÍNEA de Zattia: el pendiente cae en la marca zattia', async () => {
    await guardarSesion({}, 'stunned')
    expect(sembrados[0].marca).toBe('zattia')
  })

  it('sin descripción, el agrupador es la fecha — dos sesiones del mismo mes no se confunden', async () => {
    await guardarSesion({ descripcion: '   ' })
    expect(sembrados[0].nombre).toBe('Sesión 2026-09-10')
  })

  it('🔴 GUARDARLA DE NUEVO no siembra: editar no es crear', async () => {
    existentes = ['s99']
    const res = await guardarSesion({ descripcion: 'Cápsula primavera (2)' })
    expect(res.code).toBe(200)
    expect(sembrados).toEqual([])
    expect(upserts[0]).toHaveLength(1)
  })

  it('🔴 sin origen no siembra, y la sesión se guarda igual', async () => {
    for (const malo of [null, undefined, '', 'campaña']) {
      sembrados.length = 0
      const res = await guardarSesion({ disparador: malo })
      expect(res.code, String(malo)).toBe(200)
      expect(sembrados, String(malo)).toEqual([])
    }
  })

  it('🔴 el LOTE de la migración no siembra nada', async () => {
    const res = await guardar({
      store: 'bdi',
      kind: 'sesionfotos',
      solicitudes: [sesion(), sesion({ id: 's98' }), sesion({ id: 's97' })],
    })
    expect(res.code).toBe(200)
    expect(sembrados).toEqual([])
    expect(upserts[0]).toHaveLength(3)
  })

  it('una solicitud interna ⛔ no dispara la sesión de fotos', async () => {
    const res = await guardar({
      store: 'bdi',
      kind: 'solicitudesinternas',
      solicitud: sesion({ motivo: 'Muestra', disparador: 'ingreso' }),
    })
    expect(res.code).toBe(200)
    expect(sembrados).toEqual([])
  })

  it('🔴 si no se pudo leer qué existe, ⛔ NO siembra: no saber no es «entonces es nueva»', async () => {
    fallaLaLectura = true
    const res = await guardarSesion()
    expect(res.code).toBe(200)
    expect(sembrados).toEqual([])
  })

  it('🔴 si sembrar falla, la sesión NO se pierde: 200, y el error viaja en la respuesta', async () => {
    respuestaSiembra = { error: 'No hay ningún paso cargado como plantilla de sesión de fotos.' }
    const res = await guardarSesion()
    expect(res.code).toBe(200)
    expect(upserts[0]).toHaveLength(1)
    expect(JSON.stringify(res.body?.sembrado)).toContain('plantilla')
  })

  it('cuando sembró, lo cuenta', async () => {
    const res = await guardarSesion()
    expect(res.body?.sembrado).toEqual([{ id: 's99', creados: 9, ya: false }])
  })
})

/**
 * **Fase 5 del octavo (4-sep-2026): el que siembra pasó a ser el EVENTO, y su hija ⛔ no.**
 *
 * 🔴 Lo caro acá es el **doble**: un evento con tres solicitudes hijas sembraría los nueve pasos
 * cuatro veces —36 renglones encima de tres personas— y ⛔ ningún test del núcleo lo vería, porque
 * cada guardado por separado está bien. Lo que hay que fijar es **la combinación**.
 *
 * Y lo segundo, que ⛔ no se puede arreglar después: **las claves viejas quedan intactas**. Lo
 * sembrado antes de hoy vive con `sesion-fotos·<idSolicitud>`; si el evento usara esa misma forma,
 * un id repetido entre los dos cajones dejaría a uno de los dos sin sembrar para siempre.
 */
const evento = (over: Record<string, unknown> = {}) => ({
  id: 'ev1',
  fecha: '2026-09-10',
  hora: '15:30',
  duracionMin: 90,
  descripcion: 'Cápsula primavera',
  estado: 'planificado',
  creado: 1_780_000_000_000,
  creadoPor: 'Sofia Facello',
  disparador: 'campania',
  ...over,
})

const guardarEvento = (over: Record<string, unknown> = {}, store = 'bdi') =>
  guardar({ store, kind: 'sesion-evento', solicitud: evento(over) })

describe('la Agenda sale del EVENTO, con la hora en el título', () => {
  it('crear un evento siembra, con la clave de su propio espacio de nombres', async () => {
    const res = await guardarEvento()
    expect(res.code).toBe(200)
    expect(sembrados).toHaveLength(1)
    expect(sembrados[0]).toMatchObject({
      plantilla: 'sesion-fotos',
      fecha: '2026-09-10',
      eje: 'campania',
      marca: 'bdi',
      clave: 'sesion-fotos·evento:ev1',
    })
  })

  it('🔑 la HORA entra al título del pendiente, y ⛔ no a la regla', async () => {
    await guardarEvento()
    expect(sembrados[0].nombre).toBe('Cápsula primavera 15:30')
    // ⛔ Nada de hora viaja como fecha: `Regla` es día calendario en toda la Agenda.
    expect(sembrados[0].fecha).toBe('2026-09-10')
  })

  it('🔴 sin hora ⛔ NO se inventa ninguna: un «00:00» se lee como una sesión de madrugada', async () => {
    for (const sin of [undefined, '', null, 'a la tarde', '99:99']) {
      sembrados.length = 0
      await guardarEvento({ hora: sin })
      expect(sembrados[0].nombre, String(sin)).toBe('Cápsula primavera')
    }
  })

  it('sin descripción, el agrupador es la fecha — y la hora se le suma igual', async () => {
    await guardarEvento({ descripcion: '  ' })
    expect(sembrados[0].nombre).toBe('Sesión 2026-09-10 15:30')
  })

  it('🔴 la HIJA de un evento ⛔ NO siembra: sus pasos ya los sembró el padre', async () => {
    const res = await guardarSesion({ eventoId: 'ev1' })
    expect(res.code).toBe(200)
    expect(sembrados).toEqual([])
  })

  it('🔴 el evento + sus TRES hijas siembran UNA vez, ⛔ no cuatro', async () => {
    await guardarEvento()
    for (const id of ['s1', 's2', 's3']) await guardarSesion({ id, eventoId: 'ev1' })
    expect(sembrados).toHaveLength(1)
    expect(sembrados[0].clave).toBe('sesion-fotos·evento:ev1')
  })

  it('la solicitud SUELTA sigue sembrando igual que siempre, con la clave vieja', async () => {
    await guardarSesion()
    expect(sembrados[0].clave).toBe('sesion-fotos·s99')
  })

  it('🔴 un evento y una solicitud con el MISMO id ⛔ no comparten clave', async () => {
    await guardarEvento({ id: 'x1' })
    await guardarSesion({ id: 'x1' })
    expect(sembrados.map((s) => s.clave)).toEqual(['sesion-fotos·evento:x1', 'sesion-fotos·x1'])
  })

  it('🔴 GUARDAR el evento de nuevo ⛔ no siembra: editar la hora no es crearlo', async () => {
    existentes = ['ev1']
    const res = await guardarEvento({ hora: '17:00' })
    expect(res.code).toBe(200)
    expect(sembrados).toEqual([])
  })

  it('🔴 un evento SIN origen ⛔ no siembra, y se guarda igual', async () => {
    const res = await guardarEvento({ disparador: null })
    expect(res.code).toBe(200)
    expect(sembrados).toEqual([])
    expect(upserts[0]).toHaveLength(1)
  })

  it('🔴 Stunned es una LÍNEA de Zattia: el pendiente del evento cae en zattia', async () => {
    await guardarEvento({}, 'stunned')
    expect(sembrados[0].marca).toBe('zattia')
  })

  it('🔴 el LOTE de eventos ⛔ no siembra nada', async () => {
    const res = await guardar({
      store: 'bdi',
      kind: 'sesion-evento',
      solicitudes: [evento(), evento({ id: 'ev2' })],
    })
    expect(res.code).toBe(200)
    expect(sembrados).toEqual([])
    expect(upserts[0]).toHaveLength(2)
  })
})

/**
 * La regla, llamada DIRECTO. El handler la usa para decidir y el atajo de arriba (`unaSola`) sólo
 * evita una consulta: 🔑 **quien contesta «¿esto siembra?» es esta función**, así que un `kind` que
 * ⛔ no sea de sesión de fotos tiene que dar `null` acá también — el día que alguien la llame desde
 * otro handler, el filtro ⛔ no viaja con ella.
 */
describe('siembraDeSesion, la regla sola', () => {
  it('un kind que ⛔ no es de sesión de fotos ⛔ no siembra, aunque tenga origen', async () => {
    const { siembraDeSesion } = await import('@/lib/sesionfotos/evento.core.js')
    expect(siembraDeSesion('solicitudesinternas', sesion())).toBeNull()
    expect(siembraDeSesion('cualquiera', sesion())).toBeNull()
  })

  it('sin id ⛔ no siembra: la clave sería «sesion-fotos·undefined» para todas', async () => {
    const { siembraDeSesion } = await import('@/lib/sesionfotos/evento.core.js')
    expect(siembraDeSesion('sesion-evento', evento({ id: '' }))).toBeNull()
  })
})
