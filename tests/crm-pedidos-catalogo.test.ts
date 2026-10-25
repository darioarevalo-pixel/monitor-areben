import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-fetch', () => ({ apiFetch: vi.fn() }))
const { armarFilasPedidos, claveContacto, yaLeEscribiste } = await import('@/lib/crm/pedidos-catalogo')
const { indexarEscritos } = await import('@/lib/crm/escritos')

/**
 * «Pidieron hoy y ayer» del panel (20-oct-2026): ¿le escribiste DESPUÉS del pedido?
 */
const pedido = (fecha: string, telefono = '+54 9 223 555-1234') => ({ fecha, cliente: 'X', telefono, total: 1000, unidades: 10 })
const seg = (iso: string) => Date.parse(iso) / 1000

describe('yaLeEscribiste', () => {
  it('con la hora del último mensaje: cuenta sólo si fue después del pedido', () => {
    const p = pedido('2026-10-19T23:00:00Z')
    expect(yaLeEscribiste(p, new Map([['22355512', seg('2026-10-19T23:30:00Z')]]), new Set())).toBe(false) // otro número
    expect(yaLeEscribiste(p, new Map([['35551234', seg('2026-10-19T23:30:00Z')]]), new Set())).toBe(true)
    expect(yaLeEscribiste(p, new Map([['35551234', seg('2026-10-19T22:00:00Z')]]), new Set())).toBe(false)
  })

  it('con una extensión vieja (sin horas) cae en «le escribiste hoy»', () => {
    const p = pedido('2026-10-19T23:00:00Z')
    expect(yaLeEscribiste(p, null, indexarEscritos(['5492235551234']))).toBe(true)
    expect(yaLeEscribiste(p, null, new Set())).toBe(false)
  })
})

describe('armarFilasPedidos', () => {
  it('los sin hablar arriba, el más nuevo primero, y marca los de ayer', () => {
    const today = new Date(2026, 9, 20, 15, 0)
    const lista = [
      pedido(new Date(2026, 9, 19, 22, 0).toISOString(), '1111 1111'),
      pedido(new Date(2026, 9, 20, 9, 0).toISOString(), '2222 2222'),
      pedido(new Date(2026, 9, 20, 11, 0).toISOString(), '3333 3333'),
    ]
    const ultimos = new Map([['33333333', Date.parse(new Date(2026, 9, 20, 12, 0).toISOString()) / 1000]])
    const f = armarFilasPedidos(lista, false, today, ultimos, new Set())
    expect(f.map((x) => x.telefono)).toEqual(['2222 2222', '1111 1111', '3333 3333'])
    expect(f.map((x) => x.ayer)).toEqual([false, true, false])
    expect(f[2].hablado).toBe(true)
  })
})

describe('✓ Contactado a mano (25-oct-2026)', () => {
  it('lo tildado cuenta como contactado, separado de lo que vio WhatsApp', () => {
    const today = new Date(2026, 9, 25, 15, 0)
    const a = pedido(new Date(2026, 9, 25, 9, 0).toISOString(), '1111 1111')
    const b = pedido(new Date(2026, 9, 25, 10, 0).toISOString(), '2222 2222')
    const ultimos = new Map([['22222222', Date.parse(new Date(2026, 9, 25, 11, 0).toISOString()) / 1000]])
    const f = armarFilasPedidos([a, b], false, today, ultimos, new Set(), new Set([claveContacto(a)]))
    const fa = f.find((x) => x.telefono === '1111 1111')!
    const fb = f.find((x) => x.telefono === '2222 2222')!
    expect([fa.hablado, fa.marcado, fa.auto]).toEqual([true, true, false])
    expect([fb.hablado, fb.marcado, fb.auto]).toEqual([true, false, true])
  })

  it('la clave usa los últimos 8 dígitos: el mismo pedido con otro formato de número cae igual', () => {
    const fecha = '2026-10-25T12:00:00Z'
    expect(claveContacto(pedido(fecha, '+54 9 223 555-1234'))).toBe(claveContacto(pedido(fecha, '2235551234')))
  })
})
