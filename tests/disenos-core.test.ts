import { describe, expect, it } from 'vitest'
import { contarPorEstado, ordenar, sanearImportado } from '../lib/disenos/core'
import type { Diseno } from '../lib/disenos/tipos'

const D = (over: Partial<Diseno>): Diseno => ({ id: 'x', name: '', url: 'data:,', nota: '', up: 0, down: 0, estado: 'revisar', ...over })

describe('ordenar', () => {
  const arr: Diseno[] = [
    D({ id: 'a', name: 'Beta', up: 1, down: 4 }),
    D({ id: 'b', name: 'Alfa', up: 3, down: 1 }),
    D({ id: 'c', name: 'Gama', up: 3, down: 0 }),
  ]
  it('carga: no reordena', () => {
    expect(ordenar(arr, 'carga').map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })
  it('tildes: más up primero, desempata por nombre', () => {
    expect(ordenar(arr, 'tildes').map((d) => d.id)).toEqual(['b', 'c', 'a']) // b y c tienen up 3, Alfa<Gama
  })
  it('cruces: más down primero', () => {
    expect(ordenar(arr, 'cruces').map((d) => d.id)).toEqual(['a', 'b', 'c'])
  })
  it('saldo: mejor (up-down) primero', () => {
    // c: 3, b: 2, a: -3
    expect(ordenar(arr, 'saldo').map((d) => d.id)).toEqual(['c', 'b', 'a'])
  })
  it('no muta el original', () => {
    const orig = arr.map((d) => d.id)
    ordenar(arr, 'tildes')
    expect(arr.map((d) => d.id)).toEqual(orig)
  })
})

describe('sanearImportado', () => {
  let n = 0
  const nid = () => 'gen' + n++
  it('descarta lo que no tiene url string', () => {
    const out = sanearImportado([{ url: 'data:,ok' }, { name: 'sin url' }, null, 'x'], nid)
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe('data:,ok')
  })
  it('normaliza estado inválido a revisar y completa defaults', () => {
    const out = sanearImportado([{ url: 'data:,a', estado: 'raro' }, { url: 'data:,b', estado: 'confirmado', up: '3' }], nid)
    expect(out[0].estado).toBe('revisar')
    expect(out[1].estado).toBe('confirmado')
    expect(out[1].up).toBe(3)
  })
  it('devuelve [] si no es array', () => {
    expect(sanearImportado({ url: 'x' }, nid)).toEqual([])
  })
})

describe('contarPorEstado', () => {
  it('cuenta por estado', () => {
    const ds = [D({ estado: 'confirmado' }), D({ estado: 'confirmado' }), D({ estado: 'duda' })]
    expect(contarPorEstado(ds, 'confirmado')).toBe(2)
    expect(contarPorEstado(ds, 'rechazado')).toBe(0)
  })
})
