// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **Panel de WhatsApp › tarjeta de cuenta › «Facturas»** (facturación de mayoristas, Darío §5, Bruno 31-oct). El oráculo: lista
 * las facturas de la ficha; «Hacer factura libre» manda los renglones TAL CUAL (cantidad entera, precio en pesos) y, si la ficha
 * ⛔ tiene condición, pide los datos fiscales en el mismo paso y los manda; un 409 con `falta` los abre.
 */
const CLIENTE = '00000000-0000-0000-0000-0000000000c1'
const leer = vi.fn()
const libre = vi.fn()
vi.mock('@/lib/erp/cliente', () => ({
  leerFacturasClientePanel: (...a: unknown[]) => leer(...a),
  facturaLibrePanel: (...a: unknown[]) => libre(...a),
}))
const bajar = vi.fn(async () => {})
vi.mock('@/lib/arca/factura-pdf', () => ({ descargarFactura: (...a: unknown[]) => bajar(...(a as [])) }))

const FACTURA = { id: 'f1', ambiente: 'homologacion', marca: 'bdi', venta_id: 'libre:x', tipo: 1, pto_vta: 2, numero: 7, fecha: '2026-10-31', total: 215005, neto: 0, iva: 0, doc_tipo: 80, doc_nro: 20123456786, cond_iva: 1, estado: 'autorizada', cae: '1', cae_vence: '2026-11-10', venta_numero: null, renglones: [], receptor_nombre: 'X SA', receptor_domicilio: null, clase: 'libre' }

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })
const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement | undefined
const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const escribir = async (el: HTMLInputElement | HTMLSelectElement, valor: string) => {
  await act(async () => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valor)
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
const campo = (rotulo: string) => [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith(rotulo))?.querySelector('input, select') as HTMLInputElement

async function montar(fiscal: object, facturas: object[] = []) {
  leer.mockResolvedValue({ prendido: true, ambiente: 'homologacion', fiscal, facturas })
  const { FacturasCliente } = await import('@/components/panel/FacturasCliente')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<FacturasCliente clienteId={CLIENTE} decir={() => {}} />) })
  await esperar()
}

describe('Facturas en la tarjeta de cuenta (pantalla)', () => {
  it('lista las facturas de la ficha con su PDF', async () => {
    await montar({ doc: '20123456786', razonSocial: 'X SA', domicilio: 'Mitre 1', condicion: 'ri' }, [FACTURA])
    expect(leer).toHaveBeenCalledWith(CLIENTE)
    const t = document.body.textContent ?? ''
    expect(t).toContain('A 00002-00000007 · 31/10/2026 · libre')
    expect(t).toContain('$215.005')
    await act(async () => { boton('PDF')!.click() })
    await esperar()
    expect(bajar).toHaveBeenCalledWith(FACTURA)
  })

  it('factura libre con la ficha completa: manda los renglones y ⛔ datos fiscales', async () => {
    await montar({ doc: '20123456786', razonSocial: 'X SA', domicilio: 'Mitre 1', condicion: 'ri' })
    await act(async () => { boton('Hacer factura libre')!.click() })
    expect(document.body.textContent).toContain('Sale factura A a X SA (20123456786)')
    await escribir(campo('Producto'), 'Fundas iPhone')
    await escribir(campo('Cantidad'), '100')
    await escribir(campo('Precio unitario'), '2.000')
    expect(document.body.textContent).toContain('Total $200.000')
    libre.mockResolvedValue({ ok: true, factura: FACTURA })
    await act(async () => { boton('Facturar $200.000')!.click() })
    await esperar()
    expect(libre).toHaveBeenCalledWith({ clienteId: CLIENTE, renglones: [{ descripcion: 'Fundas iPhone', cantidad: 100, unitario: 2000 }] })
    expect(bajar).toHaveBeenCalled()
  })

  it('sin condición pide los datos en el mismo paso y los manda', async () => {
    await montar({ doc: null, razonSocial: null, domicilio: null, condicion: null })
    await act(async () => { boton('Hacer factura libre')!.click() })
    await escribir(campo('Producto'), 'Fundas')
    await escribir(campo('Precio unitario'), '1000')
    await escribir(campo('Condición'), 'ri')
    expect(document.body.textContent).toContain('Sale factura A.')
    await escribir(campo('CUIT'), '20-12345678-6')
    await escribir(campo('Razón social'), 'X SA')
    await escribir(campo('Domicilio'), 'Mitre 1')
    libre.mockResolvedValue({ ok: true, factura: FACTURA })
    await act(async () => { boton('Facturar $1.000')!.click() })
    await esperar()
    expect(libre).toHaveBeenCalledWith({ clienteId: CLIENTE, renglones: [{ descripcion: 'Fundas', cantidad: 1, unitario: 1000 }], doc: '20123456786', condicion: 'ri', razonSocial: 'X SA', domicilio: 'Mitre 1' })
  })

  it('un 409 con `falta` abre los datos fiscales y dice qué falta', async () => {
    await montar({ doc: null, razonSocial: null, domicilio: null, condicion: 'consumidor' })
    await act(async () => { boton('Hacer factura libre')!.click() })
    expect(campo('Condición')).toBeUndefined()
    await escribir(campo('Producto'), 'Fundas')
    await escribir(campo('Precio unitario'), '1000')
    libre.mockRejectedValue(Object.assign(new Error('Desde $10000000 la factura B necesita el DNI o CUIT del cliente'), { datos: { falta: true } }))
    await act(async () => { boton('Facturar $1.000')!.click() })
    await esperar()
    expect(campo('Condición')).toBeTruthy()
    expect(document.body.textContent).toContain('necesita el DNI o CUIT')
  })
})
