import { beforeEach, describe, expect, it, vi } from 'vitest'

const poner = vi.fn()
vi.mock('../motor/venta/cliente.mjs', () => ({ ponerContactoCliente: (...a: unknown[]) => poner(...a) }))

import { ponerContactoCliente } from '../api/_erp-clientes.js'

const CLIENTE = '6f1c2a3e-1111-4222-8333-444455556666'
/** Un `conMotor` de mentira: corre la función con un pg que devuelve la empresa del cliente (o ninguna). */
const conMotor = (hay = true) => async (_marca: string, _que: string, fn: (pg: unknown) => Promise<unknown>) =>
  fn({ query: async () => ({ rows: hay ? [{ empresa_id: 'areben' }] : [] }) })

describe('poner-contacto', () => {
  beforeEach(() => poner.mockReset())

  it('valida marca, cliente y quién lo carga antes de tocar el motor', async () => {
    expect((await ponerContactoCliente({ marca: 'x', body: {}, usuario: 'a' }, { conMotor: conMotor() })).status).toBe(400)
    expect((await ponerContactoCliente({ marca: 'bdi', body: { clienteId: 'no' }, usuario: 'a' }, { conMotor: conMotor() })).status).toBe(400)
    expect((await ponerContactoCliente({ marca: 'bdi', body: { clienteId: CLIENTE }, usuario: null }, { conMotor: conMotor() })).status).toBe(400)
    expect(poner).not.toHaveBeenCalled()
  })

  it('le pasa al motor la empresa del cliente y devuelve el contacto guardado', async () => {
    poner.mockResolvedValue({ ok: true, cliente: { whatsapp: '5493515551234', email: null } })
    const r = await ponerContactoCliente({ marca: 'bdi', body: { clienteId: CLIENTE, whatsapp: '0351 15 555-1234' }, usuario: 'bruno' }, { conMotor: conMotor() })
    expect(r).toEqual({ ok: true, contacto: { whatsapp: '5493515551234', email: null } })
    expect(poner.mock.calls[0][1]).toMatchObject({ empresa_id: 'areben', cliente_id: CLIENTE, whatsapp: '0351 15 555-1234' })
  })

  it('un cliente que no está da 404 y un número dudoso da 400 con el mensaje del motor', async () => {
    expect((await ponerContactoCliente({ marca: 'bdi', body: { clienteId: CLIENTE, email: 'a@b.com' }, usuario: 'a' }, { conMotor: conMotor(false) })).status).toBe(404)
    poner.mockResolvedValue({ ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'No se puede asegurar ese WhatsApp' } })
    const r = await ponerContactoCliente({ marca: 'bdi', body: { clienteId: CLIENTE, whatsapp: '123' }, usuario: 'a' }, { conMotor: conMotor() })
    expect(r).toEqual({ status: 400, error: 'No se puede asegurar ese WhatsApp' })
  })
})
