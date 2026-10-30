// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProveedorLineaErp, deLaTienda } from '@/lib/erp/linea-erp'

/**
 * **El buscador de productos respeta la tienda elegida** (visto 30-oct): la base de Zattia trae las dos líneas, y con
 * Stunned elegido el ajuste y la transferencia ofrecían productos de Zattia (y al revés). Se queda con los de la tienda.
 */
const STU = { producto: '10', talle: '1', sku: 'STU-REM-0019-M', barcode: '779001', nombre: 'REMERA STU', talleNombre: 'M', gn: 0 }
const ZAT = { producto: '20', talle: '2', sku: 'RRE-0052-BL', barcode: '779002', nombre: 'REMERA 1174', talleNombre: 'BLANCO', gn: 0 }
const m = vi.hoisted(() => ({
  buscarPrendas: vi.fn(), leerListaDeStock: vi.fn(), leerTransferenciasDoc: vi.fn(), leerDepositos: vi.fn(), leerAjustes: vi.fn(), leerStockDePrenda: vi.fn(),
  crearTransferenciaDoc: vi.fn(), armarTransferenciaDoc: vi.fn(), enviarTransferenciaDoc: vi.fn(), recibirTransferenciaDoc: vi.fn(), cancelarTransferenciaDoc: vi.fn(),
  crearAjuste: vi.fn(), aprobarAjuste: vi.fn(), descartarAjuste: vi.fn(),
}))
vi.mock('@/lib/erp/cliente', () => m)

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })
beforeEach(() => {
  m.buscarPrendas.mockResolvedValue({ variantes: [STU, ZAT], cortado: false })
  m.leerListaDeStock.mockResolvedValue({ filas: [] })
  m.leerTransferenciasDoc.mockResolvedValue({ transferencias: [], enTransito: [] })
  m.leerDepositos.mockResolvedValue({ depositos: [] })
  m.leerAjustes.mockResolvedValue({ linea: 'stunned', aContar: [], sinConciliacion: false, ajustes: [] })
  m.leerStockDePrenda.mockResolvedValue({ prenda: STU, depositos: [], historial: [], sinDeposito: [] })
})

const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
async function montar(el: React.ReactElement) {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(el) })
  await esperar()
}
async function escribir(input: HTMLInputElement, valor: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { set.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const boton = (t: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === t) as HTMLButtonElement
const opciones = () => [...host.querySelectorAll('button')].map((b) => b.textContent ?? '').filter((t) => t.startsWith('+ '))

describe('deLaTienda', () => {
  it('Stunned = los STU; Zattia = el resto; BDI = todo', () => {
    expect(deLaTienda([STU, ZAT], 'stunned')).toEqual([STU])
    expect(deLaTienda([STU, ZAT, { ...ZAT, sku: null }], 'zattia')).toEqual([ZAT, { ...ZAT, sku: null }])
    expect(deLaTienda([STU, ZAT], 'bdi')).toEqual([STU, ZAT])
  })
})

describe('El buscador con Stunned elegido', () => {
  it('Nuevo ajuste ofrece sólo los de Stunned', async () => {
    const { AjustesStock } = await import('@/components/erp/AjustesStock')
    await montar(<ProveedorLineaErp value="stunned"><AjustesStock /></ProveedorLineaErp>)
    await act(async () => { boton('Nuevo ajuste').click() })
    await escribir(host.querySelector('input[placeholder="código, código de barras o nombre"]') as HTMLInputElement, 'remera')
    await act(async () => { boton('Buscar').click() }); await esperar()
    expect(opciones()).toEqual(['+ REMERA STU · M'])
  })

  it('Mover: escanear el código de un producto de Zattia ⛔ lo suma', async () => {
    m.buscarPrendas.mockResolvedValue({ variantes: [ZAT], cortado: false })
    const { MoverYRecibir } = await import('@/components/erp/stock/MoverYRecibir')
    await montar(<ProveedorLineaErp value="stunned"><MoverYRecibir /></ProveedorLineaErp>)
    const caja = host.querySelector('input[placeholder^="Código"]') as HTMLInputElement
    await escribir(caja, '779002')
    await act(async () => { caja.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }); await esperar()
    expect(host.textContent).toContain('No encontré «779002»')
    expect(host.textContent).toContain('Todavía no se escaneó nada.')
  })
})
