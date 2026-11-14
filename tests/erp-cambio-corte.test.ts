/**
 * El cambio SUELTO (venta de Gestión Nube o sin ticket) por el CORTE de la línea (`erp_corte`), ⛔ «sólo Stunned» con
 * `CAJA_STUNNED_PRUEBA`. Lo que no se ve si falla: BDI sigue sin poder cambiar después de su corte, un cambio de Zattia entra
 * a Areben Gestión antes del suyo (y el libro lo descuenta con GN también), o se cuela de prueba uno real.
 *
 * Las 3 marcas × antes/después de su corte, por venta de GN y sin ticket. La línea sale del PRODUCTO, ⛔ del SKU de la pantalla.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REGLAS_INICIALES } from '../lib/caja/core.core.js'

type Fila = Record<string, unknown>
const tablas: Record<string, Fila[]> = {}
let cortes: Array<{ linea: string; instante: string }> = []
let ventaOriginal: { prueba: boolean; marca: string } | null = null
const consultas: Array<{ sql: string; params: unknown[] }> = []

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      const filtros: Array<(f: Fila) => boolean> = []
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros.push((f) => String(f[c]) === String(v)); return q },
        in: (c: string, vs: unknown[]) => { filtros.push((f) => vs.map(String).includes(String(f[c]))); return q },
        limit: () => q,
        maybeSingle: async () => ({ data: (tablas[tabla] || []).filter((f) => filtros.every((x) => x(f)))[0] ?? null, error: null }),
        then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve({ data: (tablas[tabla] || []).filter((f) => filtros.every((x) => x(f))), error: null }).then(ok),
      }
      return q
    },
  }),
}))

vi.mock('pg', () => ({
  default: {
    Client: class {
      async connect() {}
      async end() {}
      async query(sql: string, params: unknown[] = []) {
        consultas.push({ sql, params })
        if (/from erp_corte/.test(sql)) return { rows: cortes }
        if (/select prueba, marca from venta where id/.test(sql)) return { rows: ventaOriginal ? [ventaOriginal] : [] }
        return { rows: [] }
      }
    },
  },
}))

const registrarCambio = vi.fn()
vi.mock('../motor/venta/registrar.mjs', () => ({ registrarCambio: (...a: unknown[]) => registrarCambio(...a) }))
vi.mock('../api/_caja-reglas.js', () => ({ reglasGuardadas: async () => REGLAS_INICIALES, reglasDeHoy: async () => REGLAS_INICIALES, feriaDeCampanias: async () => ({}) }))
vi.mock('../api/_erp-pin.js', async (orig) => ({ ...(await orig<Record<string, unknown>>()), autorizarConPin: async () => ({ autoriza: { usuario: 'Encargada', motivo: 'pin_encargada' } }) }))

process.env.DATABASE_URL_ZATTIA = 'postgres://u:p@127.0.0.1:5432/z'
process.env.DATABASE_URL_BDI = 'postgres://u:p@127.0.0.1:5432/b'
process.env.ZATTIA_SUPABASE_URL = 'https://z.example'
process.env.ZATTIA_SUPABASE_SERVICE_KEY = 'k'
process.env.SUPABASE_URL = 'https://b.example'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
process.env.SUPABASE_SERVICE_KEY = 'k'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://b.example'

const { cambiarVentaPropia, ventaGnDeCambio } = await import('../api/_erp.js')

const STUNNED = { linea: 'stunned', instante: '2026-10-28T23:00:00Z' }
const BDI = { linea: 'bdi', instante: '2026-11-16T03:00:00Z' }
const ZATTIA = { linea: 'zattia', instante: '2026-11-24T03:00:00Z' }
/** Los cortes de HOY (31-oct) en cada base: sólo Stunned. */
const HOY = [STUNNED]

let n = 0
const id = () => `0f8fad5b-d9cb-469f-a165-${String(70867728950 + ++n).padStart(12, '0')}`
const cambio = (marca: string, extra: object) => cambiarVentaPropia({ marca, usuario: 'Cajera', body: { id: id(), items: [], pagos: [], ...extra } }) as Promise<{ status?: number; error?: string; ok?: boolean }>
const desdeGn = (marca: string, devuelve: number, lleva: number[] = []) =>
  cambio(marca, { gnVentaId: '30930', devueltas: [{ productId: devuelve, sizeId: 10, cantidad: 1, sku: 'STU-PANTALLA' }], items: lleva.map((p) => ({ product_id: p, size_id: 10, cantidad: 1, precio: 10000, sku: 'STU-PANTALLA' })) })
