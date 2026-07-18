import { describe, it, expect } from 'vitest'
import { aplicarCats, catsDisponibles, minKey, minimo, moverFinal, objetivo, reporte, sugerido, ubicCmp } from '@/lib/reposicion/core'
import { repoCfgDefault, type RepoCfg, type RepoItem } from '@/lib/reposicion/tipos'

function item(over: Partial<RepoItem> = {}): RepoItem {
  return { vid: '10_100', pid: '10', sid: '100', name: 'Templado', size: 'iPhone 15', sku: 'T-15', local: 0, deposito: 10, cats: [], catFallback: 'VIDRIOS', cat: 'VIDRIOS', subcat: null, modelo: null, s7: 0, ubic: '', ...over }
}
function cfg(over: Partial<RepoCfg> = {}): RepoCfg {
  return { ...repoCfgDefault(), ...over }
}

describe('minKey / minimo / objetivo', () => {
  it('minKey: subcat > modelo > cat', () => {
    expect(minKey(item({ subcat: 'VIDRIOS', modelo: 'iPhone 15', cat: 'X' }))).toBe('VIDRIOS')
    expect(minKey(item({ subcat: null, modelo: 'iPhone 15', cat: 'X' }))).toBe('iPhone 15')
    expect(minKey(item({ subcat: null, modelo: null, cat: 'X' }))).toBe('X')
  })
  it('minimo: por clave, o default', () => {
    expect(minimo(item({ cat: 'VIDRIOS' }), cfg({ mins: { VIDRIOS: 8 } }))).toBe(8)
    expect(minimo(item({ cat: 'OTRA' }), cfg({ defaultMin: 5 }))).toBe(5)
  })
  it('objetivo: el tope por producto baja el mínimo si es menor', () => {
    expect(objetivo(item({ pid: '10', cat: 'VIDRIOS' }), cfg({ mins: { VIDRIOS: 8 }, topes: { '10': 2 } }))).toBe(2)
    expect(objetivo(item({ pid: '10', cat: 'VIDRIOS' }), cfg({ mins: { VIDRIOS: 8 }, topes: { '10': 20 } }))).toBe(8) // tope mayor no aplica
  })
})

describe('sugerido · reserva de depósito', () => {
  it('mueve lo justo para llegar al objetivo', () => {
    // objetivo 4 (default), local 1, deposito 10, sin reserva (no modelo, no reservaTodos) → mover 3
    expect(sugerido(item({ local: 1, deposito: 10, modelo: null }), cfg({ reservaTodos: false }), false)).toBe(3)
  })
  it('respeta la reserva de depósito en fundas (siempre)', () => {
    // funda (modelo), objetivo 4, local 0, deposito 3, reserva 1 → min(4, 3-1)=2
    expect(sugerido(item({ local: 0, deposito: 3, modelo: 'iPhone 15' }), cfg({ reservaDeposito: 1 }), false)).toBe(2)
  })
  it('en BDI con reservaTodos aplica la reserva a todo', () => {
    expect(sugerido(item({ local: 0, deposito: 3, modelo: null }), cfg({ reservaTodos: true, reservaDeposito: 1 }), true)).toBe(2)
    expect(sugerido(item({ local: 0, deposito: 3, modelo: null }), cfg({ reservaTodos: false, reservaDeposito: 1 }), true)).toBe(3) // sin reservaTodos, no aplica
  })
  it('si el local ya llega al objetivo → 0', () => {
    expect(sugerido(item({ local: 5, deposito: 10 }), cfg({ defaultMin: 4 }), false)).toBe(0)
  })
  it('si el depósito no alcanza (bajo reserva) → 0', () => {
    expect(sugerido(item({ local: 0, deposito: 1, modelo: 'iPhone 15' }), cfg({ reservaDeposito: 1 }), false)).toBe(0)
  })
})

describe('moverFinal / reporte', () => {
  it('moverFinal: manual pisa el sugerido', () => {
    const it = item({ local: 1, deposito: 10 })
    expect(moverFinal(it, cfg({ reservaTodos: false }), false, {})).toBe(3)
    expect(moverFinal(it, cfg({ reservaTodos: false }), false, { '10_100': 1 })).toBe(1)
    expect(moverFinal(it, cfg({ reservaTodos: false }), false, { '10_100': 0 })).toBe(0)
  })
  it('reporte: no apagados, bajo objetivo, con algo para mover', () => {
    const inv = [
      item({ vid: 'a', pid: '1', local: 0, deposito: 5, cat: 'V' }), // repone
      item({ vid: 'b', pid: '2', local: 8, deposito: 5, cat: 'V' }), // ya sobre objetivo → no
      item({ vid: 'c', pid: '3', local: 0, deposito: 0, cat: 'V' }), // sin depósito → sugerido 0 → no
      item({ vid: 'd', pid: '4', local: 0, deposito: 5, cat: 'V' }), // apagado → no
    ]
    const c = cfg({ reservaTodos: false, apagados: ['4'] })
    expect(reporte(inv, c, false).map((x) => x.pid)).toEqual(['1'])
  })
})

describe('aplicarCats', () => {
  it('subcat = primera candidata no ignorada; cat = subcat o respaldo', () => {
    const inv = [item({ cats: ['Night', 'TOPS Y BODIES'], catFallback: 'Fundas' })]
    expect(aplicarCats(inv, [])[0]).toMatchObject({ subcat: 'Night', cat: 'Night' })
    expect(aplicarCats(inv, ['night'])[0]).toMatchObject({ subcat: 'TOPS Y BODIES', cat: 'TOPS Y BODIES' })
    expect(aplicarCats([item({ cats: [], catFallback: 'Fundas' })], [])[0]).toMatchObject({ subcat: null, cat: 'Fundas' })
  })
  it('catsDisponibles: todas las candidatas, únicas, ordenadas', () => {
    expect(catsDisponibles([item({ cats: ['Zeta', 'Alfa'] }), item({ cats: ['alfa', 'Beta'] })])).toEqual(['Alfa', 'Beta', 'Zeta'])
  })
})

describe('ubicCmp · orden por ubicación física NN-N', () => {
  it('ordena por ubicación, posición, y texto; vacíos al final', () => {
    const arr = ['17-2', '3-1', '17-1', '', '5']
    expect(arr.slice().sort(ubicCmp)).toEqual(['3-1', '5', '17-1', '17-2', ''])
  })
})
