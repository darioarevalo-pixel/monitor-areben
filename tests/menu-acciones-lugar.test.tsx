// @vitest-environment jsdom
// El «⋯» de las listas del ERP abre fijo a la pantalla (3-nov): adentro de la lista, la caja que scrollea lo cortaba
// y en las últimas filas ⛔ se veía ninguna acción (Ventas #56: menú en 608-842 con la lista terminando en 607).
// jsdom ⛔ ve lo que corta una caja: acá se prueba el LUGAR; que se vea se mira en pantalla.
import { beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MenuAcciones, lugarDelMenu } from '@/components/ui/MenuAcciones'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const pantalla = { ancho: 1440, alto: 672 }
const fila = (top: number) => ({ left: 381, right: 409, top, bottom: top + 28 })

describe('lugarDelMenu', () => {
  it('abre abajo si entra', () => {
    expect(lugarDelMenu(fila(100), pantalla, 7, 'izquierda')).toMatchObject({ position: 'fixed', top: 132, bottom: 'auto', left: 381, right: 'auto' })
  })

  it('la última fila de Ventas: 7 acciones ⛔ entran abajo, abre arriba y entra entero', () => {
    const l = lugarDelMenu(fila(576), pantalla, 7, 'izquierda')
    expect(l).toMatchObject({ bottom: 672 - 576 + 4, top: 'auto' })
    expect(l.maxHeight).toBeUndefined()
  })

  it('un alto fijo se quedaba corto: 6 acciones (202 px) con 200 px de lugar abre arriba', () => {
    const l = lugarDelMenu(fila(672 - 28 - 208), pantalla, 6, 'izquierda')
    expect(l.top).toBe('auto')
  })

  it('si ⛔ entra de ningún lado, va al lado con más lugar y scrollea adentro', () => {
    const l = lugarDelMenu(fila(150), { ancho: 1440, alto: 400 }, 20, 'izquierda')
    expect(l).toMatchObject({ top: 182, overflowY: 'auto', maxHeight: 400 - 178 - 8 })
  })

  it('alineado a la derecha ⛔ se sale de la pantalla: se ancla al borde derecho del «⋯»', () => {
    expect(lugarDelMenu({ left: 1400, right: 1428, top: 100, bottom: 128 }, pantalla, 3, 'derecha')).toMatchObject({ right: 12, left: 'auto' })
  })
})

describe('MenuAcciones', () => {
  const abrir = (props: { vertical?: boolean; alPie?: boolean; flotante?: boolean }) => {
    const nodo = document.createElement('div')
    document.body.appendChild(nodo)
    const raiz = createRoot(nodo)
    act(() => raiz.render(<MenuAcciones etiqueta="Más acciones de X" acciones={[{ key: 'a', label: 'A', onClick: () => {} }]} {...props} />))
    act(() => nodo.querySelector('button')!.click())
    return { menu: nodo.querySelector('[role=menu]') as HTMLElement, nodo }
  }

  it('el vertical, el de las listas, abre fijo sin pedirlo', () => {
    expect(abrir({ vertical: true }).menu.style.position).toBe('fixed')
  })

  it('el horizontal y el del pie de la ficha siguen como estaban', () => {
    expect(abrir({}).menu.style.position).toBe('absolute')
    expect(abrir({ vertical: true, alPie: true }).menu.style.position).toBe('absolute')
  })

  it('se cierra al scrollear la lista, ⛔ al scrollear el propio menú', () => {
    const { menu, nodo } = abrir({ vertical: true })
    act(() => { menu.dispatchEvent(new Event('scroll')) })
    expect(nodo.querySelector('[role=menu]')).not.toBeNull()
    act(() => { window.dispatchEvent(new Event('scroll')) })
    expect(nodo.querySelector('[role=menu]')).toBeNull()
  })
})