const sinTicket = (marca: string, devuelve: number, lleva: number[] = []) =>
  cambio(marca, { sinTicket: true, pin: '1234', pinPersona: 'Encargada', devueltas: [{ productId: devuelve, sizeId: 10, cantidad: 1, precio: 10000 }], items: lleva.map((p) => ({ product_id: p, size_id: 10, cantidad: 1, precio: 10000 })) })
const registrado = () => registrarCambio.mock.calls.map((c) => ({ marca: c[1].marca, prueba: c[1].prueba }))

beforeEach(() => {
  // El reloj DESPUÉS de los tres cortes: qué línea está en Areben Gestión lo dicen sólo las filas de `erp_corte` de cada test.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'))
  registrarCambio.mockReset()
  registrarCambio.mockResolvedValue({ ok: true, venta: { id: 'c1', numero: 1 }, a_favor: 0, saldo: null, nc_pendiente: false, ya_existia: false })
  consultas.length = 0
  // Zattia: 1 y 3 son de Stunned (el 3 por el PROVEEDOR: sin SKU, como el drop del 7-sep), 2 y 4 de Zattia. BDI: 7 y 8.
  tablas.productos = [{ id: 1, sku: 'STU-1', proveedor: null }, { id: 2, sku: 'ZA-2', proveedor: null }, { id: 3, sku: null, proveedor: 'STUNNED' }, { id: 4, sku: 'ZA-4', proveedor: null }]
  tablas.inventario = [
    { product_id: 1, size_id: 10, sku: 'STU-1-S' }, { product_id: 2, size_id: 10, sku: 'ZA-2-S' }, { product_id: 3, size_id: 10, sku: null }, { product_id: 4, size_id: 10, sku: 'ZA-4-S' },
    { product_id: 7, size_id: 10, sku: 'B-7' }, { product_id: 8, size_id: 10, sku: 'B-8' },
  ]
  tablas.ventas = [{ id: 30930, number: 30930, date_sale: '2026-11-10', total_price: 30000, client_name: 'Ana', sale_state: 'Confirmada' }]
  tablas.venta_detalles = [
    { sale_id: 30930, product_id: 1, size_id: 10, size: 'S', product_name: 'Remera Stunned', quantity: 1, unit_price: 10000, total: 10000 },
    { sale_id: 30930, product_id: 2, size_id: 10, size: 'S', product_name: 'Jean Zattia', quantity: 1, unit_price: 10000, total: 10000 },
    { sale_id: 30930, product_id: 7, size_id: 10, size: 'S', product_name: 'Buzo BDI', quantity: 1, unit_price: 10000, total: 10000 },
  ]
})

afterEach(() => { vi.useRealTimers() })

describe('cambio desde una venta de Gestión Nube, por el corte de la línea', () => {
  it('hoy (sólo Stunned cortó): Stunned pasa REAL; la prenda de Zattia ⛔ (todavía cambia en Gestión Nube)', async () => {
    cortes = HOY
    expect(await desdeGn('zattia', 1, [3])).toMatchObject({ ok: true })
    expect(registrado()).toEqual([{ marca: 'stunned', prueba: false }])
    expect(await desdeGn('zattia', 2, [4])).toMatchObject({ status: 400, error: expect.stringMatching(/todavía cambia allá/) })
    expect(registrarCambio).toHaveBeenCalledTimes(1)
  })

  it('BDI antes de su corte ⛔; después, REAL con marca bdi', async () => {
    cortes = HOY
    expect(await desdeGn('bdi', 7, [8])).toMatchObject({ status: 409, error: expect.stringMatching(/no tiene productos de/) })
    cortes = [STUNNED, BDI]
    expect(await desdeGn('bdi', 7, [8])).toMatchObject({ ok: true })
    expect(registrado()).toEqual([{ marca: 'bdi', prueba: false }])
  })

  it('después del corte de Zattia: Zattia REAL; un cambio que mezcla Zattia y Stunned ⛔ (una marca por cambio)', async () => {
    cortes = [STUNNED, BDI, ZATTIA]
    expect(await desdeGn('zattia', 2, [4])).toMatchObject({ ok: true })
    expect(await desdeGn('zattia', 2, [3])).toMatchObject({ status: 400, error: expect.stringMatching(/mezcla productos de Zattia y de Stunned/) })
    expect(registrado()).toEqual([{ marca: 'zattia', prueba: false }])
  })

  it('🔴 la línea sale del PRODUCTO, ⛔ del SKU que manda la pantalla («STU-PANTALLA» en todo)', async () => {
    cortes = HOY
    // devuelve Stunned y se lleva el 4 (Zattia) con SKU «STU-…» de la pantalla: frena por mezcla
    expect(await desdeGn('zattia', 1, [4])).toMatchObject({ status: 400, error: expect.stringMatching(/mezcla/) })
    expect(registrarCambio).not.toHaveBeenCalled()
  })

  it('CAJA_STUNNED_PRUEBA ya ⛔ se lee: con 1, Stunned sigue real', async () => {
    cortes = HOY
    process.env.CAJA_STUNNED_PRUEBA = '1'
    try {
      expect(await desdeGn('zattia', 1, [3])).toMatchObject({ ok: true })
    } finally {
      delete process.env.CAJA_STUNNED_PRUEBA
    }
    expect(registrado()).toEqual([{ marca: 'stunned', prueba: false }])
  })
})

