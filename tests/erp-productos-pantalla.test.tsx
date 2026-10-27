// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarFilasProductos } from '@/lib/erp/productos-lista.core.js'
import type { FilaProducto, PrecioDeProducto } from '@/lib/erp/cliente'

/**
 * **ERP › Productos y precios › Productos, del lado de la pantalla** (el molde del diseño). El oráculo es lo que se LEE y lo
 * que se APRIETA: las vistas con su número, el resumen arriba, que la fila abra la ficha al costado con las listas, las
 * variantes y el historial, y que el $ de la fila abra «Cargar en el ERP» y cargue con el monto bien leído.
 * Las filas pasan por el núcleo real (`armarFilasProductos`).
 */
const FILAS = armarFilasProductos({
  productos: [{ id: 1, nombre: 'TOP SAHARA', marca: 'zattia', categoria: 'TOPS', proveedor: 'AREBEN' }, { id: 2, nombre: 'CINTO CALYPSO', marca: 'zattia', categoria: null, proveedor: null }],
  stock: [
    { producto: '1', talle: '1', nombre: 'TOP SAHARA', talleNombre: 'S', sku: 'TOP-0110-S', barcode: '771', linea: 'zattia', deps: { local: 2, deposito: 3 }, estanteria: 5, enPedidos: 1, disponible: 4 },
    { producto: '2', talle: '1', nombre: 'CINTO CALYPSO', talleNombre: 'U', sku: 'ACI-0014', barcode: null, linea: 'zattia', deps: { local: 0, deposito: 0 }, estanteria: 0, enPedidos: 0, disponible: 0 },
  ],
  precios: [{ product_id: 1, marca: 'zattia', lista: 'local', precio: 22990 }, { product_id: 1, marca: 'zattia', lista: 'mayorista', precio: 13800 }],
  costos: [{ product_id: 1, marca: 'zattia', costo: 7900 }],
  tn: [{ product_id: 1, publicado: true }],
}) as FilaProducto[]
const leerListaDeProductos = vi.fn(async () => ({ filas: FILAS, libroHasta: '2026-10-19T16:00:00Z', pedidosLeidosEn: null, tnLeidaEn: '2026-10-19T15:00:00Z' }))
const precio: PrecioDeProducto = {
  producto: '1', nombre: 'TOP SAHARA', skus: 1, tnLeidaEn: '2026-10-19T15:00:00Z', feria: null, avisos: [],
  listas: [
    { lista: 'local', nombre: 'Local', precio: 22990, fuente: 'gn', desde: '2026-10-01T12:00:00Z', usuario: 'gn', motivo: null, deLista: null, sigue: 'oferta', puedeSoltar: false },
    { lista: 'mayorista', nombre: 'Mayorista', precio: 13800, fuente: 'gn', desde: '2026-10-01T12:00:00Z', usuario: 'gn', motivo: null, deLista: null, sigue: null, puedeSoltar: false },
  ],
  costo: { costo: 7900, proveedor: 'AREBEN', proveedorId: '40', fuente: 'gn', desde: '2026-10-01T12:00:00Z', usuario: 'gn', motivo: null },
  proveedor: { id: '40', nombre: 'AREBEN', origen: 'ingresos', oc: { label: 'OC 12', fecha: '2026-09-20' } },
  gn: { precio: 22990, mayorista: 13800, costo: 7900 },
  tn: { tienda: 'zattia', variantes: 1, precio: 22990, promocional: null, cobra: 22990, costo: null, distintos: false },
  historial: [{ que: 'precio', lista: 'local', valor: 22990, fuente: 'gn', desde: '2026-10-01T12:00:00Z', usuario: 'gn', motivo: null }],
}
const leerPrecioDeProducto = vi.fn(async () => precio)
const editarProductoErp = vi.fn(async () => ({ ok: true, cambios: [{ campo: 'nombre', antes: 'TOP SAHARA', despues: 'TOP SAHARA NEGRO' }], desde_gn: true, variante: null, avisos: [] }))
const editarVarianteErp = vi.fn(async () => ({ ok: true, cambios: [{ campo: 'barcode', antes: '771', despues: '999' }], desde_gn: true, variante: null, avisos: [] }))
const cargarPrecioCosto = vi.fn(async () => ({ ok: true, futuro: false, aviso: null }))
vi.mock('@/lib/erp/cliente', () => ({
  leerListaDeProductos: () => leerListaDeProductos(),
  leerPrecioDeProducto: () => leerPrecioDeProducto(),
  leerProveedores: async () => ({ proveedores: [{ id: '40', nombre: 'AREBEN', cuit: null }] }),
  cargarPrecioCosto: (...a: unknown[]) => (cargarPrecioCosto as (...x: unknown[]) => unknown)(...a),
  soltarPrecio: vi.fn(), guardarProveedor: vi.fn(),
  leerHistorialDeEdicion: async () => ({ historial: [] }),
  editarProductoErp: (...a: unknown[]) => (editarProductoErp as (...x: unknown[]) => unknown)(...a),
  editarVarianteErp: (...a: unknown[]) => (editarVarianteErp as (...x: unknown[]) => unknown)(...a),
  agregarVarianteErp: vi.fn(),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))

const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, String(v)) },
  removeItem: (k: string) => { guardado.delete(k) }, clear: () => guardado.clear(),
})

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; window.confirm = () => true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; localStorage.clear(); vi.clearAllMocks() })

