import { describe, it, expect } from 'vitest'
import { celdasDelMes, columnaDe, DIAS_CORTOS, DIAS_GRILLA, mesCorrido, rotuloFecha } from '@/lib/fechas/semana'

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
