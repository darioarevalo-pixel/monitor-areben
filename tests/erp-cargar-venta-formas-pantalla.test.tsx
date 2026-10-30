// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **ERP › Cargar venta con las formas de pago del POS (27-oct, Bruno: «idéntico al POS, que corran con la ruta»).** Lo que se MANDA es la
 * cuenta de cobro de la forma elegida (⛔ la lista de todas las cuentas), y antes de cargar se DICE a qué cuenta real va y con qué comisión.
 */
const cuentas = [{ id: 'cc', nombre: 'Cuenta corriente', medio: 'cuenta', marca: 'zattia' }, { id: 'mp', nombre: 'Mercado Pago', medio: 'mp', marca: 'zattia' }]
const datos = {
  lineas: ['zattia'], cuentas, canales: ['local', 'online'], depositos: ['local'], manualHabilitado: true,
  formas: { zattia: [
    { clave: 'efectivo', nombre: 'Efectivo', cuenta: 'c-ef', rutas: { local: { cuenta: 'Areben · Caja local', tasa: null, dias: 0 }, online: null } },
    { clave: 'credito', nombre: 'Tarjeta de crédito', cuenta: 'c-cr', rutas: { local: { cuenta: 'Areben · Mercado Pago', tasa: 3.5, dias: 2 }, online: null },
      opciones: [{ clave: 'normal', nombre: 'Sin promo', cuenta: 'c-cr' }, { clave: 'seis', nombre: '6 cuotas', cuenta: 'c-6' }] },
    { clave: 'cuenta', nombre: 'Queda debiendo', cuenta: 'cc', rutas: {} },
  ] },
  sueltas: { zattia: [{ id: 'mp', nombre: 'Mercado Pago', medio: 'mp', marca: 'zattia' }] },
}
const cargarVenta = vi.fn(async () => ({ ok: true, venta: { id: 'v', numero: 9, total: 1000, prueba: true }, yaExistia: false, avisos: [] }))
vi.mock('@/lib/erp/cliente', () => ({
  leerParaCargar: async () => datos, buscarClientas: vi.fn(),
  buscarPrendas: async () => ({ variantes: [{ producto: '101', talle: '7', sku: 'ZA1', barcode: null, nombre: 'JEAN', talleNombre: '36' }] }),
  leerPrecioDeProducto: async () => ({ precios: {} }), cargarVenta: (...a: unknown[]) => cargarVenta(...(a as [])),
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
async function montar() {
  const { CargarVenta } = await import('@/components/erp/ventas/CargarVenta')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<CargarVenta marca="zattia" onCerrar={() => {}} onCargada={() => {}} />) })
  await escribir(document.querySelector('input[placeholder*="código"]')!, 'jean')
  const buscar = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Buscar')
  await act(async () => { buscar[buscar.length - 1].click() })
  await act(async () => { boton('JEAN')!.click() })
  await escribir(document.querySelector('input[aria-label="Precio"]')!, '1000')
}

describe('Cargar venta: formas de pago del POS con su ruta', () => {
  it('muestra las tarjetas del POS (⛔ la lista de cuentas) y dice la ruta del canal', async () => {
    await montar()
    expect(document.querySelector('select[aria-label="Cuenta"]')).toBeNull()
    expect(['Efectivo', 'Tarjeta de crédito', 'Queda debiendo', 'Otra cuenta'].every((t) => boton(t))).toBe(true)
    await act(async () => { boton('Tarjeta de crédito')!.click() })
    expect(document.body.textContent).toContain('Va a Areben · Mercado Pago · comisión 3,5 % · se acredita en 2 días')
    await escribir(document.querySelector('select[aria-label="Canal"], select')!, 'local')
  })

  it('un canal sin ruta lo avisa', async () => {
    await montar()
    await act(async () => { boton('Efectivo')!.click() })
    const canal = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'online'))!
    await escribir(canal, 'online')
    expect(document.body.textContent).toContain('Esta forma de pago no tiene cuenta en este canal')
  })

  it('manda la CUENTA de la forma elegida, y la del crédito en 6 cuotas', async () => {
    await montar()
    await act(async () => { boton('Tarjeta de crédito')!.click() })
    await act(async () => { boton('6 cuotas')!.click() })
    await act(async () => { boton('Completar')!.click() })
    await act(async () => { boton('Cargar venta')!.click() })
    expect(cargarVenta).toHaveBeenCalledTimes(1)
    expect((cargarVenta.mock.calls[0] as unknown as [string, { pagos: unknown }])[1].pagos).toEqual([{ cuenta: 'c-6', monto: 1000 }])
  })

  it('con Efectivo manda la cuenta de Efectivo (⛔ queda sin cuenta)', async () => {
    await montar()
    await act(async () => { boton('Efectivo')!.click() })
    await act(async () => { boton('Completar')!.click() })
    await act(async () => { boton('Cargar venta')!.click() })
    expect((cargarVenta.mock.calls[0] as unknown as [string, { pagos: unknown }])[1].pagos).toEqual([{ cuenta: 'c-ef', monto: 1000 }])
  })

  it('«Otra cuenta» deja elegir una cuenta que no es del POS', async () => {
    await montar()
    await act(async () => { boton('Otra cuenta')!.click() })
    await escribir(document.querySelector('select[aria-label="Otra cuenta"]')!, 'mp')
    await act(async () => { boton('Completar')!.click() })
    await act(async () => { boton('Cargar venta')!.click() })
    expect((cargarVenta.mock.calls[0] as unknown as [string, { pagos: unknown }])[1].pagos).toEqual([{ cuenta: 'mp', monto: 1000 }])
  })
})
