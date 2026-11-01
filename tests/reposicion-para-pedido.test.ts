import { describe, expect, it } from 'vitest'
import { agruparLista, grupoDe, paraPedidoDe, soloEnDeposito, unidadesEnPedidos } from '@/lib/reposicion/paraPedido'
import type { FilaVentas } from '@/lib/reposicion/porVentas'

const V = (vid: string, sku: string, name: string, size: string, local = 0) => ({ vid, sku, name, size, local })

describe('paraPedidoDe: manda la menor entre el negativo y los pedidos', () => {
  it('con pedido y Local en −1, 1 a la bolsa aunque se lleven 3', () => expect(paraPedidoDe(-1, 1, 3)).toBe(1))
  it('pedido con stock en el Local: se saca de ahí', () => expect(paraPedidoDe(2, 1, 3)).toBe(0))
  it('Local en 0: la prenda del pedido ya está en el local', () => expect(paraPedidoDe(0, 1, 2)).toBe(0))
  it('negativo sin pedido: va al perchero', () => expect(paraPedidoDe(-1, 0, 3)).toBe(0))
  it('nunca más que lo que se lleva', () => expect(paraPedidoDe(-3, 3, 2)).toBe(2))
  it('nunca más que lo que debe el Local', () => expect(paraPedidoDe(-1, 4, 5)).toBe(1))
})

describe('unidadesEnPedidos', () => {
  const inv = [
    V('c', 'BKB-0002-VI-S', 'CORPIÑO TAYRA - VIOLETA', 'S'),
    V('b', 'BKB-0002-VI-S', 'BOMBACHA TAYRA - VIOLETA', 'S'),
    V('s', 'BKB-0003-VI-L', 'BOMBACHA NYA - VIOLETA', 'S'),
    V('l', 'BKB-0003-VI-L', 'BOMBACHA NYA - VIOLETA', 'L'),
    V('t', 'RCT-0002-VE-S', 'CORSET FRANK SE', 'S'),
  ]
  it('SKU único: alcanza el SKU, sumando pedidos y sin importar mayúsculas', () => {
    const p = [{ sku: 'rct-0002-ve-s', nombre: 'OTRO NOMBRE (S)', cantidad: 1 }, { sku: 'RCT-0002-VE-S', nombre: 'x', cantidad: 2 }]
    expect(unidadesEnPedidos(inv, p)).toEqual({ t: 3 })
  })
  it('SKU repetido entre dos productos: desempata el nombre', () => {
    expect(unidadesEnPedidos(inv, [{ sku: 'BKB-0002-VI-S', nombre: 'BOMBACHA TAYRA - VIOLETA (S)', cantidad: 1 }])).toEqual({ b: 1 })
    expect(unidadesEnPedidos(inv, [{ sku: 'BKB-0002-VI-S', nombre: 'Corpiño Tayra - Violeta (S)', cantidad: 1 }])).toEqual({ c: 1 })
  })
  it('SKU repetido dentro del producto: desempata el talle', () => {
    expect(unidadesEnPedidos(inv, [{ sku: 'BKB-0003-VI-L', nombre: 'BOMBACHA NYA - VIOLETA (L)', cantidad: 1 }])).toEqual({ l: 1 })
  })
  it('SKU repetido sin coincidencia, o SKU desconocido: no hay alerta', () => {
    expect(unidadesEnPedidos(inv, [{ sku: 'BKB-0002-VI-S', nombre: 'BIKINI TAYRA (S)', cantidad: 1 }, { sku: 'NADA', nombre: 'x', cantidad: 1 }])).toEqual({})
  })
})

describe('los grupos de la lista', () => {
  const F = (vid: string, local: number, llevar: number, exhibir = false, deposito = 5, pid = vid) => ({ it: { vid, pid, local, deposito }, d: { llevar, exhibir } }) as unknown as FilaVentas
  const cant = (f: FilaVentas) => f.d.llevar

  it('pedido gana a exhibir, y exhibir a reposición', () => {
    expect(grupoDe(true, 1)).toBe('pedidos')
    expect(grupoDe(true, 0)).toBe('exhibir')
    expect(grupoDe(false, 0)).toBe('reposicion')
  })
  it('ordena Pedidos, Para exhibir, Reposición, y saca los vacíos', () => {
    const g = agruparLista([F('r', 1, 1), F('e', 0, 2, true), F('p', -1, 3, true)], { p: 1 }, cant)
    expect(g.map((x) => [x.clave, x.filas.map((f) => f.it.vid)])).toEqual([['pedidos', ['p']], ['exhibir', ['e']], ['reposicion', ['r']]])
    expect(agruparLista([F('r', 1, 1)], {}, cant).map((x) => x.clave)).toEqual(['reposicion'])
  })
  it('negativo sin pedido no va a Pedidos', () => {
    expect(agruparLista([F('n', -1, 3)], {}, cant)[0].clave).toBe('reposicion')
  })
  it('candidatos a Exclusivo online: nada en el local entre todas sus variantes, algo en el depósito', () => {
    const f = [F('a1', 0, 0, false, 3, 'a'), F('a2', -1, 0, false, 0, 'a'), F('b1', 1, 0, false, 3, 'b'), F('b2', 0, 0, false, 3, 'b'), F('c1', 0, 0, false, 0, 'c')]
    expect(soloEnDeposito(f)).toEqual(['a'])
  })
})
