import { describe, expect, it } from 'vitest'
import { esProduccionPropia, pieDe, proveedorPropio } from '@/lib/tn-desc/origen.core.js'

/**
 * El pie de marca sale de la ORDEN DE COMPRA, no de un campo que alguien carga. Lo dijo Bruno el
 * 4-sep-2026 —«producción propia sale de la OC de la que viene ese producto»— y se verificó contra
 * las 74 OC de Zattia: 27 proveedores, uno se llama ZATTIA, 34 productos publicados vienen de ahí.
 */
describe('producción propia = la OC cuyo proveedor es la marca misma', () => {
  it('la OC de ZATTIA lleva el pie', () => {
    expect(pieDe('zattia', ['ZATTIA'])).toBe('Producto 100% Zattia 🇦🇷')
    expect(esProduccionPropia('zattia', ['zattia'])).toBe(true) // el nombre viene como venga
  })

  it('⛔ una compra nacional no lo lleva', () => {
    expect(pieDe('zattia', ['ASKDENIM'])).toBe(null)
    expect(pieDe('zattia', ['PSYCHIC', 'MAIE'])).toBe(null)
  })

  it('🔴 sin OC tampoco: la regla falla CERRADA', () => {
    // 136 de los 356 publicados son anteriores al webhook de Ingresos. Poner «100% Zattia» en algo
    // comprado es una afirmación falsa; no ponerlo en algo propio es sólo una línea que falta.
    expect(pieDe('zattia', [])).toBe(null)
    expect(pieDe('zattia', null)).toBe(null)
    expect(esProduccionPropia('zattia', [])).toBe(false)
  })

  it('⛔ y un producto con proveedores MEZCLADOS tampoco', () => {
    // Hoy no pasa —de los 220 que cruzan, cero tienen ZATTIA y otro— pero el día que pase es una
    // pregunta abierta, no algo para contestar solo.
    expect(pieDe('zattia', ['ZATTIA', 'ASKDENIM'])).toBe(null)
  })

  it('⚠️ BDI no tiene pie definido, así que no le sale ninguno', () => {
    expect(proveedorPropio('bdi')).toBe(null)
    expect(pieDe('bdi', ['BDI'])).toBe(null)
    expect(pieDe('bdi', ['ZATTIA'])).toBe(null)
  })
})
