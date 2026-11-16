import { afterEach, describe, expect, it, vi } from 'vitest'
import { calcularAgregado, fechaCorridaPorCompra, PLAZO_SIN_RITMO } from '@/lib/crm/core'
import { correrPorCompra } from '@/lib/crm/seguimiento'
import { olvidarDatos, traerAgenda } from '@/lib/crm/panel'
import type { FilaVenta, MapaSeguimiento } from '@/lib/crm/tipos'

/**
 * 🛒 La compra corre la fecha del próximo contacto (Darío, 15-nov-2026).
 *
 * El caso que lo pidió: un cliente que compró hace 17 días seguía «Atrasado 88 días» porque nadie
 * había tocado la fecha. La excepción: una fecha que todavía no llegó (ej. avisarle de un ingreso)
 * se respeta.
 */

const HOY = new Date(2026, 10, 15) // dom 15-nov-2026

const ventas = (...fechas: string[]): FilaVenta[] =>
  fechas.map((f, i) => ({ id: i + 1, date_sale: f, total_price: 1000, client_id: 7, channel_id: 10, sale_state: null }))

describe('fechaCorridaPorCompra', () => {
  it('compró después de la fecha: pasa a compra + cada cuánto compra', () => {
    // Compra cada 20 días; la fecha era el 19-ago y compró el 29-oct → 18-nov (miércoles).
    expect(fechaCorridaPorCompra('2026-08-19', ventas('2026-09-19', '2026-10-09', '2026-10-29'), HOY)).toBe('2026-11-18')
  })

  it('🔑 una fecha que todavía no había llegado cuando compró se respeta', () => {
    // Le pusiste el 25-nov para avisarle de un ingreso y compró el 12-nov: queda el 25.
    expect(fechaCorridaPorCompra('2026-11-25', ventas('2026-09-19', '2026-10-09', '2026-11-12'), HOY)).toBe(null)
  })

  it('compró el mismo día que tocaba: se corre', () => {
    expect(fechaCorridaPorCompra('2026-11-12', ventas('2026-11-12'), HOY)).toBe('2026-12-14')
  })

  it('sin ritmo (menos de 3 compras) usa un mes, corrido al día hábil', () => {
    expect(PLAZO_SIN_RITMO).toBe(30)
    // 10-nov + 30 = 10-dic (jueves).
    expect(fechaCorridaPorCompra('2026-11-01', ventas('2026-11-10'), HOY)).toBe('2026-12-10')
    // 14-nov + 30 = 14-dic (lunes); 7-nov + 30 = 7-dic (lunes); 5-nov + 30 = 5-dic (sábado) → lunes 7.
    expect(fechaCorridaPorCompra('2026-11-01', ventas('2026-11-05'), HOY)).toBe('2026-12-07')
  })

  it('sin fecha no se inventa una, y sin compras no se mueve nada', () => {
    expect(fechaCorridaPorCompra(null, ventas('2026-11-10'), HOY)).toBe(null)
    expect(fechaCorridaPorCompra('2026-11-01', [], HOY)).toBe(null)
  })

  it('una compra vieja (antes de la fecha) no la mueve: sigue atrasado', () => {
    expect(fechaCorridaPorCompra('2026-11-01', ventas('2026-10-01'), HOY)).toBe(null)
  })
})

describe('Clientes y la ficha (calcularAgregado)', () => {
  it('el atrasado que compró queda agendado', () => {
    const crmSeg: MapaSeguimiento = { 7: { proximo_manual: '2026-08-19', notas: [] } }
    const { activos } = calcularAgregado({
      ventas: ventas('2026-09-19', '2026-10-09', '2026-10-29'),
      clientes: { 7: { id: 7, name: 'Local Ejemplo', email: '', phone: '', city: '', province: '' } },
      crmSeg,
      crmTelOverride: {},
      today: HOY,
    })
    expect(activos[0].proximo_contacto).toBe('2026-11-18')
    expect(activos[0].seg_estado).toBe('semana')
  })
})

describe('correrPorCompra (lo que se guarda)', () => {
  it('corre la fecha sin tocar el último contacto', () => {
    const m: MapaSeguimiento = { 7: { proximo_manual: '2026-08-19', ultimo_contacto: '2026-08-01', notas: [] } }
    const r = correrPorCompra(m, [{ id: 7, de: '2026-08-19', a: '2026-11-18' }])
    expect(r[7]).toEqual({ proximo_manual: '2026-11-18', ultimo_contacto: '2026-08-01', notas: [] })
  })

  it('🔴 si alguien cambió la fecha mientras tanto, gana la persona', () => {
    const m: MapaSeguimiento = { 7: { proximo_manual: '2026-11-20', notas: [] } }
    expect(correrPorCompra(m, [{ id: 7, de: '2026-08-19', a: '2026-11-18' }])).toBe(m)
  })

  it('no crea clientes que no estaban', () => {
    const m: MapaSeguimiento = {}
    expect(correrPorCompra(m, [{ id: 7, de: '2026-08-19', a: '2026-11-18' }])).toEqual({})
  })
})

describe('la Agenda (traerAgenda)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    olvidarDatos()
  })

  it('el que compró sale de los atrasados y vuelve la corrida para guardarla', async () => {
    vi.stubGlobal('fetch', (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          clientes: body.ids.map((id: number) => ({
            id,
            name: 'C' + id,
            phone: '',
            total_amount: 0,
            // El 7 compró después de su fecha; el 8 no compró nada desde entonces.
            compras: id === 7 ? ['2026-10-29', '2026-10-09', '2026-09-19'] : ['2026-07-01'],
          })),
        }),
      })
    })
    const crmSeg: MapaSeguimiento = {
      7: { proximo_manual: '2026-08-19', notas: [] },
      8: { proximo_manual: '2026-08-19', notas: [] },
    }
    const r = await traerAgenda(crmSeg, HOY)
    if (!r.ok) throw new Error(r.motivo)
    expect(r.lista.map((f) => f.id)).toEqual([8])
    expect(r.corridas).toEqual([{ id: 7, de: '2026-08-19', a: '2026-11-18' }])
  })
})
