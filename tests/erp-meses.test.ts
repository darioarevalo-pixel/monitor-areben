import { describe, expect, it } from 'vitest'
import { conMesesAnteriores, correrMes, mesDeClave, mesesAnteriores, nombreDelMes, rangoDeMes, ultimoDiaDelMes } from '@/lib/erp/meses.core.js'
import { PERIODOS, rangoDePeriodo } from '@/lib/erp/ventas-lista.core.js'
import { rangoCaja } from '@/lib/erp/cajas.core.js'
import { rangoGasto } from '@/lib/erp/gastos.core.js'
import { rangoDeCobros } from '@/lib/erp/cobros.core.js'
import { periodoDeVenta } from '@/lib/erp/busqueda-global.core.js'
import { hoyDelResultado, tramosDelMes } from '../api/_erp-inicio.js'

/** Bruno 10-nov: «poder cambiar de mes en el erp - no veo como ir para atras en los meses». */
describe('ERP › los meses de antes', () => {
  it('los meses: nombre, correr, último día y clave', () => {
    expect(nombreDelMes('2026-09')).toBe('Septiembre 2026')
    expect(correrMes('2026-01', -2)).toBe('2025-11')
    expect(correrMes('2025-12', 1)).toBe('2026-01')
    expect(ultimoDiaDelMes('2028-02')).toBe('2028-02-29')
    expect(mesDeClave('m:2026-09')).toBe('2026-09')
    expect(mesDeClave('m:2026-13')).toBeNull()
    expect(mesDeClave('mes')).toBeNull()
  })

  it('el selector suma los meses de ANTES del pasado, del más nuevo al más viejo, hasta un año', () => {
    const ms = mesesAnteriores('2026-11-10')
    expect(ms[0]).toEqual(['m:2026-09', 'Septiembre 2026'])
    expect(ms.at(-1)).toEqual(['m:2025-12', 'Diciembre 2025'])
    expect(ms).toHaveLength(10)
    const todos = conMesesAnteriores(PERIODOS, '2026-11-10')
    expect(todos.slice(0, PERIODOS.length)).toEqual(PERIODOS)
    expect(new Set(todos.map(([k]) => k)).size).toBe(todos.length)
  })

  it('el rango de un mes de antes es del 1 al último día, en las cuatro listas (y Cajas)', () => {
    const sep = { desde: '2026-09-01', hasta: '2026-09-30' }
    expect(rangoDeMes('m:2026-09', '2026-11-10')).toEqual(sep)
    expect(rangoDePeriodo('m:2026-09', '2026-11-10')).toEqual(sep)
    expect(rangoGasto('m:2026-09', '2026-11-10')).toEqual(sep)
    expect(rangoCaja('m:2026-09', '2026-11-10')).toEqual(sep)
    expect(rangoDeCobros('m:2026-09', '2026-11-10')).toEqual(sep)
    // ⛔ pasa de hoy, y las claves de siempre siguen igual.
    expect(rangoDeMes('m:2026-11', '2026-11-10')).toEqual({ desde: '2026-11-01', hasta: '2026-11-10' })
    expect(rangoDePeriodo('anterior', '2026-11-10')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' })
    expect(rangoDeCobros('hoy', '2026-11-10')).toEqual({ desde: '2026-11-10', hasta: '2026-11-10' })
  })

  it('el buscador abre una venta vieja en SU mes (hasta un año atrás)', () => {
    expect(periodoDeVenta('2026-08-10T12:00:00Z', '2026-11-10')).toBe('m:2026-08')
    expect(periodoDeVenta('2025-08-10T12:00:00Z', '2026-11-10')).toBeNull()
  })

  it('Inicio: un mes de antes va ENTERO contra el anterior entero; uno inválido o futuro es hoy', () => {
    expect(hoyDelResultado('2026-09', '2026-11-10')).toEqual({ hoy: '2026-09-30', completo: true })
    expect(hoyDelResultado('2026-11', '2026-11-10')).toEqual({ hoy: '2026-11-10', completo: false })
    expect(hoyDelResultado('2027-01', '2026-11-10')).toEqual({ hoy: '2026-11-10', completo: false })
    expect(hoyDelResultado("2026-09'; drop", '2026-11-10')).toEqual({ hoy: '2026-11-10', completo: false })
    expect(tramosDelMes('2026-09-30', { completo: true }).anterior).toEqual({ desde: '2026-08-01', hasta: '2026-08-31' })
    // Sin `completo` (hoy cae fin de mes) sigue el mismo tramo.
    expect(tramosDelMes('2026-09-30').anterior).toEqual({ desde: '2026-08-01', hasta: '2026-08-30' })
  })
})
