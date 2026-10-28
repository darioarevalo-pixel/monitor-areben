// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **ERP › Cargar venta a cuenta: el PIN de admin (27-oct).** El campo NO está desde el principio: aparece cuando el ERP frena la venta
 * (sin crédito / atrasado / pasa el tope), y el segundo intento manda el `pin`. Un freno que no es de crédito ⛔ lo pide.
 */

const datos = { lineas: ['zattia'], cuentas: [{ id: 'cc', nombre: 'Cuenta corriente', medio: 'cuenta', marca: 'zattia' }], canales: ['local'], depositos: ['local'], manualHabilitado: true }
const cargarVenta = vi.fn()
vi.mock('@/lib/erp/cliente', () => ({
  leerParaCargar: async () => datos,
  buscarClientas: vi.fn(),
  buscarPrendas: async () => ({ variantes: [{ producto: '101', talle: '7', sku: 'ZA1', barcode: null, nombre: 'JEAN', talleNombre: '36' }] }),
  leerPrecioDeProducto: async () => ({ precios: {} }),
  cargarVenta: (...a: unknown[]) => cargarVenta(...a),
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement | undefined
const escribir = async (el: Element, v: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })) })
}
const error = (codigo: string) => Object.assign(new Error('El cliente no tiene crédito: la venta a cuenta necesita el PIN de un admin'), { codigo })

async function montarYLlenar() {
  const { CargarVenta } = await import('@/components/erp/ventas/CargarVenta')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<CargarVenta marca="zattia" onCerrar={() => {}} onCargada={() => {}} />) })
  const num = () => [...document.querySelectorAll('input[inputmode="numeric"]')] as HTMLInputElement[]
  await escribir(num()[0], '900000001')
  await escribir([...document.querySelectorAll('input')].find((i) => i.value === '' && i.closest('label')?.textContent?.startsWith('Nombre')) as HTMLInputElement, 'PRUEBA FIFO')
  await escribir(document.querySelector('input[aria-label="Buscar producto"]') ?? document.querySelector('input[placeholder*="código"]')!, 'jean')
  const buscar = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Buscar')
  await act(async () => { buscar[buscar.length - 1].click() }) // el 2º: el de productos
}

describe('Cargar venta a cuenta con PIN de admin', () => {
  it('el campo aparece recién cuando el ERP frena, y el reintento manda el pin', async () => {
    await montarYLlenar()
    await act(async () => { boton('JEAN')!.click() })
    const precio = [...document.querySelectorAll('input[type="number"]')][1] as HTMLInputElement | undefined
    if (precio) await escribir(precio, '1000')
    await escribir(document.querySelector('select[aria-label="Cuenta"]')!, 'cc')
    await act(async () => { boton('Completar')!.click() })
    expect(document.querySelector('input[aria-label="PIN de admin"]')).toBeNull()

    cargarVenta.mockRejectedValueOnce(error('SIN_CREDITO'))
    await act(async () => { boton('Cargar venta')!.click() })
    const campo = document.querySelector('input[aria-label="PIN de admin"]') as HTMLInputElement
    expect(campo).not.toBeNull()
    expect(cargarVenta.mock.calls[0][1].pin).toBeUndefined()
    expect(boton('Autorizar y cargar')!.disabled).toBe(true) // sin PIN no se puede reintentar

    cargarVenta.mockResolvedValueOnce({ ok: true, venta: { id: 'v', numero: 9, total: 1000, prueba: true }, yaExistia: false, avisos: [] })
    await escribir(campo, '1234')
    await act(async () => { boton('Autorizar y cargar')!.click() })
    expect(cargarVenta).toHaveBeenCalledTimes(2)
    expect(cargarVenta.mock.calls[1][1].pin).toBe('1234')
  })

  it('un error que no es del crédito ⛔ pide el PIN', async () => {
    await montarYLlenar()
    await act(async () => { boton('JEAN')!.click() })
    await escribir(document.querySelector('select[aria-label="Cuenta"]')!, 'cc')
    await act(async () => { boton('Completar')!.click() })
    cargarVenta.mockRejectedValueOnce(new Error('La base no responde'))
    await act(async () => { boton('Cargar venta')!.click() })
    expect(document.querySelector('input[aria-label="PIN de admin"]')).toBeNull()
  })
})
