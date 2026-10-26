// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **ERP › Cuenta corriente › «Escribir por WhatsApp» y «Resumen de cuenta» (26-oct, Resto).** El oráculo es el ENLACE que se abre
 * (número y texto) y que sin WhatsApp el botón queda apagado y dice por qué.
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
async function montar(whatsapp: string | null) {
  const { FichaCuenta } = await import('@/components/erp/clientes/FichaCuenta')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<FichaCuenta marca="bdi" fila={{ ...fila, whatsapp }} prueba admin onCerrar={() => {}} onCambio={() => {}} />) })
}

describe('WhatsApp y resumen en la ficha de la cuenta (pantalla)', () => {
  it('con número abre wa.me con el saldo en el texto', async () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    await montar('11 5555-1234')
    const b = boton('Escribir por WhatsApp')!
    expect(b.disabled).toBe(false)
    await act(async () => { b.click() })
    const url = String(abrir.mock.calls[0][0])
    expect(url).toContain('https://wa.me/5491155551234?text=')
    expect(decodeURIComponent(url)).toContain('saldo pendiente de $ 1.000')
    abrir.mockRestore()
  })
  it('⛔ sin WhatsApp el botón queda apagado y dice por qué', async () => {
    await montar(null)
    const b = boton('Escribir por WhatsApp')!
    expect(b.disabled).toBe(true)
    expect(b.title).toBe('No tiene WhatsApp cargado.')
  })
  it('«Resumen de cuenta» espera a que la cuenta esté leída y abre la ventana de impresión', async () => {
    const w = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn(), close: vi.fn() }
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => w as unknown as Window)
    await montar(null)
    await act(async () => { boton('Resumen de cuenta')!.click() })
    expect(abrir).toHaveBeenCalledWith('', '_blank')
    expect(w.document.write.mock.calls[0][0]).toContain('Resumen de cuenta corriente')
    abrir.mockRestore()
  })
})
