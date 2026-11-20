// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarFilasProductos } from '@/lib/erp/productos-lista.core.js'
import type { FilaProducto, PrecioDeProducto } from '@/lib/erp/cliente'

/**
 * **Areben Gestión › Productos y precios › Productos, del lado de la pantalla** (el molde del diseño). El oráculo es lo que se LEE y lo
 * que se APRIETA: las vistas con su número, el resumen arriba, que la fila abra la ficha al costado con las listas, las
 * variantes y el historial, y que el $ de la fila abra «Cargar en Areben Gestión» y cargue con el monto bien leído.
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
const leerListaDeProductos = vi.fn(async (): Promise<{ filas: FilaProducto[]; libroHasta: string; pedidosLeidosEn: null; tnLeidaEn: string; costos: boolean }> =>
  ({ filas: FILAS, libroHasta: '2026-10-19T16:00:00Z', pedidosLeidosEn: null, tnLeidaEn: '2026-10-19T15:00:00Z', costos: true }))
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
  costos: true,
}
const leerPrecioDeProducto = vi.fn(async (): Promise<PrecioDeProducto> => precio)
const editarProductoErp = vi.fn(async () => ({ ok: true, cambios: [{ campo: 'nombre', antes: 'TOP SAHARA', despues: 'TOP SAHARA NEGRO' }], desde_gn: true, variante: null, avisos: [] }))
const editarVarianteErp = vi.fn(async () => ({ ok: true, cambios: [{ campo: 'barcode', antes: '771', despues: '999' }], desde_gn: true, variante: null, avisos: [] }))
const cargarPrecioCosto = vi.fn(async () => ({ ok: true, futuro: false, aviso: null }))
let enErp = false
vi.mock('@/lib/erp/cliente', () => ({
  leerCorteDeLinea: async () => ({ en_erp: enErp }),
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
  it('🔴 sin costos (el local, Bruno 30-oct): ⛔ columna, vista ni tile «Sin costo», y la ficha abre sin la fila del costo', async () => {
    const sin = armarFilasProductos({ productos: [], stock: [], precios: [], tn: [], costos: null })
    leerListaDeProductos.mockResolvedValueOnce({ filas: FILAS.map(({ costo: _c, ...f }) => f as FilaProducto).concat(sin), libroHasta: '2026-10-19T16:00:00Z', pedidosLeidosEn: null, tnLeidaEn: '2026-10-19T15:00:00Z', costos: false })
    leerPrecioDeProducto.mockResolvedValueOnce({ ...precio, costo: null, costos: false, gn: { precio: 22990, mayorista: 13800 }, tn: { ...precio.tn!, costo: undefined } })
    await montar()
    expect(host.querySelector('[role="table"]')!.textContent).not.toMatch(/Costo/)
    expect([...host.querySelectorAll('button')].some((b) => /^Sin costo/.test(b.textContent ?? ''))).toBe(false)
    expect(todo()).not.toMatch(/Sin costo/)
    await clic(filaDe('TOP SAHARA'))
    const f = ficha()!
    expect(f.textContent).toContain('22.990')
    expect(f.textContent).not.toMatch(/Costo|Sin costo|7\.900/)
  })

  it('5 pestañas (Darío 20-nov): lo que falta completar va junto en «Para revisar», con un desplegable de qué; sin cuadros de resumen', async () => {
    await montar()
    const tabs = [...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.replace(/\d+$/, '').trim())
    expect(tabs).toEqual(['Todos', 'Con stock', 'Sin stock', 'Para revisar', 'Inactivos'])
    expect(boton(/^Con stock/).textContent).toContain('1')
    expect(todo()).not.toMatch(/Productos22 variantes/)
    expect(filaDe('TOP SAHARA').textContent).toContain('Publicado')
    expect(filaDe('CINTO CALYPSO').textContent).toContain('No está en Tienda Nube')
    await clic(boton(/^Para revisar/))
    const que = host.querySelector<HTMLSelectElement>('select[aria-label="Qué revisar"]')!
    expect([...que.options].map((o) => o.textContent)).toEqual(expect.arrayContaining(['Sin costo · 1', 'No están en Tienda Nube · 1']))
    await act(async () => { que.value = 'sinbarra'; que.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(host.querySelector('[role="table"]')!.textContent).not.toContain('TOP SAHARA')
  })

  it('la fila abre la ficha en ventana (Darío 20-nov): precios con Tienda Nube, variantes con su stock y un solo historial', async () => {
    await montar()
    await clic(filaDe('TOP SAHARA'))
    const f = ficha()!
    expect(f).toBeTruthy()
    expect(f.textContent).toContain('Precio Local')
    expect(f.querySelector('[aria-label="Precio por lista"]')!.textContent).toMatch(/Mayorista/)
    expect(f.querySelector('[aria-label="Stock por variante"]')!.textContent).toMatch(/TOP-0110-S/)
    expect(f.textContent).toContain('OC 12 · 20/09')
    expect(f.textContent).toContain('Precio Local · $ 22.990')
    expect(document.querySelector('[aria-label="Precio por lista"] input')).toBeNull()
  })

  it('el $ de la fila abre la ficha con el Local en edición; el lápiz del Costo carga el costo con el monto bien leído (Darío 20-nov)', async () => {
    await montar()
    await clic(boton('Cargar precio o costo', filaDe('TOP SAHARA')))
    const tabla = document.querySelector('[aria-label="Precio por lista"]')!
    expect(tabla.querySelector('input')).toBeTruthy()
    await clic(boton('Editar costo', tabla))
    const f = tabla
    const monto = [...f.querySelectorAll('label')].find((l) => l.textContent?.includes('Nuevo monto'))!.querySelector('input')!
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(monto, '8.100'); monto.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await clic(boton('Guardar', f))
    expect(cargarPrecioCosto).toHaveBeenCalledWith('zattia', expect.objectContaining({ que: 'costo', producto: '1', monto: 8100, proveedorId: '40' }))
    expect(todo()).toContain('Costo guardado.')
    expect(leerListaDeProductos).toHaveBeenCalledTimes(2)
  })

  it('«Corregir datos» (tabla, Darío 20-nov) cambia el nombre y el código de barras de una variante con UN guardar, y manda sólo lo que cambió', async () => {
    await montar()
    await clic(filaDe('TOP SAHARA'))
    await clic(boton('Editar', ficha()!))
    const poner = async (input: HTMLInputElement, v: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const nombre = [...document.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'Nombre')!.querySelector('input')!
    const f = nombre.closest('[role="dialog"]')!
    expect(boton('Guardar cambios', f).disabled).toBe(true)
    await poner(nombre, 'TOP SAHARA NEGRO')
    await poner(f.querySelector<HTMLInputElement>('input[aria-label^="Código de barras de"]')!, '999')
    // Sin ConfirmProvider, la confirmación es `window.confirm` (sí): guarda de una.
    await clic(boton('Guardar 2 cambios', f))
    expect(editarProductoErp).toHaveBeenCalledWith('zattia', '1', { nombre: 'TOP SAHARA NEGRO' })
    expect(editarVarianteErp).toHaveBeenCalledWith('zattia', '1', '1', { barcode: '999' })
    expect(editarVarianteErp).toHaveBeenCalledTimes(1)
    expect(todo()).toContain('2 cambios guardados.')
  })

  it('Eliminar (Darío 20-nov) va al lado de Editar: con stock apagado; sin stock pregunta y desactiva (queda en Inactivos)', async () => {
    await montar()
    await clic(filaDe('TOP SAHARA'))
    expect(boton('Eliminar', ficha()!).disabled).toBe(true)
    await clic(boton('Cerrar', ficha()!))
    await clic(filaDe('CINTO CALYPSO'))
    await clic(boton('Eliminar', ficha()!))
    expect(editarProductoErp).toHaveBeenCalledWith('zattia', '2', { activo: false })
    expect(leerListaDeProductos).toHaveBeenCalledTimes(2)
  })

  it('Precios: el $ de la fila abre la ficha con «Cargar en Areben Gestión» a la vista', async () => {
    const { PreciosErp } = await import('@/components/erp/productos/PreciosErp')
    host = document.createElement('div'); document.body.appendChild(host)
    await act(async () => { root = createRoot(host); root.render(<PreciosErp />) })
    await act(async () => {})
    await clic(boton('Cargar precio o costo', filaDe('TOP SAHARA')))
    expect(document.querySelector('[aria-label="Precio por lista"] input')).toBeTruthy()
  })

  it('🔴 Precios: el cartel sólo ANTES del corte (revisión 10-nov: decía «no cambia Tienda Nube» fijo; Darío 20-nov: ya cortada, sin cartel)', async () => {
    const { PreciosErp } = await import('@/components/erp/productos/PreciosErp')
    for (const [corto, conCartel] of [[false, true], [true, false]] as const) {
      enErp = corto
      host = document.createElement('div'); document.body.appendChild(host)
      await act(async () => { root = createRoot(host); root.render(<PreciosErp />) })
      await act(async () => {})
      expect(todo().includes('Mientras Gestión Nube funcione')).toBe(conCartel)
      expect(todo()).not.toContain('Tienda Nube lo muestra en hasta 2 horas')
      act(() => root?.unmount()); root = null; host.remove()
    }
    enErp = false
  })
})
