/**
 * 🩱 El CAMBIO de una bikini en el servidor (Bruno 21/22-nov, `reglas-vigentes.md`): una parte sola sale SÓLO en otro talle de la misma
 * parte que vuelve sola, y a lo que vale en la bikini; si no, se lleva la bikini entera. Lo que no se ve si falla: la cajera entrega una
 * bombacha suelta (en TN ⛔ existe sola: el stock de las combinaciones queda mal), o la cobra a cualquier precio.
 * Lo que VUELVE lo frena el motor (`CONJUNTO_INCOMPLETO`, test del motor); acá, lo que SE LLEVA y lo que queda escrito en el cambio.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REGLAS_INICIALES } from '../lib/caja/core.core.js'

type Fila = Record<string, unknown>
/** Bikini MADDIE · Camo en TN: corpiño 100 (S=1, M=2) + bombacha 200 (S=1, M=2), $49.990; sin costo ⇒ mitad y mitad (24.995). */
const KITS = [[901, 1, 1], [902, 1, 2], [903, 2, 1], [904, 2, 2]].flatMap(([v, cs, bs]) => [
  { variant_id: v, n: 1, product_id: 100, size_id: cs, cantidad: 1, precio: '49990', precio_promocional: null, valores: [], producto: 'Bikini MADDIE · Camo', product_name: 'CORPIÑO MADDIE CAMO', size_name: cs === 1 ? 'S' : 'M' },
  { variant_id: v, n: 2, product_id: 200, size_id: bs, cantidad: 1, precio: '49990', precio_promocional: null, valores: [], producto: 'Bikini MADDIE · Camo', product_name: 'BOMBACHA MADDIE CAMO', size_name: bs === 1 ? 'S' : 'M' },
])
let kits: Fila[] | 'roto' = KITS
/** La venta original: la bikini 902 (corpiño S + bombacha M) vendida por la Caja. */
const LINEAS = [
  { id: '11111111-1111-4111-8111-111111111111', product_id: 100, size_id: 1, cantidad: 1, importe: 24995 },
  { id: '22222222-2222-4222-8222-222222222222', product_id: 200, size_id: 2, cantidad: 1, importe: 24995 },
]
const DETALLE = { conjuntos: [{ variant_id: 902, nombre: 'Bikini MADDIE · Camo', cantidad: 1, piezas: [{ product_id: 100, size_id: 1, cantidad: 1 }, { product_id: 200, size_id: 2, cantidad: 1 }] }] }

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, in: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(ok) }
      return q
    },
  }),
}))

vi.mock('pg', () => ({
  default: {
    Client: class {
      async connect() {}
      async end() {}
      async query(sql: string) {
        if (/to_regclass\('public.tn_kit_pieza'\)/.test(sql)) { if (kits === 'roto') throw new Error('se cortó'); return { rows: [{ hay: true }] } }
        if (/from tn_kit_pieza/.test(sql)) return { rows: kits }
        if (/to_regclass\('public.productos'\)/.test(sql)) return { rows: [{ espejo: false, tabla: false }] }
        if (/from erp_corte/.test(sql)) return { rows: [{ linea: 'zattia', instante: '2026-11-21T16:00:00Z' }] }
        if (/select prueba, marca from venta where id/.test(sql)) return { rows: [{ prueba: false, marca: 'zattia' }] }
        if (/select detalle from venta where id/.test(sql)) return { rows: [{ detalle: DETALLE }] }
        if (/select id, product_id, size_id from venta_linea/.test(sql)) return { rows: LINEAS }
        if (/select id, cantidad, importe from venta_linea/.test(sql)) return { rows: LINEAS }
        return { rows: [] }
      }
    },
  },
}))

const registrarCambio = vi.fn()
vi.mock('../motor/venta/registrar.mjs', () => ({ registrarCambio: (...a: unknown[]) => registrarCambio(...a), registrarVenta: vi.fn() }))
vi.mock('../api/_caja-reglas.js', () => ({ reglasGuardadas: async () => REGLAS_INICIALES, reglasDeHoy: async () => REGLAS_INICIALES, feriaDeCampanias: async () => ({}) }))

process.env.DATABASE_URL_ZATTIA = 'postgres://u:p@127.0.0.1:5432/z'
process.env.ZATTIA_SUPABASE_URL = 'https://z.example'
process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'k'

const { cambiarVentaPropia } = await import('../api/_erp.js')
const { conjuntosDeCaja } = await import('../api/_caja-motor.js')

