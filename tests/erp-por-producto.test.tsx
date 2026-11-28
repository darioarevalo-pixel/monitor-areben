// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { agrupar, filtrar, renglonesDeVenta, resumen } from '@/lib/erp/ventas-producto.core.js'
import type { RenglonProducto } from '@/lib/erp/cliente'

/**
 * **Areben Gestión › Ventas › Por producto** (Diseño 8; 27-nov: de las ventas del ERP). El oráculo: lo vendido de cada renglón
 * reparte el descuento de SU venta y deja el envío aparte ⇒ Σ vendido + envíos = Σ total de las ventas (lo de «Por venta»);
 * lo agrupado suma lo mismo que los renglones (unidades NETAS: una devolución resta), el margen sólo con costo de TODOS sus
 * renglones (si no, «sin costo», ⛔ un 0), y la pantalla arranca agrupada, pasa a «Cada renglón» con su número y abre la ficha.
 */
const linea = (sku: string | null) => (sku?.startsWith('STU') ? 'stunned' : 'zattia')
const COSTOS = new Map([['7', 6000]])
const nombres = new Map([['7', 'CORSET FRANK'], ['8', 'TOP SAHARA'], ['20', 'CORPIÑO SERENA HONEY'], ['21', 'BOMBACHA SERENA HONEY']])
const talles = new Map([['7:1', 'S'], ['7:2', 'M'], ['8:1', 'U'], ['20:1', 'S'], ['21:1', 'S']])
const venta = (o: Record<string, unknown>) => ({ id: 'v1', numero: 500, tipo: 'venta', origen: 'caja', total: 15000, ocurrida_en: '2026-10-18T15:00:00Z', detalle: {}, cliente: 'Ana', lineas: [], ...o })
const linea1 = (o: Record<string, unknown>) => ({ id: 'l1', product_id: 7, size_id: 1, sku: 'CRS-1', cantidad: 1, precio: 15000, importe: 15000, ...o })
const V = [
  venta({ lineas: [linea1({})] }),
  venta({ id: 'v2', numero: 501, origen: 'gn', detalle: { canal_gn: 'Tienda Nube' }, total: 49990, lineas: [linea1({ id: 'l2', size_id: 2, cantidad: 2, importe: 27000 }), linea1({ id: 'l4', product_id: 8, size_id: 1, sku: 'STU-0003', precio: 22990, importe: 22990 })] }),
  venta({ id: 'v3', numero: 502, tipo: 'cambio', total: -15000, lineas: [linea1({ id: 'l3', cantidad: -1, importe: -15000 })] }),
]
const R = V.flatMap((v) => renglonesDeVenta(v, { linea, costos: COSTOS, nombres, talles })) as RenglonProducto[]

describe('el núcleo', () => {
  it('TN #7588: el descuento se reparte entre los productos y el envío queda aparte (Σ vendido + envío = total)', () => {
    const v = venta({ id: 'v9', numero: 32062, origen: 'tn', total: 57198.82, detalle: { tn: { numero: 7588, envio: 12207.82, descuento: 4999 } },
      lineas: [linea1({ id: 'a', product_id: 20, sku: 'BKC-0017-S', precio: 22319.16, importe: 22319.16 }), linea1({ id: 'b', product_id: 21, sku: 'BKB-0017-S', precio: 27670.84, importe: 27670.84 })] })
    const r = renglonesDeVenta(v, { linea, nombres, talles })
    expect(r.map((x) => [x.nombre, x.talle, x.total])).toEqual([['CORPIÑO SERENA HONEY', 'S', 20087.24], ['BOMBACHA SERENA HONEY', 'S', 24903.76]])
    expect(resumen(r)).toMatchObject({ vendido: 44991, envios: 12207.82, ventas: 1 })
    expect(r[0]).toMatchObject({ canal: 'Tienda Nube', tn: '7588', envio: 12207.82 })
    expect(filtrar(r, { q: '7588' })).toHaveLength(2)
  })
  it('el envío de GN y del mayorista (`detalle.envio`) también queda aparte, y se cuenta UNA vez por venta', () => {
    const v = venta({ total: 31500, detalle: { envio: 6903.22, canal_gn: 'Mi Local' }, origen: 'gn', lineas: [linea1({ importe: 14490 }), linea1({ id: 'l9', importe: 14490 })] })
    const r = renglonesDeVenta(v, { linea })
    expect(resumen(r).envios).toBe(6903.22)
    expect(Math.round((resumen(r).vendido + resumen(r).envios) * 100) / 100).toBe(31500)
    expect(r[0].canal).toBe('Local')
  })
  it('agrupa por producto con unidades netas, ventas distintas y margen sólo con costo', () => {
    const [corset, top] = agrupar(R).sort((a, b) => a.nombre.localeCompare(b.nombre))
    expect(corset).toMatchObject({ unidades: 2, ventas: 3, vendido: 27000, promedio: 13500, costo: 12000, margen: 15000, talles: 'M 2' }) // la S vendida y devuelta ⛔ queda
    expect(top).toMatchObject({ unidades: 1, margen: null, linea: 'stunned' })
  })
  it('el resumen cuenta lo mismo que los renglones y dice cuántos van sin costo', () => {
    expect(resumen(R)).toMatchObject({ unidades: 3, vendido: 49990, productos: 2, ventas: 3, margen: 15000, sinCosto: 1, envios: 0 })
  })
  it('busca por nombre, SKU, venta o cliente; filtra línea y origen', () => {
    expect(filtrar(R, { q: '502' }).map((r) => r.id)).toEqual(['l3'])
    expect(filtrar(R, { linea: 'stunned' }).map((r) => r.id)).toEqual(['l4'])
    expect(filtrar(R, { canal: 'Tienda Nube' }).map((r) => r.id)).toEqual(['l2', 'l4'])
    expect(R[0].canal).toBe('Local')
    expect(R.find((r) => r.id === 'l3')?.canal).toBe('Cambio')
  })
  it('sin costos (el perfil ⛔ los ve) ⇒ ningún margen', () => {
    expect(agrupar(renglonesDeVenta(V[0], { linea })).map((g) => g.margen)).toEqual([null])
  })
})

