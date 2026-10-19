// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarAContar, filaDeAjuste } from '@/lib/erp/ajuste.core.js'
import type { AjustesDeLinea } from '@/lib/erp/cliente'

/**
 * **ERP › Ajustes, del lado de la pantalla** (19-oct). El oráculo es lo que se LEE y lo que se MANDA: «Contar» lleva la
 * prenda al ajuste con el depósito de la tienda y lee su stock, la diferencia se ve antes de enviar, el envío lleva lo
 * contado (⛔ la diferencia: la calcula el motor), «Aprobar» manda el id, y «Descartar» ⛔ sale sin porqué.
 */
const conciliacion = { fecha: '2026-10-19', calculadoEn: '2026-10-19T16:40:00Z', grupos: [{ tipo: 'stock_tn', clase: 'libro_aparte', filas: [
  { producto: '828948', talle: '229042', nombre: 'TOP ZARA', talleNombre: 'NEGRO', sku: 'RTO-0152-NG', tn: 12, erp: 0, gn: 12, dias: 2 },
] }] }
const pendiente = { id: '0d6c3f0e-0000-4000-8000-000000000001', numero: 7, linea: 'zattia', deposito: 'local', motivo: 'conteo', estado: 'para_aprobar', fuente: 'conciliacion',
  creado_por: 'camila', creado_en: '2026-10-19T13:00:00Z', renglones: [{ n: 1, product_id: 370642, size_id: 76584, sku: 'RTO-0013-BL', antes: 7, contado: 0, diferencia: -7, ahora: 6 }] }
const datos = (): AjustesDeLinea => ({ ...armarAContar({ linea: 'zattia', conciliacion, contar: [], ajustes: [] }), sinConciliacion: false, ajustes: [filaDeAjuste(pendiente)] }) as AjustesDeLinea

const leerAjustes = vi.fn(async (..._a: unknown[]) => datos())
const leerStockDePrenda = vi.fn(async (..._a: unknown[]) => ({ prenda: { producto: '828948', talle: '229042', nombre: 'TOP ZARA', talleNombre: 'NEGRO', sku: 'RTO-0152-NG', barcode: '7790152' },
  depositos: [{ deposito: 'local', libro: 0, gn: 12, diferencia: 12 }, { deposito: 'deposito', libro: 3, gn: 3, diferencia: 0 }], historial: [], sinDeposito: [] }))
const crearAjuste = vi.fn(async (..._a: unknown[]) => ({ ok: true, numero: 8, id: 'y', renglones: 1, avisos: [{ codigo: 'CONTEO_DE_DEPOSITO_RECIENTE', texto: 'Esta prenda tiene un conteo de Depósito (C-31)' }] }))
const aprobarAjuste = vi.fn(async (..._a: unknown[]) => ({ ok: true, numero: 7, movimientos: 1, avisos: [] }))
const descartarAjuste = vi.fn(async (..._a: unknown[]) => ({ ok: true, numero: 7 }))
vi.mock('@/lib/erp/cliente', () => ({
  leerAjustes: (...a: unknown[]) => leerAjustes(...a), leerStockDePrenda: (...a: unknown[]) => leerStockDePrenda(...a),
  crearAjuste: (...a: unknown[]) => crearAjuste(...a), aprobarAjuste: (...a: unknown[]) => aprobarAjuste(...a),
  descartarAjuste: (...a: unknown[]) => descartarAjuste(...a), buscarPrendas: vi.fn(async () => ({ variantes: [], cortado: false })),
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); vi.clearAllMocks() })

async function montar() {
  const { AjustesStock } = await import('@/components/erp/AjustesStock')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<AjustesStock />) })
  await act(async () => {})
}
const texto = () => host.textContent ?? ''
const boton = (t: string | RegExp) => [...host.querySelectorAll('button')].find((b) => (typeof t === 'string' ? b.textContent === t : t.test(b.textContent ?? ''))) as HTMLButtonElement
const click = async (b: HTMLButtonElement) => { await act(async () => { b.click() }); await act(async () => {}) }
function escribir(input: HTMLInputElement, valor: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => { set.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('AjustesStock', () => {
  it('muestra la lista a contar y lo que espera aprobación, con el aviso de que el ERP se movió', async () => {
    await montar()
    expect(leerAjustes).toHaveBeenCalledWith('zattia')
    expect(texto()).toContain('A contar · 1')
    expect(texto()).toContain('TOP ZARA · NEGRO')
    expect(texto()).toContain('Coincide Tienda Nube con GN')
    expect(texto()).toContain('Para aprobar · 1')
    expect(texto()).toContain('el ERP se movió desde que se contó')
    expect(texto()).toContain('cambia sólo el stock del ERP')
  })

  it('«Contar» arma el ajuste con el depósito de la tienda, muestra la diferencia y envía lo contado', async () => {
    await montar()
    await click(boton('Contar'))
    expect(leerStockDePrenda).toHaveBeenCalledWith('zattia', '828948', '229042')
    expect(texto()).toContain('Nuevo ajuste')
    expect(boton('Enviar a aprobar').disabled).toBe(true)
    const contado = host.querySelector('td input') as HTMLInputElement
    escribir(contado, '11')
    await act(async () => {})
    expect([...host.querySelectorAll('td')].map((t) => t.textContent)).toContain('+11')
    expect(boton('Enviar a aprobar').disabled).toBe(false)
    await click(boton('Enviar a aprobar'))
    expect(crearAjuste).toHaveBeenCalledWith({ linea: 'zattia', deposito: 'local', motivo: 'conteo', detalle: '', fuente: 'conciliacion',
      renglones: [{ producto: '828948', talle: '229042', sku: 'RTO-0152-NG', barcode: '7790152', contado: 11 }] })
    expect(texto()).toContain('Ajuste A-8 listo para aprobar')
    expect(texto()).toContain('C-31')
    expect(leerAjustes).toHaveBeenCalledTimes(2)
  })

  it('«Aprobar» manda el id; «Descartar» pide el porqué antes de salir', async () => {
    await montar()
    await click(boton('Aprobar 1 diferencia'))
    expect(aprobarAjuste).toHaveBeenCalledWith('zattia', pendiente.id)
    expect(texto()).toContain('A-7 aprobado')
    await click(boton('Descartar'))
    expect(boton('Descartar A-7').disabled).toBe(true)
    escribir(host.querySelector('input[placeholder="Ej.: se contó otro talle"]') as HTMLInputElement, 'otro talle')
    await act(async () => {})
    await click(boton('Descartar A-7'))
    expect(descartarAjuste).toHaveBeenCalledWith('zattia', pendiente.id, 'otro talle')
  })
})
