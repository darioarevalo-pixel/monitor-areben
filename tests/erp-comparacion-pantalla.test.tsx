// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarComparacion } from '@/lib/erp/comparacion.core.js'
import type { FilaComparacion } from '@/lib/erp/cliente'

/**
 * **ERP › Stock › Comparación con TN y ML, del lado de la pantalla.** El oráculo es lo que se LEE: se entra a «No coinciden»
 * con la que muestra DE MÁS arriba, la diferencia lleva su signo, «Qué pasa» habla como Conciliación, Mercado Libre dice que
 * ⛔ se compara y manda a Conciliación. Las filas pasan por el núcleo real.
 */
const fila = (id: string, sku: string, deps: Record<string, number>, linea = 'zattia') => ({
  id, producto: id.split('/')[0], talle: id.split('/')[1], nombre: `TOP ${id}`, talleNombre: 'S', sku, barcode: null,
  linea, deps, estanteria: 0, enPedidos: 0, disponible: 0, gn: null, negativo: false, ultimo: null,
})
const FILAS = armarComparacion({
  marca: 'zattia',
  filas: [fila('1/1', 'Z-1', { local: 1, deposito: 0 }), fila('2/2', 'Z-2', { local: 5, deposito: 0 }), fila('3/3', 'Z-3', { local: 2, deposito: 0 })],
  inventario: [{ product_id: '1', size_id: '1', store_name: 'Local', available_quantity: 4 }, { product_id: '3', size_id: '3', store_name: 'Local', available_quantity: 2 }],
  tn: [{ tienda: 'zattia', variant_id: 1, sku: 'Z-1', barcode: null, stock: 4 }, { tienda: 'zattia', variant_id: 2, sku: 'Z-2', barcode: null, stock: 3 }, { tienda: 'zattia', variant_id: 3, sku: 'Z-3', barcode: null, stock: 2 }],
}).filas as FilaComparacion[]
const leerComparacion = vi.fn(async () => ({
  filas: FILAS, sinLimite: 0, tnLeidas: { zattia: '2026-10-20T11:50:00Z', stunned: '2026-10-20T11:50:00Z' },
  ml: { fecha: '2026-10-19', noCierran: 44 }, libroHasta: '2026-10-20T12:00:00Z', pedidosLeidosEn: null,
}))
const leerEmpujesStock = vi.fn(async (_t: string) => ({ empujes: [] }))
vi.mock('@/lib/erp/cliente', () => ({ leerComparacion: () => leerComparacion(), leerEmpujesStock: (t: string) => leerEmpujesStock(t), mandarStockATN: vi.fn() }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))
const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, String(v)) },
  removeItem: (k: string) => { guardado.delete(k) }, clear: () => guardado.clear(),
})

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; localStorage.clear(); vi.clearAllMocks() })

const irAConciliacion = vi.fn()
async function montar() {
  const { ComparacionStock } = await import('@/components/erp/stock/ComparacionStock')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ComparacionStock ajustar={() => {}} irAConciliacion={irAConciliacion} />) })
  await act(async () => {})
}
const todo = () => document.body.textContent ?? ''

describe('Comparación con TN y ML', () => {
  it('entra a «No coinciden» con la que muestra de más arriba y la diferencia con signo', async () => {
    await montar()
    const filas = [...document.querySelectorAll('[role="row"]')].map((r) => r.textContent ?? '').filter((t) => t.includes('TOP'))
    expect(filas).toHaveLength(2)
    expect(filas[0]).toContain('TOP 1/1')
    expect(filas[0]).toContain('+3')
    expect(filas[0]).toContain('El ERP dice otro stock')
    expect(filas[1]).toContain('-2')
    expect(todo()).not.toContain('TOP 3/3')
  })

  it('el botón de enviar el stock va a la tienda de la línea (Zattia, sin línea elegida)', async () => {
    await montar()
    expect(leerEmpujesStock).toHaveBeenCalledWith('zattia')
    expect(todo()).toContain('Enviar el stock a Tienda Nube · Zattia')
    expect(todo()).not.toContain('no arregla nada')
  })

  it('Mercado Libre dice que no se compara y lleva a Conciliación', async () => {
    await montar()
    expect(todo()).toContain('Mercado Libre todavía no se compara acá')
    expect(todo()).toContain('44 publicaciones que no coinciden')
    const boton = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Ver en Conciliación')!
    await act(async () => { boton.click() })
    expect(irAConciliacion).toHaveBeenCalled()
  })
})
