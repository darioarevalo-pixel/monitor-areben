// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * «Facturar una parte» en la HOJA DEL PEDIDO mayorista (Darío §5; Bruno 31-oct): qué botones conviven (sin facturas los dos,
 * con partes sólo la parte, con la entera ninguno) y el verbo desde la pantalla — monto ⇒ «Proponer los renglones» (default
 * AJUSTADOS, «¿quiere los precios reales?» = no), corregir un renglón, «Facturar $X» manda los renglones COMO QUEDARON, avisa
 * cuánto queda y baja el PDF; pasarse de lo que queda apaga el botón.
 */
const cliente = vi.hoisted(() => ({
  leerPedidoPanel: vi.fn(), leerFacturasClientePanel: vi.fn(), facturarPedidoPanel: vi.fn(), proponerPartePanel: vi.fn(), emitirPartePanel: vi.fn(),
  buscarProductosPedido: vi.fn(), cambiarPedidoPanel: vi.fn(), mandarAPrepararPanel: vi.fn(), anularPedidoPanel: vi.fn(),
  entrarPedidoPanel: vi.fn(), leerPedidosPanel: vi.fn(), leerPreparadosSinPagar: vi.fn(),
}))
vi.mock('@/lib/erp/cliente', () => cliente)
vi.mock('@/components/panel/CuentaCorriente', () => ({ useCuentaPrendida: () => true }))
const bajar = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/lib/arca/factura-pdf', () => ({ descargarFactura: bajar }))

import { HojaPedido } from '@/components/panel/PedidosMayoristas'

const P = '11111111-1111-4111-8111-111111111111'
const C = '22222222-2222-4222-8222-222222222222'
const base = {
  prendido: true, escribir: true,
  pedido: { id: P, numero: 12, recibido_en: '2026-10-30T15:00:00Z', etapa: 'preparado', total: 84000, unidades: 2, persona: null, venta_id: 'v', cliente_id: C, editable: false, a_preparar_por: null },
  lineas: [{ product_id: 1, size_id: 10, cantidad: 2, precio: 42000, stock: 8, nombre: 'Funda Mom', talle: 'iPhone 13' }],
  cambios: [],
}
const SIN = { entera: null, partes: 0, total: 84000, facturado: 0, queda: 84000 }
const FACTURA = { id: 'f1', tipo: 1, pto_vta: 2, numero: 9, total: 84000, clase: 'venta' }

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
let caja: HTMLDivElement
const botones = () => [...document.querySelectorAll('button')]
const boton = (txt: string | RegExp) => botones().find((x) => (typeof txt === 'string' ? x.textContent?.trim() === txt : txt.test(x.textContent ?? '')))
const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
async function montar(ficha: object) {
  for (const f of Object.values(cliente)) f.mockReset()
  cliente.leerPedidoPanel.mockResolvedValue(ficha)
  caja = document.createElement('div')
  document.body.appendChild(caja)
  root = createRoot(caja)
  const hecho = vi.fn()
  await act(async () => { root!.render(<HojaPedido pedidoId={P} onCerrar={() => {}} onHecho={hecho} />) })
  await esperar()
  return hecho
}
afterEach(() => { act(() => root?.unmount()); root = null; caja?.remove(); document.body.innerHTML = ''; bajar.mockClear() })

const ESTADO = { ok: true, total: 84000, facturado: 0, queda: 84000, partes: 0, pendientes: [] }
const FISCAL = { prendido: true, ambiente: 'homologacion', fiscal: { doc: '30718508181', razonSocial: 'X SA', domicilio: 'Rosario', condicion: 'ri' }, facturas: [] }
const escribir = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const campo = (rotulo: string) => [...document.querySelectorAll('label')].find((l) => l.textContent?.includes(rotulo))?.querySelector('input') as HTMLInputElement

