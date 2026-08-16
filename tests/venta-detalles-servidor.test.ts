import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Las dos puertas del escalón 3 (pieza A): las líneas de venta con plata salieron del navegador.
 *
 *   `api/_crm.js`         action:'detalles'        → el resumen de compras del modal de un cliente
 *   `api/_liquidacion.js` action:'ventas-campania' → el Resultado de una campaña
 *
 * 🔴 **Este archivo existe por un defecto real, no por completitud.** La acción de Liquidación
 * había quedado DEBAJO del `const id = String(b.id || '')` que comparten las acciones que operan
 * sobre una campaña, así que un request perfectamente válido recibía `400 falta el id de la
 * campaña`. Lint, typecheck, build y los tests del navegador estaban todos en verde: ninguno
 * ejerce el handler. Lo único que lo caza es llamarlo.
 */

// El builder de supabase-js, encadenable. Cada método devuelve el mismo objeto y `range()` —que es
// lo último de las dos consultas— resuelve con las filas que le sembró el caso.
let filasPorTabla: Record<string, unknown[]> = {}
const consultas: { tabla: string; pasos: string[] }[] = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const registro = { tabla, pasos: [] as string[] }
      consultas.push(registro)
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'gte', 'lte', 'order', 'eq', 'not', 'maybeSingle']) {
        q[m] = (...args: unknown[]) => {
          registro.pasos.push(`${m}(${args.map(String).join('|')})`)
          return q
        }
      }
      // Sin paginar de mentira: se devuelve todo en la primera página y `leerTodo` corta solo.
      q.range = (desde: number) =>
        Promise.resolve({ data: desde === 0 ? filasPorTabla[tabla] || [] : [], error: null })
      // El padrón no pagina —un lote de 500 client_id devuelve como mucho 500 filas—, así que su
      // cadena termina en `.in()` y se espera derecho. El builder de supabase-js es "thenable" por
      // eso, y el falso también tiene que serlo o ese camino devuelve el objeto en vez de las filas.
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: filasPorTabla[tabla] || [], error: null }).then(ok)
      return q
    },
  }),
}))

function resFalso() {
  const r = {
    code: 0 as number,
    body: null as Record<string, unknown> | null,
    setHeader() {},
    status(c: number) { r.code = c; return r },
    json(b: unknown) { r.body = b as Record<string, unknown>; return r },
    send(b: string) { r.body = JSON.parse(b) as Record<string, unknown>; return r },
    end() { return r },
  }
  return r
}

const sobre = (d: unknown) => Buffer.from(JSON.stringify(d), 'utf8').toString('base64')

/** El KV contesta que sí con este perfil: la identidad es válida, lo que se prueba es el permiso. */
function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

const pedido = (body: Record<string, unknown>) => ({
  method: 'POST',
  headers: { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) },
  query: {},
  body,
})

