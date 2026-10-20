// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { armarFila, contarVistas, resumen } from '@/lib/erp/recepciones-lista.core'
import type { Recepcion } from '@/lib/recepciones/core'

/**
 * **ERP › Stock › Recepciones.** El oráculo: «con diferencia» va por faltantes Y sobrantes (⛔ el neto: 2 de menos + 2 de más
 * da cero y no es cero), el día es el que muestra la columna (⛔ `recibido_en`), la barrita dice «a de b», y la fila abre la
 * ficha AL COSTADO con los renglones que no cerraron primero.
 */
const oc = (x: Partial<Recepcion>): Recepcion => ({
  id: 'zattia:1', store: 'zattia', oc_id: 1, oc_label: 'OC-0001', oc_estado: 'confirmada', fecha_compra: null, fecha_ingreso: '2026-10-14',
  confirmada_at: '2026-10-14T16:00:00Z', proveedor_nombre: 'TALLER CALYPSO', productos: 2, lineas: 2, unidades_pedidas: 24, unidades_contadas: 24,
  diferencia_unidades: 0, lineas_con_diferencia: 0, unidades_faltantes: 0, unidades_sobrantes: 0, lineas_nuevas: 0, cumplimiento: 1,
  totales_coinciden: true, lineas_recibidas: 2, espejo_consultado: true, skus_sin_espejo: 0, recibido_en: '2026-10-20T10:00:00Z', ...x,
})
const OCS = [
  oc({}),
  // El neto da 0 y no cerró: 2 de menos en un talle, 2 de más en otro.
  oc({ id: 'zattia:2', oc_label: 'OC-0002', proveedor_nombre: 'NEOXCELA', unidades_faltantes: 2, unidades_sobrantes: 2, lineas_con_diferencia: 2 }),
  // La fecha que carga Ingresos puede ser FUTURA (la OC-3047 real: 30/10, confirmada el 20/10): «Llegó» es la confirmación.
  oc({ id: 'zattia:3', oc_label: 'OC-0003', fecha_ingreso: '2026-10-30', confirmada_at: '2026-09-02T15:00:00Z', unidades_pedidas: 4, unidades_contadas: 3, diferencia_unidades: -1, unidades_faltantes: 1, cumplimiento: 0.75, recibido_en: '2026-10-20T10:00:00Z' }),
]
const leerRecepciones = vi.fn(async () => ({ recepciones: OCS, eventos: { rotos: [], ultimo: null }, puede: { proveedores: true } }))
const leerRecepcion = vi.fn(async () => ({
  recepcion: OCS[2], espejoConsultado: true, puede: { proveedores: true },
  lineas: [
    { id: 'a', oc_ref: 'zattia:3', orden: 1, sku: 'TOP-1', codigo_barras: null, nombre: 'TOP SAHARA', talle: 'S', color: 'NEGRO', cantidad_pedida: 2, cantidad_contada: 2, diferencia: 0, es_nuevo: false, en_gn_hoy: true },
    { id: 'b', oc_ref: 'zattia:3', orden: 2, sku: 'TOP-2', codigo_barras: null, nombre: 'TOP SAHARA', talle: 'M', color: 'NEGRO', cantidad_pedida: 2, cantidad_contada: 1, diferencia: -1, es_nuevo: true, en_gn_hoy: false },
  ],
}))
vi.mock('@/lib/recepciones/cliente', () => ({ leerRecepciones: () => leerRecepciones(), leerRecepcion: () => leerRecepcion() }))
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
  const { RecepcionesStock } = await import('@/components/erp/stock/RecepcionesStock')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<RecepcionesStock />) })
  await act(async () => {})
}
const boton = (t: RegExp) => [...document.body.querySelectorAll('button')].find((b) => t.test(b.textContent ?? '') || t.test(b.getAttribute('aria-label') ?? ''))!
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await act(async () => {}) }
const filaDe = (t: string) => [...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes(t))!

describe('ERP › Stock › Recepciones', () => {
  it('el núcleo: con diferencia por faltantes y sobrantes (⛔ el neto), el día de la columna, el mes', () => {
    const filas = OCS.map(armarFila)
    expect(filas.map((f) => f.estado)).toEqual(['recibida', 'diferencia', 'diferencia'])
    expect(filas[1]).toMatchObject({ estadoTexto: 'Con diferencia: faltaron 2 · sobraron 2', tono: 'aviso', vaA: 'Depósito' })
    expect(filas[2]).toMatchObject({ dia: '2026-09-02', fecha: '2/9/2026', fechaIngresos: '30/10/2026', tono: 'malo' })
    expect(contarVistas(filas, '2026-10')).toEqual({ diferencia: 2, mes: 2, todas: 3 })
    expect(resumen(filas, '2026-10')).toEqual({ ordenes: 2, entraron: 48, conDiferencia: 1, faltaron: 2 })
    expect(armarFila(oc({ unidades_pedidas: 0, cumplimiento: null })).estado).toBe('sin_pedido')
    // Cargada a mano ANTES de confirmar: vale la de Ingresos (sólo la posterior se reemplaza).
    expect(armarFila(oc({ fecha_ingreso: '2026-09-30', confirmada_at: '2026-10-05T12:00:00Z' }))).toMatchObject({ dia: '2026-09-30', fechaIngresos: null })
  })

  it('la lista: barrita «a de b», proveedor, y la ficha con los que no cerraron primero', async () => {
    await montar()
    expect(boton(/^Con diferencia/).textContent).toContain('2')
    const t = filaDe('OC-0003').textContent
    expect(t).toContain('3 de 4')
    expect(t).toContain('2/9/2026')
    expect(filaDe('OC-0002').textContent).toContain('NEOXCELA')
    await clic(filaDe('OC-0003').querySelector('[role="cell"]:last-child')!)
    const ficha = document.querySelector('aside[aria-label^="Ficha de la orden"]')!
    expect(ficha.textContent).toContain('Los que no cerraron (1 de 2)')
    expect(ficha.textContent).toContain('falta darlo de alta en GN')
    expect(ficha.querySelectorAll('tbody tr').length).toBe(1)
    await clic(boton(/^Ver los 2/))
    expect(ficha.querySelectorAll('tbody tr').length).toBe(2)
  })
})
