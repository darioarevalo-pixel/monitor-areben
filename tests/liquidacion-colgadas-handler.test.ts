import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El aviso de ofertas colgadas y el stock de la campaña, **ejercidos contra el handler**.
 *
 * La regla pura ya está fijada en `tests/liquidacion-colgadas.test.ts` y
 * `tests/liquidacion-resultado.test.ts`. Lo que se fija acá es lo otro, que es donde se rompen estas
 * cosas: qué se le pide a la base, cómo se desduplica la bitácora, y que el número que sale sea el
 * de las filas que entraron. Un `distinct on` mal armado o un `estado` leído del lado equivocado no
 * los caza ningún test de la función pura.
 *
 * Mismo patrón de mock que `tests/etiquetas-cola-handler.test.ts`.
 */

let filasPorTabla: Record<string, unknown[]> = {}
const consultas: { tabla: string; pasos: string[] }[] = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const registro = { tabla, pasos: [] as string[] }
      consultas.push(registro)
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'in', 'eq', 'order', 'limit', 'insert', 'update', 'upsert']) {
        q[m] = (...args: unknown[]) => {
          registro.pasos.push(`${m}(${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join('|')})`)
          return q
        }
      }
      const unaFila = () => Promise.resolve({ data: (filasPorTabla[tabla] || [])[0] ?? null, error: null })
      q.single = unaFila
      q.maybeSingle = unaFila
      q.range = (desde: number) => Promise.resolve({ data: desde === 0 ? filasPorTabla[tabla] || [] : [], error: null })
      q.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: filasPorTabla[tabla] || [], error: null }).then(ok)
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
const cabecera = { 'x-monitor-auth': sobre({ user: 'Alguien', pass: 'p' }) }
const LIQUIDACION = { name: 'Bruno', admin: false, cuenta: null, acceso: { bdi: { liquidacion: true } }, funcion: [] }

function sesionDe(perfil: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, perfil }) })))
}

async function llamar(req: unknown) {
  const mod = await import(/* @vite-ignore */ '@/api/_liquidacion.js')
  const res = resFalso()
  await (mod.default as (q: unknown, s: typeof res) => Promise<unknown>)(req, res)
  return res
}

const portada = { method: 'GET', query: { store: 'bdi' }, headers: cabecera }

/** Una campaña cerrada, para que lo que quedó escrito en la tienda cuelgue. */
const CERRADA = [{ id: 'liq1', nombre: 'Sale Invierno', estado: 'cerrada', datos: { desde: '2026-08-01', hasta: '2026-08-10' } }]

beforeEach(() => {
  filasPorTabla = {}
  consultas.length = 0
  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_KEY = 'clave-de-servicio'
  sesionDe(LIQUIDACION)
})
afterEach(() => vi.unstubAllGlobals())

