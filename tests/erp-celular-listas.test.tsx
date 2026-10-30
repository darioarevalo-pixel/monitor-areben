// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarFilasClientes } from '@/lib/erp/clientes-lista.core.js'
import { armarFilasProductos } from '@/lib/erp/productos-lista.core.js'
import { armarMovimiento } from '@/lib/erp/movimientos.core.js'
import type { FilaCliente, FilaMovimiento, FilaProducto } from '@/lib/erp/cliente'

/**
 * 📱 **El ERP en el celular, las listas que siguen a Ventas y Stock** (30-oct): cada pantalla declara `movil` en sus
 * columnas y la fila sale como TARJETA. El oráculo es la tarjeta que se LEE con `?movil=1`: el nombre arriba, el número
 * que importa grande, a lo sumo 3 chicos, y lo `oculta` (el costo, el saldo de Clientes, el documento) ⛔ aparece.
 * Las filas pasan por el núcleo real de cada lista, como en sus tests de pantalla.
 */
const CLIENTES = armarFilasClientes({
  hoy: '2026-10-19',
  gn: [{ clave: '10', nombre: 'Barbara Spagnoli', compras: 26, total: 500000, primera: '2025-02-16', ultima: '2026-10-03', mayorista: 12, canales: ['Mayorista'] }],
}) as FilaCliente[]
const PRODUCTOS = armarFilasProductos({
  productos: [{ id: 1, nombre: 'TOP SAHARA', marca: 'zattia', categoria: 'TOPS', proveedor: 'AREBEN' }],
  stock: [{ producto: '1', talle: '1', nombre: 'TOP SAHARA', talleNombre: 'S', sku: 'TOP-0110-S', barcode: '771', linea: 'zattia', deps: { local: 2, deposito: 3 }, estanteria: 5, enPedidos: 1, disponible: 4 }],
  precios: [{ product_id: 1, marca: 'zattia', lista: 'local', precio: 22990 }],
  costos: [{ product_id: 1, marca: 'zattia', costo: 7900 }],
  tn: [{ product_id: 1, publicado: true }],
}) as FilaProducto[]
const N = new Map([['1/1', { nombre: 'TOP SAHARA', talleNombre: 'S - CHOCOLATE', sku: 'TOP-0110-CH-S', barcode: '771' }]])
const MOVIMIENTOS = [armarMovimiento({
  id: 3, product_id: 1, size_id: 1, linea: 'zattia', sku: null, barcode: null, hora_exacta: true, detalle: {}, deposito: 'local', cantidad: -1, queda: 2,
  tipo: 'venta', origen: 'caja', origen_ref: 'v', ocurrido_en: '2026-10-19T13:25:00Z', venta_numero: 296, venta_usuario: 'camila',
}, N) as FilaMovimiento]

vi.mock('@/lib/erp/cliente', () => ({
  leerListaDeClientes: async () => ({ filas: CLIENTES, gnHasta: '2026-10-19', clientesErp: 0, cuentaLista: true, porNombre: false }),
  leerListaDeProductos: async () => ({ filas: PRODUCTOS, libroHasta: '2026-10-19T16:00:00Z', pedidosLeidosEn: null, tnLeidaEn: '2026-10-19T15:00:00Z' }),
  leerMovimientos: async (_m: string, desde: string, hasta: string) => ({ filas: MOVIMIENTOS, desde, hasta, cortado: false, libroHasta: '2026-10-19T16:00:00Z' }),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))
const guardado = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => { guardado.set(k, String(v)) },
  removeItem: (k: string) => { guardado.delete(k) }, clear: () => guardado.clear(),
})

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; localStorage.clear(); window.history.replaceState(null, '', '/') })

async function montar(el: React.ReactElement) {
  window.history.replaceState(null, '', '/erp?movil=1')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(el) })
  await act(async () => {})
}
/** La única tarjeta, partida en lo que se lee. */
function tarjeta() {
  const t = [...host.querySelectorAll('[role="listitem"]')]
  expect(t).toHaveLength(1)
  expect(host.querySelector('[role="table"]')).toBeNull()
  expect(host.querySelector('[role="listitem"] input[type="checkbox"]')).toBeNull()
  const de = (m: string) => [...t[0].querySelectorAll(`[data-movil="${m}"]`)].map((x) => x.textContent ?? '')
  return { titulo: de('titulo'), dato: de('dato'), chicos: de('chico'), todo: t[0].textContent ?? '' }
}

describe('las listas del ERP en el celular', () => {
  it('Clientes: el nombre, lo comprado grande; tipo, última compra y cuántas compras', async () => {
    const { ClientesErp } = await import('@/components/erp/clientes/ClientesErp')
    await montar(<ClientesErp />)
    const t = tarjeta()
    expect(t.titulo).toEqual(['Barbara Spagnoli'])
    expect(t.dato).toHaveLength(1)
    expect(t.dato[0]).toContain('500.000')
    expect(t.chicos.length).toBeLessThanOrEqual(3)
    expect(t.todo).toContain('Mayorista · 03/10/26')
    expect(t.chicos).toContain('Compras 26')
    expect(t.todo).not.toContain('sin cuenta')
  })

  it('Productos: el producto, el disponible grande; el precio de Local con su nombre y ⛔ el costo', async () => {
    const { ProductosErp } = await import('@/components/erp/productos/ProductosErp')
    await montar(<ProductosErp />)
    const t = tarjeta()
    expect(t.titulo).toEqual(['TOP SAHARA'])
    expect(t.dato).toEqual(['4'])
    expect(t.chicos.length).toBeLessThanOrEqual(3)
    expect(t.chicos.some((c) => /^Local .*22\.990/.test(c))).toBe(true)
    expect(t.todo).not.toContain('7.900')
  })

  it('Movimientos: el producto, la cantidad grande; cuándo, tipo y dónde', async () => {
    const { MovimientosStock } = await import('@/components/erp/stock/MovimientosStock')
    await montar(<MovimientosStock ajustar={() => {}} />)
    const t = tarjeta()
    expect(t.titulo[0]).toContain('TOP SAHARA')
    expect(t.dato).toHaveLength(1)
    expect(t.dato[0]).toMatch(/1/)
    expect(t.chicos).toHaveLength(3)
  })
})
