import { describe, expect, it } from 'vitest'
import { armarHistorial, depositoInicial, filtrarHistorial } from '@/lib/erp/historial-prenda.core.js'
import type { FilaHistorial } from '@/lib/erp/cliente'

type F = FilaHistorial & { saldoVisto: number }

let id = 0
const m = (deposito: string, cantidad: number, tipo: string, origen: string, origen_ref: string, cuando: string, detalle: Record<string, unknown> = {}) =>
  ({ id: ++id, deposito, cantidad, tipo, origen, origen_ref, ocurrido_en: `2026-11-${cuando}:00Z`, hora_exacta: true, linea: 'bdi', detalle })

describe('el historial de un producto (Darío 18-nov: un renglón por cada vez que entra o sale de verdad)', () => {
  it('el pedido de Tienda Nube es UN renglón: su venta, el «desarme» del cambio de regla y el preparado', () => {
    const tn = { tn: { tn_id: 99, numero: 22577 } }
    const r = armarHistorial({
      movimientos: [
        m('deposito_minorista', 10, 'apertura', 'apertura', 'a', '01T10'),
        m('deposito_minorista', -1, 'venta', 'motor', 'v1:l1', '14T20', { venta_numero: 2102 }),
        m('deposito_minorista', 1, 'desarme', 'motor', 'tn:bdi:99#1', '16T00', { ...tn, motivo: 'sin armar' }),
        m('deposito_minorista', -1, 'armado', 'motor', 'tn:bdi:99#2', '16T10', { ...tn, motivo: 'armado' }),
      ],
      ventas: new Map([['v1', { numero: 2102, origen: 'tn', origen_ref: 'bdi:99', canal: 'online', usuario: null, cliente: 'Daiana Delgado' }]]),
    })
    expect(r.filas.map((f: F) => [f.tipo, f.ref, f.cantidad, f.saldo, f.desc])).toEqual([
      ['venta', '#2102', -1, 9, 'Daiana Delgado · Tienda Nube 22577'],
      ['inicial', '', 10, 10, 'Al pasar a Areben Gestión'],
    ])
  })

  it('el pedido que se canceló antes de salir no deja renglón; el que volvió preparado, sí («vuelve al depósito»)', () => {
    const a = { tn: { tn_id: 1, numero: 100 } }
    const b = { tn: { tn_id: 2, numero: 200 } }
    const r = armarHistorial({
      movimientos: [
        m('deposito_minorista', -1, 'venta', 'motor', 'v1:l', '01T10'),
        m('deposito_minorista', 1, 'anulacion', 'motor', 'v1:l:anulacion', '01T11'),
        m('deposito_minorista', -1, 'armado', 'motor', 'tn:bdi:2#1', '02T10', { ...b, motivo: 'armado' }),
        m('deposito_minorista', 1, 'desarme', 'motor', 'tn:bdi:2#2', '03T10', { ...b, motivo: 'desarmado', status: 'cancelled' }),
      ],
      ventas: new Map([['v1', { numero: 7, origen: 'tn', origen_ref: 'bdi:1', canal: 'online', usuario: null, cliente: null }]]),
      ventasTn: new Map([['1', { numero: 7 }], ['2', { numero: 8, cliente: 'Ana' }]]),
    })
    void a
    expect(r.filas.map((f: F) => [f.tipoNombre, f.ref, f.cantidad])).toEqual([
      ['Pedido cancelado', 'Tienda Nube 200', 1],
      ['Venta', '#8', -1],
    ])
  })

  it('las correcciones de una venta que se anulan entre sí no se ven; si no, son «Ajuste de venta»', () => {
    const r = armarHistorial({
      movimientos: [
        m('deposito_minorista', -1, 'venta', 'gn', '500:1:2:deposito_minorista', '05T10', { canal: 'Mayorista' }),
        m('deposito_minorista', 1, 'correccion', 'gn', '500:1:2:deposito_minorista#2', '08T10'),
        m('deposito_minorista', -1, 'correccion', 'gn', '500:1:2:deposito_minorista#3', '08T11'),
        m('deposito_minorista', -2, 'venta', 'gn', '600:1:2:deposito_minorista', '09T10'),
        m('deposito_minorista', -1, 'correccion', 'gn', '600:1:2:deposito_minorista#2', '10T10'),
      ],
      ventasGn: new Map([['500', { number: 33294, client_name: 'Luciana Ocampo', channel: 'Mayorista' }], ['600', { number: 33300, client_name: null, channel: null }]]),
    })
    expect(r.filas.map((f: F) => [f.tipoNombre, f.ref, f.cantidad, f.desc])).toEqual([
      ['Ajuste de venta', '#33300', -1, 'Se agregó a la venta'],
      ['Venta', '#33300', -2, ''],
      ['Venta', '#33294', -1, 'Luciana Ocampo · Mayorista'],
    ])
  })

  it('la transferencia dice desde o a qué depósito; el saldo es por depósito y, en «Todos», el total', () => {
    const r = armarHistorial({
      movimientos: [
        m('local', 2, 'apertura', 'apertura', 'a', '01T10'),
        m('deposito_minorista', 5, 'apertura', 'apertura', 'b', '01T10'),
        m('local', -1, 'transferencia', 'repo', 'r:sale', '12T10', { transfer_id: 8909 }),
        m('deposito_minorista', 1, 'transferencia', 'repo', 'r:entra', '12T10', { transfer_id: 8909 }),
      ],
    })
    const min = filtrarHistorial(r.filas, { deposito: 'deposito_minorista', filtro: 'todo' })
    expect(min.map((f: F) => [f.ref, f.desc, f.saldoVisto])).toEqual([['T-8909', 'Desde Local', 6], ['', 'Al pasar a Areben Gestión', 5]])
    const todos = filtrarHistorial(r.filas, { deposito: 'todos', filtro: 'transf' })
    expect(todos.map((f: F) => [f.depositoNombre, f.desc, f.saldoVisto])).toEqual([['Depósito minorista', 'Desde Local', 7], ['Local', 'A Depósito minorista', 6]])
    expect(depositoInicial(r.depositos)).toBe('local')
  })

  it('el ajuste lleva su número, su porqué y quién lo hizo', () => {
    const r = armarHistorial({
      movimientos: [m('local', -2, 'ajuste', 'ajuste', 'aj1:3', '17T12', { ajuste: 22, motivo: 'conteo' })],
      ajustes: new Map([['aj1', { numero: 22, motivo: 'conteo', detalle: 'Conteo del local', creado_por: 'karenf' }]]),
    })
    expect(r.filas[0]).toMatchObject({ tipo: 'ajuste', ref: 'A-22', cantidad: -2, desc: 'Conteo del local · karenf', grupo: 'ajustes' })
  })
})
