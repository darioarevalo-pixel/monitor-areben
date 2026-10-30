// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BarraSeleccion, FichaCostado, type PieFicha } from '@/components/ui/FichaCostado'

/**
 * 📱 **El ERP en el celular, tanda 2** (Bruno, 29-oct; artifact `diseno/celular/erp-celular.html`, molde 3): en el celular la
 * ficha lleva la acción principal FIJA AL PIE y el resto en «⋯», que abre hacia arriba. En la compu el pie ⛔ se dibuja
 * (la ficha sigue con sus botones arriba). `BarraSeleccion` ⛔ aparece en el celular.
 */

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); window.history.replaceState(null, '', '/') })

async function montar(el: React.ReactElement, url: string) {
  window.history.replaceState(null, '', url)
  host = document.createElement('div'); document.body.appendChild(host)
  await act(async () => { root = createRoot(host); root.render(el) })
}

const cobrar = vi.fn()
const anular = vi.fn()
const PIE: PieFicha = {
  principal: { label: 'Registrar cobro', onClick: cobrar },
  otra: { label: 'Editar', onClick: () => {} },
  mas: [{ key: 'anular', label: 'Anular…', onClick: anular }],
}
const ficha = (pie: PieFicha | undefined = PIE) => (
  <FichaCostado abierta onCerrar={() => {}} titulo="Venta #1283" etiqueta="Ficha de la venta #1283" pie={pie}>
    <p>Cuerpo de la ficha</p>
  </FichaCostado>
)
const elPie = () => document.querySelector('[data-pie-ficha]')

describe('FichaCostado en el celular', () => {
  it('la acción principal va fija al pie; lo demás, en «⋯» que abre hacia arriba', async () => {
    await montar(ficha(), '/erp/ventas?movil=1')
    const pie = elPie()!
    expect(pie).not.toBeNull()
    expect(getComputedStyle(pie as HTMLElement).position).toBe('sticky')
    const botones = [...pie.querySelectorAll('button')].map((b) => b.textContent || b.getAttribute('aria-label'))
    expect(botones).toEqual(['Editar', 'Registrar cobro', 'Más acciones · Ficha de la venta #1283'])

    act(() => (pie.querySelector('button:nth-of-type(2)') as HTMLButtonElement).click())
    expect(cobrar).toHaveBeenCalledOnce()

    act(() => (pie.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement).click())
    const menu = document.querySelector('[role="menu"]') as HTMLElement
    expect(menu.style.bottom).not.toBe('')
    expect(menu.style.top).toBe('')
    act(() => (menu.querySelector('[role="menuitem"]') as HTMLButtonElement).click())
    expect(anular).toHaveBeenCalledOnce()
  })

  it('sin nada que hacer ⛔ se dibuja el pie (ni un «⋯» vacío)', async () => {
    await montar(ficha({ principal: undefined, mas: [] }), '/erp/clientes?movil=1')
    expect(elPie()).toBeNull()
  })

  it('en la compu ⛔ hay pie: la ficha queda como estaba', async () => {
    await montar(ficha(), '/erp/ventas?movil=0')
    expect(document.body.textContent).toContain('Cuerpo de la ficha')
    expect(elPie()).toBeNull()
  })
})

describe('BarraSeleccion', () => {
  const barra = <BarraSeleccion cuantas={3} onSoltar={() => {}}><span>Imprimir etiquetas</span></BarraSeleccion>
  it('en el celular ⛔ aparece: ahí ⛔ se trabaja en lote', async () => {
    await montar(barra, '/erp/stock?movil=1')
    expect(host.textContent).toBe('')
  })
  it('en la compu sigue igual', async () => {
    await montar(barra, '/erp/stock?movil=0')
    expect(host.textContent).toContain('3 elegidas')
  })
})
