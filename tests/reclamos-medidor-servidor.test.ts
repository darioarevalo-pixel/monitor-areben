import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * **El medidor, del lado del servidor** (§5 del plan del 30-ago-2026).
 *
 * 🔴 **Lo que se fija acá es QUÉ LE PIDE A LA BASE**, y ⛔ no el número: la regla ya tiene sus
 * tests. Este handler baja dos tablas enteras, y las dos formas de romperlo son **silenciosas**:
 *
 * 1. **Paginar sin `order`.** Medido contra la base de BDI el 30-ago-2026: pedir las ventas por
 *    páginas de 1.000 **sin orden** devolvió **4.694 filas con 3.554 ids únicos** —repitió unas y
 *    se comió otras— y agosto pasó de **283 ventas online a 89**. Un denominador chico **infla** el
 *    cociente ⇒ el modo de falla de este número es **exagerar el problema, callado**. Y `date_sale`
 *    ⛔ no sirve de orden: se repite decenas de veces por día.
 * 2. **Pedir `channel_id`.** La tabla de Zattia ⛔ no tiene esa columna y PostgREST rechaza el
 *    `select` **entero** por una que no existe ⇒ el medidor de una marca muere y el de la otra no.
 *
 * Y una tercera, que es la que hace hablar a los ceros: **el primer reclamo registrado se pregunta
 * sobre la tabla ENTERA**, ⛔ no sobre la ventana de seis meses. Preguntado adentro de la ventana,
 * el mes más viejo siempre parecería el primero con registro.
 */

/** Lo que contesta la base, y lo que el handler le pidió, tabla por tabla. */
const mundo = {
  filas: {} as Record<string, Record<string, unknown>[]>,
  /** Tabla → mensaje de error de PostgREST, para el caso en que la base ⛔ no contesta. */
  falla: {} as Record<string, string>,
  pedido: [] as { tabla: string; select?: string; order?: [string, unknown]; gte?: [string, unknown]; limit?: number; rangos: [number, number][] }[],
}

function fakeSupabase() {
  const desde = (tabla: string) => {
    const p = { tabla, rangos: [] as [number, number][] } as (typeof mundo.pedido)[number]
    mundo.pedido.push(p)
    const datos = () => (mundo.falla[tabla]
      ? { data: null, error: { message: mundo.falla[tabla] } }
      : { data: mundo.filas[tabla] || [], error: null })
    const api: Record<string, unknown> = {
      select: (c: string) => { p.select = c; return api },
      eq: () => api,
      gte: (c: string, v: unknown) => { p.gte = [c, v]; return api },
      order: (c: string, o?: unknown) => { p.order = [c, o]; return api },
      limit: (n: number) => { p.limit = n; return api },
      // `leerTodo` corta cuando una página vuelve con menos de 1.000: la primera ya alcanza.
      range: async (a: number, b: number) => { p.rangos.push([a, b]); return datos() },
      maybeSingle: async () => (mundo.falla[tabla]
        ? { data: null, error: { message: mundo.falla[tabla] } }
        : { data: (mundo.filas[tabla] || [])[0] || null, error: null }),
      then: (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) => Promise.resolve(datos()).then(ok, mal),
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
const ADMIN = { name: 'Bruno', admin: true, cuenta: null, acceso: {}, funcion: ['administracion'] }

async function pedirMedidor(store = 'bdi') {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil: ADMIN }) })))
  const { default: handler } = await import('../api/_reclamos.js')
  const res = resFalso()
  await handler({ method: 'GET', headers: { 'x-monitor-auth': sobre({ user: 'x', pass: 'y' }) }, query: { store, vista: 'medidor' }, body: null }, res)
  return res
}

const pedidoA = (tabla: string, i = 0) => mundo.pedido.filter((p) => p.tabla === tabla)[i]

