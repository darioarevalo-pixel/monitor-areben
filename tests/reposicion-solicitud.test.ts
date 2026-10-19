// La devolución como solicitud (Darío, 15-oct-2026): el orden de prioridad, la bolsa y el resumen.
import { describe, it, expect } from 'vitest'
import { bolsaDeLectura, bolsaPorDefecto, conBolsa, filtrarPropuesta, fusionar, lineasDe, porProducto, propuesta, resumenSolicitud, vendidasPorProducto } from '@/lib/reposicion/solicitud'
import type { FilaVentas } from '@/lib/reposicion/porVentas'
import type { LineaPedido } from '@/lib/reposicion/armado'

const F = (pid: string, sid: string, sku: string, name: string, devolver: number, vendidas: number): FilaVentas =>
  ({ it: { vid: `${pid}_${sid}`, pid, sid, sku, barcode: '', name, size: sid, cat: '', local: devolver + 2, deposito: 0 }, d: { devolver, vendidas } }) as unknown as FilaVentas

const filas = [
  F('1', 'S', 'RTO-0001-S', 'TOP ZOE', 2, 3),
  F('1', 'M', 'RTO-0001-M', 'TOP ZOE', 0, 1), // no sobra, pero sus ventas cuentan para el producto
  F('2', '38', 'RBE-0002-38', 'JEAN MOM', 5, 1),
  F('3', 'U', 'RBO-0003-U', 'BODY LIA', 1, 0),
  F('4', 'S', 'RTO-0004-S', 'TOP ANA', 4, 0),
]

describe('la propuesta', () => {
  it('🔑 primero lo que no vendió nada en 60 días, después lo que más sobra', () => {
    expect(propuesta(filas).map((g) => [g.name, g.prioridad, g.sobra])).toEqual([
      ['TOP ANA', 'sin-ventas', 4],
      ['BODY LIA', 'sin-ventas', 1],
      ['JEAN MOM', 'con-ventas', 5],
      ['TOP ZOE', 'con-ventas', 2],
    ])
  })

  it('las ventas son del PRODUCTO entero: una variante sin ventas de un producto que vende no es «sin ventas»', () => {
    expect(propuesta(filas).find((g) => g.pid === '1')).toMatchObject({ prioridad: 'con-ventas', vendidas: 4, clave: 'RTO-0001' })
  })

  it('🔴 cuentan las ventas de los talles AGOTADOS (no están en las filas): Short Cliff, 19-oct', () => {
    // El 36 y el 38 sobran y no vendieron; las 3 ventas fueron del 40 y el 42, hoy en cero (sin fila).
    const cliff = [F('9', '36', 'RSH-0100-36', 'SHORT CLIFF', 1, 0), F('9', '38', 'RSH-0100-38', 'SHORT CLIFF', 1, 0)]
    expect(propuesta(cliff)[0]).toMatchObject({ prioridad: 'sin-ventas', vendidas: 0 })
    const vv = { '9_36': 0, '9_40': 2, '9_42': 1, '4_S': 0 }
    expect(vendidasPorProducto(vv)).toEqual({ '9': 3, '4': 0 })
    expect(propuesta(cliff, {}, vendidasPorProducto(vv))[0]).toMatchObject({ prioridad: 'con-ventas', vendidas: 3 })
  })

  it('un cambio (venta en negativo) descuenta: vendió 1 y lo devolvió = sin ventas', () => {
    expect(vendidasPorProducto({ '9_36': 1, '9_38': -1 })).toEqual({ '9': 0 })
  })

  it('🔑 lo que vende va por SEMANAS DE STOCK, no por lo que sobra (Darío, 19-oct-2026)', () => {
    // 21 en el local y 3 ventas en 60 días ⇒ 60 semanas. Top Zara sobra más pero vende 28 ⇒ 4 semanas.
    const orsa = [F('20', 'BE', 'RTO-0065-BE', 'TOP ORSA', 7, 0), F('20', 'NG', 'RTO-0065-NG', 'TOP ORSA', 7, 2), F('20', 'CT', 'RTO-0065-CT', 'TOP ORSA', 1, 1)]
    const zara = [F('21', 'S', 'RTO-0152-S', 'TOP ZARA', 11, 28)]
    const g = propuesta([...zara, ...orsa])
    expect(g.map((x) => [x.name, x.local, x.semanas])).toEqual([
      ['TOP ORSA', 21, 60],
      ['TOP ZARA', 13, 4],
    ])
  })

  it('lo nuevo se mide con sus días de vida, no con los 60', () => {
    const nuevo = { ...F('22', 'U', 'RTO-0999-U', 'TOP NUEVO', 2, 2), d: { devolver: 2, vendidas: 2, dias: 14 } } as unknown as FilaVentas
    expect(propuesta([nuevo])[0].semanas).toBe(4) // 4 en el local, 1 por semana
  })

  it('sin ventas no tiene semanas (y un cambio que deja el neto en 0 es «sin ventas»)', () => {
    const g = propuesta([F('23', 'U', 'RTO-0998-U', 'TOP X', 1, 0)], {}, { '23': -1 })
    expect(g[0]).toMatchObject({ prioridad: 'sin-ventas', semanas: null })
  })

  it('lo que ya está en una solicitud no se propone dos veces', () => {
    const g = propuesta(filas, { '2_38': 3, '4_S': 4 })
    expect(g.find((x) => x.pid === '2')?.sobra).toBe(2)
    expect(g.find((x) => x.pid === '4')).toBeUndefined()
  })
})

