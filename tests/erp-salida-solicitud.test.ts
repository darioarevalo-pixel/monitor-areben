import { describe, expect, it } from 'vitest'
import { canjeDe, consumoDe, devolverDe, pedidoDeSolicitud, salieronDe, tipoDe, volvioTodo, volvieronDe } from '@/lib/erp/salida-solicitud.core.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
const item = (o: Record<string, unknown>) => ({ vid: `${o.pid}_${o.sid}`, nombre: 'x', variante: 'M', sku: 'SKU', qty: 3, origen: 'deposito', ...o })
const sol = (o: Record<string, unknown> = {}): any => ({
  id: 'sf-1', descripcion: 'Campaña verano', estado: 'cargada', ventas: { deposito: { id: 987 } },
  items: [item({ pid: '1', sid: '10' }), item({ pid: '2', sid: '20', origen: 'local', qty: 2 })],
  verif: { '1_10': 3, '2_20': 2 }, ...o,
})

describe('tipoDe', () => {
  it('sólo sale lo que ya salió y es retornable', () => {
    expect(tipoDe('sesionfotos', sol())).toBe('foto')
    expect(tipoDe('sesionfotos', sol({ ventas: undefined }))).toBeNull()
    expect(tipoDe('sesionfotos', sol({ ventas: {} }))).toBeNull()
    expect(tipoDe('solicitudesinternas', sol({ tipo: 'retornable', motivo: 'Muestra para producción' }))).toBe('produccion')
    expect(tipoDe('solicitudesinternas', sol({ tipo: 'retornable', motivo: 'Vidriera' }))).toBe('interna')
    expect(tipoDe('solicitudesinternas', sol({ tipo: 'consumo' }))).toBeNull()
    expect(tipoDe('sesion-evento', sol())).toBeNull()
  })
})

describe('salieronDe: espeja la venta de GN (lo preparado)', () => {
  it('traduce el origen al depósito de la marca y topea a lo pedido', () => {
    const z = [...salieronDe(sol({ verif: { '1_10': 9, '2_20': 1 } }), 'zattia').values()]
    expect(z.map((r: any) => [r.product_id, r.size_id, r.deposito, r.cantidad])).toEqual([[1, 10, 'deposito', 3], [2, 20, 'local', 1]])
    const b = [...salieronDe(sol(), 'bdi').values()]
    expect(b[0].deposito).toBe('deposito_minorista')
  })
  it('lo no preparado, los nuevos y los sin variante quedan afuera; la misma prenda repetida se suma', () => {
    const s = sol({ items: [item({ pid: '1', sid: '10' }), item({ pid: '1', sid: '10', vid: 'otro', qty: 1 }), item({ pid: '5', sid: '50', nuevo: true }), item({ pid: null, sid: null, vid: 'man_1' }), item({ pid: '7', sid: '70' })],
      verif: { '1_10': 3, otro: 1, '5_50': 3, man_1: 3 } })
    expect([...salieronDe(s, 'zattia').values()].map((r: any) => [r.product_id, r.cantidad])).toEqual([[1, 4]])
  })
})

describe('pedidoDeSolicitud', () => {
  it('arma el pedido de crearSalida con las ventas de GN', () => {
    const p: any = pedidoDeSolicitud('sesionfotos', sol(), 'zattia')
    expect([p.linea, p.tipo, p.ref, p.detalle, p.gn_sale_ids]).toEqual(['zattia', 'foto', 'sf-1', 'Campaña verano', { deposito: '987' }])
    expect(p.renglones).toHaveLength(2)
  })
  it('null si no corresponde o no se preparó nada', () => {
    expect(pedidoDeSolicitud('sesionfotos', sol({ ventas: undefined }), 'zattia')).toBeNull()
    expect(pedidoDeSolicitud('sesionfotos', sol({ verif: {} }), 'zattia')).toBeNull()
    expect(pedidoDeSolicitud('sesionfotos', sol(), 'otra')).toBeNull()
  })
})

describe('devolver y cerrar', () => {
  const doc = (devuelta = [0, 0]) => [
    { n: 1, product_id: 1, size_id: 10, deposito: 'deposito', cantidad: 3, devuelta: devuelta[0], consumida: 0, danada: 0, perdida: 0 },
    { n: 2, product_id: 2, size_id: 20, deposito: 'local', cantidad: 2, devuelta: devuelta[1], consumida: 0, danada: 0, perdida: 0 },
  ]
  it('sólo anota lo que SUBIÓ y topea a lo que salió', () => {
    const s = sol({ devuelto: { '1_10': 2, '2_20': 9 } })
    expect([...volvieronDe(s, 'zattia').entries()]).toEqual([['1:10:deposito', 2], ['2:20:local', 2]])
    expect(devolverDe(s, 'zattia', doc())).toEqual([{ n: 1, cantidad: 2 }, { n: 2, cantidad: 2 }])
    expect(devolverDe(s, 'zattia', doc([2, 0]))).toEqual([{ n: 2, cantidad: 2 }])
    expect(devolverDe(s, 'zattia', doc([2, 2]))).toEqual([])
  })
  it('una devolución reiniciada (baja) ⛔ resta en el motor', () => {
    expect(devolverDe(sol({ devuelto: { '1_10': 1 } }), 'zattia', doc([2, 0]))).toEqual([])
  })
  it('cierra sólo si volvió TODO; con faltantes queda abierta', () => {
    expect(volvioTodo(doc([3, 2]), [])).toBe(true)
    expect(volvioTodo(doc([1, 0]), [{ n: 1, cantidad: 2 }, { n: 2, cantidad: 2 }])).toBe(true)
    expect(volvioTodo(doc([1, 0]), [{ n: 1, cantidad: 2 }])).toBe(false)
    expect(volvioTodo([], [])).toBe(false)
  })
})