beforeEach(() => {
  mundo.filas = { devoluciones: [], ventas: [] }
  mundo.falla = {}
  mundo.pedido = []
  vi.stubEnv('SUPABASE_URL', 'https://ejemplo.supabase.co')
  vi.stubEnv('SUPABASE_KEY', 'llave-de-mentira')
  vi.stubEnv('ZATTIA_SUPABASE_URL', 'https://zattia.supabase.co')
  vi.stubEnv('ZATTIA_SUPABASE_KEY', 'llave-de-mentira')
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('lo que el medidor le pide a la base', () => {
  it('🔴 pide las VENTAS ordenadas por `id`, ⛔ no por `date_sale` ni sin orden', () => {
    return pedirMedidor().then(() => {
      expect(pedidoA('ventas').order?.[0]).toBe('id')
    })
  })

  it('🔴 pide los RECLAMOS ordenados por `id`', async () => {
    await pedirMedidor()
    expect(pedidoA('devoluciones').order?.[0]).toBe('id')
  })

  it('🔴 pide las dos por páginas, ⛔ no con un `limit` que corta en 1.000', async () => {
    await pedirMedidor()
    expect(pedidoA('ventas').rangos.length).toBeGreaterThan(0)
    expect(pedidoA('devoluciones').rangos.length).toBeGreaterThan(0)
    expect(pedidoA('ventas').limit).toBeUndefined()
  })

  it('🔴 ⛔ NO pide `channel_id`: la tabla de Zattia ⛔ no tiene esa columna y el select entero se cae', async () => {
    await pedirMedidor('zattia')
    expect(pedidoA('ventas').select).toContain('channel')
    expect(pedidoA('ventas').select).not.toContain('channel_id')
  })

  it('🔴 el PRIMER reclamo registrado se pregunta sobre la tabla entera, ⛔ no sobre la ventana', async () => {
    await pedirMedidor()
    // Tres consultas: reclamos de la ventana, ventas de la ventana, y el primero de todos.
    const aDevoluciones = mundo.pedido.filter((p) => p.tabla === 'devoluciones')
    expect(aDevoluciones.length).toBe(2)
    const primero = aDevoluciones[1]
    expect(primero.limit).toBe(1)
    expect(primero.order).toEqual(['created_at', { ascending: true }])
    expect(primero.gte).toBeUndefined()
  })

  /**
   * 🔴 **Este handler corre en Vercel, o sea en UTC.** Entre las 21:00 y las 24:00 del último día
   * del mes, `new Date()` allá ya está en el mes siguiente: la ventana se correría un mes entero
   * —se cae el más viejo y entra uno que ⛔ todavía no existe— y el «mes en curso» quedaría en cero
   * sobre cero. Es el mismo borde que ya hizo que un test de la Agenda se pusiera rojo **sólo de
   * noche**. Lo cazó un mutante: hasta acá ⛔ nadie miraba esta línea.
   */
  it('🔴 a las 23:00 del 31 de agosto en Argentina, el mes en curso sigue siendo AGOSTO', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T02:00:00Z')) // 23:00 del 31-ago acá
    try {
      const res = await pedirMedidor()
      const meses = res.body?.meses as { mes: string; enCurso: boolean }[]
      expect(meses[meses.length - 1].mes).toBe('2026-08')
      expect(meses[0].mes).toBe('2026-03')
    } finally {
      vi.useRealTimers()
    }
  })

  it('la ventana arranca el primer día del mes más viejo, en las dos tablas', async () => {
    await pedirMedidor()
    const desde = String(pedidoA('ventas').gte?.[1])
    expect(desde).toMatch(/^\d{4}-\d{2}-01$/)
    expect(String(pedidoA('devoluciones').gte?.[1])).toBe(`${desde}T00:00:00Z`)
  })
})

describe('lo que contesta', () => {
  it('🔑 corre la regla de verdad: seis meses, con el cociente del mes en curso', async () => {
    mundo.filas = {
      devoluciones: [
        { estado: 'resuelto', created_at: '2026-08-26T14:00:00Z' },
        { estado: 'borrador', created_at: '2026-08-27T14:00:00Z' },
        { estado: 'anulado', created_at: '2026-08-28T14:00:00Z' },
      ],
      ventas: Array.from({ length: 100 }, () => ({ date_sale: '2026-08-15', channel: 'Tienda Nube' })),
    }
    const res = await pedirMedidor()
    expect(res.code).toBe(200)
    const meses = res.body?.meses as { mes: string; ventas: number; reclamos: number; cada100: number | null; enCurso: boolean }[]
    expect(meses.length).toBe(6)
    const enCurso = meses.filter((m) => m.enCurso)
    expect(enCurso.length).toBe(1)
    // El `anulado` ⛔ no cuenta, y el fixture cae todo en agosto: si el mes en curso es agosto,
    // el cociente sale; si el test corre otro mes, agosto queda como un mes cerrado más.
    const agosto = meses.find((m) => m.mes === '2026-08')
    if (agosto) {
      expect(agosto.reclamos).toBe(2)
      expect(agosto.ventas).toBe(100)
      expect(agosto.cada100).toBe(2)
    }
  })

  /**
   * ⚠️ **Un medidor que ⛔ no pudo medir tiene que romper, ⛔ no contestar cero.** Si la lectura de
   * ventas falla —la marca sin credenciales, la tabla sin permiso— un `0` en el denominador se
   * dibujaría como «no hubo ventas online», que es una afirmación sobre el negocio.
   */
  it('🔴 si la base falla, contesta 500 y ⛔ no un medidor en cero', async () => {
    // La misma base de mentira, pero la lectura de `ventas` contesta el error de PostgREST.
    mundo.falla.ventas = 'permission denied for table ventas'
    const res = await pedirMedidor()
    expect(res.code).toBe(500)
    expect(String(res.body?.error)).toContain('permission denied')
    expect(res.body?.meses).toBeUndefined()
  })
})
