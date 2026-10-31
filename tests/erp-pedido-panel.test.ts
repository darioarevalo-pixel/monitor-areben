import { beforeEach, describe, expect, it, vi } from 'vitest'
import { entradaInvalida } from '@/lib/erp/entrada.core.js'
import { permisoErpDe } from '@/lib/permisos.core.js'

/**
 * El pedido mayorista en el panel de WhatsApp (plan «BDI directo al ERP» paso 3, `api/_erp-pedido.js`): ESCONDIDO detrás de
 * `PANEL_CUENTA_CORRIENTE`, y lo que ESCRIBE además detrás de `VENTA_MAYORISTA_REAL` (hasta el corte, la venta mayorista la
 * registra la copia de Gestión Nube: entrar un pedido acá reservaría dos veces).
 */
const pv = {
  ventaMayoristaRealEn: vi.fn((m: string, env: Record<string, string>) => String(env.VENTA_MAYORISTA_REAL ?? '').split(',').includes(m)),
  pedidosMayoristasDe: vi.fn(), fichaDePedidoMayorista: vi.fn(), preparadosSinPagar: vi.fn(),
  entrarPedidoMayorista: vi.fn(), cambiarPedidoMayorista: vi.fn(), mandarAPreparar: vi.fn(), anularPedidoDelErp: vi.fn(),
}
vi.mock('../motor/pedido/venta.mjs', () => pv)

import { accionDePedido, escribirPrendido, pedidoDelPanel, pedidosDelPanel } from '../api/_erp-pedido.js'

const base = (rows: Record<string, unknown[]>) => ({
  query: async (sql: string) => {
    const k = Object.keys(rows).find((x) => sql.includes(x))
    return { rows: k ? rows[k] : [] }
  },
})
const conMotor = (db: unknown) => async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(db)
const CON064 = { 'information_schema.columns': [{ hay: true }] }
const P = '11111111-1111-4111-8111-111111111111'
const C = '22222222-2222-4222-8222-222222222222'

