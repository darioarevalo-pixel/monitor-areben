import { describe, it, expect } from 'vitest'
import { cambiosDeStock, registrarCambiosDeStock } from '../scripts/lib/stock-cambios.mjs'

/**
 * La historia de stock. Lo que se prueba es la pregunta del doc de Darío: un 3 → 0 → 2 tiene que
 * dejar rastro del 0, porque el espejo sólo ve el 2 y lo confunde con una variante que nunca se cortó.
 */

const fila = (product_id: number, size_id: number, store_name: string, available_quantity: number) =>
  ({ product_id, size_id, store_name, available_quantity })

describe('cambiosDeStock', () => {
  const antes = new Map([['1|10|Local', 3], ['1|11|Local', 2], ['2|20|Deposito ', 5]])

  it('anota sólo lo que cambió, con antes y después', () => {
    const c = cambiosDeStock(antes, [fila(1, 10, 'Local', 0), fila(1, 11, 'Local', 2), fila(2, 20, 'Deposito ', 5)])
    expect(c).toEqual([{ product_id: 1, size_id: 10, store_name: 'Local', antes: 3, despues: 0 }])
  })

  it('una variante nueva entra con antes null', () => {
    const c = cambiosDeStock(antes, [fila(3, 30, 'Local', 1)])
    expect(c).toEqual([{ product_id: 3, size_id: 30, store_name: 'Local', antes: null, despues: 1 }])
  })

  it('el mismo producto en otro lugar es otra variante', () => {
    const c = cambiosDeStock(antes, [fila(2, 20, 'Local', 5)])
    expect(c[0].antes).toBeNull()
  })

  it('una que dejó de venir ⛔ es un movimiento', () => {
    expect(cambiosDeStock(antes, [])).toEqual([])
  })

  it('el 3 → 0 → 2 deja el 0 en la historia', () => {
    const lunes = new Map([['1|10|Local', 3]])
    const martes = cambiosDeStock(lunes, [fila(1, 10, 'Local', 0)])
    const miercoles = cambiosDeStock(new Map([['1|10|Local', 0]]), [fila(1, 10, 'Local', 2)])
    expect([...martes, ...miercoles].map((c) => c.despues)).toEqual([0, 2])
  })
})

/** Mock mínimo del client de Supabase: el espejo paginado y la tabla donde se inserta. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mock(espejo: any[], { falla = false } = {}): any {
  const insertados: unknown[] = []
  return {
    insertados,
    from(tabla: string) {
      if (tabla === 'stock_cambios') {
        return {
          insert: async (filas: unknown[]) => {
            if (falla) return { error: { message: 'relation "stock_cambios" does not exist' } }
            insertados.push(...filas)
            return { error: null }
          },
        }
      }
      const api = {
        select: () => api,
        order: () => api,
        range: async (desde: number, hasta: number) => ({ data: espejo.slice(desde, hasta + 1), error: null }),
      }
      return api
    },
  }
}

describe('registrarCambiosDeStock', () => {
  it('lee el espejo ENTERO aunque pase las 1.000 filas', async () => {
    const espejo = Array.from({ length: 2500 }, (_, i) => fila(i, 1, 'Local', 1))
    const db = mock(espejo)
    // la última fila del espejo cambia: si la lectura cortara en 1.000, saldría como alta nueva
    const r = await registrarCambiosDeStock(db, [fila(2499, 1, 'Local', 0)], 'diario')
    expect(r).toEqual({ cambios: 1 })
    expect(db.insertados).toMatchObject([{ product_id: 2499, antes: 1, despues: 0, origen: 'diario' }])
  })

  it('con el espejo vacío ⛔ anota nada y lo dice', async () => {
    const db = mock([])
    const r = await registrarCambiosDeStock(db, [fila(1, 1, 'Local', 1)], 'diario')
    expect(r.cambios).toBe(0)
    expect(r.error).toMatch(/vacío/)
    expect(db.insertados).toEqual([])
  })

  it('si la tabla no existe devuelve el error, ⛔ tira', async () => {
    const db = mock([fila(1, 1, 'Local', 1)], { falla: true })
    const r = await registrarCambiosDeStock(db, [fila(1, 1, 'Local', 0)], 'rapido')
    expect(r.error).toMatch(/stock_cambios/)
  })
})
