import { describe, expect, it } from 'vitest'
import { armarCobro, armarContraentrega, contarVistas, filtrar, mediosOrdenados, rangoDeCobros, resumen } from '@/lib/erp/cobros.core.js'

const c = (o: Record<string, unknown>) => ({
  id: '1', origen: 'venta', fecha: '2026-10-20', en: '2026-10-20T13:00:00.000Z', clase: 'plata', monto: 1000, medio: 'efectivo',
  cuenta: { id: 'c', nombre: 'Efectivo local' }, cuenta_real: null, venta: { id: 'v', numero: 860, canal: null, origen: 'caja' },
  cliente: null, usuario: 'Lorena', comision: null, acredita_el: null, anulado: false, ref: null, linea: 'zattia', ...o,
})

describe('ERP › Cobros', () => {
  const filas = [
    c({ id: '1' }),
    c({ id: '2', monto: -200, venta: { id: 'v2', numero: 861, canal: null, origen: 'caja' } }),
    c({ id: '3', origen: 'pago_a_cuenta', venta: null, medio: 'transferencia', cliente: { id: 'k', nombre: 'Manuel Sosa' }, ref: 'pago-1' }),
    c({ id: '4', clase: 'a_cuenta', medio: 'cuenta', monto: 5000 }),
    c({ id: '5', anulado: true, linea: 'stunned' }),
    c({ id: '6', origen: 'devolucion', monto: -300 }),
  ].map(armarCobro)

  it('dice qué fue cada cobro en palabras', () => {
    expect(filas.map((f) => f.que)).toEqual([
      'Venta 860 · Caja', 'Vuelto · venta 861 · Caja', 'Pago a cuenta', 'Venta 860 · Caja', 'Venta 860 · Caja', 'Devolución de la venta 860',
    ])
    expect(filas[3].medioTexto).toBe('A cuenta')
  })

  it('cada vista cuenta lo suyo: lo anulado ⛔ entra en «Entró plata»', () => {
    expect(contarVistas(filas)).toEqual({ todos: 6, entro: 2, salio: 2, a_cuenta: 1, debe: 1, saldo: 0, anulados: 1, contraentrega: 0 })
  })

  it('busca por cliente, número y medio; filtra por línea y medio', () => {
    expect(filtrar(filas, { q: 'sosa' }).map((f) => f.id)).toEqual(['pago_a_cuenta:3'])
    expect(filtrar(filas, { q: '#861' }).map((f) => f.id)).toEqual(['venta:2'])
    expect(filtrar(filas, { linea: 'stunned' })).toHaveLength(1)
    expect(filtrar(filas, { medio: 'transferencia' })).toHaveLength(1)
  })

  it('el cobrado sale de los totales del MOTOR por línea; a cuenta se cuenta aparte', () => {
    const totales = {
      zattia: { plata: 1500, entro: 2000, salio: 500, por_medio: { efectivo: 500, transferencia: 1000 } },
      stunned: { plata: 0, entro: 0, salio: 0, por_medio: {} },
    }
    const r = resumen(totales, filas)
    expect(r).toMatchObject({ cobrado: 1500, entro: 2000, salio: 500, debe: 5000 })
    expect(resumen(totales, filas, 'stunned').cobrado).toBe(0)
    expect(mediosOrdenados(r.porMedio).map((m) => m.nombre)).toEqual(['Transferencia', 'Efectivo'])
  })

  it('la contraentrega abierta ⛔ es un cobro: sólo en su vista, fuera del cobrado, con lo que está en la calle', () => {
    const abiertas = [
      { venta_id: 'v9', numero: 870, canal: 'local', origen: 'manual', en: '2026-10-18T15:00:00.000Z', monto: 25000, cliente: { id: 'k', nombre: 'Ana Paz' }, linea: 'zattia' },
      { venta_id: 'v8', numero: 865, canal: 'local', origen: 'manual', en: '2026-10-15T15:00:00.000Z', monto: 5000.5, cliente: null, linea: 'stunned' },
    ].map(armarContraentrega)
    const todas = [...filas, ...abiertas]
    expect(abiertas[0]).toMatchObject({ id: 'contraentrega:v9', que: 'Venta 870 · Manual', medioTexto: 'Contraentrega', clase: 'entrega' })
    expect(contarVistas(todas)).toMatchObject({ todos: 6, entro: 2, contraentrega: 2 })
    expect(filtrar(todas, { vista: 'contraentrega', q: 'paz' }).map((f) => f.id)).toEqual(['contraentrega:v9'])
    const totales = { zattia: { plata: 1500, entro: 2000, salio: 500, por_medio: {} } }
    expect(resumen(totales, todas)).toMatchObject({ cobrado: 1500, cobros: 4, calle: 30000.5, enLaCalle: 2, calleDesde: '2026-10-15T15:00:00.000Z' })
    expect(resumen(totales, todas, 'zattia')).toMatchObject({ calle: 25000, enLaCalle: 1 })
  })

  it('el mes pasado y hoy, en días argentinos', () => {
    expect(rangoDeCobros('anterior', '2026-10-20')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' })
    expect(rangoDeCobros('hoy', '2026-10-20')).toEqual({ desde: '2026-10-20', hasta: '2026-10-20' })
  })
})
