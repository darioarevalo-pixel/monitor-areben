/**
 * El botón «Traer las ventas de hoy» de la pestaña Resultado.
 *
 * Existe porque Resultado no le pregunta nada a Gestión Nube: lee el espejo de Supabase, y el
 * espejo lo llena un sync que corre una vez por día a las 3 de la mañana. Una campaña que arrancó
 * hoy se mide, entonces, contra los datos de ayer y contesta «no vendió» de todo.
 *
 * Lo testeable del handler son sus dos decisiones puras: **qué rango se le pide a GN** y **si el
 * botón puede volver a correr**. Lo demás es red y base.
 */

import { describe, it, expect } from 'vitest'
import { puedeSincronizarVentas, ventanaVentasHoy } from '../api/_liquidacion.js'

/** Un instante en UTC, para poder razonar sobre el corrimiento a Argentina (UTC-3). */
const utc = (iso: string) => Date.parse(iso)

describe('ventanaVentasHoy', () => {
  it('pide ayer y hoy', () => {
    expect(ventanaVentasHoy(utc('2026-08-13T15:00:00Z'))).toEqual({
      desde: '2026-08-12',
      hasta: '2026-08-13',
    })
  })

  it('🔑 el día lo decide Argentina, no UTC: a las 21:30 de Buenos Aires sigue siendo hoy', () => {
    // 2026-08-14T00:30Z ya es "mañana" en UTC, pero en Argentina son las 21:30 del 13 — la hora en
    // la que el local está cerrando y en la que más se va a apretar el botón. Con el reloj del
    // servidor se le pedirían a GN las ventas del 14 y volvería vacío.
    expect(ventanaVentasHoy(utc('2026-08-14T00:30:00Z'))).toEqual({
      desde: '2026-08-12',
      hasta: '2026-08-13',
    })
  })

  it('cruza el mes sin romperse', () => {
    expect(ventanaVentasHoy(utc('2026-09-01T14:00:00Z'))).toEqual({
      desde: '2026-08-31',
      hasta: '2026-09-01',
    })
  })
})

describe('puedeSincronizarVentas', () => {
  const ahora = utc('2026-08-13T19:00:00Z')

  it('sin sincronizada previa, corre', () => {
    expect(puedeSincronizarVentas(null, ahora)).toBe(true)
  })

  it('recién sincronizado, no corre', () => {
    expect(puedeSincronizarVentas('2026-08-13T18:59:30Z', ahora)).toBe(false)
  })

  it('pasado el minuto, vuelve a correr', () => {
    expect(puedeSincronizarVentas('2026-08-13T18:58:00Z', ahora)).toBe(true)
  })

  it('justo en el borde corre: la espera es un mínimo, no un intervalo abierto', () => {
    expect(puedeSincronizarVentas('2026-08-13T18:59:00Z', ahora)).toBe(true)
  })

  it('🔑 un ISO ilegible deja pasar: trabar el botón por un dato roto es peor que sincronizar de más', () => {
    expect(puedeSincronizarVentas('cualquier cosa', ahora)).toBe(true)
  })
})