async function montar() {
  const { ProductosErp } = await import('@/components/erp/productos/ProductosErp')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ProductosErp />) })
  await act(async () => {})
}
const todo = () => document.body.textContent ?? ''
const boton = (t: string | RegExp, en: ParentNode = document.body) => [...en.querySelectorAll('button')].find((b) => (typeof t === 'string' ? (b.textContent?.trim() === t || b.getAttribute('aria-label') === t) : t.test(b.textContent ?? '') || t.test(b.getAttribute('aria-label') ?? '')))!
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
const filaDe = (t: string) => [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(t))!
const ficha = () => document.querySelector('aside[aria-label^="Ficha del producto"]')

describe('la lista de productos', () => {
  it('vistas con su número, el resumen arriba y el estado en Tienda Nube', async () => {
    await montar()
    expect(boton(/^Con stock/).textContent).toContain('1')
    expect(boton(/^Sin costo/).textContent).toContain('1')
    expect(boton(/^No están en Tienda Nube/).textContent).toContain('1')
    expect(todo()).toMatch(/Productos22 variantes/)
    expect(todo()).toContain('4 u')
    expect(filaDe('TOP SAHARA').textContent).toContain('Publicado')
    expect(filaDe('CINTO CALYPSO').textContent).toContain('No está en Tienda Nube')
    await clic(boton(/^Sin código de barras/))
    expect(host.querySelector('[role="table"]')!.textContent).not.toContain('TOP SAHARA')
  })

  it('la fila abre la ficha al costado: listas con Gestión Nube y Tienda Nube, variantes con su stock y el historial', async () => {
    await montar()
    await clic(filaDe('TOP SAHARA'))
    const f = ficha()!
    expect(f).toBeTruthy()
    expect(f.textContent).toContain('Precio Local')
    expect(f.querySelector('[aria-label="Precio por lista"]')!.textContent).toMatch(/Mayorista/)
    expect(f.querySelector('[aria-label="Stock por variante"]')!.textContent).toMatch(/TOP-0110-S/)
    expect(f.textContent).toContain('de Ingresos, OC 12 del 20/09')
    expect(f.textContent).toContain('Precio Local · $ 22.990')
    expect(f.textContent).not.toContain('Cargar en el ERP')
  })

  it('el $ de la fila abre «Cargar en el ERP» y carga el costo con el monto bien leído', async () => {
    await montar()
    await clic(boton('Cargar precio o costo', filaDe('TOP SAHARA')))
    const f = ficha()!
    expect(f.textContent).toContain('Cargar en el ERP')
    const monto = [...f.querySelectorAll('input')].find((i) => i.getAttribute('placeholder') === '$ 0')!
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(monto, '8.100'); monto.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await clic(boton('Cargar', f))
    expect(cargarPrecioCosto).toHaveBeenCalledWith('zattia', expect.objectContaining({ que: 'costo', producto: '1', monto: 8100, proveedorId: '40' }))
    expect(todo()).toContain('Costo cargado.')
    expect(leerListaDeProductos).toHaveBeenCalledTimes(2)
  })

  it('«Corregir datos» cambia el nombre y el código de una variante, y manda sólo lo que cambió', async () => {
    await montar()
    await clic(filaDe('TOP SAHARA'))
    const f = ficha()!
    await clic(boton('Corregir datos', f))
    const poner = async (input: HTMLInputElement, v: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const ent = (etiqueta: string) => [...f.querySelectorAll('label')].find((l) => l.textContent?.trim() === etiqueta)!.querySelector('input')!
    await poner(ent('Nombre'), 'TOP SAHARA NEGRO')
    await clic(boton('Guardar producto', f))
    await clic(boton('Guardar', document.body))
    expect(editarProductoErp).toHaveBeenCalledWith('zattia', '1', { nombre: 'TOP SAHARA NEGRO' })
    expect(todo()).toContain('Producto: nombre guardado.')
    await poner(ent('Código de barras'), '999')
    await clic([...f.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Guardar')[0])
    await clic(boton('Guardar', document.body))
    expect(editarVarianteErp).toHaveBeenCalledWith('zattia', '1', '1', { barcode: '999' })
  })

  it('Precios: el $ de la fila abre la ficha con «Cargar en el ERP» a la vista', async () => {
    const { PreciosErp } = await import('@/components/erp/productos/PreciosErp')
    host = document.createElement('div'); document.body.appendChild(host)
    await act(async () => { root = createRoot(host); root.render(<PreciosErp />) })
    await act(async () => {})
    await clic(boton('Cargar precio o costo', filaDe('TOP SAHARA')))
    expect(ficha()!.textContent).toContain('Cargar en el ERP')
  })
})
