// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { TileResumen, tonoDeConteo } from '@/components/ui/PiezasLista'

/** Color del ERP (diseño §9): el tile dice algo. Principal = índigo sólido; un conteo a revisar = rojo si hay, verde si no. */
describe('TileResumen › tono', () => {
  it('tonoDeConteo: rojo si hay algo para revisar, verde si no', () => {
    expect(tonoDeConteo(3)).toBe('revisar')
    expect(tonoDeConteo(0)).toBe('bien')
    expect(tonoDeConteo(undefined)).toBe('bien')
  })

  it('oscuro = principal (índigo sólido); sin tono = índigo suave; revisar = rojo suave', () => {
    const el = document.createElement('div')
    const raiz = createRoot(el)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    act(() => raiz.render(<><TileResumen oscuro titulo="a" valor="1" /><TileResumen titulo="b" valor="2" /><TileResumen tono="revisar" titulo="c" valor="3" /></>))
    const fondos = [...el.children].map((n) => (n as HTMLElement).style.background)
    expect(fondos).toEqual(['var(--mo-brand-solid)', 'var(--mo-brand-bg)', 'var(--mo-danger-bg)'])
    act(() => raiz.unmount())
  })
})
