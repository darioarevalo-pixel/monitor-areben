// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarConciliacion } from '@/lib/erp/conciliacion.core.js'
import type { ConciliacionDelDia } from '@/lib/erp/cliente'

/**
 * **ERP › Conciliación, del lado de la pantalla** (18-oct). El oráculo es lo que se LEE: cuánto coincide sale del resumen
 * del motor, cada grupo dice qué mirar, la prenda abre su stock, el pedido abre Tienda Nube, y una base sin la 024 o un día
 * sin calcular lo DICEN (⛔ muestran «todo coincide»). Los datos pasan por el núcleo real (`armarConciliacion`).
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

let root: Root | null = null
let host: HTMLDivElement
const abrirPrenda = vi.fn()
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); vi.clearAllMocks() })

async function montar() {
  const { ConciliacionDia } = await import('@/components/erp/ConciliacionDia')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ConciliacionDia abrirPrenda={abrirPrenda} />) })
  await act(async () => {})
}
const texto = () => host.textContent ?? ''

describe('ConciliacionDia', () => {
  it('dice cuánto coincide, el diff de GN, ML sin conexión, y cada grupo con qué mirar', async () => {
    await montar()
    expect(leerConciliacion).toHaveBeenCalledWith('zattia', null)
    expect(texto()).toContain('3 no coinciden')
    expect(texto()).toContain('Coinciden 8 de 10 variantes (80.0%) · 1 de la tienda sin producto en el ERP')
    expect(texto()).toContain('1 de 20 pedidos no coinciden')
    expect(texto()).toContain('Coinciden los 20 pedidos')
    expect(texto()).toContain('3 sin explicar: verlas en Diferencias del día')
    expect(texto()).toContain('Todavía sin conexión')
    expect(texto()).toContain('El ERP dice otro stock · 1')
    expect(texto()).toContain('(1 vienen de días anteriores)')
    expect(texto()).toContain('Cancelado con la venta activa en GN · 1')
  })
  it('la prenda abre su stock (con la marca de la BASE); la de TN sin producto ⛔ abre nada; el pedido va a TN', async () => {
    await montar()
    const filaDe = (t: string) => [...host.querySelectorAll('tr')].find((tr) => tr.textContent?.includes(t))!
    await act(async () => { filaDe('Remera Lisa · M').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(abrirPrenda).toHaveBeenCalledWith({ marca: 'zattia', producto: '1', talle: '10' })
    await act(async () => { filaDe('XX-1').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(abrirPrenda).toHaveBeenCalledTimes(1)
    const a = host.querySelector('a[href*="/orders/99"]') as HTMLAnchorElement
    expect(a.href).toBe('https://zattiaco.mitiendanube.com/admin/orders/99')
  })
  it('Stunned se pide como stunned y abre la prenda en la base de Zattia', async () => {
    await montar()
    const tab = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Stunned')!
    await act(async () => { tab.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => {})
    expect(leerConciliacion).toHaveBeenLastCalledWith('stunned', null)
    const filaDe = (t: string) => [...host.querySelectorAll('tr')].find((tr) => tr.textContent?.includes(t))!
    await act(async () => { filaDe('Remera Lisa · M').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(abrirPrenda).toHaveBeenCalledWith({ marca: 'zattia', producto: '1', talle: '10' })
  })
  it('sin la 024 lo dice; un día sin calcular ⛔ dice «todo coincide»', async () => {
    leerConciliacion.mockResolvedValueOnce({ ...conDatos(), sinTablas: true, fecha: null, dias: [] })
    await montar()
    expect(texto()).toContain('todavía no está instalada')
    expect(texto()).not.toContain('Todo coincide')
    act(() => root?.unmount()); root = null; host.remove()
    leerConciliacion.mockResolvedValueOnce({ sinTablas: false, fecha: '2026-10-18', dias: ['2026-10-18'], calculadoEn: null, ...armarConciliacion({ tienda: 'zattia', filas: [], resumen: null, nombres: new Map() }) })
    await montar()
    expect(texto()).toContain('No se calculó ese día.')
    expect(texto()).not.toContain('Todo coincide')
  })
})