describe('la portada de Liquidación · las ofertas colgadas', () => {
  it('devuelve la que quedó escrita con la campaña cerrada, con su stock de hoy', async () => {
    filasPorTabla = {
      liquidaciones: CERRADA,
      liquidacion_items: [{ liq_id: 'liq1', pid: '101', estado: 'aplicado' }],
      liquidacion_bitacora: [
        { pid: '101', producto: 'CAMPERA', sku: 'C-1', liq_id: 'liq1', liq_nombre: 'Sale Invierno', precio_a: 34900, cuando: '2026-08-05T10:00:00.000Z' },
      ],
      inventario: [
        { product_id: 101, available_quantity: 3 },
        { product_id: 101, available_quantity: 2 },
      ],
    }
    const res = await llamar(portada)
    expect(res.code).toBe(200)
    const c = res.body?.colgadas as { colgadas: Record<string, unknown>[]; conStock: number }
    expect(c.colgadas).toHaveLength(1)
    expect(c.colgadas[0].producto).toBe('CAMPERA')
    // Los dos depósitos suman: la pregunta es si la prenda está en algún lado, no en cuál.
    expect(c.colgadas[0].stock).toBe(5)
    expect(c.colgadas[0].seSacaDesdeAca).toBe(true)
    expect(c.conStock).toBe(1)
  })

  it('🔴 manda el ÚLTIMO movimiento de cada producto: el `sacar` posterior lo baja de la lista', async () => {
    // La consulta ordena por fecha descendente, así que la primera fila es la más nueva. Sin la
    // desduplicación, un producto que se puso y después se sacó seguiría colgado para siempre.
    filasPorTabla = {
      liquidaciones: CERRADA,
      liquidacion_items: [{ liq_id: 'liq1', pid: '101', estado: 'aplicado' }],
      liquidacion_bitacora: [
        { pid: '101', producto: 'CAMPERA', sku: 'C-1', liq_id: 'liq1', liq_nombre: 'Sale', precio_a: null, cuando: '2026-08-11T10:00:00.000Z' },
        { pid: '101', producto: 'CAMPERA', sku: 'C-1', liq_id: 'liq1', liq_nombre: 'Sale', precio_a: 34900, cuando: '2026-08-05T10:00:00.000Z' },
      ],
      inventario: [{ product_id: 101, available_quantity: 3 }],
    }
    const res = await llamar(portada)
    expect((res.body?.colgadas as { colgadas: unknown[] }).colgadas).toHaveLength(0)
  })

  it('el que ya no está aplicado en ninguna campaña queda fuera del alcance del botón', async () => {
    filasPorTabla = {
      liquidaciones: CERRADA,
      liquidacion_items: [{ liq_id: 'liq1', pid: '101', estado: 'confirmado' }],
      liquidacion_bitacora: [
        { pid: '101', producto: 'CAMPERA', sku: null, liq_id: 'liq1', liq_nombre: 'Sale', precio_a: 34900, cuando: '2026-08-05T10:00:00.000Z' },
      ],
      inventario: [{ product_id: 101, available_quantity: 1 }],
    }
    const res = await llamar(portada)
    const c = res.body?.colgadas as { colgadas: Record<string, unknown>[] }
    expect(c.colgadas[0].motivo).toBe('fuera-de-alcance')
    expect(c.colgadas[0].seSacaDesdeAca).toBe(false)
  })

  it('sin bitácora no pide el inventario: no hay a quién mirarle el stock', async () => {
    filasPorTabla = { liquidaciones: CERRADA, liquidacion_items: [], liquidacion_bitacora: [] }
    const res = await llamar(portada)
    expect((res.body?.colgadas as { colgadas: unknown[] }).colgadas).toHaveLength(0)
    expect(consultas.some((q) => q.tabla === 'inventario')).toBe(false)
  })

  it('🔑 si el aviso se rompe, la lista de campañas sale igual y el aviso va en `null`', async () => {
    // `null` es «no se pudo saber», que NO es «no hay»: la pantalla no dibuja un aviso vacío que
    // diga que está todo bien. Y la portada no se cae por un aviso — es un cartel arriba de la
    // lista, no la lista. La bitácora que no es una lista rompe `leerTodo` a propósito.
    filasPorTabla = { liquidaciones: CERRADA, liquidacion_items: [], liquidacion_bitacora: 5 as never }
    const res = await llamar(portada)
    expect(res.code).toBe(200)
    expect(res.body?.colgadas).toBeNull()
    expect((res.body?.campanias as unknown[]).length).toBe(1)
  })
})

describe('stock-campania', () => {
  const pedir = (pids: string[]) => ({
    method: 'POST',
    query: { store: 'bdi' },
    headers: cabecera,
    body: { store: 'bdi', action: 'stock-campania', pids },
  })

  it('suma los dos depósitos y dice de cuándo es el número', async () => {
    filasPorTabla = {
      inventario: [
        { product_id: 101, available_quantity: 2 },
        { product_id: 101, available_quantity: 1 },
        { product_id: 102, available_quantity: 0 },
      ],
      sync_state: [{ updated_at: '2026-08-16T06:24:21.123Z' }],
    }
    const res = await llamar(pedir(['101', '102']))
    expect(res.code).toBe(200)
    expect(res.body?.stock).toEqual({ '101': 3, '102': 0 })
    expect(res.body?.leidoEn).toBe('2026-08-16T06:24:21.123Z')
  })

  it('🔑 `leidoEn` es del espejo y no del request: sin `sync_state` va null, no «ahora»', async () => {
    filasPorTabla = { inventario: [{ product_id: 101, available_quantity: 2 }] }
    const res = await llamar(pedir(['101']))
    expect(res.body?.leidoEn).toBeNull()
  })

  it('sin productos no consulta nada', async () => {
    const res = await llamar(pedir([]))
    expect(res.body?.stock).toEqual({})
    expect(consultas.some((q) => q.tabla === 'inventario')).toBe(false)
  })

  it('los pid que no son enteros no llegan al filtro: van adentro de un `in.(…)`', async () => {
    filasPorTabla = { inventario: [] }
    await llamar(pedir(['101', "1 or 1='1"]))
    const inv = consultas.find((q) => q.tabla === 'inventario')
    expect(inv?.pasos.some((p) => p.includes('in(product_id|[101])'))).toBe(true)
  })
})
