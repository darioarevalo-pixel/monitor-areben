// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Destacado } from '@/lib/destacados/tipos'

/**
 * **La «Asignación rápida» de ⭐ montada de verdad**, con el teclado: la pantalla ⛔ se puede abrir
 * desde acá (la sesión del monitor es el login de Google de Bruno), y el tramo entre el gesto y el
 * `alternar` con el pid correcto ⛔ lo mira el test del núcleo.
 *
 * Mutantes que tienen que caer:
 *  1. → que llame a `alternar` sin la acción explícita (o con el producto de otra carta).
 *  2. ← que llame a `alternar`.
 *  3. El mazo con los productos sin foto adentro.
 */

vi.mock('@/lib/tn', () => ({
  imagenesDe: (p: { name?: string }) => (p.name === 'SIN FOTO' ? [] : [`https://x/${p.name}.jpg`]),
}))

const { MazoEstrellas } = await import('@/components/destacados/AsignacionRapida')
const { ToastProvider } = await import('@/components/ui/Toast')

beforeAll(() => { (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

const PRODUCTOS = [
  { id: '11', name: 'TOP MONTANA', sku: 'TM', retailer_price: 24990, stock: 22, diasVivo: 3 },
  { id: '12', name: 'SIN FOTO' },
  { id: '13', name: 'BABY TEE HOT', sku: null, retailer_price: 18990, stock: 15, diasVivo: 3 },
  { id: '14', name: 'CAMPERA REVOLUTION' },
]

async function montar() {
  const alternar = vi.fn(async () => {})
  const porProducto = new Map<string, Destacado>([['14', { id: 'x' } as Destacado]])
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(
      <ToastProvider>
        <MazoEstrellas
          productos={PRODUCTOS}
          tnIdx={{} as never}
          destacados={{ porProducto, cargando: false, error: null, alternar }}
          onCerrar={() => {}}
        />
      </ToastProvider>,
    )
  })
  const tecla = async (key: string) => {
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key })) })
  }
  return { div, alternar, tecla }
}

describe('Asignación rápida', () => {
  it('pasa los productos con foto, → marca con su pid, ← no escribe', async () => {
    const { div, alternar, tecla } = await montar()
    expect(div.textContent).toContain('1 de 3')
    expect(div.textContent).toContain('1 sin foto, salteados')
    expect(div.textContent).toContain('TOP MONTANA')

    await tecla('ArrowRight')
    expect(alternar).toHaveBeenCalledTimes(1)
    expect(alternar).toHaveBeenCalledWith({ id: '11', nombre: 'TOP MONTANA', sku: 'TM' }, 'marcar')
    // El de sin foto se salteó: la 2ª carta es BABY TEE.
    expect(div.textContent).toContain('BABY TEE HOT')

    await tecla('ArrowLeft')
    expect(alternar).toHaveBeenCalledTimes(1)

    // CAMPERA ya tenía ⭐: → avanza sin escribir.
    expect(div.textContent).toContain('CAMPERA REVOLUTION')
    await tecla('ArrowRight')
    expect(alternar).toHaveBeenCalledTimes(1)
    expect(div.textContent).toContain('Marcaste 1 de 3')
  })

  it('deshacer una ⭐ propia la saca', async () => {
    const { alternar, tecla } = await montar()
    await tecla('ArrowRight')
    await tecla('Backspace')
    expect(alternar).toHaveBeenLastCalledWith({ id: '11', nombre: 'TOP MONTANA', sku: 'TM' }, 'sacar')
  })
})
