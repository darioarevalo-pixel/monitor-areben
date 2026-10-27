// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **ERP › Cargar venta: elegir un cliente SIN documento ⛔ rompe la pantalla (27-oct).** La búsqueda devuelve `doc: null` para fichas
 * sin DNI/CUIT (en Zattia: «consumidorfinal») y el formulario hacía `doc.replace(...)` sobre null ⇒ «This page couldn't load».
 */

const datos = { lineas: ['zattia'], cuentas: [], canales: ['local'], depositos: ['local', 'deposito'], manualHabilitado: true }
vi.mock('@/lib/erp/cliente', () => ({
  leerParaCargar: async () => datos,
  buscarClientas: async () => ({ clientas: [{ doc: null, nombre: 'consumidorfinal', razonSocial: null, domicilio: null, condicion: null }] }),
  buscarPrendas: vi.fn(), cargarVenta: vi.fn(), leerPrecioDeProducto: vi.fn(),
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = '' })

const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement | undefined

describe('Cargar venta con un cliente sin documento', () => {
  it('lo elige sin romper y deja el documento vacío', async () => {
    const { CargarVenta } = await import('@/components/erp/ventas/CargarVenta')
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    await act(async () => { root!.render(<CargarVenta marca="zattia" onCerrar={() => {}} onCargada={() => {}} />) })
    const buscar = document.querySelector('input[aria-label="Buscar cliente"]') as HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { set.call(buscar, 'consumidorfinal'); buscar.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { boton('Buscar')!.click() })
    const fila = boton('consumidorfinal')
    expect(fila?.textContent).toContain('sin documento')
    await act(async () => { fila!.click() })
    expect(document.body.textContent).toContain('Documento')
    expect((document.querySelectorAll('input[inputmode="numeric"]')[0] as HTMLInputElement).value).toBe('')
  })
})
