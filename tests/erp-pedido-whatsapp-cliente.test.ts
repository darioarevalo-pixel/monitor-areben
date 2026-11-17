import { describe, expect, it, vi } from 'vitest'

/**
 * El cliente sin WhatsApp en su ficha toma el del pedido (Darío 17-nov: Lucila Reales, nueva sin número, llegó a Logística
 * sin teléfono). ⛔ pisa uno que ya tenga, ⛔ toca la ficha general «Pedido mayorista» y ⛔ frena nada si falla.
 */
const poner = vi.fn(async () => ({ ok: true }))
vi.mock('../motor/venta/cliente.mjs', () => ({
  ponerContactoCliente: poner,
  esFichaSinCliente: (id: string) => id === 'general',
}))

import { whatsappDesdeElPedido } from '../api/_erp-pedido.js'

const base = (rows: unknown[]) => ({ query: vi.fn(async () => ({ rows })) })

describe('whatsappDesdeElPedido', () => {
  it('completa la ficha vacía con el teléfono de la nota del pedido', async () => {
    poner.mockClear()
    await whatsappDesdeElPedido(base([{ empresa_id: 'areben', cliente_id: 'c1', telefono: '3834063111' }]) as never, 'p1')
    expect(poner).toHaveBeenCalledWith(expect.anything(), { empresa_id: 'areben', cliente_id: 'c1', whatsapp: '3834063111' })
  })
  it('con WhatsApp ya cargado la consulta no devuelve nada y no se toca', async () => {
    poner.mockClear()
    await whatsappDesdeElPedido(base([]) as never, 'p1')
    expect(poner).not.toHaveBeenCalled()
  })
  it('la ficha general «Pedido mayorista» no se toca', async () => {
    poner.mockClear()
    await whatsappDesdeElPedido(base([{ empresa_id: 'areben', cliente_id: 'general', telefono: '3834063111' }]) as never, 'p1')
    expect(poner).not.toHaveBeenCalled()
  })
  it('si la base falla, no tira', async () => {
    const db = { query: vi.fn(async () => { throw new Error('caída') }) }
    await expect(whatsappDesdeElPedido(db as never, 'p1')).resolves.toBeUndefined()
  })
})
