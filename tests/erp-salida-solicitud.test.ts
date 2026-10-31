import { describe, expect, it } from 'vitest'
import { canjeDe, canjeErpDe, consumoDe, fallaErpDe, lineaErpDe, salidasErpDe, sinOrigenesErp, solicitudErpDe, motivoDeConsumo, devolverDe, pedidoDeSolicitud, salieronDe, tipoDe, volvioTodo, volvieronDe } from '@/lib/erp/salida-solicitud.core.js'

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
  it('Moldería, Prueba y Otro son uso interno; Consumo, Video/contenido y Muestra, consumible', () => {
    for (const m of ['Moldería', 'Prueba', 'Otro']) expect(consumoDe('solicitudesinternas', consumo({ motivo: m }), 'zattia')[0].motivo).toBe('uso_interno')
    for (const m of ['Consumo', 'Video/contenido', 'Muestra', '']) expect(consumoDe('solicitudesinternas', consumo({ motivo: m }), 'zattia')[0].motivo).toBe('consumible')
    expect(motivoDeConsumo(undefined)).toBe('consumible')
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

describe('fallaErpDe: la falla de una línea en el ERP como ajuste `fallado` (⛔ a GN)', () => {
  const pedido = (o: Record<string, unknown> = {}): any => ({
    proposito: 'falla', solicitudId: 'falla-31', origen: 'local', comments: 'Falla STU-REM-0001-L — costura',
    items: [{ product_id: 7, size_id: 70, quantity: 1, unit_price: 39990 }], ...o,
  })
  const stu = new Map([[7, 'stunned'], [8, 'zattia']])
  const HOY = ['stunned'] // 31-oct: sólo Stunned cortó
  it('un ajuste `fallado` de la línea stunned, en el depósito del origen, con `ref` = falla:depósito', () => {
    const a: any = fallaErpDe(pedido(), 'zattia', stu, HOY)
    expect([a.linea, a.deposito, a.motivo, a.ref]).toEqual(['stunned', 'local', 'fallado', 'falla-31:local'])
    expect(a.renglones.map((r: any) => [r.product_id, r.size_id, r.cantidad])).toEqual([[7, 70, -1]])
    expect((fallaErpDe(pedido({ origen: 'deposito' }), 'zattia', stu, HOY) as any).deposito).toBe('deposito')
  })
  it('la línea la decide el mapa del SERVIDOR, ⛔ el sku que manda la pantalla', () => {
    expect(fallaErpDe(pedido({ items: [{ product_id: 8, size_id: 80, quantity: 1, sku: 'STU-REM-0001-L' }] }), 'zattia', stu, HOY)).toBeNull()
    expect(fallaErpDe(pedido(), 'zattia', new Map(), HOY)).toBeNull()
  })
  it('BDI sin corte ⇒ null (sigue a GN); con corte ⇒ ajuste de la línea bdi en el Minorista', () => {
    const bdi = new Map([[5, 'bdi']])
    const p = pedido({ origen: 'deposito', items: [{ product_id: 5, size_id: 50, quantity: 1 }] })
    expect(fallaErpDe(p, 'bdi', bdi, [])).toBeNull()
    expect(fallaErpDe(p, 'bdi', bdi, ['bdi'])).toMatchObject({ linea: 'bdi', deposito: 'deposito_minorista', motivo: 'fallado' })
  })
  it('Zattia cortada (23-nov): su falla también va al ERP', () => {
    expect(fallaErpDe(pedido({ items: [{ product_id: 8, size_id: 80, quantity: 1 }] }), 'zattia', stu, ['zattia', 'stunned'])).toMatchObject({ linea: 'zattia' })
  })
  it('⛔ corresponde si no es falla: sigue a GN', () => {
    expect(fallaErpDe(pedido({ proposito: 'canje' }), 'zattia', stu, HOY)).toBeNull()
    expect(fallaErpDe(null, 'zattia', stu, HOY)).toBeNull()
  })
  it('frena (⛔ cae a GN) si mezcla líneas —aunque las dos estén en el ERP—, falta el id, el origen ⛔ se conoce o un renglón es inválido', () => {
    const mezcla = pedido({ items: [{ product_id: 7, size_id: 70, quantity: 1 }, { product_id: 8, size_id: 80, quantity: 1 }] })
    expect(fallaErpDe(mezcla, 'zattia', stu, HOY)).toHaveProperty('error')
    expect(fallaErpDe(mezcla, 'zattia', stu, ['zattia', 'stunned'])).toHaveProperty('error')
    expect(fallaErpDe(pedido({ solicitudId: undefined }), 'zattia', stu, HOY)).toHaveProperty('error')
    expect(fallaErpDe(pedido({ origen: 'evento' }), 'zattia', stu, HOY)).toHaveProperty('error')
    expect(fallaErpDe(pedido({ items: [{ product_id: 7, size_id: 70, quantity: 0 }] }), 'zattia', stu, HOY)).toHaveProperty('error')
  })
  it('lineaErpDe: un producto que ⛔ está en el espejo, junto a uno del ERP, también frena', () => {
    expect(lineaErpDe([{ product_id: 7 }, { product_id: 99 }], stu, HOY, 'X')).toHaveProperty('error')
    expect(lineaErpDe([{ product_id: 99 }], stu, HOY, 'X')).toBeNull()
  })
})

describe('canjeErpDe: el canje de BDI desde su corte es el ajuste APLICADO (⛔ la venta de GN)', () => {
  const pedido = (o: Record<string, unknown> = {}): any => ({ proposito: 'canje', solicitudId: 'canje-12', origen: 'local', items: [{ product_id: 5, size_id: 50, quantity: 2 }], ...o })
  const bdi = new Map([[5, 'bdi']])
  it('sin corte ⇒ null: venta de GN + sombra, como hoy', () => {
    expect(canjeErpDe(pedido(), 'bdi', bdi, [])).toBeNull()
  })
  it('con corte ⇒ ajuste `canje` con el MISMO ref que la sombra (`canjeDe`)', () => {
    const a: any = canjeErpDe(pedido(), 'bdi', bdi, ['bdi'])
    expect([a.linea, a.deposito, a.motivo, a.ref]).toEqual(['bdi', 'local', 'canje', 'canje-12:local'])
    expect(a.ref).toBe(canjeDe(pedido(), 'bdi')[0].ref)
    expect(a.renglones.map((r: any) => r.cantidad)).toEqual([-2])
    expect((canjeErpDe(pedido({ origen: 'deposito' }), 'bdi', bdi, ['bdi']) as any).deposito).toBe('deposito_minorista')
  })
  it('⛔ es canje ⇒ null; sin id ⇒ error', () => {
    expect(canjeErpDe(pedido({ proposito: 'falla' }), 'bdi', bdi, ['bdi'])).toBeNull()
    expect(canjeErpDe(pedido({ solicitudId: undefined }), 'bdi', bdi, ['bdi'])).toHaveProperty('error')
  })
})

describe('la solicitud interna retornable sale con TODO su qty (no hay escaneo: ⛔ `verif`)', () => {
  const interna = (o: Record<string, unknown> = {}): any => ({
    id: 'si-5', motivo: 'Muestra para producción', tipo: 'retornable', estado: 'retirada', ventas: { deposito: { id: 55 } },
    items: [item({ pid: '1', sid: '10', qty: 3 }), item({ pid: '2', sid: '20', origen: 'local', qty: 2, nuevo: true })], ...o,
  })
  it('el pedido sale aunque ⛔ haya verif, con la cantidad pedida', () => {
    const p = pedidoDeSolicitud('solicitudesinternas', interna(), 'zattia') as any
    expect(p).not.toBeNull()
    expect(p.tipo).toBe('produccion')
    expect(p.renglones.map((r: any) => [r.product_id, r.size_id, r.deposito, r.cantidad])).toEqual([[1, 10, 'deposito', 3], [2, 20, 'local', 2]])
  })
  it('lo devuelto se anota contra lo que salió (topeado a qty)', () => {
    const s = interna({ devuelto: { '1_10': 2, '2_20': 9 } })
    const doc = [{ n: 1, product_id: 1, size_id: 10, deposito: 'deposito', cantidad: 3, devuelta: 0 }, { n: 2, product_id: 2, size_id: 20, deposito: 'local', cantidad: 2, devuelta: 0 }]
    expect(devolverDe(s, 'zattia', doc, 'solicitudesinternas')).toEqual([{ n: 1, cantidad: 2 }, { n: 2, cantidad: 2 }])
  })
  it('la sesión de fotos sigue saliendo sólo con lo preparado', () => {
    expect(pedidoDeSolicitud('sesionfotos', sol({ verif: {} }), 'zattia')).toBeNull()
  })
})

describe('solicitudErpDe: la solicitud de una línea en el ERP, ⛔ a GN (§8.3)', () => {
  const pedido = (o: Record<string, unknown> = {}): any => ({
    solicitudId: 'sf-9', origen: 'deposito', comments: 'Sesión de fotos — drop 2 — solicitud sf-9 (Monitor)', salida: { kind: 'sesionfotos' },
    items: [{ product_id: 7, size_id: 70, quantity: 2 }, { product_id: 7, size_id: 71, quantity: 1 }], ...o,
  })
  const stu = new Map([[7, 'stunned'], [8, 'zattia']])
  it('sesión de fotos ⇒ salida `foto` de la línea stunned, cantidades POSITIVAS, `ref` = solicitud:depósito', () => {
    const r: any = solicitudErpDe(pedido(), 'zattia', stu, ['stunned'])
    expect([r.salida.linea, r.salida.tipo, r.salida.ref]).toEqual(['stunned', 'foto', 'sf-9:deposito'])
    expect(r.salida.renglones.map((x: any) => [x.product_id, x.size_id, x.deposito, x.cantidad])).toEqual([[7, 70, 'deposito', 2], [7, 71, 'deposito', 1]])
    expect(r.ajuste).toBeUndefined()
  })
  it('la misma variante dos veces se SUMA (el motor rechaza la prenda repetida)', () => {
    const r: any = solicitudErpDe(pedido({ items: [{ product_id: 7, size_id: 70, quantity: 2 }, { product_id: 7, size_id: 70, quantity: 1 }] }), 'zattia', stu, ['stunned'])
    expect(r.salida.renglones.map((x: any) => x.cantidad)).toEqual([3])
  })
  it('interna retornable ⇒ salida `interna` (o `produccion` por el motivo)', () => {
    const r: any = solicitudErpDe(pedido({ salida: { kind: 'solicitudesinternas', tipo: 'retornable', motivo: 'Prueba' } }), 'zattia', stu, ['stunned'])
    expect(r.salida.tipo).toBe('interna')
    const p: any = solicitudErpDe(pedido({ salida: { kind: 'solicitudesinternas', tipo: 'retornable', motivo: 'Muestra para producción' } }), 'zattia', stu, ['stunned'])
    expect(p.salida.tipo).toBe('produccion')
  })
  it('interna consumo ⇒ AJUSTE con el mismo `ref` que `consumoDe` (guardar ⛔ lo repite) y el motivo de consumo', () => {
    const r: any = solicitudErpDe(pedido({ origen: 'local', salida: { kind: 'solicitudesinternas', tipo: 'consumo', motivo: 'Video/contenido' } }), 'zattia', stu, ['stunned'])
    expect([r.ajuste.linea, r.ajuste.deposito, r.ajuste.motivo, r.ajuste.ref]).toEqual(['stunned', 'local', 'consumible', 'sf-9:local'])
    expect(r.ajuste.renglones.map((x: any) => x.cantidad)).toEqual([-2, -1])
    expect((solicitudErpDe(pedido({ salida: { kind: 'solicitudesinternas', tipo: 'consumo', motivo: 'Moldería' } }), 'zattia', stu, ['stunned']) as any).ajuste.motivo).toBe('uso_interno')
  })
  it('⛔ corresponde: Zattia sin corte, BDI sin corte, con propósito o acción ⇒ null (sigue a GN); BDI con corte ⇒ su salida', () => {
    expect(solicitudErpDe(pedido({ items: [{ product_id: 8, size_id: 80, quantity: 1 }] }), 'zattia', stu, ['stunned'])).toBeNull()
    expect(solicitudErpDe(pedido(), 'bdi', new Map([[7, 'bdi']]), [])).toBeNull()
    expect((solicitudErpDe(pedido(), 'bdi', new Map([[7, 'bdi']]), ['bdi']) as any).salida).toMatchObject({ linea: 'bdi', tipo: 'foto', ref: 'sf-9:deposito_minorista' })
    expect((solicitudErpDe(pedido(), 'bdi', new Map([[7, 'bdi']]), ['bdi']) as any).salida.renglones[0].deposito).toBe('deposito_minorista')
    expect(solicitudErpDe(pedido({ proposito: 'falla' }), 'zattia', stu, ['stunned'])).toBeNull()
    expect(solicitudErpDe(pedido({ proposito: 'canje' }), 'zattia', stu, ['stunned'])).toBeNull()
    expect(solicitudErpDe(pedido({ accion: 'reingreso' }), 'zattia', stu, ['stunned'])).toBeNull()
  })
  it('FRENA (⛔ cae a GN): mezcla, sin `salida` (pantalla vieja), sin id, origen raro, cantidad inválida', () => {
    expect(solicitudErpDe(pedido({ items: [{ product_id: 7, size_id: 70, quantity: 1 }, { product_id: 8, size_id: 80, quantity: 1 }] }), 'zattia', stu, ['stunned'])).toHaveProperty('error')
    expect(solicitudErpDe(pedido({ salida: undefined }), 'zattia', stu, ['stunned'])).toHaveProperty('error')
    expect(solicitudErpDe(pedido({ salida: { kind: 'solicitudesinternas', tipo: 'evento' } }), 'zattia', stu, ['stunned'])).toHaveProperty('error')
    expect(solicitudErpDe(pedido({ solicitudId: undefined }), 'zattia', stu, ['stunned'])).toHaveProperty('error')
    expect(solicitudErpDe(pedido({ origen: 'evento' }), 'zattia', stu, ['stunned'])).toHaveProperty('error')
    expect(solicitudErpDe(pedido({ items: [{ product_id: 7, size_id: 70, quantity: 0 }] }), 'zattia', stu, ['stunned'])).toHaveProperty('error')
  })
})

describe('al GUARDAR, lo que fue al ERP ⛔ se vuelve a anotar como sombra', () => {
  const erp = { id: 'erp:S-3', number: 'ERP S-3', erp: 'S-3' }
  it('sinOrigenesErp saca los ítems y la «venta» de los orígenes del ERP ⇒ todo en el ERP ⇒ ni salida ni consumo de sombra', () => {
    const s = sol({ store: 'stunned', ventas: { deposito: erp, local: { id: 555 } } })
    const g = sinOrigenesErp(s)
    expect(Object.keys(g.ventas)).toEqual(['local'])
    expect(g.items.map((i: any) => i.origen)).toEqual(['local'])
    expect(pedidoDeSolicitud('sesionfotos', sinOrigenesErp(sol({ ventas: { deposito: erp, local: erp } })), 'stunned')).toBeNull()
    expect(consumoDe('solicitudesinternas', sinOrigenesErp(sol({ tipo: 'consumo', estado: 'retirada', ventas: { deposito: erp, local: erp } })), 'stunned')).toEqual([])
    const igual = sol()
    expect(sinOrigenesErp(igual)).toBe(igual)
  })
  it('salidasErpDe: un `ref` por origen del ERP, con sólo sus ítems; el consumo ⛔ (⛔ vuelve)', () => {
    const s = sol({ ventas: { deposito: erp, local: { id: 555 } } })
    const r = salidasErpDe('sesionfotos', s)
    expect(r.map((x) => [x.origen, x.ref, x.solicitud.items.length])).toEqual([['deposito', 'sf-1:deposito', 1]])
    expect(devolverDe(r[0].solicitud, 'stunned', [{ n: 1, product_id: 1, size_id: 10, deposito: 'deposito', cantidad: 3, devuelta: 0 }], 'sesionfotos')).toEqual([])
    const vuelto = { ...r[0].solicitud, devuelto: { '1_10': 2 } }
    expect(devolverDe(vuelto, 'stunned', [{ n: 1, product_id: 1, size_id: 10, deposito: 'deposito', cantidad: 3, devuelta: 0 }], 'sesionfotos')).toEqual([{ n: 1, cantidad: 2 }])
    expect(salidasErpDe('solicitudesinternas', sol({ tipo: 'consumo', ventas: { deposito: erp } }))).toEqual([])
  })
  it('salidasErpDe: la línea viaja en la venta (BDI ⇒ depósito minorista); sin línea = Stunned (las de antes del 31-oct)', () => {
    expect(salidasErpDe('sesionfotos', sol({ ventas: { deposito: erp } }))[0].linea).toBe('stunned')
    const r = salidasErpDe('sesionfotos', sol({ ventas: { deposito: { ...erp, linea: 'bdi' } } }))
    expect(r.map((x) => [x.linea, x.ref])).toEqual([['bdi', 'sf-1:deposito_minorista']])
  })
})
