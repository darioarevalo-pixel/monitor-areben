import { describe, it, expect } from 'vitest'
import { puedeTraer, ESPERA_MS } from '../api/_mkt-ventas.js'
import { ventanaVentasHoy } from '../api/_ventas-hoy.js'

/**
 * El botón «Traer las ventas de hoy» de Ventas de Marketing.
 *
 * 🔴 **Es la única puerta de esta sección que ESCRIBE en producción** (`ventas`, `venta_detalles`,
 * `clientes` del espejo) **y la única que gasta cupo de Gestión Nube**. El `concurrency:
 * gestion-nube` que comparten los ocho workflows **no alcanza a una función de Vercel**, así que el
 * antirrebote de acá es lo único que frena diez toques seguidos.
 */

const utc = (iso: string) => Date.parse(iso)

describe('puedeTraer: el antirrebote', () => {
  const ahora = utc('2026-08-18T19:00:00Z')

  it('sin traída previa, se puede', () => {
    expect(puedeTraer(null, ahora)).toBe(true)
    expect(puedeTraer(undefined, ahora)).toBe(true)
  })

  it('🔴 recién traído, NO', () => {
    expect(puedeTraer('2026-08-18T18:59:30Z', ahora)).toBe(false)
  })

  it('pasado el minuto, sí', () => {
    expect(puedeTraer('2026-08-18T18:58:00Z', ahora)).toBe(true)
  })

  // El borde exacto: a los 60 s clavados ya se puede. Es `>=`, no `>`.
  it('el borde del minuto entra', () => {
    expect(puedeTraer('2026-08-18T18:59:00Z', ahora)).toBe(true)
  })

  it('una fecha que no se entiende no puede frenar el botón para siempre', () => {
    expect(puedeTraer('cualquier cosa', ahora)).toBe(true)
  })

  it('la espera es de un minuto', () => {
    expect(ESPERA_MS).toBe(60_000)
  })
})

/**
 * 🔑 **El día lo decide Argentina, no el reloj de la función.** Vercel corre en UTC: a las 21:30 de
 * Buenos Aires `toISOString().slice(0,10)` ya devuelve mañana, así que el botón pediría las ventas
 * de un día que no existe **justo a la hora en que el local cierra**, que es cuando más se aprieta.
 * Se prueba acá porque la función se mudó de `_liquidacion.js` a `_ventas-hoy.js` y los dos
 * llamadores dependen de esto.
 */
describe('ventanaVentasHoy: ayer y hoy, en hora de Argentina', () => {
  it('media tarde: pide ayer y hoy', () => {
    expect(ventanaVentasHoy(utc('2026-08-18T15:00:00Z'))).toEqual({ desde: '2026-08-17', hasta: '2026-08-18' })
  })

  it('🔴 a las 21:30 de Buenos Aires todavía es hoy, no mañana', () => {
    // 00:30 UTC del 19 = 21:30 del 18 en Argentina.
    expect(ventanaVentasHoy(utc('2026-08-19T00:30:00Z'))).toEqual({ desde: '2026-08-17', hasta: '2026-08-18' })
  })

  it('cruza el mes sin romperse', () => {
    expect(ventanaVentasHoy(utc('2026-09-01T14:00:00Z'))).toEqual({ desde: '2026-08-31', hasta: '2026-09-01' })
  })
})
