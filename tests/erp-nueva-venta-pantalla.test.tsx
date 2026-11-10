// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **ERP › Ventas › «Nueva venta» (Bruno 10-nov, maqueta aprobada).** Las formas de pago de la Caja con su %, editables; un «Sale de»
 * para toda la venta; «Entra a» editable; el cartel «de prueba» sólo si la línea ⛔ cortó; «Corregir una venta pasada» con motivo.
 */
const datos = {
  lineas: ['zattia'], cuentas: [], canales: ['local', 'online'], depositos: ['local', 'deposito'], manualHabilitado: true,
  formas: { zattia: [
    { clave: 'efectivo', nombre: 'Efectivo', cuenta: 'c-ef', pct: 15, rutas: { local: { cuenta: 'Areben · Caja local', cuentaId: 'r-caja', tasa: null, dias: 0 } } },
    { clave: 'transferencia', nombre: 'Transferencia', cuenta: 'c-tr', pct: 10, rutas: { local: { cuenta: 'Darío · MP', cuentaId: 'r-mpd', tasa: null, dias: 0 } } },
    { clave: 'debito', nombre: 'Débito', cuenta: 'c-db', pct: 10, rutas: {} },
    { clave: 'credito', nombre: 'Crédito', cuenta: 'c-cr', pct: 0, rutas: {} },
    { clave: 'cuenta', nombre: 'Queda debiendo', cuenta: 'cc', pct: 0, rutas: {} },
  ] },
  sueltas: { zattia: [{ id: 'mp', nombre: 'Mercado Pago', medio: 'mp', marca: 'zattia' }] },
  cuentasReales: [{ id: 'r-mpd', nombre: 'Darío · MP' }, { id: 'r-mpa', nombre: 'Areben · MP' }, { id: 'r-caja', nombre: 'Areben · Caja local' }],
  enErp: { zattia: false }, redondeo: { zattia: 100 },
}
const cargarVenta = vi.fn(async () => ({ ok: true, venta: { id: 'v1', numero: 2041, total: 29610, prueba: false }, yaExistia: false, avisos: [] }))
const permisos: Record<string, boolean> = { 'venta-pasada': true, 'facturar-venta': true }
vi.mock('@/lib/erp/usePuedeErp', () => ({ usePuedeErp: () => (p: string) => permisos[p] ?? true }))
vi.mock('@/lib/erp/linea-erp', () => ({ useTiendaErp: () => 'zattia', deLaTienda: (v: unknown[]) => v }))
vi.mock('@/lib/erp/cliente', () => ({
  leerParaCargar: async () => datos,
  buscarClientas: async () => ({ clientas: [{ doc: null, nombre: 'consumidorfinal' }] }),
  buscarPrendas: async () => ({ variantes: [
    { producto: '101', talle: '7', sku: 'ZA1', barcode: null, nombre: 'JEAN', talleNombre: '36', gn: 5, porDeposito: { local: 2, deposito: 3 } },
    { producto: '101', talle: '8', sku: 'ZA1', barcode: null, nombre: 'JEAN', talleNombre: '38', gn: 0, porDeposito: {} },
  ], cortado: false }),
  leerPrecioDeProducto: async () => ({ listas: [{ lista: 'local', precio: 34900 }] }),
  cargarVenta: (...a: unknown[]) => cargarVenta(...(a as [])),
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks(); vi.useRealTimers() })

const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement | undefined
const escribir = async (el: Element, v: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })) })
}
const enviados = () => (cargarVenta.mock.calls[0] as unknown as [string, Record<string, unknown>])[1]

