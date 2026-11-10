// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ChequeoDelLibro } from '@/lib/erp/cliente'

/**
 * **ERP › Stock › Diferencias › «Chequeo de movimientos», del lado de la pantalla.** El oráculo es lo que se LEE y lo que se APRIETA:
 * los números arriba, cada regla con su estado y sus filas, las primeras filas de un error ABIERTAS (las de un aviso, a un clic),
 * «Revisar ahora» vuelve a pedir, y un error de lectura se DICE (⛔ una lista vacía que parezca «todo bien»).
 */
const datos: ChequeoDelLibro = {
  marca: 'bdi', revisadoEn: '2026-11-10T20:00:00Z',
  cuenta: { falla: 1, aviso: 1, omitida: 0, ok: 1 },
  reglas: [
    { id: 'anulacion', titulo: 'Un hecho anulado que sigue moviendo stock', estado: 'falla', total: 1, ejemplos: [{ ref: 'venta 1645', detalle: 'neto -1' }], porque: null },
    { id: 'negativo', titulo: 'Un nivel de stock negativo', estado: 'aviso', total: 28, ejemplos: [{ ref: 'ATE-026-17PM-9DP · deposito_minorista', detalle: '-66' }], porque: null },
    { id: 'transf', titulo: 'Una transferencia que no suma cero', estado: 'ok', total: 0, ejemplos: [], porque: null },
  ],
}
const leer = vi.fn(async (..._a: unknown[]): Promise<ChequeoDelLibro> => datos)
vi.mock('@/lib/erp/cliente', () => ({ leerChequeoDelLibro: (...a: unknown[]) => leer(...a) }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'bdi', perfil: { name: 'bruno' } }) }))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); vi.clearAllMocks() })

async function montar(alContar?: (n: number | null) => void) {
  const { ChequeoLibro } = await import('@/components/erp/ChequeoLibro')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ChequeoLibro alContar={alContar} />) })
  await act(async () => {})
}
const texto = () => host.textContent ?? ''
const boton = (t: RegExp) => [...host.querySelectorAll('button')].find((b) => t.test(b.textContent ?? ''))
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await act(async () => {}) }

describe('Chequeo de movimientos · pantalla', () => {
  it('lee la base de la marca y dice cada regla con su estado y sus filas; el contador suma errores y avisos', async () => {
    const alContar = vi.fn()
    await montar(alContar)
    expect(leer).toHaveBeenCalledWith('bdi')
    for (const t of ['Errores', 'Para mirar', 'Un hecho anulado que sigue moviendo stock', '28 filas', 'Un nivel de stock negativo', 'Bien']) expect(texto()).toContain(t)
    expect(alContar).toHaveBeenLastCalledWith(2)
  })

  it('las filas de un error se ven solas; las de un aviso, al apretar', async () => {
    await montar()
    expect(texto()).toContain('venta 1645')
    expect(texto()).not.toContain('ATE-026-17PM-9DP')
    await clic(host.querySelector('[data-regla="negativo"]')!.querySelector('button')!)
    expect(texto()).toContain('ATE-026-17PM-9DP · deposito_minorista · -66')
    expect(texto()).toContain('y 27 más')
  })

  it('«Revisar ahora» vuelve a correr las reglas', async () => {
    await montar()
    await clic(boton(/Revisar ahora/)!)
    expect(leer).toHaveBeenCalledTimes(2)
  })

  it('si no se pudo revisar, lo dice (⛔ una pantalla vacía)', async () => {
    leer.mockRejectedValueOnce(new Error('El chequeo de movimientos todavía no está conectado'))
    await montar()
    expect(texto()).toContain('todavía no está conectado')
  })
})