let n = 0
const id = () => `0f8fad5b-d9cb-469f-a165-${String(80867728950 + ++n).padStart(12, '0')}`
const VENTA = '33333333-3333-4333-8333-333333333333'
type It = { product_id: number; size_id: number; cantidad: number; precio: number; conjunto?: object }
const cambio = (devuelve: number[], items: It[]) => cambiarVentaPropia({
  marca: 'zattia', usuario: 'Cajera',
  body: { id: id(), ventaId: VENTA, devueltas: devuelve.map((i) => ({ lineaId: LINEAS[i].id, cantidad: 1 })), items, pagos: [] },
}) as Promise<{ status?: number; error?: string; ok?: boolean }>
const suelta = (pid: number, sid: number, precio = 24995): It => ({ product_id: pid, size_id: sid, cantidad: 1, precio })
const parte = (vid: number, nn: number, pid: number, sid: number): It => ({ ...suelta(pid, sid), conjunto: { variant_id: vid, n: nn, nombre: 'Bikini MADDIE · Camo' } })

beforeEach(() => {
  kits = KITS
  registrarCambio.mockReset()
  registrarCambio.mockResolvedValue({ ok: true, venta: { id: 'c1', numero: 1 }, a_favor: 0, saldo: null, nc_pendiente: false, ya_existia: false })
})

describe('🩱 el cambio de una bikini: lo que se lleva', () => {
  it('el catálogo de la Caja: cada parte con lo que vale y su nombre y talle por separado', async () => {
    const r = await conjuntosDeCaja('zattia') as { conjuntos: Array<{ variant_id: number; piezas: Array<{ precio: number; producto: string; talle: string }> }> }
    const b = r.conjuntos.find((c) => c.variant_id === 902)
    expect(b?.piezas.map((p) => [p.producto, p.talle, p.precio])).toEqual([['CORPIÑO MADDIE CAMO', 'S', 24995], ['BOMBACHA MADDIE CAMO', 'M', 24995]])
  })

  it('vuelve el corpiño S solo ⇒ sale el corpiño M solo, a lo que vale la parte', async () => {
    expect(await cambio([0], [suelta(100, 2)])).toMatchObject({ ok: true })
    expect(registrarCambio).toHaveBeenCalledTimes(1)
  })

  it('vuelve el corpiño S solo ⇒ ⛔ una bombacha sola, ⛔ el mismo talle, ⛔ dos corpiños, ⛔ a otro precio', async () => {
    expect(await cambio([0], [suelta(200, 1)])).toMatchObject({ status: 400, error: expect.stringMatching(/Sola se lleva sólo para cambiar el talle/) })
    expect(await cambio([0], [suelta(100, 1)])).toMatchObject({ status: 400, error: expect.stringMatching(/Sola se lleva sólo/) })
    expect(await cambio([0], [{ ...suelta(100, 2), cantidad: 2 }])).toMatchObject({ status: 400, error: expect.stringMatching(/más partes sueltas/) })
    expect(await cambio([0], [suelta(100, 2, 30000)])).toMatchObject({ status: 400, error: expect.stringMatching(/lo que vale en la bikini/) })
    expect(registrarCambio).not.toHaveBeenCalled()
  })

  it('vuelve la bikini completa ⇒ ⛔ una parte suelta; ✅ otra bikini entera, que queda escrita en el cambio', async () => {
    expect(await cambio([0, 1], [suelta(100, 2)])).toMatchObject({ status: 400 })
    expect(await cambio([0, 1], [parte(904, 1, 100, 2)])).toMatchObject({ status: 400, error: expect.stringMatching(/faltan partes/) })
    expect(await cambio([0, 1], [parte(904, 1, 100, 2), parte(904, 2, 200, 2)])).toMatchObject({ ok: true })
    expect(registrarCambio.mock.calls[0][1].detalle).toEqual({ conjuntos: [{ variant_id: 904, nombre: 'Bikini MADDIE · Camo', cantidad: 1, piezas: [{ product_id: 100, size_id: 2, cantidad: 1 }, { product_id: 200, size_id: 2, cantidad: 1 }] }] })
  })

  it('sin poder leer las bikinis: un cambio que se lleva una ⛔ se registra (503); uno sin bikini sigue', async () => {
    kits = 'roto'
    expect(await cambio([0, 1], [parte(904, 1, 100, 2), parte(904, 2, 200, 2)])).toMatchObject({ status: 503 })
    expect(await cambio([0, 1], [{ product_id: 300, size_id: 1, cantidad: 1, precio: 20000 }])).toMatchObject({ ok: true })
    expect(registrarCambio).toHaveBeenCalledTimes(1)
  })
})