async function llamar(modulo: string, req: unknown) {
  const mod = await import(/* @vite-ignore */ modulo)
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

/** Alguien con la sección tildada en BDI y en Zattia. */
const con = (...keys: string[]) => ({
  name: 'Alguien',
  acceso: { bdi: Object.fromEntries(keys.map((k) => [k, true])), zattia: Object.fromEntries(keys.map((k) => [k, true])) },
})

beforeEach(() => {
  filasPorTabla = {}
  consultas.length = 0
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'clave-de-servicio'
})
afterEach(() => vi.unstubAllGlobals())

describe('api/_crm.js — action:detalles', () => {
  const CRM = '@/api/_crm.js'

  it('sin el permiso de Clientes corta con 403', async () => {
    // Es el gate que la anon key no podía tener: hasta ayer estas líneas se las bajaba cualquiera
    // desde afuera, sin siquiera estar logueado.
    sesionDe(con('marketing'))
    const res = await llamar(CRM, pedido({ action: 'detalles', ids: [1] }))
    expect(res.code).toBe(403)
  })

  it('con el permiso devuelve las líneas, con la plata', async () => {
    sesionDe(con('clientes'))
    filasPorTabla.venta_detalles = [{ sale_id: 1, product_name: 'Funda', size: 'U', quantity: 2, unit_price: 5000, total: 9000 }]
    const res = await llamar(CRM, pedido({ action: 'detalles', ids: [1, 1, 0, -3] }))
    expect(res.code).toBe(200)
    expect(res.body?.detalles).toHaveLength(1)
    // Ids repetidos y basura no llegan a la consulta: se concatenan en un `in.(…)`.
    expect(consultas[0].pasos.join(' ')).toContain('in(sale_id|1)')
  })

  it('sin `action` sigue contestando el padrón, que es como nació', async () => {
    // El navegador viejo no manda el campo. Que la acción nueva no le cambie el contrato al que ya
    // estaba es lo que permite deployar sin coordinar los dos lados.
    sesionDe(con('clientes'))
    filasPorTabla.clientes = [{ id: 7, name: 'Ana' }]
    const res = await llamar(CRM, pedido({ ids: [7] }))
    expect(res.code).toBe(200)
    expect(res.body?.clientes).toHaveLength(1)
    expect(res.body?.detalles).toBeUndefined()
  })
})

/**
 * La puerta del escalón 5: las ventas del CRM salieron del navegador.
 *
 * 🔑 **Es la única de las tres columnas con plata que quedaba afuera.** `ventas` sí entró al pase
 * de `api/_espejo.js` —que no pide permiso— pero sólo con `id, date_sale, channel, channel_id`.
 * `total_price`, `client_id` y `sale_state` los lee sólo el CRM, así que van por acá, detrás del
 * mismo gate que el padrón. Si estuvieran en el pase, cualquier usuario con sesión se bajaría la
 * facturación entera sin tener Clientes tildado.
 */
describe('api/_crm.js — action:ventas', () => {
  const CRM = '@/api/_crm.js'

  it('🔴 sin el permiso de Clientes corta con 403, y no toca la base', async () => {
    sesionDe(con('marketing'))
    const res = await llamar(CRM, pedido({ action: 'ventas', modo: 'all' }))
    expect(res.code).toBe(403)
    expect(consultas).toHaveLength(0)
  })

  it('modo «todos»: una consulta, sin filtro de canal', async () => {
    sesionDe(con('clientes'))
    filasPorTabla.ventas = [{ id: 1, date_sale: '2026-07-01', total_price: 10, client_id: 111, channel_id: 10, sale_state: 'ok' }]
    const res = await llamar(CRM, pedido({ action: 'ventas', modo: 'all' }))
    expect(res.code).toBe(200)
    expect(res.body?.ventas).toHaveLength(1)
    expect(consultas).toHaveLength(1)
    const pasos = consultas[0].pasos.join(' ')
    expect(pasos).toContain('not(client_id|is|null)')
    expect(pasos).not.toContain('eq(channel_id')
    // El select trae la plata: es lo que esta puerta existe para servir con permiso.
    expect(pasos).toContain('total_price')
  })

  it('modo Mayorista: el canal MÁS las ventas de los marcados ★, en lotes', async () => {
    sesionDe(con('clientes'))
    filasPorTabla.ventas = [{ id: 1, date_sale: '2026-07-01', total_price: 10, client_id: 111, channel_id: 10, sale_state: 'ok' }]
    const res = await llamar(CRM, pedido({ action: 'ventas', modo: '10', flagged: [111, 222] }))
    expect(res.code).toBe(200)
    expect(consultas).toHaveLength(2)
    expect(consultas[0].pasos.join(' ')).toContain('eq(channel_id|10)')
    expect(consultas[1].pasos.join(' ')).toContain('in(client_id|111,222)')
  })

  it('sin marcados ★ no sale la segunda consulta', async () => {
    sesionDe(con('clientes'))
    await llamar(CRM, pedido({ action: 'ventas', modo: '10', flagged: [] }))
    expect(consultas).toHaveLength(1)
  })

  it('dedupe por id: una venta que está en las dos consultas se cuenta una vez', async () => {
    sesionDe(con('clientes'))
    filasPorTabla.ventas = [{ id: 2, date_sale: '2026-07-01', total_price: 10, client_id: 111, channel_id: 10, sale_state: 'ok' }]
    const res = await llamar(CRM, pedido({ action: 'ventas', modo: '10', flagged: [111] }))
    // Las dos consultas devuelven la misma fila: tiene que salir una sola vez.
    expect(res.body?.ventas).toHaveLength(1)
  })

  it('🔴 el `order` lleva `id` de desempate, o la paginación pierde filas', async () => {
    // `date_sale` es una FECHA y hay decenas de ventas por día: paginar con `range` sobre un orden
    // que empata no está definido — la misma fila puede volver dos veces y otra ninguna. Es la
    // clase de pérdida que no da error, sólo un total más chico.
    sesionDe(con('clientes'))
    await llamar(CRM, pedido({ action: 'ventas', modo: 'all' }))
    const pasos = consultas[0].pasos.join(' ')
    expect(pasos).toContain('order(date_sale|[object Object])')
    expect(pasos).toContain('order(id|[object Object])')
  })

  it('un modo que no es "all" ni un número se rechaza antes de la base', async () => {
    // Se concatena en el filtro de PostgREST: cualquier otra cosa es una inyección en la query.
    sesionDe(con('clientes'))
    for (const modo of ['10; drop', 'all-1', '../ventas', '10.5']) {
      consultas.length = 0
      const res = await llamar(CRM, pedido({ action: 'ventas', modo }))
      expect(res.code, `modo ${modo}`).toBe(400)
      expect(consultas).toHaveLength(0)
    }
  })

  it('los ★ que no son enteros positivos no llegan a la consulta', async () => {
    sesionDe(con('clientes'))
    await llamar(CRM, pedido({ action: 'ventas', modo: '10', flagged: [111, 'abc', -3, 0, 111] }))
    expect(consultas[1].pasos.join(' ')).toContain('in(client_id|111)')
  })
})

describe('api/_liquidacion.js — action:ventas-campania', () => {
  const LIQ = '@/api/_liquidacion.js'

  it('sin el permiso de Liquidación en esa marca corta con 403', async () => {
    sesionDe(con('clientes'))
    const res = await llamar(LIQ, pedido({ store: 'bdi', action: 'ventas-campania', pids: [1], desde: '2026-08-12', hasta: '2026-08-27' }))
    expect(res.code).toBe(403)
  })

  it('contesta 200 y NO "falta el id de la campaña"', async () => {
    // 🔴 EL test de este archivo. Esta acción no opera sobre una campaña —pregunta por unos
    // productos entre dos fechas— y por eso va arriba del guard que exige `id`. Debajo, contestaba
    // 400 con un mensaje que mandaba a buscar el problema al lado equivocado.
    sesionDe(con('liquidacion'))
    filasPorTabla.ventas = [{ id: 10, date_sale: '2026-08-13', channel: 'Local' }]
    filasPorTabla.venta_detalles = [{ sale_id: 10, product_id: 1, quantity: 1, unit_price: 9000, total: 9000 }]
    const res = await llamar(LIQ, pedido({ store: 'bdi', action: 'ventas-campania', pids: [1], desde: '2026-08-12', hasta: '2026-08-27' }))
    expect(res.code).toBe(200)
    expect(res.body?.error).toBeUndefined()
    expect(res.body?.detalles).toHaveLength(1)
  })

  it('el rango se valida antes de tocar la base', async () => {
    sesionDe(con('liquidacion'))
    for (const rango of [
      { desde: '2026-08-27', hasta: '2026-08-12' },
      { desde: 'ayer', hasta: '2026-08-27' },
      { desde: '', hasta: '' },
    ]) {
      consultas.length = 0
      const res = await llamar(LIQ, pedido({ store: 'bdi', action: 'ventas-campania', pids: [1], ...rango }))
      expect(res.code).toBe(400)
      expect(consultas).toHaveLength(0)
    }
  })

  it('sin pids válidos contesta vacío sin consultar', async () => {
    sesionDe(con('liquidacion'))
    const res = await llamar(LIQ, pedido({ store: 'bdi', action: 'ventas-campania', pids: ['abc', -1], desde: '2026-08-12', hasta: '2026-08-27' }))
    expect(res.code).toBe(200)
    expect(res.body?.detalles).toEqual([])
    expect(consultas).toHaveLength(0)
  })

  it('sin ventas en el rango no pregunta por los detalles', async () => {
    // El `sale_id` es el único puente: sin ventas no hay rango de ids que pedir, y preguntar igual
    // sería un `gte.undefined` que PostgREST rechaza.
    sesionDe(con('liquidacion'))
    filasPorTabla.ventas = []
    const res = await llamar(LIQ, pedido({ store: 'bdi', action: 'ventas-campania', pids: [1], desde: '2026-08-12', hasta: '2026-08-27' }))
    expect(res.code).toBe(200)
    expect(consultas.map((c) => c.tabla)).toEqual(['ventas'])
  })
})
