// Lo que la sección deriva de las recepciones. Todo puro: sin red y sin base.
import { describe, it, expect } from 'vitest'
import {
  porProveedor,
  resumen,
  renglonesQueNoCerraron,
  sinAltaEnGN,
  porcentaje,
  tonoDeCumplimiento,
  SIN_PROVEEDOR,
  fechaDeIngreso,
  type Recepcion,
  type LineaRecepcion,
} from '../lib/recepciones/core'

const oc = (p: Partial<Recepcion>): Recepcion => ({
  id: 'bdi:1', store: 'bdi', oc_id: 1, oc_label: 'OC-0001', oc_estado: 'confirmada',
  fecha_compra: null, fecha_ingreso: null, confirmada_at: null, proveedor_id: 7, proveedor_nombre: 'Textil Sur',
  productos: 1, lineas: 1, unidades_pedidas: 0, unidades_contadas: 0, diferencia_unidades: 0,
  lineas_con_diferencia: 0, unidades_faltantes: 0, unidades_sobrantes: 0, lineas_nuevas: 0,
  cumplimiento: null, totales_coinciden: true, lineas_recibidas: 1, espejo_consultado: true,
  skus_sin_espejo: 0, recibido_en: '2026-08-26T10:00:00Z', ...p,
})

const linea = (p: Partial<LineaRecepcion>): LineaRecepcion => ({
  id: 'x', oc_ref: 'bdi:1', orden: 0, sku: 'A', codigo_barras: null, nombre: null, talle: null,
  color: null, cantidad_pedida: 0, cantidad_contada: 0, diferencia: 0, observaciones: null,
  es_nuevo: false, imagen_url: null, imagen_thumb_url: null, en_gn: true, producto_id: '1', ...p,
})

describe('porProveedor', () => {
  it('🔴 suma por UNIDADES, no promedia los porcentajes de cada OC', () => {
    // Una OC chica perfecta y una grande que entregó la mitad. El promedio de porcentajes daría
    // 75%; lo que le importa a quien compra es que faltaron 450 de 904.
    const filas = porProveedor([
      oc({ id: 'bdi:1', unidades_pedidas: 4, unidades_contadas: 4 }),
      oc({ id: 'bdi:2', unidades_pedidas: 900, unidades_contadas: 450, unidades_faltantes: 450 }),
    ])
    expect(filas).toHaveLength(1)
    expect(filas[0].unidades_pedidas).toBe(904)
    expect(filas[0].cumplimiento).toBeCloseTo(454 / 904, 6)
    expect(filas[0].cumplimiento).toBeLessThan(0.75)
  })

  it('separa proveedores y pone arriba al que más dejó de entregar', () => {
    const filas = porProveedor([
      oc({ id: 'bdi:1', proveedor_id: 1, proveedor_nombre: 'A', unidades_pedidas: 100, unidades_contadas: 99, unidades_faltantes: 1 }),
      oc({ id: 'bdi:2', proveedor_id: 2, proveedor_nombre: 'B', unidades_pedidas: 100, unidades_contadas: 60, unidades_faltantes: 40 }),
    ])
    expect(filas.map((f) => f.nombre)).toEqual(['B', 'A'])
    expect(filas[0].ocs_con_diferencia).toBe(1)
  })

  it('las OC sin proveedor no se mezclan con las que sí lo tienen', () => {
    const filas = porProveedor([
      oc({ id: 'bdi:1', proveedor_id: null, proveedor_nombre: null, unidades_pedidas: 10, unidades_contadas: 10 }),
      oc({ id: 'bdi:2', proveedor_id: 7, unidades_pedidas: 10, unidades_contadas: 10 }),
    ])
    expect(filas).toHaveLength(2)
    expect(filas.some((f) => f.nombre === SIN_PROVEEDOR)).toBe(true)
  })

  it('⛔ un proveedor al que no se le pidió nada tiene cumplimiento null, no 100%', () => {
    const filas = porProveedor([oc({ unidades_pedidas: 0, unidades_contadas: 0 })])
    expect(filas[0].cumplimiento).toBeNull()
  })

  it('una OC que sólo tuvo SOBRANTES también cuenta como "con diferencia"', () => {
    const filas = porProveedor([oc({ unidades_pedidas: 10, unidades_contadas: 12, unidades_sobrantes: 2 })])
    expect(filas[0].ocs_con_diferencia).toBe(1)
  })
})

