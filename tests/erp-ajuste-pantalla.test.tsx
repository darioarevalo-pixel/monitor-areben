// @vitest-environment jsdom
import type { PrendaAAjustar } from '@/components/erp/stock/StockErp'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarAContar, filaDeAjuste } from '@/lib/erp/ajuste.core.js'
import type { AjustesDeLinea } from '@/lib/erp/cliente'

/**
 * **ERP › Stock › Conteos y ajustes, del lado de la pantalla** (Diseño, 19-oct). El oráculo es lo que se LEE y lo que se
 * MANDA: ⛔ «A contar» ni «Conteo» a mano (Bruno: ⛔ se cuenta en el ERP); «Guardar ajuste» manda lo que SALE en positivo
 * y APLICA en el mismo gesto (aprobación apagada); si aplicar falla, queda «Sin confirmar» y ⛔ se crea dos veces; la lista
 * abre la ficha con antes → después.
 */
const conciliacion = { fecha: '2026-10-19', calculadoEn: '2026-10-19T16:40:00Z', grupos: [{ tipo: 'stock_tn', clase: 'libro_aparte', filas: [
  { producto: '828948', talle: '229042', nombre: 'TOP ZARA', talleNombre: 'NEGRO', sku: 'RTO-0152-NG', tn: 12, erp: 0, gn: 12, dias: 2 },
] }] }
const pendiente = { id: '0d6c3f0e-0000-4000-8000-000000000001', numero: 7, linea: 'zattia', deposito: 'local', motivo: 'fallado', estado: 'para_aprobar', fuente: 'mano',
  creado_por: 'camila', creado_en: '2026-10-19T13:00:00Z', renglones: [{ n: 1, product_id: 370642, size_id: 76584, sku: 'RTO-0013-BL', antes: 7, contado: null, diferencia: -1, ahora: 7 }] }
const igualado = { id: '0d6c3f0e-0000-4000-8000-000000000002', numero: 5, linea: 'zattia', deposito: 'deposito', motivo: 'otro', detalle: 'Igualado a GN (Bruno, 19-oct) · causa: transferencia', estado: 'aplicado', fuente: 'mano',
  creado_por: 'bruno', creado_en: '2026-10-19T12:00:00Z', resuelto_por: 'bruno', resuelto_en: '2026-10-19T12:00:01Z', renglones: [{ n: 1, product_id: 828948, size_id: 229042, sku: 'RTO-0152-NG', antes: 0, contado: null, diferencia: 12, ahora: 12 }] }
const datos = (): AjustesDeLinea => ({ ...armarAContar({ linea: 'zattia', conciliacion, contar: [], ajustes: [] }), sinConciliacion: false, ajustes: [filaDeAjuste(pendiente), filaDeAjuste(igualado)] }) as AjustesDeLinea
const prenda = { producto: '828948', talle: '229042', nombre: 'TOP ZARA', talleNombre: 'NEGRO', sku: 'RTO-0152-NG', barcode: '7790152' }
const leerAjustes = vi.fn(async (..._a: unknown[]) => datos())
const leerStockDePrenda = vi.fn(async (..._a: unknown[]) => ({ prenda: { producto: '828948', talle: '229042', nombre: 'TOP ZARA', talleNombre: 'NEGRO', sku: 'RTO-0152-NG', barcode: '7790152' },
  depositos: [{ deposito: 'local', libro: 0, gn: 12, diferencia: 12 }, { deposito: 'deposito', libro: 3, gn: 3, diferencia: 0 }], historial: [], sinDeposito: [] }))
const crearAjuste = vi.fn(async (..._a: unknown[]) => ({ ok: true, numero: 8, id: 'nuevo-8', renglones: 1, avisos: [{ codigo: 'CONTEO_DE_DEPOSITO_RECIENTE', texto: 'Esta prenda tiene un conteo de Depósito (C-31)' }] }))
const aprobarAjuste = vi.fn(async (..._a: unknown[]) => ({ ok: true, numero: 7, movimientos: 1, avisos: [] }))
const descartarAjuste = vi.fn(async (..._a: unknown[]) => ({ ok: true, numero: 7 }))
vi.mock('@/lib/erp/cliente', () => ({
  leerAjustes: (...a: unknown[]) => leerAjustes(...a), leerStockDePrenda: (...a: unknown[]) => leerStockDePrenda(...a),
  crearAjuste: (...a: unknown[]) => crearAjuste(...a), aprobarAjuste: (...a: unknown[]) => aprobarAjuste(...a),
  descartarAjuste: (...a: unknown[]) => descartarAjuste(...a), buscarPrendas: vi.fn(async () => ({ variantes: [prenda], cortado: false })),
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); vi.clearAllMocks() })

