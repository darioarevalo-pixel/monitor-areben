// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/erp/cliente', async (orig) => ({
  ...(await orig<typeof import('@/lib/erp/cliente')>()),
  leerEncargadas: vi.fn(async () => ({ marca: 'zattia', encargadas: [{ usuario: 'ana', nombre: 'Ana' }] })),
}))
const { ModalSinStock } = await import('@/components/caja/ModalSinStock')
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('la ventana del PIN de vender sin stock', () => {
  it('dice qué prenda falta, muestra el error del PIN y sin encargada ni PIN ⛔ deja autorizar', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const raiz = createRoot(el)
    const onAutorizar = vi.fn()
    await act(async () => {
      raiz.render(<ModalSinStock faltan={[{ product_id: 7, size_id: 1, nombre: 'Remera', talle: 'M', hay: -2, pide: 1 }]} error="PIN incorrecto" enviando={false} onCerrar={() => {}} onAutorizar={onAutorizar} />)
    })
    const texto = document.body.textContent ?? ''
    expect(texto).toContain('Remera · M (hay 0, se lleva 1)')
    expect(texto).toContain('PIN incorrecto')
    const boton = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Autorizar y cobrar')) as HTMLButtonElement
    expect(boton.disabled).toBe(true)
    await act(async () => { raiz.unmount() })
    el.remove()
  })

  it('🔴 se monta en `modalesJSX`, el bloque que usan la vista de PC y la de celular', () => {
    const fuente = readFileSync('components/caja/CajaPOS.tsx', 'utf8')
    const desde = fuente.indexOf('const modalesJSX = (')
    const hasta = fuente.indexOf('\n  )\n', desde)
    expect(fuente.slice(desde, hasta)).toContain('<ModalSinStock')
    expect(fuente.match(/\{modalesJSX\}/g)).toHaveLength(2)
  })
})
