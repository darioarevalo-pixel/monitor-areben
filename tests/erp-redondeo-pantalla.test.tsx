// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * **ERP › Configuración › Redondeo, del lado de la pantalla.** El oráculo es lo que se LEE y lo que se MANDA: un renglón por
 * canal con lo que vale hoy y un ejemplo, y el pedido lleva la línea, el canal, el paso y el modo elegidos.
 */

const canales = ['local', 'online', 'mayorista', 'ml']
const filas = (linea: string) => canales.map((canal) => ({
  canal,
  vigente: linea === 'zattia' && canal === 'mayorista' ? { paso: 100, modo: 'cercano', desde: '2026-10-20T03:00:00Z' } : null,
  proximo: null,
}))
const historial = [{ id: 'r1', marca: 'zattia', canal: 'mayorista', paso: 100, modo: 'cercano', desde: '2026-10-20T03:00:00Z', puesto_por: 'Bruno Arevalo', puesto_en: '2026-10-20T03:00:00Z' }]
const datos = { lineas: [{ linea: 'zattia', filas: filas('zattia') }, { linea: 'stunned', filas: filas('stunned') }], historial }

const leerRedondeo = vi.fn(async () => datos)
const ponerRedondeo = vi.fn(async () => ({ ok: true, id: '2' }))
vi.mock('@/lib/erp/cliente', () => ({ leerRedondeo: (...a: unknown[]) => leerRedondeo(...(a as [])), ponerRedondeo: (...a: unknown[]) => ponerRedondeo(...(a as [])) }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); document.body.innerHTML = ''; vi.clearAllMocks() })

async function montar() {
  const { Redondeo } = await import('@/components/erp/Redondeo')
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(<Redondeo />) })
}
const texto = () => document.body.textContent ?? ''
const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(t)) as HTMLButtonElement | undefined

describe('Redondeo (pantalla)', () => {
  it('un renglón por canal: lo que vale hoy y el ejemplo; los otros, «Sin redondeo»', async () => {
    await montar()
    expect(leerRedondeo).toHaveBeenCalledWith('zattia')
    const t = texto()
    for (const c of ['Local', 'Online', 'Mayorista', 'Mercado Libre']) expect(t).toContain(c)
    expect(t).toContain('Al $100 más cercano')
    expect(t).toContain('$12.300')
    expect(t).toContain('$12.345,67')
    expect(t.match(/Sin redondeo/g)?.length).toBe(3)
  })

  it('«Cambios» muestra el historial con quién lo puso', async () => {
    await montar()
    await act(async () => { boton('Cambios')?.click() })
    expect(texto()).toContain('Bruno Arevalo')
  })
})
