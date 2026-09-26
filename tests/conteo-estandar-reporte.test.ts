import { describe, it, expect } from 'vitest'
import { armarReporte, diaAr, diasConReporte } from '@/lib/conteo-estandar/reporte'
import type { ConteoHistorial } from '@/lib/conteo-deposito/tipos'

const fila = (over: Record<string, unknown>) => ({ inventory_id: 1, barcode: 'B', sku: 'RTO-0013-NG', producto: 'TOP EMBER', variante: 'Negro', sistema: 2, exhibido: 0, deposito: 0, ...over })
const conteo = (fecha: string, detalle: Record<string, unknown>[], linea = 'zattia'): ConteoHistorial => ({ fecha_aplicado: fecha, resumen: { modo: 'estandar', linea } as never, detalle })

describe('reporte para colgar', () => {
  it('uno por talle y color: lo que no está en el salón, separado por si hay en depósito', () => {
    const c = conteo('2026-09-27T15:00:00Z', [
      fila({ inventory_id: 1, variante: 'Negro', exhibido: 1, deposito: 3 }),
      fila({ inventory_id: 2, variante: 'Blanco', exhibido: 0, deposito: 2 }),
      fila({ inventory_id: 3, variante: 'Rojo', exhibido: 0, deposito: 0 }),
      fila({ inventory_id: 4, sku: 'RBE-0002-34', producto: 'BERMUDA', variante: '34', exhibido: 0, deposito: 1 }),
    ])
    const r = armarReporte([c], 'zattia', '2026-09-27', [])
    expect(r.paraColgar.map((f) => f.producto + ' ' + f.variante)).toEqual(['BERMUDA 34', 'TOP EMBER Blanco'])
    expect(r.paraColgar[1].categoria).toBe('Tops')
    expect(r.sinUnidades.map((f) => f.variante)).toEqual(['Rojo'])
    expect(r.productos).toBe(2)
    expect(r.variantes).toBe(4)
  })
  it('si un talle se contó dos veces en el día, vale el último; otra línea y otro día no entran', () => {
    const r = armarReporte(
      [
        conteo('2026-09-27T20:00:00Z', [fila({ exhibido: 1, deposito: 2 })]),
        conteo('2026-09-27T12:00:00Z', [fila({ exhibido: 0, deposito: 2 })]),
        conteo('2026-09-27T12:00:00Z', [fila({ inventory_id: 9, exhibido: 0, deposito: 5 })], 'stunned'),
        conteo('2026-09-20T12:00:00Z', [fila({ inventory_id: 8, exhibido: 0, deposito: 5 })]),
      ],
      'zattia',
      '2026-09-27',
      [],
    )
    expect(r.paraColgar).toEqual([])
  })
  it('los conteos viejos sin desglose no cuentan, y el día es el de Argentina', () => {
    expect(diaAr('2026-09-28T01:30:00Z')).toBe('2026-09-27')
    const viejo = conteo('2026-07-10T12:00:00Z', [{ inventory_id: 1, producto: 'X', diferencia: 1 }])
    expect(diasConReporte([viejo, conteo('2026-09-27T12:00:00Z', [fila({})])], 'zattia')).toEqual(['2026-09-27'])
  })
  it('sin SKU guardado lo busca en el stock actual', () => {
    const r = armarReporte([conteo('2026-09-27T12:00:00Z', [fila({ sku: undefined, deposito: 1 })])], 'zattia', '2026-09-27', [
      { pid: '1', name: 'TOP EMBER', linea: 'zattia', variants: [{ vid: '1_1', sid: 1, size: 'Negro', sku: 'RTO-0013-NG', inventory_id: 1, esperado: 2 }] },
    ])
    expect(r.paraColgar[0].skuProd).toBe('RTO-0013')
  })
})
