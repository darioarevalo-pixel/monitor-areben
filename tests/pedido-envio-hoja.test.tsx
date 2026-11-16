// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * El ENVÍO en la hoja del pedido (Darío 15-nov): «+ Envío» → monto + transporte → `ponerEnvioPedidoPanel`; «Sacar» manda null;
 * con el pedido facturado ⛔ hay botón (la línea se ve igual); con envío, «💬 Total» copia el total con el envío incluido.
 */
const cliente = vi.hoisted(() => ({
  leerPedidoPanel: vi.fn(), leerFacturasClientePanel: vi.fn(), facturarPedidoPanel: vi.fn(), ponerEnvioPedidoPanel: vi.fn(),
  buscarProductosPedido: vi.fn(), cambiarPedidoPanel: vi.fn(), mandarAPrepararPanel: vi.fn(), anularPedidoPanel: vi.fn(),
  entrarPedidoPanel: vi.fn(), leerPedidosPanel: vi.fn(), leerPreparadosSinPagar: vi.fn(),
}))
vi.mock('@/lib/erp/cliente', () => cliente)
vi.mock('@/components/panel/CuentaCorriente', () => ({ useCuentaPrendida: () => true }))
vi.mock('@/lib/arca/factura-pdf', () => ({ descargarFactura: vi.fn(async () => {}) }))

import { HojaPedido } from '@/components/panel/PedidosMayoristas'

const P = '11111111-1111-4111-8111-111111111111'
const base = {
  prendido: true, escribir: true,
  pedido: { id: P, numero: 12, recibido_en: '2026-11-15T15:00:00Z', etapa: 'pedido', total: 84000, unidades: 2, persona: null, venta_id: 'v', cliente_id: 'c', editable: true, a_preparar_por: null },
  lineas: [{ product_id: 1, size_id: 10, cantidad: 2, precio: 42000, stock: 8, nombre: 'Funda Mom', talle: 'iPhone 13' }],
  cambios: [],
  facturacion: { entera: null, partes: 0, total: 84000, facturado: 0, queda: 84000 },
}

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
let caja: HTMLDivElement
const boton = (txt: string) => [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === txt)
const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
async function montar(ficha: object) {
  for (const f of Object.values(cliente)) f.mockReset()
  cliente.leerPedidoPanel.mockResolvedValue(ficha)
  cliente.ponerEnvioPedidoPanel.mockResolvedValue({ ok: true, ya: false, sinCambios: false, avisarDeposito: false, ventaId: 'v' })
  caja = document.createElement('div')
  document.body.appendChild(caja)
  root = createRoot(caja)
  await act(async () => { root!.render(<HojaPedido pedidoId={P} onCerrar={() => {}} onHecho={() => {}} />) })
  await esperar()
}
const escribir = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
afterEach(() => { act(() => root?.unmount()); root = null; caja?.remove(); document.body.innerHTML = '' })

describe('Envío en la hoja del pedido', () => {
  it('sin envío: «+ Envío», monto y transporte → lo guarda', async () => {
    await montar(base)
    expect(boton('💬Total')).toBeUndefined()
    await act(async () => { boton('+ Envío')!.click() })
    await escribir(document.querySelector('input[inputmode="decimal"]') as HTMLInputElement, '12.500')
    await act(async () => { boton('Andreani')!.click() })
    await act(async () => { boton('Guardar')!.click() })
    await esperar()
    expect(cliente.ponerEnvioPedidoPanel).toHaveBeenCalledWith(P, 12500, 'Andreani')
  })
  it('con envío: se ve, «Sacar» lo saca y está «💬 Total»', async () => {
    await montar({ ...base, pedido: { ...base.pedido, total: 96500, envio: 12500, transporte: 'Andreani' } })
    expect(document.body.textContent).toContain('Envío (Andreani)')
    expect([...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Total'))).toBe(true)
    await act(async () => { boton('Cambiar')!.click() })
    await act(async () => { boton('Sacar')!.click() })
    await esperar()
    expect(cliente.ponerEnvioPedidoPanel).toHaveBeenCalledWith(P, null, null)
  })
  it('facturado: la línea se ve pero no se cambia', async () => {
    await montar({ ...base, pedido: { ...base.pedido, total: 96500, envio: 12500, transporte: null },
      facturacion: { entera: { id: 'f', tipo: 1, pto_vta: 2, numero: 9, total: 96500 }, partes: 0, total: 96500, facturado: 96500, queda: 0 } })
    expect(document.body.textContent).toContain('Envío')
    expect(boton('Cambiar')).toBeUndefined()
    expect(boton('+ Envío')).toBeUndefined()
  })
})
