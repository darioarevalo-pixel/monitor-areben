// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * 🔄 **Recalcular el cierre, la pantalla** (Bruno, 31-oct; Areben Gestión › Ventas › Cajas): el caso real de Z-0038 — el pedido web
 * de Stunned #36 entró como efectivo y después se le corrigió el medio. Sólo un admin ve «Recalcular el cierre»: primero
 * muestra qué cambia con lo de hoy, «Guardar» lo escribe. El que ⛔ es admin ve, a lo sumo, que se recalculó.
 */
const ef = (erp: number) => ({ fondo: 54900, cobrado: 214400, deEspera: 0, cobradoGN: 0, cobradoERP: erp, aportes: 0, salidas: 0, esperado: 269300 + erp })
const Z38 = {
  id: 't38', store: 'zattia', numero: 38, arqueo: null, fondo: 54900, contado: 269300, esperado: 313095,
  abierto_en: '2026-10-29T17:05:58Z', abierto_por: 'camila', cerrado_en: '2026-10-29T21:58:20Z', cerrado_por: 'camila',
  resumen: { ventas: 17, total: 521100, efectivo: ef(43795), porForma: [] }, conteos: null,
}
const m = vi.hoisted(() => ({
  sesion: { marca: 'zattia', perfil: { name: 'bruno', admin: true } as { name: string; admin?: boolean } },
  recalcularCierre: vi.fn(),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => m.sesion }))
vi.mock('@/lib/erp/cliente', () => ({
  leerTurnosCaja: async () => ({ turnos: [Z38], arqueo: { disponible: true } }),
  leerCajaAbierta: async () => ({ turno: null }),
  leerCajaDelSobre: async () => ({ turno: Z38 }),
  arquearSobre: vi.fn(),
  recalcularCierre: m.recalcularCierre,
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

async function abrirFicha(admin: boolean) {
  m.sesion.perfil = { name: admin ? 'bruno' : 'camila', ...(admin ? { admin: true } : {}) }
  const { CajasErp } = await import('@/components/erp/ventas/CajasErp')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<CajasErp />) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  await act(async () => { (document.querySelector('.mo-lista-fila') as HTMLElement).click() })
}
const boton = (texto: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto) ?? null
const texto = () => (document.body.textContent ?? '').replace(/\s/g, ' ')

describe('Areben Gestión › Cajas › Recalcular el cierre', () => {
  it('la ficha muestra el efectivo de los pedidos web de Areben Gestión', async () => {
    await abrirFicha(true)
    expect(texto()).toContain('Pedidos web (Areben Gestión)')
  })

  it('admin: muestra qué cambia y «Guardar» lo escribe', async () => {
    const vista = { antes: { esperado: 313095, diferencia: -43795 }, despues: { esperado: 269300, diferencia: 0 }, cambia: true, efectivoAntes: ef(43795), efectivoDespues: ef(0) }
    m.recalcularCierre.mockResolvedValueOnce(vista)
    m.recalcularCierre.mockResolvedValueOnce({ ...vista, turno: { ...Z38, esperado: 269300, resumen: { ...Z38.resumen, efectivo: ef(0), recalculos: [{ en: '2026-10-31T15:00:00Z', por: 'bruno', antes: vista.antes, despues: vista.despues }] } } })
    await abrirFicha(true)
    await act(async () => { boton('Recalcular el cierre')!.click() })
    expect(m.recalcularCierre).toHaveBeenLastCalledWith('zattia', { id: 't38', guardar: false })
    expect(texto()).toContain('Con lo de hoy')
    expect(texto()).toMatch(/Pedidos web \(Areben Gestión\)\$ 43\.795 → \$ 0/)
    expect(texto()).toMatch(/Diferencia− \$ 43\.795 → \$ 0/)
    await act(async () => { boton('Guardar')!.click() })
    expect(m.recalcularCierre).toHaveBeenLastCalledWith('zattia', { id: 't38', guardar: true })
    expect(texto()).toContain('Cierre recalculado.')
    expect(texto()).toMatch(/Recalculado · bruno .* esperado \$ 313\.095 → \$ 269\.300/)
  })

  it('al día ⇒ lo dice y ⛔ ofrece guardar', async () => {
    m.recalcularCierre.mockResolvedValueOnce({ antes: { esperado: 313095, diferencia: -43795 }, despues: { esperado: 313095, diferencia: -43795 }, cambia: false, efectivoAntes: ef(43795), efectivoDespues: ef(43795) })
    await abrirFicha(true)
    await act(async () => { boton('Recalcular el cierre')!.click() })
    expect(texto()).toContain('El cierre ya está al día')
    expect(boton('Guardar')).toBeNull()
  })

  it('⛔ admin: ⛔ ve el botón', async () => {
    await abrirFicha(false)
    expect(boton('Recalcular el cierre')).toBeNull()
  })
})