describe('consumoDe: la baja definitiva como ajustes `consumible`', () => {
  const consumo = (o: Record<string, unknown> = {}): any => sol({ id: 'si-9', tipo: 'consumo', estado: 'retirada', motivo: 'Consumo', verif: undefined, ...o })

  it('uno por depósito, cantidad en negativo, `ref` = solicitud:depósito (todo `qty`, sin escaneo)', () => {
    const r = consumoDe('solicitudesinternas', consumo(), 'zattia')
    expect(r.map((a: any) => [a.deposito, a.ref, a.motivo])).toEqual([['deposito', 'si-9:deposito', 'consumible'], ['local', 'si-9:local', 'consumible']])
    expect(r[0].renglones).toEqual([{ product_id: 1, size_id: 10, sku: 'SKU', cantidad: -3 }])
    expect(r[1].renglones[0].cantidad).toBe(-2)
    expect(consumoDe('solicitudesinternas', consumo(), 'bdi')[0].deposito).toBe('deposito_minorista')
  })
  it('suma la misma variante repetida en un depósito', () => {
    const r = consumoDe('solicitudesinternas', consumo({ items: [item({ pid: '1', sid: '10' }), item({ pid: '1', sid: '10', qty: 2 })] }), 'zattia')
    expect(r).toHaveLength(1)
    expect(r[0].renglones).toEqual([{ product_id: 1, size_id: 10, sku: 'SKU', cantidad: -5 }])
  })
  it('⛔ corresponde si no es consumo, está pendiente / rechazada, la venta ⛔ salió o la marca es desconocida', () => {
    expect(consumoDe('solicitudesinternas', consumo({ tipo: 'retornable' }), 'zattia')).toEqual([])
    expect(consumoDe('solicitudesinternas', consumo({ estado: 'pendiente' }), 'zattia')).toEqual([])
    expect(consumoDe('solicitudesinternas', consumo({ estado: 'rechazada' }), 'zattia')).toEqual([])
    expect(consumoDe('solicitudesinternas', consumo({ ventas: undefined }), 'zattia')).toEqual([])
    expect(consumoDe('sesionfotos', consumo(), 'zattia')).toEqual([])
    expect(consumoDe('solicitudesinternas', consumo(), 'otra')).toEqual([])
  })
  it('deja afuera lo que ⛔ tiene variante o cantidad entera', () => {
    const r = consumoDe('solicitudesinternas', consumo({ items: [item({ pid: null, sid: null }), item({ pid: '1', sid: '10', qty: 0 }), item({ pid: '3', sid: '30', qty: 1 })] }), 'zattia')
    expect(r[0].renglones.map((x: any) => x.product_id)).toEqual([3])
  })
  it('la `ref` es estable entre guardados (idempotencia)', () => {
    expect(consumoDe('solicitudesinternas', consumo(), 'zattia')).toEqual(consumoDe('solicitudesinternas', consumo({ estado: 'devuelta' }), 'zattia'))
  })
})

describe('canjeDe: el canje como ajuste `canje`', () => {
  const pedido = (o: Record<string, unknown> = {}): any => ({
    proposito: 'canje', solicitudId: 'canje-12', origen: 'local', comments: 'Canje 12 — Ana',
    items: [{ product_id: 1, size_id: 10, quantity: 2, unit_price: 5000 }, { product_id: '2', size_id: '20', quantity: '1' }], ...o,
  })
  it('un ajuste en el depósito del origen, cantidades en negativo y `ref` = canje:depósito', () => {
    const [a] = canjeDe(pedido(), 'bdi')
    expect([a.deposito, a.motivo, a.ref, a.linea]).toEqual(['local', 'canje', 'canje-12:local', 'bdi'])
    expect(a.renglones.map((r: any) => [r.product_id, r.size_id, r.cantidad])).toEqual([[1, 10, -2], [2, 20, -1]])
    expect(canjeDe(pedido({ origen: 'deposito' }), 'bdi')[0].deposito).toBe('deposito_minorista')
  })
  it('suma la variante repetida y deja afuera los renglones sin variante o cantidad', () => {
    const [a] = canjeDe(pedido({ items: [{ product_id: 1, size_id: 10, quantity: 1 }, { product_id: 1, size_id: 10, quantity: 2 }, { product_id: null, size_id: 3, quantity: 1 }, { product_id: 4, size_id: 40, quantity: 0 }] }), 'bdi')
    expect(a.renglones).toEqual([{ product_id: 1, size_id: 10, sku: null, cantidad: -3 }])
  })
  it('⛔ corresponde si no es canje, falta el id, el origen o la marca ⛔ se conocen, o no queda ningún renglón', () => {
    expect(canjeDe(pedido({ proposito: 'falla' }), 'bdi')).toEqual([])
    expect(canjeDe(pedido({ solicitudId: undefined }), 'bdi')).toEqual([])
    expect(canjeDe(pedido({ origen: 'otro' }), 'bdi')).toEqual([])
    expect(canjeDe(pedido(), 'otra')).toEqual([])
    expect(canjeDe(pedido({ items: [] }), 'bdi')).toEqual([])
    expect(canjeDe(null, 'bdi')).toEqual([])
  })
  it('la `ref` es la misma al reintentar (idempotencia)', () => {
    expect(canjeDe(pedido(), 'bdi')).toEqual(canjeDe(pedido(), 'bdi'))
  })
})
