// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarFilasStock } from '@/lib/erp/stock-lista.core.js'
import type { FilaStock, StockDePrenda } from '@/lib/erp/cliente'

/**
 * **ERP › Stock › Stock, del lado de la pantalla** (el molde del diseño). El oráculo es lo que se LEE y lo que se APRIETA:
 * las vistas con su número, el disponible en grande arriba, que la fila abra la ficha al costado con su historial, que
 * «Ajustar» lleve la prenda a «Nuevo ajuste», y que la prenda pedida desde Diferencias abra su ficha sola.
 * Las filas pasan por el núcleo real (`armarFilasStock`).
 */
const FILAS = armarFilasStock({
  marca: 'zattia',
  inventario: [
    { product_id: 1, size_id: 1, store_name: 'Local', available_quantity: 2, product_name: 'TOP SAHARA', size_name: 'S - CHOCOLATE', sku: 'TOP-0110-CH-S', barcode: '771' },
    { product_id: 2, size_id: 1, store_name: 'Deposito ', available_quantity: 3, product_name: 'BUZO ROMA', size_name: 'L - GRIS', sku: 'BUZ-0042-GR-L', barcode: '772' },
  ],
  niveles: [{ product_id: 1, size_id: 1, deposito: 'local', nivel: 2, linea: 'zattia' }, { product_id: 1, size_id: 1, deposito: 'deposito', nivel: 5, linea: 'zattia' }, { product_id: 2, size_id: 1, deposito: 'deposito', nivel: 3, linea: 'zattia' }],
  ultimos: [{ product_id: 1, size_id: 1, tipo: 'venta', origen: 'caja', origen_ref: 'venta:296', ocurrido_en: '2026-10-19T13:25:00Z' }],
  reservado: new Map([['1/1', 1]]),
}) as FilaStock[]
const leerListaDeStock = vi.fn(async () => ({ filas: FILAS, libroHasta: '2026-10-19T16:00:00Z', pedidosLeidosEn: '2026-10-19T15:00:00Z', pedidos: 1, sinVariante: 0 }))
const ficha: StockDePrenda = {
  prenda: { producto: '1', talle: '1', nombre: 'TOP SAHARA', talleNombre: 'S - CHOCOLATE', sku: 'TOP-0110-CH-S', barcode: '771' },
  depositos: [{ deposito: 'deposito', libro: 5, gn: 5, diferencia: 0 }, { deposito: 'local', libro: 2, gn: 3, diferencia: 1 }],
  historial: [
    { id: '2', deposito: 'local', cantidad: -1, saldo: 2, tipo: 'venta', origen: 'caja', origen_ref: 'venta:296', ocurrido_en: '2026-10-19T13:25:00Z', linea: 'zattia', detalle: null },
    { id: '1', deposito: 'local', cantidad: 3, saldo: 3, tipo: 'apertura', origen: 'apertura', origen_ref: 'foto', ocurrido_en: '2026-10-13T12:00:00Z', linea: 'zattia', detalle: null },
  ],
  sinDeposito: [],
}
const leerStockDePrenda = vi.fn(async () => ficha)
vi.mock('@/lib/erp/cliente', () => ({ leerListaDeStock: () => leerListaDeStock(), leerStockDePrenda: () => leerStockDePrenda() }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))

const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, String(v)) },
  removeItem: (k: string) => { guardado.delete(k) }, clear: () => guardado.clear(),
})

let root: Root | null = null
let host: HTMLDivElement
const ajustar = vi.fn()
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; localStorage.clear(); vi.clearAllMocks() })

async function montar(pedida: { marca: 'zattia'; producto: string; talle: string } | null = null) {
  const { StockErp } = await import('@/components/erp/stock/StockErp')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<StockErp pedida={pedida} ajustar={ajustar} />) })
  await act(async () => {})
}
const todo = () => document.body.textContent ?? ''
const boton = (t: string | RegExp, en: ParentNode = document.body) => [...en.querySelectorAll('button')].find((b) => (typeof t === 'string' ? (b.textContent?.trim() === t || b.getAttribute('aria-label') === t) : t.test(b.textContent ?? '') || t.test(b.getAttribute('aria-label') ?? '')))!
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
const filaDe = (t: string) => [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(t))!
const fichaAbierta = () => document.querySelector('aside[aria-label^="Ficha de la prenda"]')

describe('la lista de stock', () => {
  it('vistas con su número, el disponible arriba y lo apartado por pedidos', async () => {
    await montar()
    expect(boton(/^Con stock/).textContent).toContain('2')
    expect(boton(/^Sin stock en el Local/).textContent).toContain('1')
    expect(todo()).toContain('9 u') // disponible: 6 + 3
    expect(todo()).toMatch(/Negativos0ninguna/)
    expect(todo()).toContain('1 apartadas por pedidos sin pagar')
    expect(filaDe('TOP SAHARA').textContent).toContain('Venta · 19/10 10:25')
    await clic(boton(/^Sin stock en el Local/))
    expect(host.querySelector('[role="table"]')!.textContent).not.toContain('TOP SAHARA')
    expect(host.querySelector('[role="table"]')!.textContent).toContain('BUZO ROMA')
  })

  it('el buscador encuentra por SKU', async () => {
    await montar()
    const input = host.querySelector('input[aria-label="Buscar en el stock"]') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'buz-0042')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelector('[role="table"]')!.textContent).not.toContain('TOP SAHARA')
    expect(host.querySelector('[role="table"]')!.textContent).toContain('BUZO ROMA')
  })

  it('la fila abre la ficha al costado: disponible, por depósito contra GN e historial con lo que quedó', async () => {
    await montar()
    await clic(filaDe('TOP SAHARA').querySelector('[role="cell"]:last-child')!)
    const f = fichaAbierta()!
    expect(f).toBeTruthy()
    expect(f.textContent).toContain('Disponible6')
    expect(f.textContent).toContain('GN +1')
    expect(f.textContent).toContain('Venta · -1')
    expect(f.textContent).toContain('Local · quedan 2 · Caja')
    expect(f.textContent).not.toContain('venta:296')
  })

  it('«Ajustar» de la fila lleva la prenda a «Nuevo ajuste»', async () => {
    await montar()
    await clic(boton('Ajustar', filaDe('BUZO ROMA')))
    expect(ajustar).toHaveBeenCalledWith(expect.objectContaining({ linea: 'zattia', producto: '2', talle: '1', sku: 'BUZ-0042-GR-L' }))
    expect(fichaAbierta()).toBeNull()
  })

  it('la prenda pedida desde Diferencias abre su ficha sola, con lo apartado de su fila', async () => {
    await montar({ marca: 'zattia', producto: '1', talle: '1' })
    expect(fichaAbierta()!.textContent).toContain('1 sin pagar')
  })

  it('ocultar una columna queda guardado para ese usuario', async () => {
    await montar()
    await clic(boton(/^Columnas · 8 de 11/))
    await clic(document.getElementById('col-est')!)
    expect(host.querySelector('[role="row"]')!.textContent).not.toContain('En estantería')
    act(() => root?.unmount()); root = null; host.remove()
    await montar()
    expect(host.querySelector('[role="row"]')!.textContent).not.toContain('En estantería')
    expect(boton(/^Columnas · 7 de 11/)).toBeTruthy()
  })
})
