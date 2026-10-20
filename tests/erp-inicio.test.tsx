// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { resultadoDelMes, tramosDelMes } from '../api/_erp-inicio.js'

/**
 * **ERP › Inicio.** El oráculo: el tramo del mes pasado es el MISMO pedazo (del 1 al mismo día), el estado de la venta
 * ⛔ se filtra (`lib/crm/metricas.ts` §2), y «Para hacer» pone el número de la vista de cada lista (su mismo núcleo).
 */
describe('el resultado del mes', () => {
  it('el mes pasado, del 1 al mismo día (o al último si es más corto); enero mira diciembre', () => {
    expect(tramosDelMes('2026-10-19')).toEqual({ mes: { desde: '2026-10-01', hasta: '2026-10-19' }, anterior: { desde: '2026-09-01', hasta: '2026-09-19' } })
    expect(tramosDelMes('2026-03-31').anterior).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(tramosDelMes('2027-01-05').anterior).toEqual({ desde: '2026-12-01', hasta: '2026-12-05' })
  })

  it('suma vendido − costo y ⛔ filtra por estado', async () => {
    const sqls: string[] = []
    const db = { query: async (s: string, p?: string[]) => { sqls.push(s); return { rows: s.includes('max(date_sale)') ? [{ hasta: '2026-10-19' }] : [{ ventas: p![0] === '2026-10-01' ? 10 : 8, vendido: 1000, costo: 400, sin_costo: 1 }] } } }
    const r = await resultadoDelMes({ marca: 'bdi', hoy: '2026-10-19' }, { conMotor: async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(db) }) as { mes: { margen: number; ventas: number }; anterior: { ventas: number } }
    expect(r.mes).toMatchObject({ margen: 600, ventas: 10 })
    expect(r.anterior.ventas).toBe(8)
    expect(sqls.join(' ')).not.toContain('sale_state')
    expect(await resultadoDelMes({ marca: 'x' }, { conMotor: async () => null })).toMatchObject({ status: 400 })
  })
})

const RES = { mes: { desde: '2026-10-01', hasta: '2026-10-19', ventas: 637, vendido: 29525438, costo: 9690802, sinCosto: 3, margen: 19834636 }, anterior: { desde: '2026-09-01', hasta: '2026-09-19', ventas: 753, vendido: 36035252, costo: 12575031, sinCosto: 7, margen: 23460221 }, gnHasta: '2026-10-19' }
vi.mock('@/lib/erp/cliente', () => ({
  leerResultadoDelMes: async () => RES,
  leerListaDeVentas: async () => ({ filas: [{ estadoKey: 'a_preparar', cobroKey: 'sinpagar', kind: 'venta', tipo: 'venta', anulada: false, facturada: false }] }),
  leerListaDeStock: async () => { throw new Error('El stock del ERP todavía no está conectado') },
  leerListaDeProductos: async () => ({ filas: [{ disponible: 1, tn: 'si', costo: null, precios: { mayorista: null }, proveedor: null, sinBarra: false }] }),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'bdi', perfil: { name: 'bruno' } }) }))

let root: Root | null = null
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })

describe('la pantalla', () => {
  it('el resultado arriba y «Para hacer» con el número de cada vista; la lista que falla lo dice', async () => {
    const { InicioErp } = await import('@/components/erp/inicio/InicioErp')
    const host = document.createElement('div'); document.body.appendChild(host)
    await act(async () => { root = createRoot(host); root.render(<InicioErp href={(s, p) => `/erp/${s}/${p}`} />) })
    await act(async () => {})
    const t = host.textContent ?? ''
    expect(t).toContain('Resultado comercial del mes')
    expect(t).toContain('-18%') // 29,5 M contra 36,0 M
    expect(t).toContain('67% de lo vendido')
    const fila = (que: string) => [...host.querySelectorAll('a')].find((a) => a.textContent?.startsWith(que))!
    expect(fila('Ventas a preparar').textContent).toMatch(/1$/)
    expect(fila('Ventas a preparar').getAttribute('href')).toBe('/erp/ventas/ventas')
    expect(fila('Pedidos sin pagar').textContent).toMatch(/1$/)
    expect(fila('Productos sin costo').textContent).toMatch(/1$/)
    expect(fila('Prendas en negativo').textContent).toContain('no se pudo')
  })
})
