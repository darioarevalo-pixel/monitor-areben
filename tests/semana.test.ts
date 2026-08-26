import { describe, it, expect } from 'vitest'
import {
  celdasDelMes, columnaDe, DIAS_CORTOS, DIAS_GRILLA, diasDeSemana, inicioDeSemana, mesCorrido,
  rotuloFecha, rotuloSemana, semanaCorrida,
} from '@/lib/fechas/semana'

/**
 * Los nombres de los días y el armado de la grilla mensual.
 *
 * 🔴 **Esto existe por un error que ya se cometió y que no falla solo**: dar vuelta el array de los
 * días para que la grilla arrancara en lunes corrió **todas** las etiquetas de fecha un día, y nada
 * se rompió — la pantalla siguió andando, diciendo que el martes era lunes. Un test es la única
 * forma de que ese cambio duela en el momento en que se hace y no un mes después.
 *
 * Referencias verificadas a mano: **agosto de 2026 arranca sábado** y tiene 31 días; **noviembre de
 * 2026 arranca domingo** (el caso de los seis huecos); **febrero de 2027 arranca lunes** (cero
 * huecos); el 11-ago-2026 es martes.
 */

describe('los dos ordenamientos de la semana, que no se mezclan', () => {
  it('DIAS_CORTOS se indexa con getDay(): el domingo va PRIMERO', () => {
    expect(DIAS_CORTOS[0]).toBe('dom')
    expect(DIAS_CORTOS[6]).toBe('sáb')
  })

  it('DIAS_GRILLA es el encabezado: arranca en lunes y el domingo va al final', () => {
    expect(DIAS_GRILLA[0]).toBe('lun')
    expect(DIAS_GRILLA[6]).toBe('dom')
  })

  it('columnaDe() es el único puente entre los dos', () => {
    expect(columnaDe(1)).toBe(0) // lunes, primera columna
    expect(columnaDe(0)).toBe(6) // domingo, última
    expect(columnaDe(6)).toBe(5) // sábado, anteúltima
  })
})

describe('rotuloFecha(): el día que dice es el día que es', () => {
  it('el 11-ago-2026 es martes', () => {
    expect(rotuloFecha('2026-08-11')).toBe('mar 11-ago')
  })

  it('el 1-nov-2026 es domingo', () => {
    expect(rotuloFecha('2026-11-01')).toBe('dom 1-nov')
  })
})

describe('celdasDelMes(): los huecos del arranque, contados desde el lunes', () => {
  it('🔴 un mes que arranca DOMINGO deja seis huecos, no cero', () => {
    // El caso que delata si la conversión a columna está al revés: con `getDay()` crudo daría 0.
    const c = celdasDelMes(2026, 11)
    expect(c.slice(0, 6)).toEqual([null, null, null, null, null, null])
    expect(c[6]).toBe(1)
    expect(c).toHaveLength(6 + 30)
  })

  it('un mes que arranca LUNES no deja ninguno', () => {
    const c = celdasDelMes(2027, 2)
    expect(c[0]).toBe(1)
    expect(c).toHaveLength(28)
  })

  it('agosto de 2026 arranca sábado: cinco huecos y 31 días', () => {
    const c = celdasDelMes(2026, 8)
    expect(c.filter((d) => d === null)).toHaveLength(5)
    expect(c.filter((d) => d !== null)).toHaveLength(31)
  })
})

describe('mesCorrido(): el borde del año es lo único que importa acá', () => {
  it('un mes después de diciembre es enero DEL AÑO QUE VIENE', () => {
    expect(mesCorrido('2026-12-15', 1)).toEqual({ anio: 2027, mes: 1 })
  })

  it('un mes antes de enero es diciembre del anterior', () => {
    expect(mesCorrido('2026-01-05', -1)).toEqual({ anio: 2025, mes: 12 })
  })

  it('sin corrimiento devuelve el mes de la fecha', () => {
    expect(mesCorrido('2026-08-11', 0)).toEqual({ anio: 2026, mes: 8 })
  })
})

// ── La semana ────────────────────────────────────────────────────────────────────

describe('inicioDeSemana(): el lunes, y el domingo pertenece a la semana que arrancó', () => {
  it('un martes vuelve a su lunes', () => {
    // 11-ago-2026 es martes.
    expect(inicioDeSemana('2026-08-11')).toBe('2026-08-10')
  })

  it('un lunes es su propio lunes', () => {
    expect(inicioDeSemana('2026-08-10')).toBe('2026-08-10')
  })

  it('🔴 EL DOMINGO ES EL CASO QUE DELATA el getDay() a mano', () => {
    // 16-ago-2026 es domingo. Con `getDay()` (0 = domingo) sin convertir, no se movería —o se iría
    // al 17—: los dos serían el arranque de la semana SIGUIENTE. En Argentina el domingo cierra.
    expect(inicioDeSemana('2026-08-16')).toBe('2026-08-10')
    expect(inicioDeSemana('2026-08-16')).not.toBe('2026-08-16')
    expect(inicioDeSemana('2026-08-16')).not.toBe('2026-08-17')
  })

  it('cruza el mes hacia atrás sin pensarlo', () => {
    // 1-sep-2026 es martes: su lunes es el 31 de agosto.
    expect(inicioDeSemana('2026-09-01')).toBe('2026-08-31')
  })
})

describe('semanaCorrida(): siempre lunes→domingo, y el año no es un caso especial', () => {
  it('el 0 es la semana en la que uno está', () => {
    expect(semanaCorrida('2026-08-11', 0)).toEqual({ desde: '2026-08-10', hasta: '2026-08-16' })
  })

  it('⛔ NO son "los siete días desde hoy": arranca en lunes aunque se pida desde un jueves', () => {
    // 13-ago-2026 es jueves.
    expect(semanaCorrida('2026-08-13', 0).desde).toBe('2026-08-10')
  })

  it('adelante y atrás', () => {
    expect(semanaCorrida('2026-08-11', 1)).toEqual({ desde: '2026-08-17', hasta: '2026-08-23' })
    expect(semanaCorrida('2026-08-11', -1)).toEqual({ desde: '2026-08-03', hasta: '2026-08-09' })
  })

  it('cruza el año', () => {
    // 30-dic-2026 es miércoles: su lunes es el 28, y la siguiente arranca el 4 de enero.
    expect(semanaCorrida('2026-12-30', 1)).toEqual({ desde: '2027-01-04', hasta: '2027-01-10' })
  })
})

describe('diasDeSemana() y rotuloSemana()', () => {
  it('son siete, en orden, arrancando en el que se pide', () => {
    const d = diasDeSemana('2026-08-10')
    expect(d).toHaveLength(7)
    expect(d[0]).toBe('2026-08-10')
    expect(d[6]).toBe('2026-08-16')
  })

  it('el rótulo nombra el mes una sola vez cuando la semana no lo cruza', () => {
    expect(rotuloSemana('2026-08-10', '2026-08-16')).toBe('10 al 16 de agosto')
  })

  it('y los dos cuando lo cruza', () => {
    expect(rotuloSemana('2026-08-31', '2026-09-06')).toBe('31-ago al 6-sep')
  })
})
