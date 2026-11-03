// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const leerCorteDeLinea = vi.fn()
vi.mock('@/lib/erp/cliente', async (orig) => ({ ...(await orig<typeof import('@/lib/erp/cliente')>()), leerCorteDeLinea: (l: string) => leerCorteDeLinea(l) }))
vi.mock('@/components/SesionProvider', () => ({ useSesion: () => ({ marca: 'zattia', perfil: { name: 'bruno' } }) }))
let tienda = 'zattia'
vi.mock('@/lib/erp/linea-erp', async (orig) => ({ ...(await orig<typeof import('@/lib/erp/linea-erp')>()), useTiendaErp: () => tienda }))

let root: Root | null = null
const div = document.createElement('div')
document.body.appendChild(div)
afterEach(() => { act(() => root?.unmount()); root = null; leerCorteDeLinea.mockReset(); tienda = 'zattia' })

async function montar() {
  const { FacturaCaja } = await import('@/components/erp/FacturaCaja')
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await act(async () => { root = createRoot(div); root.render(<FacturaCaja />) })
}
const hayCartel = () => div.textContent?.includes('sale de Gestión Nube') ?? false

describe('ERP › Facturar una venta: el cartel de Gestión Nube sigue al corte de la línea (Bruno, 3-nov)', () => {
  it('sin cortar, el cartel está', async () => {
    leerCorteDeLinea.mockResolvedValue({ en_erp: false })
    await montar()
    expect(leerCorteDeLinea).toHaveBeenCalledWith('zattia')
    expect(hayCartel()).toBe(true)
  })
  it('cortada, ⛔ está: también en Stunned', async () => {
    tienda = 'stunned'
    leerCorteDeLinea.mockResolvedValue({ en_erp: true })
    await montar()
    expect(leerCorteDeLinea).toHaveBeenCalledWith('stunned')
    expect(hayCartel()).toBe(false)
  })
  it('sin poder leer el corte, ⛔ afirma nada', async () => {
    leerCorteDeLinea.mockRejectedValue(new Error('caída'))
    await montar()
    expect(hayCartel()).toBe(false)
  })
})
