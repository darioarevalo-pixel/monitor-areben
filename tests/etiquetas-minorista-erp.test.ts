import { describe, it, expect } from 'vitest'
import { conPreciosDelErp } from '@/lib/etiquetas/core'
import { minoristaDelErp } from '../api/_liquidacion-erp.js'

// Bruno 18-nov: en las líneas cortadas (BDI, Stunned) la etiqueta dice el Minorista de Areben Gestión, lo que cobra la Caja.
describe('conPreciosDelErp', () => {
  const tn = { precios: { '1': 7990, '2': 5000, '9': 3000 }, promos: { '2': { normal: 6000, promo: 5000 } }, fueraDeTn: new Set(['1']) }

  it('el Minorista del ERP pisa al de Tienda Nube y tacha el de lista si es mayor', () => {
    const r = conPreciosDelErp(tn, [{ pid: '1', local: 6390, online: 7990 }, { pid: '2', local: 5500, online: 5500 }])
    expect(r.precios['1']).toBe(6390)
    expect(r.promos['1']).toEqual({ normal: 7990, promo: 6390 })
    expect(r.precios['2']).toBe(5500)
    expect(r.promos['2']).toBeUndefined()
    expect(r.fueraDeTn.has('1')).toBe(false)
    expect([...r.delErp].sort()).toEqual(['1', '2'])
  })

  it('el producto nuevo que sólo está en el ERP (huérfano) tiene precio', () => {
    expect(conPreciosDelErp(tn, [{ pid: '1000000188', local: 16990, online: null }]).precios['1000000188']).toBe(16990)
  })

  it('una línea cortada SIN Minorista sale sin precio, ⛔ con el de Tienda Nube', () => {
    const r = conPreciosDelErp(tn, [{ pid: '9', local: null, online: 3000 }])
    expect(r.precios['9']).toBe(0)
    expect(r.promos['9']).toBeUndefined()
  })

  it('sin filas del ERP (Zattia antes del corte, o falló la lectura) queda lo de Tienda Nube', () => {
    expect(conPreciosDelErp(tn, null).precios).toEqual(tn.precios)
    expect(conPreciosDelErp(tn, []).delErp.size).toBe(0)
  })
})

describe('minoristaDelErp', () => {
  const fake = (cortes: Array<{ linea: string; instante: string }>, filas: unknown[]) => {
    const pedidas: unknown[][] = []
    const db = { query: async (sql: string, p?: unknown[]) => (sql.includes('erp_corte') ? { rows: cortes } : (pedidas.push(p ?? []), { rows: filas })) }
    return { deps: { conMotor: async (_b: string, fn: (d: typeof db) => unknown) => fn(db) }, pedidas }
  }

  it('pide sólo las líneas ya cortadas de esa base', async () => {
    const { deps, pedidas } = fake([{ linea: 'stunned', instante: '2026-10-28T23:15:00Z' }], [{ pid: '913507', local: 12990, online: 31490 }])
    const r = await minoristaDelErp('zattia', deps as never)
    expect(r.lineas).toEqual(['stunned'])
    expect(pedidas[0]).toEqual([['stunned']])
    expect(r.precios).toHaveLength(1)
  })

  it('sin corte, ⛔ consulta precios', async () => {
    const { deps, pedidas } = fake([], [])
    expect(await minoristaDelErp('zattia', deps as never)).toEqual({ lineas: [], precios: [] })
    expect(pedidas).toHaveLength(0)
  })
})
