// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * «Facturar» en la HOJA DEL PEDIDO mayorista (Darío §5): el verbo desde la pantalla — «Facturar» abre con los datos fiscales de
 * la FICHA del pedido, «Facturar $total» manda SÓLO el pedido (la ficha completa ⛔ manda datos) y baja el PDF; ya facturado ⇒
 * «Facturado ✓» con el número y ⛔ hay botón; con partes ⇒ «Facturado $X de $Y»; con la llave apagada el botón está apagado.
 */
const cliente = vi.hoisted(() => ({
  leerPedidoPanel: vi.fn(), leerFacturasClientePanel: vi.fn(), facturarPedidoPanel: vi.fn(),
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

describe('«Facturar» en la hoja del pedido', () => {
  it('ficha completa: manda sólo el pedido, avisa el número y baja el PDF', async () => {
    const hecho = await montar({ ...base, facturacion: SIN })
    cliente.leerFacturasClientePanel.mockResolvedValue({ prendido: true, ambiente: 'homologacion', fiscal: { doc: '30718508181', razonSocial: 'X SA', domicilio: 'Rosario', condicion: 'ri' }, facturas: [] })
    cliente.facturarPedidoPanel.mockResolvedValue({ ok: true, yaEstaba: false, factura: FACTURA })
    await act(async () => { boton('Facturar')!.click() })
    await esperar()
    expect(cliente.leerFacturasClientePanel).toHaveBeenCalledWith(C)
    expect(document.body.textContent).toContain('Sale factura A a X SA')
    expect(document.body.textContent).not.toContain('todavía no está preparado')
    await act(async () => { boton(/^Facturar \$/)!.click() })
    await esperar()
    expect(cliente.facturarPedidoPanel).toHaveBeenCalledWith({ pedidoId: P })
    expect(hecho).toHaveBeenCalledWith('Factura A 00002-00000009 hecha.')
    expect(bajar).toHaveBeenCalledWith(FACTURA)
  })
  it('ficha sin condición: pide los datos y los manda con el pedido', async () => {
    await montar({ ...base, pedido: { ...base.pedido, etapa: 'pedido' }, facturacion: SIN })
    cliente.leerFacturasClientePanel.mockResolvedValue({ prendido: true, ambiente: 'homologacion', fiscal: { doc: null, razonSocial: null, domicilio: null, condicion: null }, facturas: [] })
    cliente.facturarPedidoPanel.mockResolvedValue({ ok: true, yaEstaba: false, factura: { ...FACTURA, tipo: 6 } })
    await act(async () => { boton('Facturar')!.click() })
    await esperar()
    expect(document.body.textContent).toContain('todavía no está preparado')
    const sel = document.querySelector('select') as HTMLSelectElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, 'consumidor')
      sel.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => { boton(/^Facturar \$/)!.click() })
    await esperar()
    expect(cliente.facturarPedidoPanel).toHaveBeenCalledWith({ pedidoId: P, doc: '', condicion: 'consumidor', razonSocial: '', domicilio: '' })
  })
  it('ya facturado ⇒ «Facturado ✓» con el número y sin botón', async () => {
    await montar({ ...base, facturacion: { ...SIN, entera: { id: 'f1', tipo: 1, pto_vta: 2, numero: 9, fecha: null, total: 84000 }, facturado: 84000, queda: 0 } })
    expect(document.body.textContent).toContain('Facturado ✓ · A 00002-00000009')
    expect(boton('Facturar')).toBeUndefined()
  })
  it('por partes ⇒ «Facturado $X de $Y»', async () => {
    await montar({ ...base, facturacion: { ...SIN, partes: 2, facturado: 36000, queda: 48000 } })
    expect(document.body.textContent).toMatch(/Facturado \$36\.000 de \$84\.000/)
    expect(boton('Facturar')).toBeUndefined()
  })
  it('llave apagada ⇒ el botón está, apagado; anulado ⇒ ⛔ está', async () => {
    await montar({ ...base, escribir: false, facturacion: SIN })
    expect(boton('Facturar')!.disabled).toBe(true)
    act(() => root?.unmount()); root = null
    await montar({ ...base, pedido: { ...base.pedido, etapa: 'anulado' }, facturacion: SIN })
    expect(boton('Facturar')).toBeUndefined()
  })
})