describe('la bolsa', () => {
  it('jeans, shorts y bermudas van sueltos; el resto en bolsa', () => {
    expect(bolsaPorDefecto({ name: 'JEAN MOM' })).toBe(false)
    expect(bolsaPorDefecto({ name: 'SHORT DENIM' })).toBe(false)
    // Por el código: «FADE #002» es bermuda sin decirlo (lista real del 15-oct).
    expect(bolsaPorDefecto({ name: 'FADE #002', sku: 'RBE-0007-38' })).toBe(false)
    // ⛔ La categoría no cuenta: «FALDAS Y SHORTS» es de una mini.
    expect(bolsaPorDefecto({ name: 'MINI KYLIE', sku: 'RMI-0039-S' })).toBe(true)
    expect(bolsaPorDefecto({ name: 'TOP ZOE' })).toBe(true)
  })

  it('lo elegido a mano queda recordado y le gana al nombre', () => {
    expect(conBolsa({ pid: '2', name: 'JEAN MOM' }, { '2': true })).toBe(true)
    expect(conBolsa({ pid: '1', name: 'TOP ZOE' }, { '1': false })).toBe(false)
  })

  it('al escanear: la primera del producto abre su bolsa, las siguientes van a la misma', () => {
    const p: LineaPedido[] = lineasDe(propuesta(filas).find((g) => g.pid === '1')!, (v) => v.sobra, true)
    expect(bolsaDeLectura(p, { '1_S': 1 }, p[0])).toEqual({ bolsa: 'RTO-0001', nueva: true })
    expect(bolsaDeLectura(p, { '1_S': 2 }, p[0])).toEqual({ bolsa: 'RTO-0001', nueva: false })
    expect(bolsaDeLectura(p, {}, { ...p[0], bolsa: undefined })).toBeNull()
  })
})

describe('confirmar y resumir', () => {
  const g = propuesta(filas)
  const jean = g.find((x) => x.pid === '2')!
  const top = g.find((x) => x.pid === '4')!

  it('la cantidad elegida no pasa de lo que sobra', () => {
    expect(lineasDe(jean, () => 99, false).map((l) => l.cant)).toEqual([5])
    expect(lineasDe(jean, () => 0, false)).toEqual([])
  })

  it('confirmar en varias veces suma, ordenado por SKU, y la bolsa la decide lo último', () => {
    const a = fusionar([], lineasDe(top, () => 2, true))
    const b = fusionar(a, [...lineasDe(top, () => 1, false), ...lineasDe(jean, (v) => v.sobra, false)])
    expect(b.map((l) => [l.sku, l.cant, !!l.bolsa])).toEqual([
      ['RBE-0002-38', 5, false],
      ['RTO-0004-S', 3, false],
    ])
  })

  it('el resumen: productos, prendas, etiquetas de bolsa y lo suelto', () => {
    const p = fusionar([], [...lineasDe(top, (v) => v.sobra, true), ...lineasDe(jean, (v) => v.sobra, false)])
    expect(resumenSolicitud(p)).toEqual({ productos: 2, prendas: 9, bolsas: 1, sueltas: 5 })
    expect(porProducto(p).map((x) => [x.clave, x.bolsa])).toEqual([
      ['RBE-0002', false],
      ['RTO-0004', true],
    ])
  })
})

describe('el buscador de la Propuesta', () => {
  const gs = propuesta([
    F('30', '36', 'RSH-0100-36', 'SHORT CLIFF', 1, 0),
    F('31', '38', 'RJE-0070-38', 'JEAN ÍNDIGO', 1, 2),
    F('32', 'S', 'RTO-0065-BE', 'TOP ORSA', 3, 1),
  ])
  it('por nombre, sin tildes ni mayúsculas', () => {
    expect(filtrarPropuesta(gs, 'indigo').map((g) => g.name)).toEqual(['JEAN ÍNDIGO'])
    expect(filtrarPropuesta(gs, 'Short').map((g) => g.name)).toEqual(['SHORT CLIFF'])
  })
  it('por código del producto o SKU de la variante', () => {
    expect(filtrarPropuesta(gs, 'rje').map((g) => g.name)).toEqual(['JEAN ÍNDIGO'])
    expect(filtrarPropuesta(gs, 'RTO-0065-BE').map((g) => g.name)).toEqual(['TOP ORSA'])
  })
  it('vacío = todo; varias palabras = todas', () => {
    expect(filtrarPropuesta(gs, '  ')).toHaveLength(3)
    expect(filtrarPropuesta(gs, 'top short')).toHaveLength(0)
  })
})
