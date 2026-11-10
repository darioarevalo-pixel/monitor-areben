// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

/**
 * 🐛 Bruno 10-nov: «Stunned modo paralelo en los primeros dos segundos de la vista». El cartel «modo paralelo» salía MIENTRAS se
 * leía el corte de la línea (`erp_corte`) y se iba al llegar la respuesta. Se dibuja recién leído; si la lectura FALLA, sale (el prudente).
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno', admin: true }, setMarca: vi.fn() }) }))
vi.mock('@/lib/permisos', () => ({ puedeVer: () => true, esAdmin: () => true }))
vi.mock('@/lib/erp/usePuedeErp', () => ({ usePuedeErp: () => () => true }))
vi.mock('@/components/erp/ventas/VentasErp', () => ({ VentasErp: () => <div data-pantalla="VentasErp" /> }))
let responder: ((v: { en_erp: boolean }) => void) | null = null
let fallar: ((e: Error) => void) | null = null
vi.mock('@/lib/erp/cliente', async (original) => ({
  ...(await original<typeof import('@/lib/erp/cliente')>()),
  leerCorteDeLinea: () => new Promise((ok, mal) => { responder = ok; fallar = mal }),
}))

let root: Root | null = null
const div = document.createElement('div')
document.body.appendChild(div)
afterEach(() => { act(() => root?.unmount()); root = null; responder = null; fallar = null })

async function montar() {
  const { Erp } = await import('@/components/erp/Erp')
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  act(() => { root = createRoot(div); root.render(<Erp ruta={['ventas']} />) })
}
const hayCartel = () => div.textContent?.includes('modo paralelo') ?? false

describe('ERP › el cartel «modo paralelo»', () => {
  it('⛔ sale mientras se lee el corte, ni después si la línea ya pasó al ERP', async () => {
    await montar()
    expect(hayCartel()).toBe(false)
    await act(async () => { responder?.({ en_erp: true }) })
    expect(hayCartel()).toBe(false)
  })

  it('sale recién leído si la línea sigue con Gestión Nube, y si la lectura falla (el prudente)', async () => {
    await montar()
    await act(async () => { responder?.({ en_erp: false }) })
    expect(hayCartel()).toBe(true)
    act(() => root?.unmount()); root = null
    await montar()
    await act(async () => { fallar?.(new Error('sin red')) })
    expect(hayCartel()).toBe(true)
  })
})
