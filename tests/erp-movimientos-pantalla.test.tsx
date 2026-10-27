// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarMovimiento } from '@/lib/erp/movimientos.core.js'
import type { FilaMovimiento, StockDePrenda } from '@/lib/erp/cliente'

/**
 * **ERP › Stock › Movimientos, del lado de la pantalla.** El oráculo es lo que se LEE y lo que se APRIETA: las vistas con
 * su número, el resumen arriba, cantidad con signo y lo que quedó, el documento en palabras, que «quién» ⛔ invente una
 * persona, y que la fila abra la ficha de la PRENDA al costado. Las filas pasan por el núcleo real.
 */
const N = new Map([['1/1', { nombre: 'TOP SAHARA', talleNombre: 'S - CHOCOLATE', sku: 'TOP-0110-CH-S', barcode: '771' }], ['2/1', { nombre: 'BUZO ROMA', talleNombre: 'L - GRIS', sku: 'BUZ-0042-GR-L', barcode: '772' }]])
const m = (x: Record<string, unknown>) => armarMovimiento({ linea: 'zattia', size_id: 1, sku: null, barcode: null, hora_exacta: true, detalle: {}, ...x }, N) as FilaMovimiento
const FILAS = [
  m({ id: 3, product_id: 1, deposito: 'local', cantidad: -1, queda: 2, tipo: 'venta', origen: 'caja', origen_ref: 'v', ocurrido_en: '2026-10-19T13:25:00Z', venta_numero: 296, venta_usuario: 'camila' }),
  m({ id: 2, product_id: 2, deposito: 'local', cantidad: 3, queda: 5, tipo: 'transferencia', origen: 'repo', origen_ref: 'repo:x:entra', ocurrido_en: '2026-10-19T10:47:00Z', detalle: { transfer_id: 8101 } }),
  m({ id: 1, product_id: 2, deposito: 'deposito', cantidad: -3, queda: 11, tipo: 'transferencia', origen: 'repo', origen_ref: 'repo:x:sale', ocurrido_en: '2026-10-19T10:47:00Z', detalle: { transfer_id: 8101 } }),
]
const leerMovimientos = vi.fn(async (_m: string, desde: string, hasta: string) => ({ filas: FILAS, desde, hasta, cortado: false, libroHasta: '2026-10-19T16:00:00Z' }))
const ficha: StockDePrenda = {
  prenda: { producto: '1', talle: '1', nombre: 'TOP SAHARA', talleNombre: 'S - CHOCOLATE', sku: 'TOP-0110-CH-S', barcode: '771' },
  depositos: [{ deposito: 'local', libro: 2, gn: 2, diferencia: 0 }], historial: [], sinDeposito: [],
}
vi.mock('@/lib/erp/cliente', () => ({
  leerMovimientos: (a: string, b: string, c: string) => leerMovimientos(a, b, c),
  leerStockDePrenda: async () => ficha,
}))
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

async function montar() {
  const { MovimientosStock } = await import('@/components/erp/stock/MovimientosStock')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<MovimientosStock ajustar={ajustar} />) })
  await act(async () => {})
}
const todo = () => document.body.textContent ?? ''
const boton = (t: RegExp, en: ParentNode = document.body) => [...en.querySelectorAll('button')].find((b) => t.test(b.textContent ?? '') || t.test(b.getAttribute('aria-label') ?? ''))!
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
const filaDe = (t: string) => [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(t))!

describe('la lista de movimientos', () => {
  it('lee HOY al entrar; vistas con número, resumen arriba, signo, lo que quedó, documento y quién', async () => {
    await montar()
    expect(leerMovimientos).toHaveBeenCalledTimes(1)
    const [, desde, hasta] = leerMovimientos.mock.calls[0]
    expect(desde).toBe(hasta)
    expect(boton(/^Transferencias/).textContent).toContain('2')
    expect(todo()).toMatch(/Transferidas3 u/)
    expect(todo()).toMatch(/Salieron1 u1 u vendidas/)
    const venta = filaDe('TOP SAHARA').textContent
    expect(venta).toContain('-1')
    expect(venta).toContain('Venta #296')
    expect(venta).toContain('camila')
    const t = filaDe('Depósito').textContent
    expect(t).toContain('Transferencia 8101')
    expect(t).toContain('Reposición') // ⛔ una persona inventada
    await clic(boton(/^Ventas/))
    expect(host.querySelector('[role="table"]')!.textContent).not.toContain('BUZO ROMA')
  })

  it('cambiar el período vuelve a leer', async () => {
    await montar()
    const sel = host.querySelector('select[aria-label="Período"]') as HTMLSelectElement
    await act(async () => { sel.value = '7d'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => {})
    expect(leerMovimientos).toHaveBeenCalledTimes(2)
    const [, desde, hasta] = leerMovimientos.mock.calls[1]
    expect(desde < hasta).toBe(true)
  })

  it('la fila abre la ficha del producto al costado', async () => {
    await montar()
    await clic(filaDe('TOP SAHARA').querySelector('[role="cell"]:last-child')!)
    expect(document.querySelector('aside[aria-label^="Ficha del producto"]')).toBeTruthy()
  })
})
