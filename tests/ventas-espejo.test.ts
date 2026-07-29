import { describe, it, expect } from 'vitest'
import { mapVentaRow, extraerClientesDeVentas, dedupById, guardarVentasBatch } from '../scripts/lib/ventas-espejo.mjs'

/**
 * El mapeo del espejo de ventas, ahora compartido por BDI, Zattia y la purga histórica.
 * Lo que se prueba es la deriva que justificó unificarlo: que `completo` sea la ÚNICA
 * diferencia entre marcas, y que el padrón de clientes se quede con la versión más
 * reciente de cada uno.
 */

/* mapVentaRow vive en un .mjs sin tipos y devuelve dos formas distintas según
   `completo`. TS infiere la unión y no deja leer las columnas que solo tiene la
   completa, así que las lecturas del test pasan por acá. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fila = (x: unknown) => x as any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const venta = (extra: any = {}) => ({
  id: 1, number: '100', date_sale: '2026-07-01', total_price: 5000, channel: 'Showroom',
  sale_state: 'Entregado', payment_method: 'Efectivo', store: 'Central', client_name: 'Ana',
  ...extra,
})

describe('mapVentaRow', () => {
  it('completo trae cliente, costo y ganancia; reducido solo las 9 columnas viejas', () => {
    const v = venta({ client_id: 7, total_cost: 3000, profit: 2000, items_sold: 2 })

    const completo = mapVentaRow(v)
    expect(fila(completo).total_cost).toBe(3000)
    expect(fila(completo).client_id).toBe(7)
    expect(Object.keys(completo)).toHaveLength(19)

    const reducido = mapVentaRow(v, { completo: false })
    expect(Object.keys(reducido)).toHaveLength(9)
    expect('total_cost' in reducido).toBe(false)
    expect(fila(reducido).client_name).toBe('Ana') // el nombre sí, que la columna existe
  })

  it('el costo en 0 se guarda como 0 y no como vacío (?? y no ||)', () => {
    // Con `||` un costo de 0 se volvía null y la venta pasaba a "sin costo".
    expect(fila(mapVentaRow(venta({ total_cost: 0, profit: 0 }))).total_cost).toBe(0)
  })
})

describe('extraerClientesDeVentas', () => {
  it('de un cliente con varias compras queda la versión de la venta más reciente', () => {
    const clientes = extraerClientesDeVentas([
      venta({ id: 1, client_id: 7, client_city: 'Rosario', date_sale: '2025-01-01' }),
      venta({ id: 2, client_id: 7, client_city: 'Córdoba', date_sale: '2026-07-01' }),
    ])
    expect(clientes).toHaveLength(1)
    expect(clientes[0].city).toBe('Córdoba')
  })

  it('la venta sin cliente no inventa un registro en el padrón', () => {
    expect(extraerClientesDeVentas([venta({ client_id: null })])).toHaveLength(0)
  })
})

describe('dedupById', () => {
  it('con el mismo id repetido gana el último (la paginación de GN repite filas)', () => {
    expect(dedupById([{ id: 1, v: 'a' }, { id: 1, v: 'b' }, { id: 2, v: 'c' }]))
      .toEqual([{ id: 1, v: 'b' }, { id: 2, v: 'c' }])
  })
})

describe('guardarVentasBatch', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function mock(): any {
    const escrito: Record<string, unknown[]> = { ventas: [], clientes: [], venta_detalles: [] }
    return {
      escrito,
      from(tabla: string) {
        return { async upsert(filas: unknown[]) { escrito[tabla].push(...filas); return { error: null } } }
      },
    }
  }

  it('guarda ventas, clientes y renglones de un lote crudo de GN', async () => {
    const sb = mock()
    const r = await guardarVentasBatch(sb, [
      venta({ id: 1, client_id: 7, detalles: [{ id: 10, product_id: 100, quantity: 1 }] }),
      venta({ id: 2, client_id: 7, detalles: [{ id: 11, product_id: 101, quantity: 3 }] }),
    ])

    expect(r).toEqual({ ventas: 2, detalles: 2, clientes: 1 })
    expect(sb.escrito.ventas).toHaveLength(2)
    expect(sb.escrito.venta_detalles).toHaveLength(2)
    expect(sb.escrito.clientes).toHaveLength(1) // el mismo cliente en dos ventas es uno solo
  })

  it('sin `completo` no toca la tabla clientes (Zattia todavía no la tiene)', async () => {
    const sb = mock()
    const r = await guardarVentasBatch(sb, [venta({ client_id: 7 })], { completo: false })

    expect(r.clientes).toBe(0)
    expect(sb.escrito.clientes).toHaveLength(0)
  })

  it('la misma venta repetida en el lote se guarda una sola vez', async () => {
    const sb = mock()
    const filas = [venta({ id: 1, detalles: [{ id: 10 }] }), venta({ id: 1, detalles: [{ id: 10 }] })]
    const r = await guardarVentasBatch(sb, filas)

    expect(r.ventas).toBe(1)
    expect(r.detalles).toBe(1)
  })
})