describe('resumen', () => {
  it('cuenta las OC que no cerraron y las que el emisor manda inconsistentes', () => {
    const r = resumen([
      oc({ id: 'bdi:1', unidades_pedidas: 10, unidades_contadas: 10 }),
      oc({ id: 'bdi:2', unidades_pedidas: 10, unidades_contadas: 8, unidades_faltantes: 2 }),
      oc({ id: 'bdi:3', unidades_pedidas: 10, unidades_contadas: 10, totales_coinciden: false }),
    ])
    expect(r.ocs).toBe(3)
    expect(r.ocs_con_diferencia).toBe(1)
    expect(r.ocs_inconsistentes).toBe(1)
    expect(r.cumplimiento).toBeCloseTo(28 / 30, 6)
  })

  it('sin ninguna OC no afirma nada', () => {
    expect(resumen([])).toMatchObject({ ocs: 0, cumplimiento: null })
  })
})

describe('los renglones', () => {
  it('los que no cerraron salen ordenados por lo que más falta', () => {
    const r = renglonesQueNoCerraron([
      linea({ id: 'a', sku: 'A', diferencia: 2 }),
      linea({ id: 'b', sku: 'B', diferencia: 0 }),
      linea({ id: 'c', sku: 'C', diferencia: -5 }),
      linea({ id: 'd', sku: 'D', diferencia: -1 }),
    ])
    expect(r.map((l) => l.sku)).toEqual(['C', 'D', 'A'])
  })

  it('🔴 "falta darlo de alta en GN" no incluye los que no se pudieron preguntar', () => {
    const l = [
      linea({ id: 'a', sku: 'A', en_gn: false }),
      linea({ id: 'b', sku: 'B', en_gn: null }),
      linea({ id: 'c', sku: 'C', en_gn: true }),
    ]
    expect(sinAltaEnGN(l).map((x) => x.sku)).toEqual(['A'])
  })
})

describe('cómo se muestra', () => {
  it('un cumplimiento sin dato se escribe —, no 0%', () => {
    expect(porcentaje(null)).toBe('—')
    expect(porcentaje(0)).toBe('0%')
    expect(porcentaje(0.9231)).toBe('92%')
    expect(porcentaje(0.9231, 1)).toBe('92.3%')
  })

  it('el tono separa "cerró", "casi" y "no cerró" — y "no sé"', () => {
    expect(tonoDeCumplimiento(1)).toBe('ok')
    expect(tonoDeCumplimiento(0.99)).toBe('ok')
    expect(tonoDeCumplimiento(0.95)).toBe('aviso')
    expect(tonoDeCumplimiento(0.5)).toBe('malo')
    expect(tonoDeCumplimiento(null)).toBe('neutro')
    // Sobre-entrega también es un problema, pero no es "malo": es plata que no se pidió.
    expect(tonoDeCumplimiento(1.5)).toBe('aviso')
  })
})

describe('fechaDeIngreso', () => {
  // 🔴 El defecto que motiva esto: `recibido_en` es cuándo lo agarró el monitor, y el backfill del
  // 27-ago trajo 79 órdenes en el mismo minuto ⇒ la lista mostraba 27/8/2026 en 62 órdenes de junio.
  it('🔴 prefiere confirmada_at antes que recibido_en: el backfill aplasta todo en un día', () => {
    expect(fechaDeIngreso({ fecha_ingreso: null, confirmada_at: '2026-06-03T14:00:00Z', recibido_en: '2026-08-27T14:41:00Z' }))
      .toBe('3/6/2026')
  })

  it('la fecha que cargó una persona le gana a las dos', () => {
    expect(fechaDeIngreso({ fecha_ingreso: '2026-07-15', confirmada_at: '2026-06-03T14:00:00Z', recibido_en: '2026-08-27T14:41:00Z' }))
      .toBe('15/7/2026')
  })

  it('🔴 la fecha SOLA no pasa por new Date: medianoche UTC en Argentina es el día anterior', () => {
    // `new Date('2026-08-25').toLocaleDateString('es-AR')` da 24/8/2026. Un día menos, en todas.
    expect(fechaDeIngreso({ fecha_ingreso: '2026-08-25', confirmada_at: null, recibido_en: '2026-08-27T14:41:00Z' }))
      .toBe('25/8/2026')
  })

  it('sin ninguna de las tres no inventa una fecha', () => {
    expect(fechaDeIngreso({ fecha_ingreso: null, confirmada_at: null, recibido_en: '' })).toBe('—')
  })

  it('una fecha que no es fecha no sale como "Invalid Date" en la pantalla', () => {
    expect(fechaDeIngreso({ fecha_ingreso: null, confirmada_at: 'ayer', recibido_en: '' })).toBe('—')
  })
})
