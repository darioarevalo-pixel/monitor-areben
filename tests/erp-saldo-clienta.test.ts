import { describe, it, expect, vi, beforeEach } from 'vitest'

// La ficha es UNA por empresa y documento (contrato §11): el saldo a favor se busca con la empresa de la
// marca. Sin ella, la misma persona con ficha en dos empresas de la base daba `maybeSingle` con dos filas.
const filtros: Array<[string, string, unknown]> = []
type Fila = Record<string, unknown>
const filas: Record<string, Fila[]> = {}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      const eqs: Array<[string, unknown]> = []
      type Q = { select: () => Q, eq: (col: string, v: unknown) => Q, maybeSingle: () => Promise<{ data: Fila | null, error: { message: string } | null }> }
      const q: Q = {
        select: () => q,
        eq: (col: string, v: unknown) => { eqs.push([col, v]); filtros.push([tabla, col, v]); return q },
        maybeSingle: async () => {
          const hay = (filas[tabla] || []).filter((f) => eqs.every(([c, v]) => f[c] === v))
          if (hay.length > 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
          return { data: hay[0] ?? null, error: null }
        },
      }
      return q
    },
  }),
}))

const { saldoDeClienta } = await import('../api/_erp.js')

beforeEach(() => {
  filtros.length = 0
  filas.marca = [{ id: 'zattia', empresa_id: 'e-areben' }, { id: 'bdi', empresa_id: 'e-areben' }]
  filas.cliente = [
    { id: 'c1', nombre: 'Ana', doc: '30111222', empresa_id: 'e-areben' },
    { id: 'c2', nombre: 'Ana (franquicia)', doc: '30111222', empresa_id: 'e-franquicia' },
  ]
  filas.saldo_favor = [{ cliente_id: 'c1', marca: 'zattia', prueba: true, saldo: 4500 }]
})

describe('saldoDeClienta', () => {
  it('busca la ficha en la empresa de la marca, ⛔ en cualquiera', async () => {
    const r = await saldoDeClienta({ marca: 'zattia', doc: '30.111.222' })
    expect(r).toEqual({ cliente: { nombre: 'Ana' }, saldo: 4500 })
    expect(filtros).toContainEqual(['cliente', 'empresa_id', 'e-areben'])
  })

  it('una marca que el motor ⛔ conoce: 409, ⛔ busca sin empresa', async () => {
    filas.marca = []
    const r = await saldoDeClienta({ marca: 'zattia', doc: '30111222' })
    expect(r).toMatchObject({ status: 409 })
    expect(filtros.some(([t]) => t === 'cliente')).toBe(false)
  })
})
