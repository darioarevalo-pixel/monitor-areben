// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { DiferenciasDelDia } from '@/lib/erp/cliente'

/**
 * **ERP › Diferencias con GN, del lado de la pantalla** (🎨 19-oct, molde de REGISTRO). El oráculo es lo que se LEE y lo que se
 * APRIETA: los números arriba (sin explicar, sobreventa, explicadas solas), cada clase y la sobreventa como vistas con su
 * número, qué mirar, y que la fila abra la ficha de la prenda AL COSTADO (⛔ salta a Stock). Sin conexión al libro, lo DICE.
 */
const datos: DiferenciasDelDia = {
  fecha: '2026-10-18', dias: ['2026-10-18', '2026-10-17'], fotoDesde: '2026-10-17T09:40:00Z', fotoHasta: '2026-10-18T09:40:00Z',
  grupos: [
    { clase: 'venta_gn', nombre: 'Venta en Gestión Nube que no llegó al ERP', mirar: 'mirar ventas de Gestión Nube de ayer', unidades: 2, filas: [
      { producto: '1', talle: '10', nombre: 'TOP SAHARA', talleNombre: 'S', linea: 'zattia', deposito: 'local', clase: 'venta_gn', explicacion: null, deltaGN: -1, deltaLibro: 0, nivelGN: 2, nivelLibro: 3, diferencia: 1 },
      { producto: '2', talle: '20', nombre: 'BIKINI SOL', talleNombre: 'M', linea: 'stunned', deposito: 'deposito', clase: 'venta_gn', explicacion: 'ojo: Stunned', deltaGN: -1, deltaLibro: 0, nivelGN: 4, nivelLibro: 5, diferencia: 1 },
    ] },
  ],
  explicadas: [{ clase: 'transferencia', nombre: 'Transferencias', variantes: 7 }],
  desconocidas: 0, inexplicadas: 2,
  sobreventa: [{ producto: '3', talle: '30', nombre: 'BUZO ROMA', talleNombre: 'L', linea: 'zattia', deposito: 'local', nivelLibro: -1 }],
  sobreventaSinConexion: false, sobreventaError: null,
}
const leerDiferencias = vi.fn(async (..._a: unknown[]): Promise<DiferenciasDelDia> => datos)
vi.mock('@/lib/erp/cliente', () => ({ leerDiferencias: (...a: unknown[]) => leerDiferencias(...a) }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))
const fichaDe = vi.fn()
vi.mock('@/components/erp/stock/FichaPrenda', () => ({ FichaPrenda: (p: { marca: string; prenda: { producto: string; talle: string } }) => { fichaDe(p.marca, p.prenda.producto, p.prenda.talle); return <aside aria-label="Ficha del producto">ficha</aside> } }))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); vi.clearAllMocks() })

async function montar() {
  const { DiferenciasDia } = await import('@/components/erp/DiferenciasDia')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<DiferenciasDia ajustar={vi.fn()} />) })
  await act(async () => {})
}
const texto = () => host.textContent ?? ''
const boton = (t: RegExp) => [...host.querySelectorAll('button')].find((b) => t.test(b.textContent ?? ''))!
const filas = () => [...host.querySelectorAll('[role="row"]')].map((r) => r.textContent ?? '')
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await act(async () => {}) }

describe('DiferenciasDia', () => {
  it('los números arriba y cada clase como vista; la sobreventa aparte', async () => {
    await montar()
    expect(leerDiferencias).toHaveBeenCalledWith('zattia', null)
    expect(texto()).toMatch(/Sin explicar2stock nuestro ≠ Gestión Nube, el 18\/10/)
    expect(texto()).toMatch(/Sobreventa1quedaron en negativo/)
    expect(texto()).toMatch(/Explicadas solas7Transferencias 7/)
    expect(boton(/^Venta en Gestión Nube que no llegó al ERP/).textContent).toContain('2')
    expect(filas().some((r) => r.includes('TOP SAHARA · S'))).toBe(true)
    expect(filas().some((r) => r.includes('BUZO ROMA'))).toBe(false)
    expect(filas().find((r) => r.includes('BIKINI SOL'))).toContain('Stunned')
    await clic(boton(/^Sobreventa/))
    expect(filas().some((r) => r.includes('BUZO ROMA · L'))).toBe(true)
    expect(texto()).toContain('la última unidad se vendió por dos lados')
  })
  it('la fila abre la ficha del producto al costado', async () => {
    await montar()
    await clic([...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes('TOP SAHARA'))!)
    expect(fichaDe).toHaveBeenCalledWith('zattia', '1', '10')
  })
  it('sin conexión al ERP lo dice (⛔ «ninguna en negativo»)', async () => {
    leerDiferencias.mockResolvedValueOnce({ ...datos, sobreventa: [], sobreventaSinConexion: true })
    await montar()
    expect(texto()).toContain('Falta la conexión al ERP')
    expect(texto()).toMatch(/Sobreventa—falta la conexión al ERP/)
  })
})
