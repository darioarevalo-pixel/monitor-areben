import { beforeEach, describe, expect, it, vi } from 'vitest'

const cobrosDe = vi.fn()
const reintentar = vi.fn()
vi.mock('../motor/venta/cobros.mjs', () => ({ cobrosDe: (...a: unknown[]) => cobrosDe(...a) }))
vi.mock('../motor/venta/contraentrega.mjs', () => ({ contraentregasAbiertas: async () => ({ abiertas: [] }) }))
vi.mock('../motor/tn/entrega.mjs', () => ({ reintentarEntregas: (...a: unknown[]) => reintentar(...a) }))

import { cobrosDelPeriodo, reintentarEntregasErp } from '../api/_erp-cobros.js'

/** Anota los parámetros de cada consulta y contesta lo justo. */
function base(params: unknown[][]) {
  return {
    query: async (sql: string, p: unknown[] = []) => {
      params.push(p)
      if (sql.includes('con032')) return { rows: [{ con032: false }] }
      if (sql.includes('from marca')) return { rows: (p[0] as string[]).map((id) => ({ id, empresa_id: 'areben' })) }
      if (sql.includes('to_regclass')) return { rows: [{ hay: true }] }
      if (sql.includes('as n')) return { rows: [{ n: 0 }] }
      return { rows: [] }
    },
  }
}
const conMotor = (db: unknown) => async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(db)

describe('Cobros: cada línea ve lo suyo (Bruno, 30-oct)', () => {
  beforeEach(() => { cobrosDe.mockReset(); reintentar.mockReset() })

  it('mirando Stunned, el motor y «el otro libro» se piden SÓLO de Stunned; sin la línea, 400', async () => {
    cobrosDe.mockResolvedValue({ ok: true, cobros: [], totales: {} })
    const params: unknown[][] = []
    await cobrosDelPeriodo({ marca: 'zattia', linea: 'stunned', desde: '2026-10-01', hasta: '2026-10-31' }, { conMotor: conMotor(base(params)) })
    expect(cobrosDe.mock.calls.map((c) => c[1].marca)).toEqual(['stunned'])
    expect(params.filter((p) => Array.isArray(p[0])).every((p) => JSON.stringify(p[0]) === '["stunned"]')).toBe(true)
    expect(await cobrosDelPeriodo({ marca: 'zattia', linea: '', desde: '2026-10-01', hasta: '2026-10-31' }, { conMotor: conMotor(base([])) })).toMatchObject({ status: 400 })
  })

  it('«Reintentar el cobro» reintenta sólo la tienda de la lista', async () => {
    reintentar.mockResolvedValue({ revisadas: 1, registradas: 1, siguen: [] })
    await reintentarEntregasErp({ marca: 'zattia', linea: 'stunned' }, { conMotor: conMotor(base([])) })
    expect(reintentar.mock.calls.map((c) => c[0].tienda)).toEqual(['stunned'])
  })
})
