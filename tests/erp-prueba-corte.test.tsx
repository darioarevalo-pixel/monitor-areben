// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

const leer = vi.fn()
vi.mock('@/lib/erp/cliente', () => ({ leerCorteDeLinea: (l: string) => leer(l) }))
import { usePruebaSegunCorte } from '@/lib/erp/prueba-corte'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Hook = ReturnType<typeof usePruebaSegunCorte>
async function montar(linea: 'bdi' | 'stunned') {
  const result: { current: Hook } = { current: null as unknown as Hook }
  const Sonda = () => { result.current = usePruebaSegunCorte(linea); return null }
  await act(async () => { createRoot(document.createElement('div')).render(createElement(Sonda)) })
  await act(async () => { await Promise.resolve() })
  return result
}

describe('con qué abre «Reales / De prueba» (Bruno, 9-nov)', () => {
  it('la línea cortada abre en Reales', async () => {
    leer.mockResolvedValueOnce({ en_erp: true })
    const result = await montar('stunned')
    expect(result.current.listo).toBe(true)
    expect(result.current.prueba).toBe(false)
  })
  it('la línea sin cortar abre en De prueba', async () => {
    leer.mockResolvedValueOnce({ en_erp: false })
    const result = await montar('bdi')
    expect(result.current.listo).toBe(true)
    expect(result.current.prueba).toBe(true)
  })
  it('si no se puede leer el corte, De prueba', async () => {
    leer.mockRejectedValueOnce(new Error('caído'))
    const result = await montar('bdi')
    expect(result.current.listo).toBe(true)
    expect(result.current.prueba).toBe(true)
  })
  it('lo que elige la persona no lo pisa el corte', async () => {
    leer.mockResolvedValueOnce({ en_erp: true })
    const result = await montar('stunned')
    expect(result.current.listo).toBe(true)
    act(() => result.current.setPrueba(true))
    expect(result.current.prueba).toBe(true)
  })
})