async function montar(pedida: PrendaAAjustar | null = null) {
  const { AjustesStock } = await import('@/components/erp/AjustesStock')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<AjustesStock pedida={pedida} />) })
  await act(async () => {})
}
const texto = () => host.textContent ?? ''
const boton = (t: string | RegExp) => [...host.querySelectorAll('button')].find((b) => (typeof t === 'string' ? b.textContent === t : t.test(b.textContent ?? ''))) as HTMLButtonElement
const click = async (b: HTMLButtonElement) => { await act(async () => { b.click() }); await act(async () => {}) }
function escribir(input: HTMLInputElement, valor: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => { set.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('Conteos y ajustes', () => {
  it('⛔ «A contar» ni «Conteo» a mano; lista los ajustes y lo que quedó sin aplicar', async () => {
    await montar()
    expect(leerAjustes).toHaveBeenCalledWith('zattia')
    expect(texto()).toContain('Conteos y ajustes')
    expect(texto()).not.toContain('A contar')
    expect(texto()).toContain('Ajustes · 2')
    expect(texto()).toContain('Sin confirmar · 1')
    expect(texto()).toContain('Igualado a GN')
    await click(boton('Nuevo ajuste'))
    const motivos = [...host.querySelectorAll('option')].map((o) => o.textContent)
    expect(motivos).toContain('Fallado')
    expect(motivos).not.toContain('Conteo')
  })

  it('«Guardar ajuste» manda lo que sale en positivo y lo aplica en el mismo gesto', async () => {
    await montar()
    await click(boton('Nuevo ajuste'))
    escribir(host.querySelector('input[placeholder="SKU, código de barras o nombre"]') as HTMLInputElement, 'zara')
    await click(boton('Buscar'))
    await click(boton(/TOP ZARA · NEGRO/))
    expect(leerStockDePrenda).toHaveBeenCalledWith('zattia', '828948', '229042')
    expect(boton('Guardar ajuste').disabled).toBe(true)
    escribir(host.querySelector('input[aria-label="Cantidad de TOP ZARA · NEGRO"]') as HTMLInputElement, '-2')
    await act(async () => {})
    expect(boton('Guardar ajuste').disabled).toBe(false)
    await click(boton('Guardar ajuste'))
    expect(crearAjuste).toHaveBeenCalledWith({ linea: 'zattia', deposito: 'local', motivo: 'fallado', detalle: '', fuente: 'mano',
      renglones: [{ producto: '828948', talle: '229042', sku: 'RTO-0152-NG', barcode: '7790152', cantidad: 2 }] })
    expect(aprobarAjuste).toHaveBeenCalledWith('zattia', 'nuevo-8')
    expect(texto()).toContain('C-31')
  })

  it('desde Stock («Ajustar»): abre «Nuevo ajuste» en su línea con la prenda cargada y lo que dice el ERP', async () => {
    await montar({ linea: 'stunned', producto: '828948', talle: '229042', sku: 'STU-0152-NG', barcode: null, nombre: 'TOP ZARA', talleNombre: 'NEGRO' })
    expect(leerAjustes).toHaveBeenCalledWith('stunned')
    expect(leerStockDePrenda).toHaveBeenCalledWith('zattia', '828948', '229042')
    expect(host.querySelector('input[aria-label="Cantidad de TOP ZARA · NEGRO"]')).toBeTruthy()
    expect(boton('Nuevo ajuste')).toBeUndefined()
  })

  it('si aplicar falla, lo dice y ⛔ deja el borrador para crearlo otra vez', async () => {
    aprobarAjuste.mockRejectedValueOnce(new Error('se cortó'))
    await montar()
    await click(boton('Nuevo ajuste'))
    escribir(host.querySelector('input[placeholder="SKU, código de barras o nombre"]') as HTMLInputElement, 'zara')
    await click(boton('Buscar'))
    await click(boton(/TOP ZARA · NEGRO/))
    escribir(host.querySelector('input[aria-label="Cantidad de TOP ZARA · NEGRO"]') as HTMLInputElement, '1')
    await act(async () => {})
    await click(boton('Guardar ajuste'))
    expect(texto()).toContain('A-8 quedó guardado pero el stock todavía no cambió')
    expect(boton('Guardar ajuste')).toBeUndefined()
  })

  it('«Confirmar» manda el id; «Descartar» pide el porqué; la fila abre la ficha', async () => {
    await montar()
    await click(boton('Confirmar'))
    expect(aprobarAjuste).toHaveBeenCalledWith('zattia', pendiente.id)
    await click(boton('Descartar'))
    expect(boton('Descartar A-7').disabled).toBe(true)
    escribir(host.querySelector('input[placeholder="Ej.: se cargó otro talle"]') as HTMLInputElement, 'otro talle')
    await act(async () => {})
    await click(boton('Descartar A-7'))
    expect(descartarAjuste).toHaveBeenCalledWith('zattia', pendiente.id, 'otro talle')
    const fila = [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes('A-5')) as HTMLElement
    await act(async () => { fila.click() })
    expect(document.body.textContent).toContain('Ajuste A-5')
    expect(document.body.textContent).toContain('+12')
  })
})
