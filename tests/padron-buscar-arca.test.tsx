// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * «Buscar en ARCA» en los datos para facturar (padrón de ARCA, Bruno 31-oct): con un CUIT de 11 números llena razón social,
 * condición y domicilio (corregibles); si ARCA falla, lo dice y los campos quedan como estaban para tipearlos.
 */
const cliente = vi.hoisted(() => ({
  leerFacturasClientePanel: vi.fn(), leerPadronPanel: vi.fn(), leerBcraCuit: vi.fn(), facturarPedidoPanel: vi.fn(), facturaLibrePanel: vi.fn(),
  emitirPartePanel: vi.fn(), proponerPartePanel: vi.fn(), enviarFacturaPanel: vi.fn(),
}))
vi.mock('@/lib/erp/cliente', () => cliente)

import { FacturarPedido } from '@/components/panel/FacturasCliente'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
let caja: HTMLDivElement
const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement | undefined
const inputs = () => [...document.querySelectorAll('input')] as HTMLInputElement[]
const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const escribir = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function montar() {
  for (const f of Object.values(cliente)) f.mockReset()
  cliente.leerFacturasClientePanel.mockResolvedValue({ prendido: true, ambiente: 'homologacion', fiscal: { doc: null, razonSocial: null, domicilio: null, condicion: null }, facturas: [] })
  caja = document.createElement('div')
  document.body.appendChild(caja)
  root = createRoot(caja)
  await act(async () => { root!.render(<FacturarPedido pedidoId="p" clienteId="c" total={1000} preparado onCerrar={() => {}} onHecha={() => {}} />) })
  await esperar()
}
afterEach(() => { act(() => root?.unmount()); root = null; caja?.remove(); document.body.innerHTML = '' })

describe('«Buscar en ARCA»', () => {
  it('apagado hasta 11 números; trae y llena razón social, condición y domicilio', async () => {
    await montar()
    const [doc] = inputs()
    expect(boton('Buscar en ARCA')!.disabled).toBe(true)
    await escribir(doc, '30-71850818-1')
    expect(boton('Buscar en ARCA')!.disabled).toBe(false)
    cliente.leerPadronPanel.mockResolvedValue({ prendido: true, cuit: '30718508181', razonSocial: 'AREBEN COMERCIAL S.R.L.', condicion: 'ri', domicilio: 'CORRIENTES 763, ROSARIO (2000), SANTA FE', estadoClave: 'ACTIVO', avisos: [] })
    cliente.leerBcraCuit.mockResolvedValue({ prendido: true, cuit: '30718508181', ok: true, denominacion: null, periodo: '202609', peor: 1, deuda: 0, bancos: [], historia: null, peor12: null, cheques: null })
    await act(async () => { boton('Buscar en ARCA')!.click() })
    await esperar()
    expect(cliente.leerPadronPanel).toHaveBeenCalledWith('30718508181')
    expect(cliente.leerBcraCuit).toHaveBeenCalledWith('30718508181')
    expect(document.body.textContent).toContain('Sin deudas en bancos')
    const [, razon, dom] = inputs()
    expect(razon.value).toBe('AREBEN COMERCIAL S.R.L.')
    expect(dom.value).toBe('CORRIENTES 763, ROSARIO (2000), SANTA FE')
    expect((document.querySelector('select') as HTMLSelectElement).value).toBe('ri')
    expect(document.body.textContent).toContain('Datos de ARCA cargados')
    expect(document.body.textContent).toContain('Sale factura A.')
  })
  it('si ARCA falla, lo dice y los campos quedan para tipear', async () => {
    await montar()
    await escribir(inputs()[0], '30718508181')
    await escribir(inputs()[1], 'Lo que tipeó')
    cliente.leerPadronPanel.mockRejectedValue(new Error('ARCA dice: No existe persona con ese Id'))
    cliente.leerBcraCuit.mockRejectedValue(new Error('No se pudo consultar el BCRA.'))
    await act(async () => { boton('Buscar en ARCA')!.click() })
    await esperar()
    expect(inputs()[1].value).toBe('Lo que tipeó')
    expect(document.body.textContent).toContain('ARCA dice: No existe persona con ese Id Completalo a mano.')
  })
})
