import { describe, expect, it } from 'vitest'
import { clientesConCompras } from '../api/_crm.js'

/** Un supabase de mentira: sólo lo que usa `clientesConCompras`. */
function falso(filas: Record<string, unknown>[]) {
  const q = {
    select: () => q,
    in: (_c: string, ids: number[]) => ({ ...q, _ids: ids }),
    order: () => q,
    range: () => Promise.resolve({ data: filas, error: null }),
  }
  return { from: () => q }
}

describe('clientes repetidos con el mismo número', () => {
  it('Martina: de cuatro altas, la única que compró', async () => {
    const sb = falso([
      { client_id: 445750, channel_id: 10 },
      { client_id: 445750, channel_id: 10 },
    ])
    expect(await clientesConCompras(sb, [445741, 445744, 445750, 445752])).toEqual([445750])
  })

  it('las ventas técnicas no cuentan como compra', async () => {
    const sb = falso([
      { client_id: 1, channel_id: 10 },
      { client_id: 2, channel_id: 12 },
    ])
    expect(await clientesConCompras(sb, [1, 2])).toEqual([1])
  })

  it('si compraron dos, devuelve los dos (y el panel pregunta)', async () => {
    const sb = falso([
      { client_id: 1, channel_id: 10 },
      { client_id: 2, channel_id: 16 },
    ])
    expect(await clientesConCompras(sb, [1, 2])).toEqual([1, 2])
  })
})
