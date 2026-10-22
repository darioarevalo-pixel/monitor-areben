import { describe, expect, it } from 'vitest'
import { cerradaEnTN, fechaDeVenta, ordenarBandeja, pedidosDeRevision, resumenDeTraida } from '@/lib/envios/core'
import { CAMPOS, MOTIVOS_A_MANO, MOTIVOS_RESUELTO, motivoDeTN, revisableEnTN } from '@/lib/envios/reglas.core.js'
import type { Envio } from '@/lib/envios/tipos'

/**
 * La bandeja «Sin fecha»: lo que la vacía (la revisión contra TN y «Sacar…») y su orden.
 *
 * Nació el 22-oct-2026: la bandeja tenía 51 filas y de las 43 de TN ninguna seguía abierta en TN.
 */

const fila = (p: Partial<Envio> & { tn?: Record<string, unknown> } = {}): Envio => {
  const { tn, ...resto } = p
  return {
    id: 'en1',
    store: 'bdi',
    fecha: null,
    turno: null,
    origen: 'tn',
    orden_numero: '21071',
    cliente: 'Ana',
    telefono: null,
    direccion: 'Mitre 1',
    piso_depto: null,
    localidad: 'Rosario',
    anotacion: null,
    monto_envio: 0,
    envio_pagado: false,
    envio_bonificado: false,
    monto_pedido_a_cobrar: 0,
    estado: 'pendiente',
    vendedor: null,
    cadete: null,
    datos: { tn: { fecha: '2026-08-25T15:00:00+0000', ...(tn || {}) } },
    ...resto,
  } as Envio
}

describe('🔴 qué saca la revisión contra Tienda Nube', () => {
  it('cancelada o entregada en TN ⇒ sale, con su motivo', () => {
    expect(motivoDeTN({ estado_orden: 'cancelled', envio_estado: 'unpacked' })).toBe('tn_cancelada')
    expect(motivoDeTN({ estado_orden: 'open', cancelada: true })).toBe('tn_cancelada')
    expect(motivoDeTN({ estado_orden: 'closed', envio_estado: 'delivered' })).toBe('tn_entregada')
  })

  it('🔴 cerrada SIN despachar ⛔ sale: es un aviso, decide una persona (Bruno, 22-oct)', () => {
    // El mutante es sacarla: el equipo cierra órdenes en TN antes de que salga la moto.
    const m = motivoDeTN({ estado_orden: 'closed', envio_estado: 'unshipped' })
    expect(m).toBe('cerrada')
    expect(Object.keys(MOTIVOS_RESUELTO)).not.toContain(m)
  })

  it('abierta, o sin dato ⇒ nada', () => {
    expect(motivoDeTN({ estado_orden: 'open', envio_estado: 'unpacked' })).toBeNull()
    expect(motivoDeTN(null)).toBeNull()
  })

  it('🔴 la HOJA del día ⛔ se revisa: sólo la bandeja', () => {
    expect(revisableEnTN(fila())).toBe(true)
    expect(revisableEnTN(fila({ fecha: '2026-10-22', turno: 'tarde', estado: 'preparado' }))).toBe(false)
    // El que volvió sin entregar sí está en la bandeja, aunque tenga día.
    expect(revisableEnTN(fila({ fecha: '2026-10-20', turno: 'tarde', estado: 'no_entregado' }))).toBe(true)
    expect(revisableEnTN(fila({ origen: 'manual' }))).toBe(false)
    expect(revisableEnTN(fila({ resuelto_motivo: 'retiro_local' }))).toBe(false)
  })

  it('a mano ⛔ se eligen los motivos de TN', () => {
    expect(MOTIVOS_A_MANO).not.toContain('tn_entregada')
    expect(MOTIVOS_A_MANO).not.toContain('tn_cancelada')
    for (const m of MOTIVOS_A_MANO) expect(MOTIVOS_RESUELTO).toHaveProperty(m)
  })

  it('🔴 el handler PIDE la columna del motivo (sin ella, «Cerrada en TN» y «Sacar…» no se ven)', () => {
    expect(CAMPOS.split(',').map((c) => c.trim())).toEqual(expect.arrayContaining(['resuelto_motivo', 'datos']))
  })
})

