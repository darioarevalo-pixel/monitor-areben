// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalculadoraBilletes } from '@/components/caja/CalculadoraBilletes'
import { BILLETES_INICIALES } from '@/lib/caja/conteo.core.js'

/**
 * Caja · fase B: la pantalla de la calculadora. El oráculo, a mano: 3 × $20.000 + 4 × $1.000 +
 * 1 × $500 = $64.500. Y la regla de Bruno: «al volver a entrar, mantiene la cantidad de cada billete».
 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// El `localStorage` de la PC del local, en memoria (el del entorno de test ⛔ es completo).
const disco = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => disco.get(k) ?? null,
  setItem: (k: string, v: string) => void disco.set(k, v),
  removeItem: (k: string) => void disco.delete(k),
  clear: () => disco.clear(),
})
const B = [...BILLETES_INICIALES]
let raiz: Root
let caja: HTMLDivElement

beforeEach(() => {
  localStorage.clear()
  caja = document.createElement('div')
  document.body.appendChild(caja)
  raiz = createRoot(caja)
})
afterEach(() => {
  act(() => raiz.unmount())
  document.body.innerHTML = ''
})

const montar = (props: Partial<Parameters<typeof CalculadoraBilletes>[0]> = {}) => {
  const onUsar = vi.fn()
  act(() => raiz.render(<CalculadoraBilletes momento="apertura" billetes={B} titulo="Contar el fondo" accion="Usar este total" onUsar={onUsar} onCerrar={() => {}} {...props} />))
  return onUsar
}
const input = (v: number) => document.querySelector(`input[aria-label="Billetes de $${v.toLocaleString('es-AR')}"]`) as HTMLInputElement
function tipear(v: number, texto: string) {
  const el = input(v)
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    set.call(el, texto)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const boton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === t) as HTMLButtonElement

describe('CalculadoraBilletes', () => {
  it('🔑 3 × $20.000 + 4 × $1.000 + 1 × $500 ⇒ muestra $64.500 y lo entrega con los billetes', () => {
    const onUsar = montar()
    tipear(20000, '3')
    tipear(1000, '4')
    tipear(500, '1')
    expect(document.body.textContent).toContain('$64.500')
    act(() => boton('Usar este total').click())
    expect(onUsar).toHaveBeenCalledWith(64500, { 20000: 3, 10000: 0, 2000: 0, 1000: 4, 500: 1, 200: 0, 100: 0 })
  })

  it('el input sólo deja dígitos: «-2» es 2, ⛔ resta', () => {
    montar()
    tipear(1000, '-2')
    expect(input(1000).value).toBe('2')
  })

  it('🔑 al volver a entrar, los números siguen', () => {
    montar()
    tipear(20000, '3')
    tipear(100, '7')
    act(() => raiz.unmount())
    raiz = createRoot(caja)
    montar()
    expect(input(20000).value).toBe('3')
    expect(input(100).value).toBe('7')
    expect(document.body.textContent).toContain('$60.700')
  })

  it('arranca con lo guardado en la base si es más nuevo que lo de esta computadora (otra PC contó después)', () => {
    localStorage.setItem('caja:conteo:zattia:intermedio:t1', JSON.stringify({ conteo: { 20000: '1' }, en: '2026-10-05T12:00:00.000Z' }))
    const guardado = { billetes: { 20000: 2, 500: 3 }, total: 41500, en: '2026-10-05T15:00:00.000Z', por: 'otra' }
    montar({ momento: 'intermedio:t1', guardado })
    expect(input(20000).value).toBe('2')
    expect(input(500).value).toBe('3')
    act(() => raiz.unmount())
    // Y si lo de esta computadora es más nuevo, gana lo de esta computadora.
    localStorage.setItem('caja:conteo:zattia:intermedio:t1', JSON.stringify({ conteo: { 20000: '5' }, en: '2026-10-05T16:00:00.000Z' }))
    raiz = createRoot(caja)
    montar({ momento: 'intermedio:t1', guardado })
    expect(input(20000).value).toBe('5')
    expect(input(500).value).toBe('')
  })
})
