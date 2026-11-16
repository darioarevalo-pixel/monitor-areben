import { describe, expect, it } from 'vitest'
import { pasoEntrega } from '@/components/panel/PedidosDelDia'
import { mensajeCobrar } from '@/components/panel/PedidosMayoristas'
import { hace } from '@/components/panel/pasos-pedido'
import type { PendienteLogistica } from '@/lib/crm/logistica'

/** La solapa «Pedidos» (Darío 15-nov): cada pedido de Logística cae en UN paso de Entregas. */
const p = (x: Partial<PendienteLogistica>) =>
  ({ id: 1, client_name: 'Ana', status: { code: 1, label: '' }, units: { scanned: 0, total: 10, complete: false }, has_label: false, em: null, dispatch_option: null, next_step: null, missing: [], ...x }) as unknown as PendienteLogistica

describe('pasoEntrega', () => {
  it('sin forma de entrega: Despachar (es tuyo, falta elegirla)', () => {
    expect(pasoEntrega(p({ next_step: { code: 'modalidad', label: '' } }))).toBe('despachar')
  })
  it('EM pagado y con etiqueta, sin terminar de preparar: Armando', () => {
    expect(pasoEntrega(p({ dispatch_option: { code: 1, label: 'EM' }, em: 123, has_label: true, status: { code: 2, label: '' }, next_step: { code: 'preparar', label: '' } }))).toBe('armando')
  })
  it('listo con etiqueta libre: Retiro; listo por EM: Despachar', () => {
    expect(pasoEntrega(p({ dispatch_option: { code: 2, label: 'Libre' }, has_label: true, status: { code: 3, label: '' }, next_step: { code: 'despachar', label: '' } }))).toBe('retiro')
    expect(pasoEntrega(p({ dispatch_option: { code: 1, label: 'EM' }, em: 9, has_label: true, status: { code: 3, label: '' }, next_step: { code: 'despachar', label: '' } }))).toBe('despachar')
  })
  it('EM que pide el seguimiento: Seguimiento (en transporte ⛔: se despacha con la foto de la guía)', () => {
    expect(pasoEntrega(p({ dispatch_option: { code: 1, label: 'EM' }, em: 9, has_label: true, status: { code: 3, label: '' }, next_step: { code: 'seguimiento', label: '' } }))).toBe('seguimiento')
    expect(pasoEntrega(p({ dispatch_option: { code: 3, label: 'Transporte' }, has_label: true, status: { code: 3, label: '' }, next_step: { code: 'seguimiento', label: '' } }))).toBe('despachar')
  })
})

describe('textos', () => {
  it('«💬 Cobrar» dice el pedido y cuánto falta, sin cantidades', () => {
    expect(mensajeCobrar({ numero: 1187, debe: 430000 })).toBe('Hola! Tu pedido M-1187 ya esta listo. Para despacharlo falta el pago de $430.000')
  })
  it('hace: hoy, ayer y «hace N días» (lo de más de un día va en rojo)', () => {
    const ahora = new Date(2026, 10, 15, 12).getTime()
    expect(hace(new Date(2026, 10, 15, 8).toISOString(), ahora)).toEqual({ txt: 'hoy', dias: 0 })
    expect(hace(new Date(2026, 10, 14, 23).toISOString(), ahora)).toEqual({ txt: 'ayer', dias: 1 })
    expect(hace(new Date(2026, 10, 12, 10).toISOString(), ahora)).toEqual({ txt: 'hace 3 días', dias: 3 })
  })
})
