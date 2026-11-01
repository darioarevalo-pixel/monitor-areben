import { describe, expect, it } from 'vitest'
import { paraPedidoDe, unidadesEnPedidos } from '@/lib/reposicion/paraPedido'

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
