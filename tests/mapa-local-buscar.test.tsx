// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Detalle } from '@/components/mapa-local/Detalle'
import type { MapaLocal, Prenda } from '@/lib/mapa-local/tipos'

/** El buscador del módulo: busca en las dos barras juntas y dice cuántas hay, o que no está. */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const p = (nombre: string, color: string): Prenda => ({ clave: `${nombre}|${color}`, productId: nombre, nombre, color, tipo: 'TOP', linea: 'nc', img: null, unidades: 1, ventas30: null, ultimaVenta: null, alta: null, ritmo: null, tramo: 'vende' })
const modulo = { codigo: 'D01', pared: 'der' as const, orden: 1, anchoCm: 75, niveles: [
  { pos: 'alta' as const, alturaCm: 180, linea: 'nc' as const, tipos: ['TOP'], cupo: 28 },
  { pos: 'baja' as const, alturaCm: 105, linea: 'nc' as const, tipos: ['TOP'], cupo: 27 },
] }
const mapa: MapaLocal = { version: 1, tipos: [], modulos: [modulo] }
const u = { porBarra: { 'D01-alta': [p('TOP QUARTZ', 'negro'), p('TOP AMOK', 'crema')], 'D01-baja': [p('TOP QUARTZ', 'crema'), p('TOP VERA', 'negro')] }, noEntran: [], sinLugar: [], noCuelgan: [], durmiendo: [] }

function escribir(div: HTMLElement, texto: string) {
  const input = div.querySelector('input[type="search"]') as HTMLInputElement
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    set.call(input, texto)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('Detalle: buscar en el módulo', () => {
  it('busca en las dos barras y cuenta, y si no está lo dice', () => {
    const div = document.createElement('div')
    act(() => createRoot(div).render(<Detalle mapa={mapa} modo="tope" modulo={modulo} u={u} alertas={[]} opcionesTipo={[]} editar={false} onCambiar={() => {}} onImprimir={() => {}} />))
    expect(div.textContent).toContain('TOP VERA')
    escribir(div, 'quartz')
    expect(div.textContent).toContain('2 de 4 en D01')
    expect(div.textContent).not.toContain('TOP VERA')
    expect(div.textContent).not.toContain('TOP AMOK')
    escribir(div, 'sapphire')
    expect(div.textContent).toContain('No está en D01')
  })
})
