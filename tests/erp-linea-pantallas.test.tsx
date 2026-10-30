// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ProveedorLineaErp } from '@/lib/erp/linea-erp'

/**
 * **Cada tienda ve lo suyo** (Bruno, 30-oct: «no quiero que siga pasando»): el buscador (⌘K) lee la base de Zattia, que trae
 * Zattia y Stunned; con Stunned elegido ⛔ aparece una venta ni una prenda de Zattia, y al revés.
 */
const venta = (id: string, marca: string) => ({ id, numero: Number(id), marca, tipo: 'venta', estado: 'confirmada', origen: 'caja', canal: 'local', deposito: 'local', total: 1000, prueba: false, ocurridaEn: '2026-10-27T12:00:00Z', cliente: `Cliente ${marca}` })
const STU = { producto: '10', talle: '1', sku: 'STU-REM-0019-M', barcode: '779001', nombre: 'REMERA STU', talleNombre: 'M', gn: 0 }
const ZAT = { producto: '20', talle: '2', sku: 'RRE-0052-BL', barcode: '779002', nombre: 'REMERA ZATTIA', talleNombre: 'BLANCO', gn: 0 }
const m = vi.hoisted(() => ({ buscarVentas: vi.fn(), buscarPrendas: vi.fn(), buscarClientas: vi.fn() }))
vi.mock('@/lib/erp/cliente', () => m)

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })
beforeEach(() => {
  m.buscarVentas.mockResolvedValue({ ventas: [venta('1', 'zattia'), venta('2', 'stunned')], cortado: false })
  m.buscarPrendas.mockResolvedValue({ variantes: [STU, ZAT], cortado: false })
  m.buscarClientas.mockResolvedValue({ clientas: [] })
})

async function buscar(linea: 'zattia' | 'stunned', texto: string) {
  const { BusquedaGlobal } = await import('@/components/erp/BusquedaGlobal')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<ProveedorLineaErp value={linea}><BusquedaGlobal marca="zattia" marcas={['zattia']} secciones={[]} onElegir={() => {}} onCerrar={() => {}} /></ProveedorLineaErp>) })
  const input = document.querySelector('input') as HTMLInputElement
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { set.call(input, texto); input.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
  return document.body.textContent ?? ''
}

describe('⌘K: la tienda del menú', () => {
  it('con Stunned: sus ventas y prendas, ⛔ las de Zattia', async () => {
    const t = await buscar('stunned', 'remera')
    expect(t).toContain('Cliente stunned')
    expect(t).not.toContain('Cliente zattia')
    expect(t).toContain('REMERA STU')
    expect(t).not.toContain('REMERA ZATTIA')
  })
  it('con Zattia: al revés', async () => {
    const t = await buscar('zattia', 'remera')
    expect(t).toContain('Cliente zattia')
    expect(t).not.toContain('Cliente stunned')
    expect(t).toContain('REMERA ZATTIA')
    expect(t).not.toContain('REMERA STU')
  })
})
