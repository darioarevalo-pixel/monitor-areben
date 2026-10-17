// @vitest-environment jsdom
// La pantalla de la empleada: con el ticket en la mano, escanea lo que exhibe y retira (Darío, 17-oct-2026).
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const dichos: string[] = []
vi.mock('@/lib/sonido', () => ({ avisar: (_a: string, voz?: string) => voz && dichos.push(voz), prepararSonido: () => {} }))
const subidos: unknown[] = []
vi.mock('@/lib/exhib/cliente', () => ({
  guardarConfirmacion: async (_m: string, _id: string, d: unknown) => {
    subidos.push(d)
    return { cats: [], por: null, cuando: 'z' }
  },
}))

const { ConfirmarTicket } = await import('@/components/exhib/ConfirmarTicket')
const { ToastProvider } = await import('@/components/ui/Toast')

const item = (barcode: string, name: string, productId = '1') => ({ barcode, sku: barcode, productId, name, size: 'BLANCO', qty: 1 }) as never
const buscables = [item('B1', 'TOP IVORY'), item('B3', 'TOP WREN'), item('B9', 'TOP OTRO')]
const recorrido = {
  id: 'r1',
  cobertura: {
    cats: [], por: null, cuando: 'z',
    confirmacion: {
      lista: { pendientes: [{ clave: 'B1', sku: 'B1', nombre: 'TOP IVORY', variante: 'BLANCO' }], duplicadas: [{ clave: 'B3', sku: 'B3', nombre: 'TOP WREN', variante: 'BLANCO' }] },
      impreso_en: 'i', impreso_por: 'Darío', exhibidos: {}, retirados: {},
    },
  },
} as never

describe('exhibir y retirar con el lector', () => {
  it('dice el nombre propio, tacha, y avisa lo que ⛔ está en el ticket', async () => {
    localStorage.clear()
    const host = document.createElement('div')
    document.body.appendChild(host)
    await act(async () => {
      createRoot(host).render(
        <ToastProvider>
          <ConfirmarTicket marca="zattia" recorrido={recorrido} buscables={buscables} onCobertura={() => {}} />
        </ToastProvider>,
      )
    })
    expect(host.textContent).toContain('Exhibidos 0 de 1')
    const empezar = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Empezar')!
    await act(async () => empezar.click())
    const input = host.querySelector('input')!
    const pasar = async (c: string) => {
      input.value = c
      await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
      await new Promise((r) => setTimeout(r, 900))
    }
    await pasar('B1')
    await pasar('B1')
    await pasar('B3')
    await pasar('B9')
    await pasar('XX')
    expect(dichos).toEqual(['listo', 'ivory', 'ya está', 'wren', 'no está en el ticket', 'no leído'])
    expect(host.textContent).toContain('Exhibidos 1 de 1')
    expect(host.textContent).toContain('Retirados 1 de 1')
    expect(subidos.at(-1)).toMatchObject({ exhibidos: { B1: expect.any(String) }, retirados: { B3: expect.any(String) } })
  }, 15000)
})