async function montar() {
  const { NuevaVenta } = await import('@/components/erp/ventas/NuevaVenta')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<NuevaVenta marca="zattia" onCerrar={() => {}} onGuardada={() => {}} onVer={() => {}} onFacturar={() => {}} />) })
}
async function conJean() {
  await montar()
  const q = document.querySelector('input[aria-label="Buscar producto"]')!
  await escribir(q, 'jean')
  await act(async () => { q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
  await act(async () => { boton('36')!.click() })
}

describe('Nueva venta', () => {
  it('muestra los talles con el stock del lugar elegido y el precio de lista sale solo', async () => {
    await conJean()
    expect(boton('36')!.textContent).toContain('2')
    expect((document.querySelector('input[aria-label="Precio de lista"]') as HTMLInputElement).value).toBe('34900')
    await escribir(document.querySelector('select[aria-label="Sale de"]')!, 'deposito')
    expect(boton('36')!.textContent).toContain('3')
  })

  it('las formas de pago dicen su % de la Caja y lo que se manda es lo elegido (descuento por producto, %, redondeo)', async () => {
    await conJean()
    expect(boton('Efectivo')!.textContent).toContain('−15 %')
    await escribir(document.querySelector('input[aria-label="Descuento %"]')!, '5')
    await act(async () => { boton('Transferencia')!.click() })
    await escribir(document.querySelector('input[aria-label="Porcentaje de la forma de pago"]')!, '12')
    expect(document.body.textContent).toContain('$ 29.200') // 34.900 −5 % = 33.155; −12 % = 29.176,4 ⇒ redondeo a 100
    await act(async () => { boton('Guardar venta')!.click() })
    const b = enviados()
    expect(b).toMatchObject({ modo: 'local', deposito: 'local', canal: 'local', paso: 100 })
    expect(b.lineas).toEqual([expect.objectContaining({ producto: '101', talle: '7', precio: 34900, descuento_pct: 5 })])
    expect(b.pagos).toEqual([{ cuenta: 'c-tr', base: null, porcentaje: 12, redondear: true }])
  })

  it('«Entra a» arranca en la cuenta de la configuración y, si se cambia, viaja la elegida', async () => {
    await conJean()
    await act(async () => { boton('Transferencia')!.click() })
    const real = document.querySelector('select[aria-label="Cuenta del pago"]') as HTMLSelectElement
    expect(real.value).toBe('r-mpd')
    await escribir(real, 'r-mpa')
    await act(async () => { boton('Guardar venta')!.click() })
    expect((enviados().pagos as Array<{ cuenta_real?: string }>)[0].cuenta_real).toBe('r-mpa')
  })

  it('«Más» trae Queda debiendo y las cuentas sueltas; queda debiendo pide el cliente', async () => {
    await conJean()
    await act(async () => { boton('Más:')!.click() })
    await act(async () => { [...document.querySelectorAll('button')].find((x) => x.textContent === 'Queda debiendo')!.click() })
    expect(document.body.textContent).toContain('Para que quede debiendo hace falta el cliente')
    expect(boton('Guardar venta')!.disabled).toBe(true)
  })

  it('dice «de prueba» sólo si la línea todavía no vende por el ERP, y que no suma a la caja', async () => {
    await montar()
    expect(document.body.textContent).toContain('queda de prueba')
    expect(document.body.textContent).toContain('no suma a la caja')
    datos.enErp.zattia = true
    act(() => root?.unmount()); root = null
    await montar()
    expect(document.body.textContent).not.toContain('queda de prueba')
    datos.enErp.zattia = false
  })

  it('«Corregir una venta pasada» pide el motivo y manda fecha y motivo; sin permiso ⛔ aparece', async () => {
    await conJean()
    await act(async () => { boton('Corregir una venta pasada')!.click() })
    await act(async () => { boton('Efectivo')!.click() })
    expect(boton('Guardar venta')!.disabled).toBe(true)
    await escribir(document.querySelector('input[placeholder^="Ej.:"]')!, 'se olvidó en la caja')
    await act(async () => { boton('Guardar venta')!.click() })
    expect(enviados()).toMatchObject({ modo: 'corregir', motivo: 'se olvidó en la caja' })
    expect(typeof enviados().ocurrida_en).toBe('string')
    act(() => root?.unmount()); root = null
    permisos['venta-pasada'] = false
    await montar()
    expect(boton('Corregir una venta pasada')).toBeUndefined()
    permisos['venta-pasada'] = true
  })

  it('guardada: muestra el resumen con Nueva venta, Facturar y Ver la venta', async () => {
    await conJean()
    await act(async () => { boton('Efectivo')!.click() })
    await act(async () => { boton('Guardar venta')!.click() })
    expect(document.body.textContent).toContain('Venta #2041 guardada')
    expect(document.body.textContent).toContain('No suma a la caja')
    expect(['Nueva venta', 'Facturar', 'Ver la venta'].every((t) => boton(t))).toBe(true)
  })

  it('el frenado por crédito pide el PIN y el reintento lo manda', async () => {
    cargarVenta.mockImplementationOnce(async () => { throw Object.assign(new Error('No tiene crédito'), { codigo: 'SIN_CREDITO' }) })
    await conJean()
    await act(async () => { boton('Más:')!.click() })
    await act(async () => { [...document.querySelectorAll('button')].find((x) => x.textContent === 'Queda debiendo')!.click() })
    await act(async () => { boton('Crear cliente')!.click() })
    await escribir(document.querySelector('input[inputmode="numeric"]')!, '30111222')
    const nombre = [...document.querySelectorAll('input')].find((i) => i.parentElement?.textContent?.includes('Nombre') && i.getAttribute('inputmode') !== 'numeric' && !i.getAttribute('aria-label'))!
    await escribir(nombre, 'Ana Pérez')
    await act(async () => { boton('Guardar venta')!.click() })
    const pin = document.querySelector('input[aria-label="PIN de admin"]')!
    expect(pin).not.toBeNull()
    await escribir(pin, '1234')
    await act(async () => { boton('Autorizar y guardar')!.click() })
    expect((cargarVenta.mock.calls[1] as unknown as [string, { pin?: string }])[1].pin).toBe('1234')
  })

  it('un cliente sin documento se elige sin romper', async () => {
    await montar()
    await escribir(document.querySelector('input[aria-label="Buscar cliente"]')!, 'consumidorfinal')
    await act(async () => { [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Buscar').pop()!.click() })
    await act(async () => { boton('consumidorfinal')!.click() })
    expect(document.body.textContent).toContain('consumidorfinal · sin documento')
  })
})
