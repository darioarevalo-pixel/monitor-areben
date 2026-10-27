// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarConciliacion } from '@/lib/erp/conciliacion.core.js'
import type { ConciliacionDelDia } from '@/lib/erp/cliente'

/**
 * **ERP › Conciliación, del lado de la pantalla** (18-oct; 🎨 19-oct con el molde de REGISTRO). El oráculo es lo que se LEE:
 * cuánto coincide sale del resumen del motor, cada clase es una vista con su número y qué mirar, la prenda abre su ficha AL
 * COSTADO, el pedido abre Tienda Nube, y una base sin la 024 o un día sin calcular lo DICEN (⛔ muestran «todo coincide»).
 * Los datos pasan por el núcleo real (`armarConciliacion`).
 */
const resumen = {
  stock_tn: { variantes: 12, sin_limite: 0, repetidas: 0, comparadas: 10, cierran: 8, clases: { stock_tn: { libro_aparte: 1, sin_variante: 1 } } },
  pedidos: { pedidos: 20, pagados: 18, ventas_erp: 18, clases: { pedido_gn: { cancelada_con_venta: 1 } } },
}
const filas = [
  { tipo: 'stock_tn', clave: '1:10', clase: 'libro_aparte', product_id: 1, size_id: 10, sku: 'R-1', tn: 5, libro: 3, reservado: 0, gn: 5, dias: 2, detalle: {} },
  { tipo: 'stock_tn', clave: 'tn:77', clase: 'sin_variante', product_id: null, size_id: null, sku: 'XX-1', tn: 4, libro: null, reservado: null, gn: null, dias: 1, detalle: {} },
  { tipo: 'pedido_gn', clave: '#7331', clase: 'cancelada_con_venta', numero: '7331', dias: 1, detalle: { tn_id: 99, status: 'cancelled', payment_status: 'voided', gateway: 'mercadopago', total: 1500 } },
]
const conDatos = (o = {}): ConciliacionDelDia => ({ sinTablas: false, fecha: '2026-10-18', dias: ['2026-10-18', '2026-10-17'], calculadoEn: '2026-10-18T16:41:00Z',
  ...armarConciliacion({ tienda: 'zattia', filas, resumen, nombres: new Map([['1/10', { nombre: 'Remera Lisa', talle: 'M' }]]), diaGN: { resumen: { porLinea: { zattia: { inexplicadas: 3 } } } } }), ...o })

const leerConciliacion = vi.fn(async (..._a: unknown[]): Promise<ConciliacionDelDia> => conDatos())
vi.mock('@/lib/erp/cliente', () => ({ leerConciliacion: (...a: unknown[]) => leerConciliacion(...a) }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))
const fichaDe = vi.fn()
vi.mock('@/components/erp/stock/FichaPrenda', () => ({ FichaPrenda: (p: { marca: string; prenda: { producto: string; talle: string } }) => { fichaDe(p.marca, p.prenda.producto, p.prenda.talle); return <aside aria-label="Ficha del producto">ficha {p.prenda.producto}/{p.prenda.talle}</aside> } }))

let root: Root | null = null
let host: HTMLDivElement
const ajustar = vi.fn()
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); vi.clearAllMocks() })

async function montar() {
  const { ConciliacionDia } = await import('@/components/erp/ConciliacionDia')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ConciliacionDia ajustar={ajustar} />) })
  await act(async () => {})
}
const texto = () => host.textContent ?? ''
const boton = (t: RegExp) => [...host.querySelectorAll('button')].find((b) => t.test(b.textContent ?? ''))!
const filaDe = (t: string) => [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(t))!
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await act(async () => {}) }

describe('ConciliacionDia', () => {
  it('dice cuánto coincide, el diff de Gestión Nube, Mercado Libre sin conexión, y cada clase como vista con su número', async () => {
    await montar()
    expect(leerConciliacion).toHaveBeenCalledWith('zattia', null)
    expect(texto()).toMatch(/No coinciden3del 18\/10/)
    expect(texto()).toContain('Coinciden 8 de 10 variantes · 1 de la tienda sin producto en el ERP')
    expect(texto()).toContain('80.0%')
    expect(texto()).toContain('1 de 20 pedidos no coinciden (7 días)')
    expect(texto()).toContain('Coinciden los 20 pedidos (7 días)')
    expect(texto()).toContain('sin explicar: verlas en Diferencias con Gestión Nube')
    expect(texto()).not.toContain('Stock: Mercado Libre')   // Zattia ⛔ vende en ML: sin tarjeta
    expect(boton(/^El ERP dice otro stock/).textContent).toContain('1')
    expect(boton(/^Cancelado con la venta activa en Gestión Nube/).textContent).toContain('1')
    await clic(boton(/^El ERP dice otro stock/))
    expect(texto()).toContain('(1 vienen de días anteriores)')
    expect(host.querySelectorAll('[role="row"]').length).toBeGreaterThan(0)
    expect(texto()).not.toContain('#7331')
  })
  it('el producto abre su ficha al costado (con la marca de la BASE); la de Tienda Nube sin producto ⛔ abre nada; el pedido va a Tienda Nube', async () => {
    await montar()
    await clic(filaDe('Remera Lisa · M'))
    expect(fichaDe).toHaveBeenCalledWith('zattia', '1', '10')
    fichaDe.mockClear()
    await clic(filaDe('XX-1'))
    expect(fichaDe).not.toHaveBeenCalledWith('zattia', expect.anything(), expect.anything())
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null)
    await clic(filaDe('#7331'))
    expect(abrir).toHaveBeenCalledWith('https://zattiaco.mitiendanube.com/admin/orders/99', '_blank', 'noopener')
    abrir.mockRestore()
  })
  it('Stunned se pide como stunned y abre el producto en la base de Zattia', async () => {
    await montar()
    const sel = host.querySelector('select[aria-label="Tienda"]') as HTMLSelectElement
    await act(async () => { sel.value = 'stunned'; sel.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => {})
    expect(leerConciliacion).toHaveBeenLastCalledWith('stunned', null)
    await clic(filaDe('Remera Lisa · M'))
    expect(fichaDe).toHaveBeenCalledWith('zattia', '1', '10')
  })
  it('sin la 024 lo dice; un día sin calcular ⛔ dice «todo coincide»', async () => {
    leerConciliacion.mockResolvedValueOnce({ ...conDatos(), sinTablas: true, fecha: null, dias: [] })
    await montar()
    expect(texto()).toContain('todavía no está instalada')
    expect(texto()).not.toContain('Todo coincide')
    act(() => root?.unmount()); root = null; host.remove()
    leerConciliacion.mockResolvedValueOnce({ sinTablas: false, fecha: '2026-10-18', dias: ['2026-10-18'], calculadoEn: null, ...armarConciliacion({ tienda: 'zattia', filas: [], resumen: null, nombres: new Map() }) })
    await montar()
    expect(texto()).toContain('Ese día no se calculó')
    expect(texto()).not.toContain('Todo coincide')
  })
})
