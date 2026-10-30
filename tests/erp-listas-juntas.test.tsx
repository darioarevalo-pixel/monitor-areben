// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ListasJuntas, type AlContar } from '@/components/erp/ListasJuntas'

/**
 * **Pantallas juntas (tanda 3, 30-oct).** El oráculo de cada fusión: el número de cada opción del filtro es el que avisa SU
 * lista (el de la pantalla de antes), también el de la que no se está mirando; el filtro sólo elige cuál se ve.
 */
function Lista({ nombre, n, alContar }: { nombre: string; n: number | null; alContar: AlContar }) {
  useEffect(() => { alContar(n) }, [alContar, n])
  return <p>lista {nombre}</p>
}

let root: Root | null = null
let host: HTMLDivElement
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove() })

async function montar(valor: string, numeros: Record<string, number | null>, elegidas: string[] = []) {
  host = document.createElement('div'); document.body.appendChild(host)
  const partes = [{ key: 'ajustes', label: 'Ajustes' }, { key: 'ingresos', label: 'Ingresos de mercadería' }]
  await act(async () => {
    root = createRoot(host)
    root.render(<ListasJuntas etiqueta="Tipo" partes={partes} valor={valor} onCambio={(k) => elegidas.push(k)} render={(k, alContar) => <Lista nombre={k} n={numeros[k]} alContar={alContar} />} />)
  })
}
const opcion = (t: string) => [...host.querySelectorAll('[role="radio"]')].find((b) => b.textContent?.startsWith(t)) as HTMLButtonElement

describe('ERP › pantallas juntas', () => {
  it('cada opción con el número de SU lista, también la escondida; se ve sólo la elegida', async () => {
    await montar('ingresos', { ajustes: 12, ingresos: 1234 })
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Tipo')
    expect(opcion('Ajustes').textContent).toBe('Ajustes12')
    expect(opcion('Ingresos').textContent).toBe('Ingresos de mercadería1.234')
    expect(opcion('Ingresos').getAttribute('aria-checked')).toBe('true')
    const [a, i] = [...host.querySelectorAll('p')].map((p) => p.parentElement as HTMLElement)
    expect(a.hidden).toBe(true)
    expect(i.hidden).toBe(false)
  })

  it('mientras una lista lee, su número dice «…» (⛔ un 0 que parece «no hay»); elegir avisa la opción', async () => {
    const elegidas: string[] = []
    await montar('ajustes', { ajustes: null, ingresos: 3 }, elegidas)
    expect(opcion('Ajustes').textContent).toBe('Ajustes…')
    await act(async () => { opcion('Ingresos').click() })
    expect(elegidas).toEqual(['ingresos'])
  })
})
