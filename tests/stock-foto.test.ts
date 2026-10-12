import { describe, it, expect } from 'vitest'
import { fechaAR, filasDeFoto, guardarFotoDelDia } from '../scripts/lib/stock-foto.mjs'

/**
 * La foto diaria del libro de stock. Lo que se prueba es lo que la hace servir para comparar día por
 * día: UNA por día, la PRIMERA (la de las 06:40, con el local cerrado), y el día es el de Argentina.
 */

const fila = (product_id: number, size_id: number, store_name: string, available_quantity: number) =>
  ({ product_id, size_id, store_name, available_quantity })

describe('fechaAR', () => {
  it('a las 01:00 de Argentina sigue siendo el día de Argentina, ⛔ el de UTC', () => {
    expect(fechaAR(new Date('2026-10-13T04:00:00Z'))).toBe('2026-10-13')
    expect(fechaAR(new Date('2026-10-13T02:59:00Z'))).toBe('2026-10-12')
  })
})

describe('filasDeFoto', () => {
  it('guarda sólo lo que no es cero, con el día y la hora de la corrida', () => {
    const ahora = new Date('2026-10-13T09:40:00Z')
    const f = filasDeFoto([fila(1, 10, 'Local', 2), fila(1, 11, 'Local', 0), fila(2, 20, 'Deposito ', -1)], ahora)
    expect(f).toEqual([
      { fecha: '2026-10-13', product_id: 1, size_id: 10, store_name: 'Local', cantidad: 2, tomada_en: '2026-10-13T09:40:00.000Z' },
      // el negativo es un dato (GN lo tiene así) y se guarda como está
      { fecha: '2026-10-13', product_id: 2, size_id: 20, store_name: 'Deposito ', cantidad: -1, tomada_en: '2026-10-13T09:40:00.000Z' },
    ])
  })
})

/** Mock que se comporta como el upsert de Postgres con `ignoreDuplicates`: la clave que ya está ⛔ se pisa. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mock({ falla = false } = {}): any {
  const tabla = new Map<string, Record<string, unknown>>()
  const opciones: unknown[] = []
  return {
    tabla,
    opciones,
    from: () => ({
      upsert: async (filas: Array<Record<string, unknown>>, opts: { ignoreDuplicates?: boolean }) => {
        if (falla) return { error: { message: 'relation "stock_foto" does not exist' } }
        opciones.push(opts)
        for (const f of filas) {
          const k = `${f.fecha}|${f.product_id}|${f.size_id}|${f.store_name}`
          if (tabla.has(k) && opts.ignoreDuplicates) continue
          tabla.set(k, f)
        }
        return { error: null }
      },
    }),
  }
}

describe('guardarFotoDelDia', () => {
  it('🔴 la corrida de mediodía ⛔ pisa la foto de las 06:40', async () => {
    const db = mock()
    await guardarFotoDelDia(db, [fila(1, 10, 'Local', 5)], new Date('2026-10-13T09:40:00Z'))
    await guardarFotoDelDia(db, [fila(1, 10, 'Local', 3)], new Date('2026-10-13T15:10:00Z'))
    expect([...db.tabla.values()]).toMatchObject([{ cantidad: 5, tomada_en: '2026-10-13T09:40:00.000Z' }])
  })

  it('el día siguiente es otra foto', async () => {
    const db = mock()
    await guardarFotoDelDia(db, [fila(1, 10, 'Local', 5)], new Date('2026-10-13T09:40:00Z'))
    await guardarFotoDelDia(db, [fila(1, 10, 'Local', 4)], new Date('2026-10-14T09:40:00Z'))
    expect([...db.tabla.values()].map((f) => f.cantidad)).toEqual([5, 4])
  })

  it('va en lotes de 1.000 y guarda todo', async () => {
    const db = mock()
    const r = await guardarFotoDelDia(db, Array.from({ length: 2500 }, (_, i) => fila(i, 1, 'Local', 1)), new Date('2026-10-13T09:40:00Z'))
    expect(r).toEqual({ filas: 2500 })
    expect(db.tabla.size).toBe(2500)
    expect(db.opciones).toHaveLength(3)
  })

  it('si la tabla no existe devuelve el error, ⛔ tira (el sync sigue)', async () => {
    const r = await guardarFotoDelDia(mock({ falla: true }), [fila(1, 10, 'Local', 1)])
    expect(r.filas).toBe(0)
    expect(r.error).toMatch(/stock_foto/)
  })
})
