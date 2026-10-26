// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **ERP › Cuenta corriente › «Cobrar» (a la cuenta, sin elegir venta; 18-oct, Bruno y Darío).** El oráculo es lo que se MANDA:
 * cliente, línea, monto, cuenta, fecha, una clave y `prueba`; y lo que se DICE antes: que paga la compra más vieja y cuánto queda a favor.
 */

const CLIENTE = '00000000-0000-0000-0000-0000000000c1'
const fila = {
  id: 'f1', clienteId: CLIENTE, linea: 'bdi', nombre: 'Mayorista Uno', doc: '20-1', saldo: 1000, debe: 1000, aFavor: 0, vencido: 0, diasMayor: 3, tramos: {},
  credito: { credito: true, tope: null, dias: 30, puesto_por: null, puesto_en: null }, sinCredito: false, estado: 'aldia',
}
const cuenta = {
  hoy: '2026-10-26', cliente: { id: CLIENTE, nombre: 'Mayorista Uno', doc: '20-1' }, credito: { credito: true, tope: null, dias: 30, puesto_por: null, puesto_en: null },
  estado: { saldo: 1000, debe: 1000, a_favor: 0, vencido: 0, dias_mayor: 3, atrasado: false, sin_credito: false, tramos: {}, pendientes: [] },
  mayor: { anterior: 0, renglones: [], final: 1000 }, csv: '', cuentas: [{ id: 7, nombre: 'Galicia', medio: 'transferencia' }],
}
const leerCuentaDeCliente = vi.fn(async () => cuenta)
const cobrarCuentaErp = vi.fn(async () => ({ ok: true, cuenta: {} }))
vi.mock('@/lib/erp/cliente', () => ({
  leerCuentaDeCliente: (...a: unknown[]) => leerCuentaDeCliente(...(a as [])), cobrarCuentaErp: (...a: unknown[]) => cobrarCuentaErp(...(a as [])),
  ponerCreditoCliente: vi.fn(), leerPermisos: async () => ({ permisos: { bdi: {}, zattia: {} } }),
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement | undefined
async function montar() {
  const { FichaCuenta } = await import('@/components/erp/clientes/FichaCuenta')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<FichaCuenta marca="bdi" fila={fila} prueba admin onCerrar={() => {}} onCambio={() => {}} />) })
}
async function elegirCuenta() {
  const sel = document.querySelector('select') as HTMLSelectElement
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  await act(async () => { set.call(sel, '7'); sel.dispatchEvent(new Event('change', { bubbles: true })) })
}

describe('Cobrar a la cuenta (pantalla)', () => {
  it('abre con el saldo, avisa que paga la más vieja y manda el cobro SIN venta', async () => {
    await montar()
    await act(async () => { boton('Cobrar')!.click() })
    expect(document.body.textContent).toContain('paga primero la compra más vieja')
    await elegirCuenta()
    await act(async () => { boton('Cobrar $')!.click() })
    expect(cobrarCuentaErp).toHaveBeenCalledTimes(1)
    const [marca, c] = cobrarCuentaErp.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(marca).toBe('bdi')
    expect(c).toMatchObject({ clienteId: CLIENTE, linea: 'bdi', monto: 1000, cuenta: '7', prueba: true })
    expect(c).not.toHaveProperty('ventaId')
    expect(typeof c.ref).toBe('string')
  })

  it('sin cuenta elegida ⛔ se puede cobrar', async () => {
    await montar()
    await act(async () => { boton('Cobrar')!.click() })
    expect(boton('Cobrar $')?.disabled).toBe(true)
    expect(cobrarCuentaErp).not.toHaveBeenCalled()
  })
})