describe('El pedido mayorista en el panel (paso 3 del plan)', () => {
  beforeEach(() => { for (const f of Object.values(pv)) if (f !== pv.ventaMayoristaRealEn) f.mockReset() })

  it('APAGADO el panel: contesta sin abrir la base', async () => {
    const abrir = vi.fn()
    expect(await pedidosDelPanel({ clienteId: C }, { conMotor: abrir, prendido: false })).toEqual({ prendido: false })
    expect(await pedidoDelPanel({ pedidoId: P }, { conMotor: abrir, prendido: false })).toEqual({ prendido: false })
    expect(await accionDePedido({ accion: 'pedido-a-preparar', body: { pedidoId: P }, usuario: 'bruno' }, { conMotor: abrir, prendido: false, escribir: true })).toMatchObject({ status: 409 })
    expect(abrir).not.toHaveBeenCalled()
  })

  it('ESCRIBIR apagado (VENTA_MAYORISTA_REAL): 409 sin tocar el motor; la llave la lee el motor y un typo ⛔ rompe', async () => {
    const abrir = vi.fn()
    for (const accion of ['pedido-entrar', 'pedido-cambiar', 'pedido-a-preparar', 'pedido-anular']) {
      expect(await accionDePedido({ accion, body: { pedidoId: P }, usuario: 'bruno' }, { conMotor: abrir, prendido: true, escribir: false })).toMatchObject({ status: 409 })
    }
    expect(abrir).not.toHaveBeenCalled()
    expect(await escribirPrendido({} as NodeJS.ProcessEnv)).toBe(false)
    expect(await escribirPrendido({ VENTA_MAYORISTA_REAL: 'bdi' } as unknown as NodeJS.ProcessEnv)).toBe(true)
    pv.ventaMayoristaRealEn.mockImplementationOnce(() => { throw new Error('marca desconocida') })
    expect(await escribirPrendido({ VENTA_MAYORISTA_REAL: 'bid' } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })

  it('sin la sql/064 en la base: vacío, ⛔ rompe el panel', async () => {
    const r = await pedidosDelPanel({ clienteId: C }, { conMotor: conMotor(base({ 'information_schema.columns': [{ hay: false }] })), prendido: true, escribir: true })
    expect(r).toEqual({ prendido: true, escribir: false, pedidos: [], sinEntrar: [], falta064: true })
    expect(pv.pedidosMayoristasDe).not.toHaveBeenCalled()
  })

  it('los pedidos del cliente y los SIN ENTRAR que llegaron con el número del chat (escrito de otra forma)', async () => {
    pv.pedidosMayoristasDe.mockResolvedValue({ ok: true, pedidos: [{ id: 'a', numero: 3 }] })
    const db = base({ ...CON064, 'from pedido_mayorista': [
      { id: 'x', numero: '9', recibido_en: '2026-10-30', total: '1000', unidades: '2', contacto: { telefono: '0341 15 123-4567', nombre: 'Rodrigo' } },
      { id: 'y', numero: '8', recibido_en: '2026-10-29', total: '500', unidades: '1', contacto: { telefono: '351 999 9999' } },
    ] })
    const r = await pedidosDelPanel({ clienteId: C, tel: '5493411234567' }, { conMotor: conMotor(db), prendido: true, escribir: false })
    expect(r).toEqual({ prendido: true, escribir: false, pedidos: [{ id: 'a', numero: 3 }], sinEntrar: [{ id: 'x', numero: 9, recibido_en: '2026-10-30', total: 1000, unidades: 2, nombre: 'Rodrigo' }] })
    expect(pv.pedidosMayoristasDe.mock.calls[0][1]).toEqual({ cliente_id: C, limite: 30 })
  })

  it('la ficha suma nombre y variante a cada renglón', async () => {
    pv.fichaDePedidoMayorista.mockResolvedValue({ ok: true, pedido: { id: P, numero: 3 }, cambios: [], lineas: [{ product_id: 7, size_id: 70, cantidad: 2, precio: 500, stock: 4 }] })
    const db = base({ ...CON064, 'from producto ': [{ id: '7', nombre: 'Funda X' }], 'from variante': [{ product_id: '7', size_id: '70', talle: 'iPhone 15' }] })
    const r = await pedidoDelPanel({ pedidoId: P }, { conMotor: conMotor(db), prendido: true, escribir: true })
    expect(r).toMatchObject({ prendido: true, escribir: true, lineas: [{ nombre: 'Funda X', talle: 'iPhone 15', stock: 4 }] })
    pv.fichaDePedidoMayorista.mockResolvedValue({ ok: false, error: { codigo: 'NO_ENCONTRADO', mensaje: 'No está ese pedido' } })
    expect(await pedidoDelPanel({ pedidoId: P }, { conMotor: conMotor(db), prendido: true, escribir: true })).toEqual({ status: 404, error: 'No está ese pedido' })
  })

  it('las acciones llaman al motor con quién lo hace; los frenos del motor salen como 409', async () => {
    const db = base(CON064)
    const dep = { conMotor: conMotor(db), prendido: true, escribir: true }
    pv.entrarPedidoMayorista.mockResolvedValue({ ok: true, ya: false, venta_id: 'v1' })
    expect(await accionDePedido({ accion: 'pedido-entrar', body: { pedidoId: P, clienteId: C, personaId: 'nada' }, usuario: 'darío' }, dep)).toEqual({ ok: true, ya: false, sinCambios: false, avisarDeposito: false, ventaId: 'v1' })
    expect(pv.entrarPedidoMayorista.mock.calls[0][1]).toEqual({ pedido_id: P, cliente_id: C, persona_id: null, usuario: 'darío' })
    expect(await accionDePedido({ accion: 'pedido-entrar', body: { pedidoId: P }, usuario: 'darío' }, dep)).toMatchObject({ status: 400 })
    pv.cambiarPedidoMayorista.mockResolvedValue({ ok: false, error: { codigo: 'EN_PREPARACION', mensaje: 'El depósito ya empezó' } })
    expect(await accionDePedido({ accion: 'pedido-cambiar', body: { pedidoId: P, lineas: [{ productId: 1, sizeId: 10, cantidad: 2 }] }, usuario: 'darío' }, dep)).toEqual({ status: 409, error: 'El depósito ya empezó' })
    expect(pv.cambiarPedidoMayorista.mock.calls[0][1]).toEqual({ pedido_id: P, lineas: [{ product_id: 1, size_id: 10, cantidad: 2 }], usuario: 'darío' })
    pv.anularPedidoDelErp.mockResolvedValue({ ok: true })
    await accionDePedido({ accion: 'pedido-anular', body: { pedidoId: P, motivo: 'no lo quiere' }, usuario: 'darío' }, dep)
    expect(pv.anularPedidoDelErp.mock.calls[0][1]).toEqual({ pedido_id: P, motivo: 'no lo quiere', usuario: 'darío' })
    expect(await accionDePedido({ accion: 'pedido-a-preparar', body: { pedidoId: P }, usuario: null }, dep)).toMatchObject({ status: 400 })
  })

  it('la puerta: vistas y acciones nombradas con su forma; leer = cuentas, escribir = cobrar', () => {
    const get = (query: Record<string, unknown>) => entradaInvalida({ method: 'GET', query: { recurso: 'erp', nc: '1', ...query } })
    expect(get({ vista: 'pedidos-panel', marca: 'bdi', cliente: C, tel: '5493411234567' })).toBeNull()
    expect(get({ vista: 'pedidos-panel', marca: 'bdi', tel: '+54 341' })).not.toBeNull()
    expect(get({ vista: 'pedido-panel', marca: 'bdi', id: P })).toBeNull()
    expect(get({ vista: 'preparados-sin-pagar', marca: 'bdi' })).toBeNull()
    for (const vista of ['pedidos-panel', 'pedido-panel', 'preparados-sin-pagar']) expect(permisoErpDe({ method: 'GET', vista })).toBe('cuentas')
    const post = (body: unknown) => entradaInvalida({ method: 'POST', query: { recurso: 'erp' }, body })
    for (const accion of ['pedido-entrar', 'pedido-cambiar', 'pedido-a-preparar', 'pedido-anular']) {
      expect(post({ accion, marca: 'bdi', pedidoId: P })).toBeNull()
      expect(permisoErpDe({ method: 'POST', accion })).toBe('cobrar')
    }
  })
})
