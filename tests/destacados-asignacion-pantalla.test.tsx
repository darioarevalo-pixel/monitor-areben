// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Destacado } from '@/lib/destacados/tipos'

/**
 * **La «Asignación rápida» de ⭐ montada de verdad**, con el teclado: la pantalla ⛔ se puede abrir
 * desde acá (la sesión del monitor es el login de Google de Bruno).
 *
 * 🔴 El caso que manda: **las flechas ⛔ marcan**. La 1ª versión marcaba con → y Bruno, usando las
 * flechas para moverse, dejó 7 productos con ⭐ sin querer (26-sep-2026).
 *
 * Mutantes que tienen que caer:
 *  1. → o ← que llamen a `alternar`.
 *  2. ← que avance (las dos flechas para adelante, que es lo que reportó Bruno).
 *  3. ↑ sin acción explícita, o con el producto de otra carta.
 *  4. Una tecla sostenida (`repeat`) que vuelva a alternar.
 *  5. ↑ dos veces antes de que vuelva la lista: tiene que ser marcar y después sacar.
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
  const tecla = async (key: string, repeat = false) => {
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key, repeat })) })
  }
  const acciones = () => alternar.mock.calls.map((c) => {
    const [p, a] = c as unknown as [{ id: string }, string]
    return `${a}:${p.id}`
  })
  return { div, alternar, tecla, acciones }
}

describe('Asignación rápida', () => {
  it('las flechas mueven para los dos lados y ⛔ marcan nada', async () => {
    const { div, alternar, tecla } = await montar()
    expect(div.textContent).toContain('1 de 3')
    expect(div.textContent).toContain('1 sin foto, salteados')
    await tecla('ArrowRight')
    expect(div.textContent).toContain('BABY TEE HOT') // el de sin foto se salteó
    await tecla('ArrowRight')
    expect(div.textContent).toContain('CAMPERA REVOLUTION')
    await tecla('ArrowLeft')
    expect(div.textContent).toContain('BABY TEE HOT')
    await tecla('ArrowLeft')
    await tecla('ArrowLeft')
    expect(div.textContent).toContain('1 de 3')
    expect(alternar).not.toHaveBeenCalled()
  })

  it('↑ marca el que se está mirando, sin moverse; Enter también', async () => {
    const { div, alternar, tecla, acciones } = await montar()
    await tecla('ArrowUp')
    expect(alternar).toHaveBeenCalledWith({ id: '11', nombre: 'TOP MONTANA', sku: 'TM' }, 'marcar')
    expect(div.textContent).toContain('1 de 3')
    await tecla('ArrowRight')
    await tecla('Enter')
    expect(acciones()).toEqual(['marcar:11', 'marcar:13'])
  })

  it('↑ sobre uno que ya tenía ⭐ la saca', async () => {
    const { acciones, tecla } = await montar()
    await tecla('ArrowRight')
    await tecla('ArrowRight')
    await tecla('ArrowUp')
    expect(acciones()).toEqual(['sacar:14'])
  })

  it('↑ dos veces antes de que vuelva la lista: marcar y sacar; una tecla sostenida ⛔ repite', async () => {
    const { acciones, tecla } = await montar()
    await tecla('ArrowUp')
    await tecla('ArrowUp', true)
    await tecla('ArrowUp')
    expect(acciones()).toEqual(['marcar:11', 'sacar:11'])
  })

  it('al final cuenta sólo las nuevas', async () => {
    const { div, tecla } = await montar()
    await tecla('ArrowUp')
    await tecla('ArrowRight')
    await tecla('ArrowRight')
    await tecla('ArrowRight')
    expect(div.textContent).toContain('Marcaste 1 de 3')
  })
})