describe('qué se le pregunta a TN', () => {
  it('🔴 un pedido por DÍA de venta y marca: el listado de TN corta en 200', () => {
    const p = pedidosDeRevision(
      [
        fila({ id: 'a' }),
        fila({ id: 'b', orden_numero: '21077' }),
        fila({ id: 'c', tn: { fecha: '2026-09-09T12:00:00+0000' } }),
        fila({ id: 'd', store: 'zattia' }),
        fila({ id: 'e', origen: 'manual' }),
        fila({ id: 'f', fecha: '2026-10-22', turno: 'tarde', estado: 'preparado' }),
      ],
      ['bdi'],
    )
    expect(p.map((x) => [x.dia, x.filas.map((f) => f.id)])).toEqual([
      ['2026-08-25', ['a', 'b']],
      ['2026-09-09', ['c']],
    ])
  })

  it('el día de venta va en hora argentina: una venta de las 22 h es de ese día', () => {
    expect(fechaDeVenta(fila({ tn: { fecha: '2026-08-26T01:30:00+0000' } }))).toBe('2026-08-25')
    expect(fechaDeVenta(fila({ origen: 'manual', datos: {}, created_at: '2026-09-01T15:00:00Z' }))).toBe('2026-09-01')
  })
})

describe('el orden de la bandeja (Bruno, 22-oct)', () => {
  const a = fila({ id: 'a', orden_numero: '1002', monto_envio: 3000, tn: { fecha: '2026-09-01T15:00:00+0000' } })
  const b = fila({ id: 'b', orden_numero: '998', monto_envio: 0, tn: { fecha: '2026-09-05T15:00:00+0000' } })
  const c = fila({ id: 'c', orden_numero: null, origen: 'manual', datos: {}, monto_envio: 0, created_at: '2026-08-20T15:00:00Z' })

  it('por defecto: la venta más vieja arriba', () => {
    expect(ordenarBandeja([a, b, c], 'venta').map((e) => e.id)).toEqual(['c', 'a', 'b'])
  })
  it('🔴 el número de orden se compara como NÚMERO, y sin número va al final', () => {
    expect(ordenarBandeja([a, b, c], 'orden').map((e) => e.id)).toEqual(['b', 'a', 'c'])
  })
  it('sin precio primero, desempatando por venta', () => {
    expect(ordenarBandeja([a, b, c], 'sin_precio').map((e) => e.id)).toEqual(['c', 'b', 'a'])
  })
  it('no muta la lista que recibe', () => {
    const l = [a, b, c]
    ordenarBandeja(l, 'orden')
    expect(l.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('el aviso y el cartel', () => {
  it('«Cerrada en TN» sólo si está cerrada, sin entregar y sin resolver', () => {
    expect(cerradaEnTN(fila({ tn: { estado_orden: 'closed', envio_estado: 'unshipped' } }))).toBe(true)
    expect(cerradaEnTN(fila({ tn: { estado_orden: 'closed', envio_estado: 'delivered' } }))).toBe(false)
    expect(cerradaEnTN(fila({ tn: { estado_orden: 'open' } }))).toBe(false)
    expect(cerradaEnTN(fila({ tn: { estado_orden: 'closed' }, resuelto_motivo: 'retiro_local' }))).toBe(false)
  })

  const t = { agregados: 0, ya_estaban: 0, sinDireccion: 0, porCorreo: 0, noLeidas: 0 }
  it('dice cuántas salieron y por qué', () => {
    const r = resumenDeTraida({ ...t, revision: { entregadas: 19, canceladas: 9, cerradas: 15, noRevisadas: 0 } })
    expect(r.texto).toContain('salieron de «Sin fecha» 28 (19 entregadas y 9 canceladas en Tienda Nube)')
    expect(r.texto).toContain('15 cerradas en TN para revisar')
    expect(r.tono).toBe('ok')
  })
  it('🔴 si la revisión no anduvo, el cartel NO es verde', () => {
    expect(resumenDeTraida({ ...t, revision: null }).tono).toBe('aviso')
    expect(resumenDeTraida({ ...t, revision: { entregadas: 0, canceladas: 0, cerradas: 0, noRevisadas: 3 } }).tono).toBe('aviso')
  })
})