describe('cambio sin ticket, por el corte de la línea', () => {
  it('Stunned hoy: REAL (el 3 es de Stunned por su proveedor, sin SKU)', async () => {
    cortes = HOY
    expect(await sinTicket('zattia', 3, [1])).toMatchObject({ ok: true })
    expect(registrado()).toEqual([{ marca: 'stunned', prueba: false }])
  })

  it('Zattia y BDI antes de su corte ⛔ — dicen dónde se hacen', async () => {
    cortes = HOY
    expect(await sinTicket('zattia', 2, [4])).toMatchObject({ status: 400, error: 'Los cambios de Zattia sin venta de Areben Gestión todavía se hacen en Gestión Nube.' })
    expect(await sinTicket('bdi', 7, [8])).toMatchObject({ status: 400, error: 'Los cambios de BDI sin venta de Areben Gestión todavía se hacen en Gestión Nube.' })
    expect(registrarCambio).not.toHaveBeenCalled()
  })

  it('después de su corte, cada una REAL con su marca', async () => {
    cortes = [STUNNED, BDI, ZATTIA]
    expect(await sinTicket('bdi', 7, [8])).toMatchObject({ ok: true })
    expect(await sinTicket('zattia', 2, [4])).toMatchObject({ ok: true })
    expect(registrado()).toEqual([{ marca: 'bdi', prueba: false }, { marca: 'zattia', prueba: false }])
  })
})

describe('ventaGnDeCambio: sólo las líneas cortadas, cada renglón con su línea', () => {
  const leer = (store: string, lineas: string[]) => ventaGnDeCambio({ sb: { from: () => null } as never, db: null as never, store, gnVentaId: '30930', lineas })
  it('sin las líneas cortadas TIRA', async () => {
    await expect(leer('zattia', undefined as never)).rejects.toThrow(/líneas/)
  })
  it('lo ya cambiado se cuenta por las líneas cortadas y sólo lo REAL', async () => {
    cortes = HOY
    await desdeGn('zattia', 1, [3])
    const ya = consultas.find((c) => /cambio_de/.test(c.sql))
    expect(ya?.sql).toMatch(/x\.marca = any\(\$2::text\[\]\)/)
    expect(ya?.sql).toMatch(/x\.prueba = false/)
    expect(ya?.params).toEqual(['30930', ['stunned']])
  })
})

describe('🔴 cambio contra una venta de Areben Gestión DE PRUEBA (revisión 10-nov)', () => {
  const LINEA = '0f8fad5b-d9cb-469f-a165-000000000001'
  const VENTA = '0f8fad5b-d9cb-469f-a165-000000000002'
  const desdeErp = (marca: string) => cambio(marca, { ventaId: VENTA, devueltas: [{ lineaId: LINEA, cantidad: 1 }], items: [] })

  it('con la línea cortada, la copia de prueba ⛔ se cambia (dejaba el cambio de prueba y el stock sin mover)', async () => {
    cortes = [STUNNED, BDI]
    ventaOriginal = { prueba: true, marca: 'bdi' }
    expect(await desdeErp('bdi')).toMatchObject({ status: 409, error: expect.stringMatching(/copia de prueba.*Gestión Nube/) })
    expect(registrarCambio).not.toHaveBeenCalled()
  })

  it('antes del corte de su línea, la de prueba sigue cambiándose de prueba (el paralelo)', async () => {
    cortes = HOY
    ventaOriginal = { prueba: true, marca: 'bdi' }
    await desdeErp('bdi')
    expect(registrado()).toEqual([{ marca: 'bdi', prueba: true }])
  })

  it('una venta REAL de Areben Gestión, con la línea cortada, se cambia real', async () => {
    cortes = [STUNNED, BDI]
    ventaOriginal = { prueba: false, marca: 'bdi' }
    await desdeErp('bdi')
    expect(registrado()).toEqual([{ marca: 'bdi', prueba: false }])
  })
})
