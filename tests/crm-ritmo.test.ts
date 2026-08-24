import { describe, it, expect } from 'vitest'
import { MIN_COMPRAS, plazoEnPalabras, ritmoDeCompra, TOPE_DIAS } from '@/lib/crm/ritmo'
import type { FilaVenta } from '@/lib/crm/tipos'

/**
 * La sugerencia de cuándo volver a hablarle.
 *
 * Reemplaza a la cadencia, que era un campo a mantener a mano y que **en 0 de los 771 clientes
 * decidía la fecha**. Lo que se prueba acá es que la cuenta describa lo que el cliente hace y que,
 * cuando no hay con qué decir nada, **diga que no sabe** en vez de inventar un número — que en una
 * pantalla se lee igual de convincente que uno bueno.
 */

const HOY = new Date(2026, 7, 24) // 24-ago-2026

const ventas = (...fechas: string[]): FilaVenta[] =>
  fechas.map((f, i) => ({ id: i + 1, date_sale: f, total_price: 1000, client_id: 1, channel_id: null, sale_state: null }))

describe('ritmoDeCompra', () => {
  it('un cliente parejo: cada 20 días, la última hace 10 → le toca en 10', () => {
    const r = ritmoDeCompra(ventas('2026-06-25', '2026-07-15', '2026-08-04', '2026-08-14'), HOY)
    expect(r).toEqual({ cadaDias: 20, compras: 4, desdeUltima: 10, enDias: 10 })
  })

  it('🔑 usa la MEDIANA: un pedido raro no corre la cuenta', () => {
    // Compra cada 15 días y una vez tardó 8 meses. El promedio daría ~70; lo que describe lo que
    // hace es 15.
    const r = ritmoDeCompra(ventas('2025-10-01', '2026-06-01', '2026-06-16', '2026-07-01', '2026-07-16'), HOY)
    expect(r?.cadaDias).toBe(15)
  })

  it('🔑 dos pedidos el mismo día son UNA compra, no dos', () => {
    // Contarlos como dos metería un intervalo de 0 días y bajaría la mediana sin motivo.
    const r = ritmoDeCompra(ventas('2026-06-24', '2026-07-14', '2026-07-14', '2026-08-03'), HOY)
    expect(r?.compras).toBe(3)
    expect(r?.cadaDias).toBe(20)
  })

  it('el que ya está pasado no sugiere días negativos: le toca ya', () => {
    const r = ritmoDeCompra(ventas('2026-01-01', '2026-01-11', '2026-01-21'), HOY)
    expect(r?.enDias).toBe(0)
    expect(r?.desdeUltima).toBeGreaterThan(200)
  })

  it('🔴 con menos de tres compras dice que NO SABE, no inventa', () => {
    // Con dos compras hay UN intervalo, y un intervalo no es un ritmo. Un número inventado se lee
    // en la pantalla igual de convincente que uno bueno, y ahí se pierde la confianza.
    expect(ritmoDeCompra(ventas('2026-07-01', '2026-08-01'), HOY)).toBe(null)
    expect(ritmoDeCompra(ventas('2026-08-01'), HOY)).toBe(null)
    expect(ritmoDeCompra([], HOY)).toBe(null)
    expect(MIN_COMPRAS).toBe(3)
  })

  it('un ritmo absurdo para "volver a hablarle" tampoco se sugiere', () => {
    // Compra una vez por año: la sugerencia no es de esta pantalla.
    expect(ritmoDeCompra(ventas('2024-01-01', '2025-01-01', '2026-01-01'), HOY)).toBe(null)
    expect(TOPE_DIAS).toBe(120)
  })

  it('las ventas sin fecha o con fecha rota se ignoran, no rompen', () => {
    const sucias: FilaVenta[] = [
      ...ventas('2026-06-25', '2026-07-15', '2026-08-04'),
      { id: 9, date_sale: null, total_price: 1, client_id: 1, channel_id: null, sale_state: null },
      { id: 10, date_sale: 'no es fecha', total_price: 1, client_id: 1, channel_id: null, sale_state: null },
    ]
    expect(ritmoDeCompra(sucias, HOY)?.cadaDias).toBe(20)
  })

  it('la fecha puede venir con hora, como la manda Supabase', () => {
    const r = ritmoDeCompra(ventas('2026-06-25T10:30:00', '2026-07-15T09:00:00', '2026-08-04T18:00:00'), HOY)
    expect(r?.cadaDias).toBe(20)
  })
})

describe('plazoEnPalabras', () => {
  it('lo dice como lo diría una persona', () => {
    expect(plazoEnPalabras(0)).toBe('Ya le toca')
    expect(plazoEnPalabras(1)).toBe('Mañana')
    expect(plazoEnPalabras(3)).toBe('En 3 días')
    expect(plazoEnPalabras(8)).toBe('En 1 semana')
    expect(plazoEnPalabras(20)).toBe('En 2 semanas')
    expect(plazoEnPalabras(22)).toBe('En 3 semanas')
    expect(plazoEnPalabras(30)).toBe('En 1 mes')
    expect(plazoEnPalabras(60)).toBe('En 2 meses')
  })

  it('un plazo pasado no se dice en negativo', () => {
    expect(plazoEnPalabras(-5)).toBe('Ya le toca')
  })
})
