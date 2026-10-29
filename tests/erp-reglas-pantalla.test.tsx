// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ReglaComercial, ReglasDeMarca } from '@/lib/erp/cliente'
import { ProveedorLineaErp } from '@/lib/erp/linea-erp'

/**
 * **ERP › Configuración › Reglas con el molde, del lado de la pantalla** (🎨 Diseño 7). El oráculo es lo que se LEE y lo
 * que se APRIETA: la tira con «Regla de cobro» marcada, las vistas con su número (Prendidas · Apagadas · Promos bancarias),
 * la campaña como columna, Stunned por el selector de línea, y que el clic en la fila abra el formulario de ESA regla.
 */
const regla = (o: Partial<ReglaComercial>): ReglaComercial => ({
  id: 'r', nombre: 'Efectivo siempre', fin: null, marca: 'zattia', canal: 'local', campania: null, alcance: 'todo', alcance_ids: [], medios: ['efectivo'],
  banco: null, cuotas: null, monto_minimo: null, efecto: 'descuento', pct: 15, desde: null, hasta: null, dias: null, activa: true, ...o,
})
const datos: ReglasDeMarca = {
  reglas: [
    regla({ id: 'a' }),
    regla({ id: 'b', nombre: 'Feria con tarjeta', campania: 'c1', medios: ['credito'], efecto: 'recargo', pct: 10, activa: false }),
    regla({ id: 'c', nombre: 'Stunned transferencia', marca: 'stunned', medios: ['transferencia'], pct: 10 }),
  ],
  agenda: [regla({ id: 'g', nombre: 'Galicia 6 cuotas', medios: ['credito'], banco: 'Galicia', cuotas: 6, origen: 'agenda' })],
  caja: { reglas: [], avisos: [], feriaCampanias: [], diferencias: { sinTraer: false, faltan: [], sobran: [] } },
  campanias: [{ id: 'c1', nombre: 'Feria de octubre', estado: 'activa', feria: true }],
  cobraConReglas: { prendida: true, copiadasEn: '2026-10-19T12:00:00Z', por: 'Bruno', alDia: true, noCobra: [] },
}
const leerReglas = vi.fn(async (..._a: unknown[]) => datos)
vi.mock('@/lib/erp/cliente', () => ({
  leerReglas: (...a: unknown[]) => leerReglas(...a), guardarRegla: vi.fn(), prenderCajaReglas: vi.fn(), traerReglasDeCaja: vi.fn(),
  simularReglas: vi.fn(), buscarPrendas: vi.fn(async () => []),
}))
vi.mock('@/lib/tn-audit', () => ({ traerAudit: vi.fn(async () => []) }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); vi.clearAllMocks() })

async function montar(ir = vi.fn(), linea: 'zattia' | 'stunned' = 'zattia') {
  const { ReglasComerciales } = await import('@/components/erp/ReglasComerciales')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<ProveedorLineaErp value={linea}><ReglasComerciales ir={ir} /></ProveedorLineaErp>) })
  await act(async () => {})
  return ir
}
const texto = () => host.textContent ?? ''
const filas = () => [...host.querySelectorAll('[role="row"]')].map((r) => r.textContent ?? '')
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }); await act(async () => {}) }
const vista = (t: RegExp) => [...host.querySelectorAll('[role="tab"]')].find((b) => t.test(b.textContent ?? ''))!

describe('ERP › Reglas con el molde', () => {
  it('lee la marca del menú; la tira marca la regla y «Ruta» lleva a Cuentas de cobro', async () => {
    const ir = await montar()
    expect(leerReglas).toHaveBeenCalledWith('zattia')
    expect(host.querySelector('[aria-current="true"]')?.textContent).toContain('Regla de cobro')
    await clic([...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Ruta'))!)
    expect(ir).toHaveBeenCalledWith('rutas')
    expect(texto()).toContain('La Caja cobra con estas reglas')
  })

  it('vistas con su número: Prendidas 1 · Apagadas 1 · Promos bancarias 1 (sólo de la línea Zattia)', async () => {
    await montar()
    expect(vista(/Prendidas/).textContent).toMatch(/1$/)
    expect(vista(/Apagadas/).textContent).toMatch(/1$/)
    expect(vista(/Promos bancarias/).textContent).toMatch(/1$/)
    expect(filas().some((f) => f.includes('Efectivo siempre') && f.includes('Temporada') && f.includes('Prendida'))).toBe(true)
    expect(filas().some((f) => f.includes('Stunned transferencia'))).toBe(false)
    await clic(vista(/Apagadas/))
    expect(filas().some((f) => f.includes('Feria con tarjeta') && f.includes('Feria de octubre') && f.includes('Apagada'))).toBe(true)
    await clic(vista(/Promos bancarias/))
    expect(filas().some((f) => f.includes('Galicia 6 cuotas') && f.includes('De la Agenda'))).toBe(true)
  })

  it('Stunned por la línea del menú (⛔ selector adentro); sin promos bancarias (son de la marca)', async () => {
    await montar(vi.fn(), 'stunned')
    expect(host.querySelector('select[aria-label="Línea"]')).toBeNull()
    expect(filas().some((f) => f.includes('Stunned transferencia'))).toBe(true)
    expect(vista(/Promos bancarias/)).toBeUndefined()
  })

  it('clic en la fila abre el formulario de ESA regla', async () => {
    await montar()
    await clic([...host.querySelectorAll('[role="row"]')].find((r) => r.textContent?.includes('Efectivo siempre'))!)
    expect(texto()).toContain('Editar «Efectivo siempre»')
  })
})
