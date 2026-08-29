import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **El 3º disparador entra por acá: un lanzamiento que queda FIRME siembra sus once renglones.**
 *
 * El manual 08 dice que la lista *«se abre al decidir el lanzamiento, no el día antes»*, y el objeto
 * que dice eso **ya existía**: un hito propio del calendario editorial de tipo `lanzamiento`, con su
 * fecha objetivo. ⛔ No hizo falta inventar un botón ni una pantalla.
 *
 * 🔴 **El hecho es un ESTADO —«quedó firme»—, ⛔ no un alta**, y eso es lo que se prueba acá:
 *
 *  1. **Una fecha proyectada no siembra.** `firme: false` quiere decir «todavía se puede mover», y
 *     colgar once pendientes de una fecha que se mueve es sembrar once fechas equivocadas.
 *  2. **Marcarlo firme después SÍ siembra**, sin que el handler tenga que preguntar si el hito
 *     existía: la idempotencia por clave cubre los dos caminos con el mismo código.
 *  3. **Los otros tipos de hito no siembran nada**: una sesión de fotos o una llegada de mercadería
 *     cargadas en el calendario tienen sus propios disparadores, y sembrar acá los duplicaría.
 */

type Sembrado = Record<string, unknown>
const sembrados: Sembrado[] = []
let respuestaSiembra: Record<string, unknown> = { creados: 11, ya: false }

vi.mock('@/api/_agenda.js', () => ({
  sembrarEnMaestra: async (opts: Sembrado) => { sembrados.push(opts); return respuestaSiembra },
}))

/** Lo que la tabla ya tiene para el id que se guarda (el `maybeSingle` del handler). */
let previo: Record<string, unknown> | null = null
const upserts: Record<string, unknown>[][] = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.order = () => q
    q.maybeSingle = async () => ({ data: previo, error: null })
    q.upsert = async (filas: Record<string, unknown>[]) => { upserts.push(filas); return { data: null, error: null } }
    q.delete = () => q
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
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
const ADMIN = { name: 'Bruno Arevalo', admin: true, cuenta: null, acceso: {}, funcion: ['direccion'] }

const hito = (over: Record<string, unknown> = {}) => ({
  id: 'h9', fecha: '2026-10-01', titulo: 'Cápsula primavera', tipo: 'lanzamiento', firme: true, nota: null, ...over,
})

async function guardar(h: Record<string, unknown>, store = 'bdi') {
  const mod = await import('@/api/_calendario.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(
    {
      method: 'POST',
      headers: { 'x-monitor-auth': sobre({ user: 'bruno', pass: 'p' }), 'content-type': 'application/json' },
      query: {},
      body: { store, hito: h },
    },
    res,
  )
  return res
}

beforeEach(() => {
  sembrados.length = 0
  upserts.length = 0
  previo = null
  respuestaSiembra = { creados: 11, ya: false }
  vi.stubEnv('SUPABASE_URL', 'https://bdi.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_KEY', 'k')
  vi.stubEnv('ZATTIA_SUPABASE_URL', 'https://zattia.supabase.co')
  vi.stubEnv('ZATTIA_SUPABASE_SERVICE_KEY', 'k')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil: ADMIN }) })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('un lanzamiento firme siembra sus renglones', () => {
  it('siembra con la fecha OBJETIVO, la marca y el título del hito, y la clave es su ID', async () => {
    const res = await guardar(hito())
    expect(res.code).toBe(200)
    expect(sembrados).toHaveLength(1)
    expect(sembrados[0]).toMatchObject({
      plantilla: 'lanzamiento',
      nombre: 'Cápsula primavera',
      fecha: '2026-10-01',
      marca: 'bdi',
      clave: 'lanzamiento·h9',
    })
    // ⛔ Sin eje: esta plantilla no tiene, y mandar uno sería inventarle una pregunta.
    expect(sembrados[0].eje).toBeUndefined()
    expect(upserts[0]).toHaveLength(1)
  })

  it('🔴 una fecha PROYECTADA ⛔ no siembra: todavía se puede mover', async () => {
    const res = await guardar(hito({ firme: false }))
    expect(res.code).toBe(200)
    expect(sembrados).toEqual([])
    // Y el hito se guardó igual: lo que no pasó es la siembra.
    expect(upserts[0]).toHaveLength(1)
  })

  it('🔑 marcarlo firme DESPUÉS sí siembra — el hecho es el estado, ⛔ no el alta', async () => {
    previo = { datos: { ...hito({ firme: false }) }, creado_por: 'Bruno Arevalo' }
    const res = await guardar(hito({ firme: true }))
    expect(res.code).toBe(200)
    expect(sembrados).toHaveLength(1)
  })

  it('🔴 `firme` que no es exactamente true ⛔ no siembra: la verdad la dice el handler', async () => {
    // El handler normaliza con `entrada.firme === true`. Un `'true'` de texto o un 1 no alcanzan.
    for (const casi of ['true', 1, 'sí']) {
      sembrados.length = 0
      await guardar(hito({ firme: casi }))
      expect(sembrados, String(casi)).toEqual([])
    }
  })

  it('⛔ los otros tipos de hito no siembran: tienen su propio disparador', async () => {
    for (const tipo of ['sesion-fotos', 'mercaderia', 'mail', 'evento', 'otro']) {
      sembrados.length = 0
      const res = await guardar(hito({ tipo }))
      expect(res.code, tipo).toBe(200)
      expect(sembrados, tipo).toEqual([])
    }
  })

  it('la marca sale del store del calendario, que son las dos de la Agenda', async () => {
    await guardar(hito(), 'zattia')
    expect(sembrados[0].marca).toBe('zattia')
  })

  it('🔴 si sembrar falla, el hito NO se pierde: 200, y el error viaja en la respuesta', async () => {
    respuestaSiembra = { error: 'No hay ningún paso cargado como plantilla de lanzamiento.' }
    const res = await guardar(hito())
    expect(res.code).toBe(200)
    expect(upserts[0]).toHaveLength(1)
    expect(JSON.stringify(res.body?.sembrado)).toContain('plantilla')
  })

  it('cuando sembró, lo cuenta', async () => {
    const res = await guardar(hito())
    expect(res.body?.sembrado).toEqual({ creados: 11, ya: false })
  })
})
