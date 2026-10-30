// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * 🧾 **Arqueo de caja, la pantalla** (Bruno, 30-oct; ERP › Ventas › Cajas): sólo un admin ve el campo «Código del sobre» y los
 * botones «Llegó bien» / «Llegó con diferencia»; el resto ve el estado del sobre. Con el código escrito se abre esa caja.
 */
const CERRADA = {
  id: 't40', store: 'zattia', numero: 40, arqueo: null, fondo: 55100, contado: 412700, esperado: 412700,
  abierto_en: '2026-10-30T12:00:00Z', abierto_por: 'camila', cerrado_en: '2026-10-30T17:02:49Z', cerrado_por: 'camilaquintana', resumen: null, conteos: null,
}
const m = vi.hoisted(() => ({
  sesion: { marca: 'zattia', perfil: { name: 'bruno', admin: true } as { name: string; admin?: boolean } },
  arquearSobre: vi.fn(),
}))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => m.sesion }))
vi.mock('@/lib/erp/cliente', () => ({
  leerTurnosCaja: async () => ({ turnos: [CERRADA], arqueo: { disponible: true } }),
  leerCajaAbierta: async () => ({ turno: null }),
  leerCajaDelSobre: async () => ({ turno: CERRADA }),
  arquearSobre: m.arquearSobre,
}))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

async function montar(admin: boolean) {
  m.sesion.perfil = { name: admin ? 'bruno' : 'camila', ...(admin ? { admin: true } : {}) }
  const { CajasErp } = await import('@/components/erp/ventas/CajasErp')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<CajasErp />) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}
const campo = () => document.querySelector('input[aria-label="Código del sobre"]') as HTMLInputElement | null
const boton = (texto: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === texto) ?? null

describe('ERP › Cajas › Arqueo de caja', () => {
  it('admin: escribe el código del sobre, se abre esa caja con lo que tiene que haber y los dos botones', async () => {
    await montar(true)
    const input = campo()
    expect(input).not.toBeNull()
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { set.call(input, 'z-0040'); input!.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => { input!.form!.requestSubmit() })
    const t = document.body.textContent ?? ''
    expect(t).toContain('sobre Z-0040')
    expect(t).toContain('Tiene que haber en el sobre')
    expect(t.replace(/\s/g, ' ')).toMatch(/357\.600/)
    expect(boton('Llegó bien')).not.toBeNull()
    expect(boton('Llegó con diferencia')).not.toBeNull()
  })

  it('⛔ admin: ni el campo ni los botones (ve el estado del sobre)', async () => {
    await montar(false)
    expect(campo()).toBeNull()
    // Abre la caja desde la lista: la ficha muestra el sobre, ⛔ los botones.
    const fila = document.querySelector('.mo-lista-fila') as HTMLElement
    await act(async () => { fila.click() })
    const t = document.body.textContent ?? ''
    expect(t).toContain('sobre Z-0040')
    expect(t).toContain('Tiene que haber en el sobre')
    expect(boton('Llegó bien')).toBeNull()
    expect(boton('Llegó con diferencia')).toBeNull()
  })
})