const leer = vi.fn(async () => ({ renglones: R, desde: '2026-10-01', hasta: '2026-10-20', costos: true }))
const corte = { en_erp: false }
vi.mock('@/lib/erp/cliente', () => ({ leerVentasPorProducto: () => leer(), leerCorteDeLinea: async () => corte, leerListaDeProductos: async () => ({ filas: [] }) }))
vi.mock('@/components/erp/productos/FichaProducto', () => ({ FichaProducto: ({ producto }: { producto: string }) => <aside aria-label="ficha">Ficha del producto {producto}</aside> }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno', admin: true } }) }))
const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, String(v)) }, removeItem: (k: string) => { guardado.delete(k) }, clear: () => guardado.clear() })

let root: Root | null = null
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ''; localStorage.clear() })
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
const filas = () => [...document.querySelectorAll('[role="row"]')].slice(1)

describe('la pantalla', () => {
  it('arranca en Resumen, abre las VENTAS del producto en una ventana y en Detalle la ficha del producto', async () => {
    const { PorProductoErp } = await import('@/components/erp/ventas/PorProductoErp')
    const host = document.createElement('div'); document.body.appendChild(host)
    await act(async () => { root = createRoot(host); root.render(<PorProductoErp />) })
    await act(async () => {})
    const vistas = [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent)
    expect(vistas).toEqual(['Resumen2', 'Detalle4'])
    expect(filas()[0].textContent).toContain('CORSET FRANK') // el más vendido primero
    expect(document.body.textContent).toContain('$ 49.990')
    expect(document.body.textContent).toContain('sin contar 1 sin costo')
    // Darío 19-nov: el clic en Resumen abre las ventas del producto (por variante), ⛔ la ficha del catálogo.
    await clic(filas()[0].querySelectorAll('[role="cell"]')[0])
    const ventana = document.querySelector('[role="dialog"]')
    expect(ventana?.textContent).toContain('CORSET FRANK')
    expect(ventana?.textContent).toContain('Ver ficha del producto')
    expect(document.querySelector('aside[aria-label="ficha"]')).toBeNull()
    await clic([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Ver ficha del producto')!)
    expect(document.querySelector('aside[aria-label="ficha"]')?.textContent).toContain('Ficha del producto')
  })

  it('en Detalle, un renglón por producto de cada venta; el clic abre la ficha del producto', async () => {
    const { PorProductoErp } = await import('@/components/erp/ventas/PorProductoErp')
    const host = document.createElement('div'); document.body.appendChild(host)
    await act(async () => { root = createRoot(host); root.render(<PorProductoErp />) })
    await act(async () => {})
    await clic([...document.querySelectorAll('[role="tab"]')][1])
    expect(filas()).toHaveLength(4)
    expect(filas()[0].textContent).toContain('18/10')
    await clic(filas()[0].querySelectorAll('[role="cell"]')[2])
    expect(document.querySelector('aside[aria-label="ficha"]')?.textContent).toContain('Ficha del producto')
  })

  it('sin subtítulo ni cartel (Darío 19-nov): de dónde sale el margen, chico al pie', async () => {
    const { PorProductoErp } = await import('@/components/erp/ventas/PorProductoErp')
    const host = document.createElement('div'); document.body.appendChild(host)
    await act(async () => { root = createRoot(host); root.render(<PorProductoErp />) })
    await act(async () => {})
    expect(document.body.textContent).not.toContain('que es el que vende hoy')
    expect(document.body.textContent).not.toContain('Hacé clic en uno')
    expect(document.body.textContent).not.toContain('el margen usa el costo de hoy')
    expect(document.body.textContent).toContain('2 de 2')
  })
})
