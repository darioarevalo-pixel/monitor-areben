// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { deArmado } from '@/lib/erp/transferencias.core.js'
import type { FilaTransferencia } from '@/lib/erp/cliente'

/**
 * **ERP › Stock › Transferencias, del lado de la pantalla.** El oráculo es lo que se LEE y lo que se APRIETA: se entra a
 * «Todas» si no hay abiertas, la barrita dice el estado, «Prendas» dice pedidas → enviadas, la de antes del libro ⛔ sale en
 * rojo, y la fila abre la ficha AL COSTADO con lo pedido, armado y enviado de cada prenda. Las filas pasan por el núcleo real.
 */
const armado = (x: Record<string, unknown>) => ({
  id: 'ra1', store: 'zattia', linea: 'zattia', sentido: 'llevar', persona: 'Lorena Reyes', estado: 'transferido',
  pedido: [{ vid: '1_1', sku: 'TOP-1', name: 'TOP SAHARA', size: 'S', cant: 3 }, { vid: '2_2', sku: 'BUZ-2', name: 'BUZO ROMA', size: 'L', cant: 1 }],
  escaneos: { '1_1': 2, '2_2': 1 }, faltantes: {},
  transfer: { tandas: [{ hora: '2026-10-19T10:41:00Z', prendas: { '1_1': 2, '2_2': 1 }, unidades: 3, transfer_id: 8101 }] },
  error: null, creado_en: '2026-10-19T10:40:00Z', cerrado_en: '2026-10-19T10:41:00Z', ...x,
})
const FILAS = [
  deArmado(armado({}), 'zattia', 3),
  deArmado(armado({ id: 'ra0', sentido: 'devolver', creado_en: '2026-10-12T10:00:00Z', transfer: { tandas: [{ hora: '2026-10-12T10:05:00Z', prendas: { '1_1': 1 }, unidades: 1, transfer_id: 7745 }] } }), 'zattia', 0),
  deArmado(armado({ id: 'ra2', estado: 'cancelado', transfer: null, creado_en: '2026-10-18T10:00:00Z' }), 'zattia', 0),
] as FilaTransferencia[]
const leerTransferencias = vi.fn(async () => ({ filas: FILAS, cortado: false, libroDesde: '2026-10-13T11:00:00Z' }))
vi.mock('@/lib/erp/cliente', () => ({ leerTransferencias: () => leerTransferencias() }))
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

async function montar() {
  const { TransferenciasStock } = await import('@/components/erp/stock/TransferenciasStock')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<TransferenciasStock />) })
  await act(async () => {})
}
const todo = () => document.body.textContent ?? ''
const boton = (t: RegExp, en: ParentNode = document.body) => [...en.querySelectorAll('button')].find((b) => t.test(b.textContent ?? '') || t.test(b.getAttribute('aria-label') ?? ''))!
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
const filaDe = (t: string) => [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(t))!

describe('la lista de transferencias', () => {
  it('sin abiertas entra a Todas; barrita, prendas pedidas → enviadas y el número de GN', async () => {
    await montar()
    expect(leerTransferencias).toHaveBeenCalledTimes(1)
    expect(boton(/^Todas/).getAttribute('aria-pressed') ?? boton(/^Todas/).getAttribute('aria-selected')).toBe('true')
    expect(boton(/^Con faltantes/).textContent).toContain('2')
    const t = filaDe('T-8101').textContent
    expect(t).toContain('Depósito')
    expect(t).toContain('Transferida con faltantes')
    expect(t).toContain('4 → 3')
    expect(filaDe('T-7745').textContent).toContain('Local')
    expect(todo()).toMatch(/«Recibida» todavía no se controla/)
  })

  it('la fila abre la ficha al costado con cada prenda; la de antes del libro lo dice', async () => {
    await montar()
    await clic(filaDe('T-7745').querySelector('[role="cell"]:last-child')!)
    expect(document.querySelector('aside[aria-label^="Ficha de la transferencia"]')!.textContent).toContain('antes del libro')
    await clic(filaDe('T-8101').querySelector('[role="cell"]:last-child')!)
    const ficha = document.querySelector('aside[aria-label^="Ficha de la transferencia"]')!
    expect(ficha).toBeTruthy()
    expect(ficha.textContent).toContain('Depósito → Local')
    expect(ficha.textContent).toContain('TOP SAHARA')
    expect(ficha.textContent).toMatch(/Faltaron1 u/)
  })
})