describe('«Facturar una parte» en la hoja del pedido', () => {
  it('sin facturas ⇒ «Facturar» y «Facturar una parte»; con partes ⇒ sólo la parte; con la entera ⇒ ninguno', async () => {
    await montar({ ...base, facturacion: SIN })
    expect(boton('Facturar')).toBeDefined()
    expect(boton('Facturar una parte')).toBeDefined()
    act(() => root?.unmount()); root = null
    await montar({ ...base, facturacion: { ...SIN, partes: 1, facturado: 30000, queda: 54000 } })
    expect(boton('Facturar')).toBeUndefined()
    expect(boton('Facturar una parte')).toBeDefined()
    expect(document.body.textContent).toMatch(/Facturado \$30\.000 de \$84\.000/)
    act(() => root?.unmount()); root = null
    await montar({ ...base, facturacion: { ...SIN, entera: { id: 'f1', tipo: 1, pto_vta: 2, numero: 9, fecha: null, total: 84000 }, facturado: 84000, queda: 0 } })
    expect(boton('Facturar')).toBeUndefined()
    expect(boton('Facturar una parte')).toBeUndefined()
  })
  it('monto ⇒ renglones ajustados; se corrige uno y «Facturar $X» manda los renglones como quedaron', async () => {
    const hecho = await montar({ ...base, facturacion: SIN })
    cliente.leerFacturasClientePanel.mockResolvedValue(FISCAL)
    cliente.proponerPartePanel.mockResolvedValueOnce(ESTADO).mockResolvedValueOnce({
      ...ESTADO, precios: 'ajustados', propuesta: { total: 20000, renglones: [{ clave: '1:10', descripcion: 'Funda Mom - iPhone 13', cantidad: 2, unitario: 10000, importe: 20000 }] },
    })
    const PARTE = { ...FACTURA, numero: 10, total: 18000, clase: 'parte' }
    cliente.emitirPartePanel.mockResolvedValue({ ok: true, total: 84000, facturado: 18000, queda: 66000, factura: PARTE })
    await act(async () => { boton('Facturar una parte')!.click() })
    await esperar()
    expect(cliente.proponerPartePanel).toHaveBeenCalledWith({ pedidoId: P })
    expect(document.body.textContent).toMatch(/Quedan \$84\.000 por facturar/)
    await escribir(campo('Monto a facturar'), '20000')
    await act(async () => { boton('Proponer los renglones')!.click() })
    await esperar()
    expect(cliente.proponerPartePanel).toHaveBeenLastCalledWith({ pedidoId: P, monto: 20000, precios: 'ajustados' })
    expect(boton(/^Facturar \$20\.000/)).toBeDefined()
    await escribir(campo('Precio unitario'), '9000')
    await act(async () => { boton(/^Facturar \$18\.000/)!.click() })
    await esperar()
    expect(cliente.emitirPartePanel).toHaveBeenCalledWith({ pedidoId: P, renglones: [{ clave: '1:10', descripcion: 'Funda Mom - iPhone 13', cantidad: 2, unitario: 9000 }] })
    expect(hecho).toHaveBeenCalledWith('Factura A 00002-00000010 hecha por $18.000. Quedan $66.000 por facturar.')
    expect(bajar).toHaveBeenCalledWith(PARTE)
  })
  it('«¿quiere los precios reales?» = sí ⇒ pide reales; pasarse de lo que queda apaga «Facturar»', async () => {
    await montar({ ...base, facturacion: { ...SIN, partes: 1, facturado: 80000, queda: 4000 } })
    cliente.leerFacturasClientePanel.mockResolvedValue(FISCAL)
    cliente.proponerPartePanel.mockResolvedValueOnce({ ...ESTADO, facturado: 80000, queda: 4000, partes: 1 }).mockResolvedValueOnce({
      ...ESTADO, queda: 4000, precios: 'reales', propuesta: { total: 3000, renglones: [{ clave: '1:10', descripcion: 'Funda', cantidad: 1, unitario: 3000, importe: 3000 }] },
    })
    await act(async () => { boton('Facturar una parte')!.click() })
    await esperar()
    await escribir(campo('Monto a facturar'), '4000')
    const sel = document.querySelector('select') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'si')
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => { boton('Proponer los renglones')!.click() })
    await esperar()
    expect(cliente.proponerPartePanel).toHaveBeenLastCalledWith({ pedidoId: P, monto: 4000, precios: 'reales' })
    await escribir(campo('Precio unitario'), '5000')
    expect(document.body.textContent).toMatch(/Se pasa de lo que queda/)
    expect(boton(/^Facturar \$5\.000/)!.disabled).toBe(true)
  })
})
