// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { agrupar, armarRenglon, filtrar, resumen } from '@/lib/erp/ventas-producto.core.js'
import type { RenglonProducto } from '@/lib/erp/cliente'

/**
 * **ERP › Ventas › Por producto** (Diseño 8). El oráculo: lo agrupado suma lo mismo que los renglones (unidades NETAS: una
 * devolución de GN resta), el margen sólo con costo de TODOS sus renglones (si no, «sin costo», ⛔ un 0), y la pantalla
 * arranca agrupada, pasa a «Cada renglón» con su número y abre la ficha del producto al clic.
 */
const linea = (sku: string | null) => (sku?.startsWith('STU') ? 'stunned' : 'zattia')
const crudo = (o: Record<string, unknown>) => ({ id: 1, sale_id: 10, number: 500, date_sale: new Date('2026-10-18T03:00:00Z'), channel: 'Mi Local', client_name: 'Ana', product_id: 7, product_name: 'CORSET FRANK', size: 'S', quantity: 1, unit_price: 15000, total: 15000, sku: 'CRS-1', ...o })
const COSTOS = new Map([['7', 6000]])
const R = [
  armarRenglon(crudo({}), { linea, costos: COSTOS }),
  armarRenglon(crudo({ id: 2, sale_id: 11, number: 501, size: 'M', quantity: 2, total: 27000, channel: 'Tienda Nube' }), { linea, costos: COSTOS }),
  armarRenglon(crudo({ id: 3, sale_id: 12, number: 502, quantity: -1, total: -15000 }), { linea, costos: COSTOS }),
  armarRenglon(crudo({ id: 4, sale_id: 11, number: 501, product_id: 8, product_name: 'TOP SAHARA', sku: 'STU-0003', total: 22990, unit_price: 22990 }), { linea, costos: COSTOS }),
] as RenglonProducto[]

describe('el núcleo', () => {
  it('agrupa por producto con unidades netas, ventas distintas y margen sólo con costo', () => {
    const [corset, top] = agrupar(R).sort((a, b) => a.nombre.localeCompare(b.nombre))
    expect(corset).toMatchObject({ unidades: 2, ventas: 3, vendido: 27000, promedio: 13500, costo: 12000, margen: 15000, talles: 'M 2' }) // la S vendida y devuelta ⛔ queda
    expect(top).toMatchObject({ unidades: 1, margen: null, linea: 'stunned' })
  })
  it('el resumen cuenta lo mismo que los renglones y dice cuántos van sin costo', () => {
    expect(resumen(R)).toMatchObject({ unidades: 3, vendido: 49990, productos: 2, ventas: 3, margen: 15000, sinCosto: 1 })
  })
  it('busca por nombre, SKU, venta o cliente; filtra línea y origen', () => {
    expect(filtrar(R, { q: '502' }).map((r) => r.id)).toEqual(['3'])
    expect(filtrar(R, { linea: 'stunned' }).map((r) => r.id)).toEqual(['4'])
    expect(filtrar(R, { canal: 'Tienda Nube' }).map((r) => r.id)).toEqual(['2'])
    expect(R[0].canal).toBe('Local')
  })
  it('sin costos (el perfil ⛔ los ve) ⇒ ningún margen', () => {
    expect(agrupar([armarRenglon(crudo({}), { linea })]).map((g) => g.margen)).toEqual([null])
  })
})

const leer = vi.fn(async () => ({ renglones: R, desde: '2026-10-01', hasta: '2026-10-20', costos: true, gnHasta: '2026-10-20T03:00:00Z' }))
vi.mock('@/lib/erp/cliente', () => ({ leerVentasPorProducto: () => leer() }))
vi.mock('@/components/erp/productos/FichaProducto', () => ({ FichaProducto: ({ producto }: { producto: string }) => <aside aria-label="ficha">Ficha del producto {producto}</aside> }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))
const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, String(v)) }, removeItem: (k: string) => { guardado.delete(k) }, clear: () => guardado.clear() })

let root: Root | null = null
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; localStorage.clear() })
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
const filas = () => [...document.querySelectorAll('[role="row"]')].slice(1)

describe('la pantalla', () => {
  it('arranca agrupada, cambia a cada renglón y abre la ficha del producto', async () => {
    const { PorProductoErp } = await import('@/components/erp/ventas/PorProductoErp')
    const host = document.createElement('div'); document.body.appendChild(host)
    await act(async () => { root = createRoot(host); root.render(<PorProductoErp />) })
    await act(async () => {})
    const vistas = [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent)
    expect(vistas).toEqual(['Agrupado por producto2', 'Cada renglón4'])
    expect(filas()[0].textContent).toContain('CORSET FRANK') // el más vendido primero
    expect(document.body.textContent).toContain('$ 49.990')
    expect(document.body.textContent).toContain('1 productos sin costo')
    expect(document.body.textContent).toContain('llega hasta el 20/10')
    await clic([...document.querySelectorAll('[role="tab"]')][1])
    expect(filas()).toHaveLength(4)
    expect(filas()[0].textContent).toContain('18/10')
    await clic(filas()[0].querySelectorAll('[role="cell"]')[2])
    expect(document.querySelector('aside[aria-label="ficha"]')?.textContent).toContain('Ficha del producto')
  })
})
