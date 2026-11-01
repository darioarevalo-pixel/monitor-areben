import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ID_DESDE_ERP } from '../lib/erp/ventas-espejo.core.js'
import { copiarVentasErp } from '../scripts/lib/erp-ventas-copia.mjs'

/**
 * «Traer las ventas de hoy» (Liquidación y Ventas de Marketing) trae también las del ERP de la línea que ya cortó: la MISMA
 * copia que el sync diario (`scripts/lib/erp-ventas-copia.mjs`), ⛔ otra.
 */
let cortes: Record<string, string> = {}
vi.mock('../api/_caja-corte.js', () => ({ cortesDeCaja: async () => cortes }))
vi.mock('../api/_gn.js', () => ({
  GN_BASE: 'https://gn', GN_TOKENS: { bdi: 't', zattia: 't' }, PAUSA_GN: 0, dormir: async () => {},
  gnFetch: async () => ({ ok: true, json: async () => ({ data: [], meta: { has_more_pages: false } }) }),
}))

const E = (n: number) => ID_DESDE_ERP + n

function dbFalsa(ventas: unknown[], detalles: unknown[]) {
  return {
    query: async (sql: string) => {
      if (/from erp_corte/.test(sql)) return { rows: [{ linea: 'stunned', instante: '2026-10-28T23:00:00Z' }] }
      if (/information_schema/.test(sql)) return { rows: [['ventas', 'id'], ['ventas', 'total_price'], ['venta_detalles', 'id'], ['venta_detalles', 'sale_id']].map(([t, c]) => ({ table_name: t, column_name: c })) }
      if (/espejo_motor\.ventas/.test(sql)) return { rows: ventas }
      if (/espejo_motor\.venta_detalles/.test(sql)) return { rows: detalles }
      return { rows: [] }
    },
  }
}
function sbFalso(ids: { ventas: number[]; venta_detalles: number[] }) {
  const log: string[] = []
  const sb = {
    from(tabla: 'ventas' | 'venta_detalles') {
      const q = {
        select: () => q, gte: () => q, order: () => q, in: () => q,
        range: async () => ({ data: ids[tabla].map((id) => ({ id })), error: null }),
        upsert: async (filas: unknown[]) => (log.push(`upsert ${tabla} ${filas.length}`), { error: null }),
        delete: () => (log.push(`delete ${tabla}`), q),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
      }
      return q
    },
  }
  return { sb, log }
}

describe('copiarVentasErp: la copia común del sync diario y del botón', () => {
  it('escribe las del ERP y saca la anulada, renglones primero', async () => {
    const { sb, log } = sbFalso({ ventas: [E(1), E(2)], venta_detalles: [E(10), E(20)] })
    const r = await copiarVentasErp(dbFalsa([{ id: E(1), total_price: '100', extra: 1 }], [{ id: E(10), sale_id: E(1) }]), sb)
    expect(r).toMatchObject({ ventas: 1, detalles: 1, sacadas: { ventas: 1, detalles: 1 }, freno: null })
    expect(log).toEqual(['upsert ventas 1', 'upsert venta_detalles 1', 'delete venta_detalles', 'delete ventas'])
  })
  it('seco: ⛔ escribe nada', async () => {
    const { sb, log } = sbFalso({ ventas: [], venta_detalles: [] })
    const r = await copiarVentasErp(dbFalsa([{ id: E(1) }], []), sb, { seco: true })
    expect(r.ventas).toBe(1)
    expect(log).toEqual([])
  })
  it('🔴 con freno: escribe, pero ⛔ saca nada', async () => {
    const muchas = Array.from({ length: 300 }, (_, i) => E(i + 100))
    const { sb, log } = sbFalso({ ventas: muchas, venta_detalles: [] })
    const r = await copiarVentasErp(dbFalsa([{ id: E(1) }], []), sb)
    expect(r.freno).toMatch(/300/)
    expect(log.some((l) => l.startsWith('delete'))).toBe(false)
  })
})

describe('traerVentasDeHoy: también las del ERP', () => {
  beforeEach(() => { cortes = {} })
  const sbVacio = { from: () => ({ upsert: async () => ({ error: null }) }) }
  it('las del ERP vuelven en `erp`', async () => {
    const { traerVentasDeHoy } = await import('../api/_ventas-hoy.js')
    const r = await traerVentasDeHoy(sbVacio, 'zattia', Date.parse('2026-11-01T15:00:00Z'), { erp: async () => ({ ventas: 3, detalles: 4, sacadas: 0, freno: null }) })
    expect(r).toMatchObject({ ok: true, ventas: 0, erp: { ventas: 3 } })
  })
  it('🔴 si la copia del ERP falla, ⛔ ok callado: el error dice que faltan las del ERP', async () => {
    const { traerVentasDeHoy } = await import('../api/_ventas-hoy.js')
    const r = await traerVentasDeHoy(sbVacio, 'zattia', Date.parse('2026-11-01T15:00:00Z'), { erp: async () => { throw new Error('base caída') } })
    expect(r).toMatchObject({ ok: false, status: 502, error: expect.stringMatching(/ERP no: base caída/) })
  })
  it('sin línea cortada en la base ⇒ ⛔ abre el motor (null)', async () => {
    const { traerVentasDelErp } = await import('../api/_ventas-hoy.js')
    cortes = { stunned: '2026-10-28T23:00:00Z' }
    delete process.env.DATABASE_URL_BDI
    expect(await traerVentasDelErp({}, 'bdi')).toBeNull()
  })
  it('con línea cortada y sin la conexión ⇒ TIRA (⛔ null callado)', async () => {
    const { traerVentasDelErp } = await import('../api/_ventas-hoy.js')
    cortes = { stunned: '2026-10-28T23:00:00Z' }
    delete process.env.DATABASE_URL_ZATTIA
    await expect(traerVentasDelErp({}, 'zattia')).rejects.toThrow(/DATABASE_URL_ZATTIA/)
  })
})
