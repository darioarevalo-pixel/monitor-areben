import { describe, expect, it } from 'vitest'
import { devolverBdi, filasDevolucionBdi, grupoBdi } from '@/lib/reposicion/devolucionBdi'
import { propuesta } from '@/lib/reposicion/solicitud'
import type { FilaVentas } from '@/lib/reposicion/porVentas'

// ACID CASE (queda 1) y AG GLASS CASE BLACK (se cierra), cruzados el 10-nov-2026.
const QUEDA = '337213'
const CIERRA = '1006898'

const fila = (pid: string, sid: string, local: number): FilaVentas =>
  ({ it: { vid: `${pid}_${sid}`, pid, name: `P${pid}`, size: 'iPhone 15', sku: '', local, deposito: 0, cat: '' }, d: { devolver: 99, vendidas: 0, dias: 60 } }) as unknown as FilaVentas

describe('devolución grande de BDI', () => {
  it('se cierra: vuelve todo; queda 1: todo menos 1 por modelo; el resto, nada', () => {
    expect(grupoBdi(CIERRA)).toBe('cierra')
    expect(grupoBdi(QUEDA)).toBe('queda-1')
    expect(devolverBdi(CIERRA, 3)).toBe(3)
    expect(devolverBdi(QUEDA, 3)).toBe(2)
    expect(devolverBdi(QUEDA, 1)).toBe(0)
    expect(devolverBdi(QUEDA, -2)).toBe(0)
    expect(devolverBdi('1', 5)).toBe(0)
  })

  it('la propuesta separa los dos grupos, primero lo que se cierra', () => {
    const filas = filasDevolucionBdi([fila(QUEDA, '1', 4), fila(CIERRA, '1', 2), fila('1', '1', 9)])
    const g = propuesta(filas, {}, undefined, grupoBdi)
    expect(g.map((x) => [x.pid, x.prioridad, x.sobra])).toEqual([
      [CIERRA, 'cierra', 2],
      [QUEDA, 'queda-1', 3],
    ])
  })
})
