// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * «Agregar producto» en la hoja del pedido mayorista (Darío §2, plan «BDI directo al ERP» paso 3): el verbo ENTERO desde la
 * pantalla — abrir el buscador, buscar, elegir una variante, «Guardar» — y lo que viaja al servidor: los renglones de
 * antes con su cantidad Y el agregado. Un producto sin precio mayorista se ve pero ⛔ se agrega; elegir una variante que
 * ya está suma uno (⛔ un renglón repetido, que el motor rechaza).
 *
 * Monta de verdad (`createRoot` + `act`): lo que se prueba vive en efectos y cambios de estado.
 */

const cliente = vi.hoisted(() => ({
  leerPedidoPanel: vi.fn(),
  buscarProductosPedido: vi.fn(),
  cambiarPedidoPanel: vi.fn(),
  mandarAPrepararPanel: vi.fn(),
  anularPedidoPanel: vi.fn(),
  entrarPedidoPanel: vi.fn(),
  leerPedidosPanel: vi.fn(),
  leerPreparadosSinPagar: vi.fn(),
}))
vi.mock('@/lib/erp/cliente', () => cliente)
vi.mock('@/components/panel/CuentaCorriente', () => ({ useCuentaPrendida: () => true }))

import { HojaPedido } from '@/components/panel/PedidosMayoristas'

const P = '11111111-1111-4111-8111-111111111111'
const ficha = {
  prendido: true, escribir: true,
  pedido: { id: P, numero: 12, recibido_en: '2026-10-30T15:00:00Z', etapa: 'pedido', total: 1000, unidades: 2, persona: null, venta_id: 'v', editable: true, a_preparar_por: null },
  lineas: [{ product_id: 1, size_id: 10, cantidad: 2, precio: 500, stock: 8, nombre: 'Funda Mom', talle: 'iPhone 13' }],
  cambios: [],
}
const productos = [
  { product_id: 3, nombre: 'Funda Cargo', precio: 1250, variantes: [{ size_id: 30, talle: 'iPhone 15', sku: 'CA-15', stock: 4, en_pedido: false }] },
  { product_id: 4, nombre: 'Funda sin precio', precio: null, variantes: [{ size_id: 40, talle: 'iPhone 15', sku: null, stock: 9, en_pedido: false }] },
  { product_id: 1, nombre: 'Funda Mom', precio: 900, variantes: [{ size_id: 10, talle: 'iPhone 13', sku: null, stock: 8, en_pedido: true }] },
]

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let caja: HTMLDivElement
const botones = () => [...document.querySelectorAll('button')]
const boton = (txt: string | RegExp) => {
  const b = botones().find((x) => (typeof txt === 'string' ? x.textContent?.trim() === txt : txt.test(x.textContent ?? '')))
  if (!b) throw new Error(`No está el botón «${txt}»: ${botones().map((x) => x.textContent).join(' | ')}`)
  return b
}
const esperar = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }
const escribir = async (input: HTMLInputElement, valor: string) => {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(async () => {
  for (const f of Object.values(cliente)) f.mockReset()
  cliente.leerPedidoPanel.mockResolvedValue(ficha)
  cliente.buscarProductosPedido.mockResolvedValue({ prendido: true, productos })
  cliente.cambiarPedidoPanel.mockResolvedValue({ ok: true, ya: false, sinCambios: false, avisarDeposito: false, ventaId: 'v' })
  caja = document.createElement('div')
  document.body.appendChild(caja)
  root = createRoot(caja)
  await act(async () => { root.render(<HojaPedido pedidoId={P} onCerrar={() => {}} onHecho={() => {}} />) })
  await esperar()
})
afterEach(() => { act(() => root.unmount()); caja.remove() })

describe('«Agregar producto» en la hoja del pedido', () => {
  it('buscar, elegir y guardar: viajan los renglones de antes y el agregado', async () => {
    await act(async () => { boton('Agregar producto').click() })
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Buscar el producto"]')!
    await escribir(input, 'f')
    await esperar(350)
    expect(cliente.buscarProductosPedido).not.toHaveBeenCalled()
    await escribir(input, 'funda')
    await esperar(350)
    expect(cliente.buscarProductosPedido).toHaveBeenCalledWith(P, 'funda')
    expect(document.body.textContent).toContain('sin precio mayorista: no se puede agregar')
    expect(boton(/iPhone 15 · stock 9/).disabled).toBe(true)
    await act(async () => { boton(/iPhone 15 · stock 4/).click() })
    expect(document.body.textContent).toContain('Funda Cargo')
    expect(document.body.textContent).toContain('agregado')
    await act(async () => { boton('Guardar').click() })
    await esperar()
    expect(cliente.cambiarPedidoPanel).toHaveBeenCalledWith(P, [
      { productId: 1, sizeId: 10, cantidad: 2 },
      { productId: 3, sizeId: 30, cantidad: 1 },
    ])
  })

  it('elegir una variante que ya está en el pedido suma uno (⛔ un renglón repetido)', async () => {
    await act(async () => { boton('Agregar producto').click() })
    await escribir(document.querySelector<HTMLInputElement>('input[aria-label="Buscar el producto"]')!, 'mom')
    await esperar(350)
    await act(async () => { boton(/ya está/).click() })
    await act(async () => { boton('Guardar').click() })
    await esperar()
    expect(cliente.cambiarPedidoPanel).toHaveBeenCalledWith(P, [{ productId: 1, sizeId: 10, cantidad: 3 }])
  })

  it('un agregado que vuelve a 0 ⛔ viaja, y sin otro cambio ⛔ hay «Guardar»', async () => {
    await act(async () => { boton('Agregar producto').click() })
    await escribir(document.querySelector<HTMLInputElement>('input[aria-label="Buscar el producto"]')!, 'cargo')
    await esperar(350)
    await act(async () => { boton(/iPhone 15 · stock 4/).click() })
    const menos = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Uno menos"]')]
    await act(async () => { menos[1].click() })
    expect(document.body.textContent).not.toContain('agregado')
    expect(botones().some((b) => b.textContent?.trim() === 'Guardar')).toBe(false)
  })
})
