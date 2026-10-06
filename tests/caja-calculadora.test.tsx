// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CalculadoraBilletes, olvidarConteo } from '@/components/caja/CalculadoraBilletes'
import { BILLETES_INICIALES } from '@/lib/caja/conteo.core.js'

/**
 * Caja · fase B: la pantalla de la calculadora. El oráculo, a mano: 3 × $20.000 + 4 × $1.000 +
 * 1 × $500 = $64.500. Y las reglas de Bruno (5-oct): cada conteo arranca VACÍO —⛔ arrastra el anterior—;
 * sólo vuelve el borrador SIN usar del mismo momento (el modal cerrado sin querer).
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
  act(() => raiz.render(<CalculadoraBilletes momento="apertura" billetes={B} titulo="Abrir turno" accion="Abrir turno" onUsar={onUsar} onCerrar={() => {}} {...props} />))
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
    act(() => boton('Abrir turno').click())
    expect(onUsar).toHaveBeenCalledWith(64500, { 20000: 3, 10000: 0, 2000: 0, 1000: 4, 500: 1, 200: 0, 100: 0 })
  })

  it('el contador − / + suma de a un billete, ⛔ baja de cero, y viaja igual que lo tipeado', () => {
    const onUsar = montar()
    const mas = document.querySelector('button[aria-label="Un billete de $1.000 más"]') as HTMLButtonElement
    const menos = document.querySelector('button[aria-label="Un billete de $1.000 menos"]') as HTMLButtonElement
    act(() => menos.click())
    expect(input(1000).value).toBe('')
    act(() => mas.click())
    act(() => mas.click())
    act(() => menos.click())
    expect(input(1000).value).toBe('1')
    tipear(1000, '3')
    act(() => mas.click())
    act(() => boton('Abrir turno').click())
    expect(onUsar).toHaveBeenCalledWith(4000, { 20000: 0, 10000: 0, 2000: 0, 1000: 4, 500: 0, 200: 0, 100: 0 })
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

  it('🔴 un conteo ya usado ⛔ vuelve: el próximo arranca vacío', () => {
    montar()
    tipear(20000, '3')
    olvidarConteo('apertura')
    act(() => raiz.unmount())
    raiz = createRoot(caja)
    montar()
    expect(input(20000).value).toBe('')
  })

  it('🔴 un borrador de más de 12 h es de otro turno: ⛔ vuelve', () => {
    localStorage.setItem('caja:conteo:zattia:apertura', JSON.stringify({ conteo: { 20000: '4' }, en: new Date(Date.now() - 13 * 3_600_000).toISOString() }))
    montar()
    expect(input(20000).value).toBe('')
  })

  it('el total a mano manda sobre los billetes y viaja SIN conteo', () => {
    const onUsar = montar({ aMano: true })
    tipear(20000, '1')
    const el = document.querySelector('input[aria-label="Total a mano"]') as HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      set.call(el, '15.500')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => boton('Abrir turno').click())
    expect(onUsar).toHaveBeenCalledWith(15500, null)
  })

  it('al cerrar, con el esperado se ve la diferencia en términos', () => {
    montar({ esperado: 20000 })
    tipear(20000, '1')
    expect(document.body.textContent).toContain('Cuadrado')
    tipear(1000, '2')
    expect(document.body.textContent).toContain('Sobran $2.000')
  })
})
