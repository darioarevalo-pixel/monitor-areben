import { describe, expect, it } from 'vitest'
import { agruparLista, descontarReservas, grupoDe, paraPedidoDe, reservadasEnPedidos, separarNegativos, soloEnDeposito, unidadesEnPedidos } from '@/lib/reposicion/paraPedido'
import { decidir, cfgVentas } from '@/lib/reposicion/porVentas'
import { repoCfgDefault, type RepoItem } from '@/lib/reposicion/tipos'
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
  it('bikini CONJUNTO (SKU de las partes unido con «+», 26-nov-2026): cuenta el corpiño y la bombacha', () => {
    const conj = [V('cs', 'BKC-0008-S', 'CORPIÑO JULIET RIVIERA', 'S'), V('bs', 'BKB-0008-S', 'BOMBACHA JULIET RIVIERA', 'S'), V('bm', 'BKB-0008-M', 'BOMBACHA JULIET RIVIERA', 'M')]
    const p = [
      { sku: 'BKC-0008-S+BKB-0008-S', nombre: 'Bikini JULIET · Riviera (S, S)', cantidad: 1, reserva: true },
      { sku: 'bkc-0008-s+BKB-0008-M', nombre: 'Bikini JULIET · Riviera (S, M)', cantidad: 1, reserva: true },
    ]
    expect(unidadesEnPedidos(conj, p)).toEqual({ cs: 2, bs: 1, bm: 1 })
    expect(reservadasEnPedidos(conj, p)).toEqual({ cs: 2, bs: 1, bm: 1 })
    // una parte con SKU repetido: el nombre es el de la bikini ⇒ ⛔ desempata, la otra parte igual cuenta
    expect(unidadesEnPedidos(inv.concat(conj), [{ sku: 'BKB-0002-VI-S+BKB-0008-M', nombre: 'Bikini X (S, M)', cantidad: 1 }])).toEqual({ bm: 1 })
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

describe('separarNegativos: negativo sin pedido = a revisar, ⛔ se repone (Darío, 12-nov-2026)', () => {
  const I = (vid: string, local: number) => ({ vid, local, deposito: 1 })
  it('sin pedido: el Local pasa a 0 y va a revisar con lo que falta explicar', () => {
    const r = separarNegativos([I('a', -1)], {})
    expect(r.inv[0].local).toBe(0)
    expect(r.revisar).toEqual([{ it: I('a', -1), sinPedido: 1 }])
  })
  it('con pedido que lo cubre: queda igual y nada a revisar', () => {
    const r = separarNegativos([I('a', -1)], { a: 1 })
    expect(r.inv[0].local).toBe(-1)
    expect(r.revisar).toEqual([])
  })
  it('pedido que cubre una parte: queda el negativo del pedido y el resto a revisar', () => {
    const r = separarNegativos([I('a', -3)], { a: 1 })
    expect(r.inv[0].local).toBe(-1)
    expect(r.revisar[0].sinPedido).toBe(2)
  })
  it('Local en 0 o positivo: no se toca, aunque haya pedido', () => {
    const inv = [I('a', 0), I('b', 2)]
    const r = separarNegativos(inv, { a: 1, b: 1 })
    expect(r.inv).toEqual(inv)
    expect(r.revisar).toEqual([])
  })
  it('la Remera F*ck M (Stunned, 12-nov): −1 / 1 sin pedido ⇒ no pide llevarla «para exhibir» por el negativo', () => {
    const it0 = { vid: 'f', pid: '1', sid: '1', name: 'REMERA F*CK', size: 'M', sku: 'STU-REM-0014-M', barcode: '', local: -1, deposito: 1, cats: [], catFallback: '', cat: '', subcat: null, modelo: null, s7: 0, ubic: '', vv: 0 } as unknown as RepoItem
    const cfg = repoCfgDefault()
    const cv = cfgVentas(cfg, 'stunned')
    const antes = decidir(it0, cfg, cv, '2026-11-12')
    const sinPedido = decidir(separarNegativos([it0], {}).inv[0], cfg, cv, '2026-11-12')
    const conPedido = decidir(separarNegativos([it0], { f: 1 }).inv[0], cfg, cv, '2026-11-12')
    // Lo que se lleva ya no cuenta la prenda que debía el negativo: con pedido, sí.
    expect(sinPedido.llevar).toBeLessThanOrEqual(antes.llevar)
    expect(conPedido.llevar).toBe(antes.llevar)
  })
})

describe('después del corte el pedido RESERVA y el Local ⛔ queda en negativo (25-nov-2026)', () => {
  const I = (vid: string, local: number) => ({ vid, local, deposito: 5 })
  it('el pedido #7569 (NYA violeta L): Local 0 y 10 en el depósito ⇒ 1 a la bolsa', () => {
    const inv = separarNegativos(descontarReservas([I('nya', 0)], { nya: 1 }), { nya: 1 })
    expect(inv.inv[0].local).toBe(-1)
    expect(inv.revisar).toEqual([])
    expect(paraPedidoDe(inv.inv[0].local, 1, 3)).toBe(1)
  })
  it('con el Local alcanzando, ⛔ va nada a la bolsa (se arma del local)', () => {
    const inv = descontarReservas([I('a', 2)], { a: 1 })
    expect(paraPedidoDe(inv[0].local, 1, 2)).toBe(0)
  })
  it('Local 1 y dos pedidos: falta 1', () => {
    const inv = descontarReservas([I('a', 1)], { a: 2 })
    expect(paraPedidoDe(inv[0].local, 2, 5)).toBe(1)
  })
  it('un pedido de antes del corte ya pagado (⛔ reserva) ⛔ se resta: ya bajó el libro', () => {
    const todas = [{ vid: 'a', sku: 'X-1', name: 'TOP', size: 'S', local: -1 }]
    const prendas = [{ sku: 'X-1', nombre: 'TOP (S)', cantidad: 1, reserva: false }]
    expect(reservadasEnPedidos(todas, prendas)).toEqual({})
    expect(unidadesEnPedidos(todas, prendas)).toEqual({ a: 1 })
  })
  it('negativo físico + reserva: el pedido queda cubierto y el negativo viejo va a revisar', () => {
    const r = separarNegativos(descontarReservas([I('a', -1)], { a: 1 }), { a: 1 })
    expect(r.inv[0].local).toBe(-1)
    expect(r.revisar[0].sinPedido).toBe(1)
  })
  it('exclusivo online con Local 0 y una reserva: decidir lleva exactamente 1', () => {
    const it0 = { vid: 'n', pid: '1', sid: '1', name: 'CORPIÑO NYA', size: 'L', sku: 'BKC-0003-VI-L', barcode: '', local: 0, deposito: 10, cats: [], catFallback: '', cat: '', subcat: null, modelo: null, s7: 0, ubic: '', vv: 0 } as unknown as RepoItem
    const cfg = repoCfgDefault()
    cfg.ventas = { ...(cfg.ventas || {}), modosProd: { '1': { modo: 'online' } } } as typeof cfg.ventas
    const cv = cfgVentas(cfg, 'zattia')
    expect(decidir(it0, cfg, cv, '2026-11-25').llevar).toBe(0)
    const conReserva = separarNegativos(descontarReservas([it0], { n: 1 }), { n: 1 }).inv[0]
    expect(decidir(conReserva, cfg, cv, '2026-11-25').llevar).toBe(1)
  })
})
