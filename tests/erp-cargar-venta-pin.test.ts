import { beforeEach, describe, expect, it, vi } from 'vitest'

const verificarPin = vi.fn()
vi.mock('../motor/stock/pin.mjs', () => ({ verificarPin: (...a: unknown[]) => verificarPin(...a) }))

import { cargarVentaManual } from '../api/_erp-cargar.js'

const body = {
  linea: 'zattia', origen_ref: '0f8fad5b-d9cb-469f-a165-70867728950e', canal: 'local', deposito: 'local',
  cliente: { doc: '900000001', nombre: 'PRUEBA FIFO' },
  lineas: [{ producto: '101', talle: '7', cantidad: 1, precio: 1000 }], pagos: [{ cuenta: 'cc', monto: 1000 }],
}
const frenada = { ok: false, error: { codigo: 'SIN_CREDITO', mensaje: 'El cliente no tiene crédito: la venta a cuenta necesita el PIN de un admin' } }
const registrarVenta = vi.fn()
const conMotor = async (_m: string, _q: string, fn: (db: unknown, m: unknown) => Promise<unknown>) => fn({ query: async () => ({ rows: [] }) }, { registrarVenta })

describe('Cargar venta: el PIN de admin salta el freno de la venta a cuenta', () => {
  beforeEach(() => { verificarPin.mockReset(); registrarVenta.mockReset() })

  it('sin PIN: el freno vuelve con su CÓDIGO para que la pantalla pida el PIN', async () => {
    registrarVenta.mockResolvedValue(frenada)
    const r = await cargarVentaManual({ marca: 'zattia', body, usuario: 'Bruno', persona: 'bruno' }, { conMotor }) as { status: number; codigo: string }
    expect(r.status).toBe(409)
    expect(r.codigo).toBe('SIN_CREDITO')
    expect(verificarPin).not.toHaveBeenCalled()
    expect(registrarVenta.mock.calls[0][1].autoriza).toBeUndefined()
  })

  it('con PIN correcto: el `autoriza` lo arma el SERVIDOR con la persona de la sesión', async () => {
    verificarPin.mockResolvedValue({ ok: true, usuario: 'bruno' })
    registrarVenta.mockResolvedValue({ ok: true, venta: { id: 'v', numero: 9, total: 1000, prueba: true } })
    const r = await cargarVentaManual({ marca: 'zattia', body: { ...body, pin: '1234', autoriza: { motivo: 'pin_admin', usuario: 'otro' } }, usuario: 'Bruno', persona: 'bruno' }, { conMotor }) as { ok: boolean }
    expect(r.ok).toBe(true)
    expect(verificarPin.mock.calls[0][1]).toEqual({ usuario: 'bruno', pin: '1234' })
    expect(registrarVenta.mock.calls[0][1].autoriza).toEqual({ motivo: 'pin_admin', usuario: 'bruno' })
  })

  it('PIN incorrecto: ⛔ escribe la venta y dice por qué', async () => {
    verificarPin.mockResolvedValue({ error: { codigo: 'PIN_INCORRECTO', mensaje: 'PIN incorrecto' } })
    const r = await cargarVentaManual({ marca: 'zattia', body: { ...body, pin: '0000' }, usuario: 'Bruno', persona: 'bruno' }, { conMotor }) as { status: number; error: string }
    expect(r.status).toBe(403)
    expect(r.error).toMatch(/PIN/)
    expect(registrarVenta).not.toHaveBeenCalled()
  })

  it('sin persona en la sesión no hay a quién verificarle el PIN', async () => {
    const r = await cargarVentaManual({ marca: 'zattia', body: { ...body, pin: '1234' }, usuario: null, persona: null }, { conMotor }) as { status: number }
    expect(r.status).toBe(400)
    expect(registrarVenta).not.toHaveBeenCalled()
  })
})
