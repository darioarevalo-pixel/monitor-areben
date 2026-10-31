// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **Panel de WhatsApp › «$ Cargar pago»** (plan «BDI directo al ERP», 30-oct). El oráculo es lo que se MANDA (el mismo
 * «Cobrar a la cuenta» de ERP › Clientes: BDI, sin venta, del libro de prueba, con una clave) y lo que se DICE antes de
 * confirmar: qué compra cancela —la más vieja primero— y cómo queda el saldo.
 */

const CLIENTE = '00000000-0000-0000-0000-0000000000c1'
const cuenta = {
  prendido: true as const, prueba: true, hoy: '2026-10-30', linea: 'bdi' as const, credito: null,
  cliente: { id: CLIENTE, nombre: 'Mayorista Ejemplo', doc: null },
  estado: { saldo: 1500, debe: 1500, a_favor: 0, vencido: 0, dias_mayor: 38, atrasado: false, sin_credito: true, tramos: {}, pendientes: [
    { ref: 'venta:b', fecha: '2026-10-14', monto: 500, pendiente: 500, dias: 16, nombre: 'Venta 4930' },
    { ref: 'venta:a', fecha: '2026-09-22', monto: 1200, pendiente: 1000, dias: 38, nombre: 'Venta 4812' },
  ] },
  pagos: [{ fecha: '2026-10-01', monto: 200, detalle: 'Galicia' }],
  cuentas: [{ id: 7, nombre: 'Galicia', medio: 'transferencia' }, { id: 8, nombre: 'Mercado Pago', medio: 'mp' }],
}
const cobrarCuentaErp = vi.fn(async () => ({ ok: true, cuenta: {} }))
vi.mock('@/lib/erp/cliente', () => ({
  cobrarCuentaErp: (...a: unknown[]) => cobrarCuentaErp(...(a as [])), leerCuentaPanel: vi.fn(), leerCuentasCorrientes: vi.fn(),
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement | undefined
const poner = async (el: HTMLInputElement | HTMLSelectElement, v: string) => {
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!
  await act(async () => { set.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })) })
}

describe('Cargar pago desde el panel (pantalla)', () => {
  it('muestra qué compra cancela (la más vieja primero) y manda el cobro a la cuenta de BDI, de prueba', async () => {
    const { HojaCargarPago } = await import('@/components/panel/CuentaCorriente')
    const onHecho = vi.fn()
    host = document.createElement('div'); document.body.appendChild(host)
    await act(async () => { root = createRoot(host); root.render(<HojaCargarPago cuenta={cuenta} onCerrar={() => {}} onHecho={onHecho} />) })
    expect(boton('Confirmar pago')?.disabled).toBe(true)
    await poner(document.querySelector('input[inputmode="decimal"]') as HTMLInputElement, '1200')
    const texto = document.body.textContent ?? ''
    expect(texto).toContain('Venta 4812 (22/09): $1.000 · queda pagada')
    expect(texto).toContain('Venta 4930 (14/10): $200 · le quedan $300')
    expect(texto).toContain('Saldo después$300')
    expect(boton('Confirmar pago')?.disabled).toBe(true)
    await poner(document.querySelector('select') as HTMLSelectElement, '8')
    await act(async () => { boton('Confirmar pago')!.click() })
    expect(cobrarCuentaErp).toHaveBeenCalledTimes(1)
    const [marca, c] = cobrarCuentaErp.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(marca).toBe('bdi')
    expect(c).toMatchObject({ clienteId: CLIENTE, linea: 'bdi', monto: 1200, cuenta: '8', prueba: true })
    expect(c).not.toHaveProperty('ventaId')
    expect(typeof c.ref).toBe('string')
    expect(onHecho).toHaveBeenCalledWith('Pago de $1.200 cargado. Ahora debe $300.')
  })
})
