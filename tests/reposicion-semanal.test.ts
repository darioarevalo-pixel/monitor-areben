import { describe, it, expect } from 'vitest'
import { armarSemanal, esPrimerLunes, TOPE_RENGLONES } from '@/lib/reposicion/semanal.core.js'

const fila = (i: number) => ({ name: `FUNDA ${i}`, size: 'iPhone 17 Pro', porSemana: 1, local: 0, dep: 0 })

describe('el correo de los lunes de BDI (12-oct-2026)', () => {
  it('«sin ventas» va sólo el primer lunes del mes', () => {
    expect(esPrimerLunes('2026-10-05')).toBe(true)
    expect(esPrimerLunes('2026-10-12')).toBe(false)
  })
  it('sin la lista mensual ni el armado: una sola sección y el asunto lo dice', () => {
    const c = armarSemanal({ hoy: '2026-10-12', sinDeposito: [fila(1)], noEncontradas: null, sinVenta: null })
    expect(c.secciones.map((s) => s.titulo)).toEqual(['Para comprar: se vende y no queda en el depósito'])
    expect(c.asunto).toBe('Reposición BDI · semana del 12-oct: 1 sin depósito')
  })
  it('corta en el tope y dice cuántos quedan', () => {
    const c = armarSemanal({ hoy: '2026-10-05', sinDeposito: Array.from({ length: TOPE_RENGLONES + 3 }, (_, i) => fila(i)), noEncontradas: [], sinVenta: [] })
    expect(c.texto).toContain('… y 3 más')
    expect(c.secciones).toHaveLength(3)
    expect(c.html).toContain('Nada: todo lo pedido apareció.')
  })
})
