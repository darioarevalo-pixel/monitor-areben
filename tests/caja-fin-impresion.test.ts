import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { finDeImpresion } from '@/lib/caja/ticket'

/**
 * 🔴 El ticket de cambio del regalo sale cuando TERMINA la impresión del primero (Bruno, 19-oct: en GN, el
 * Enter del cuadro de impresión daba pie a la segunda). Con el cuadro abierto la página ⛔ tiene el foco.
 */
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function correr(foco: (ms: number) => boolean) {
  let ahora = 0
  let listo: number | null = null
  void finDeImpresion(() => foco(ahora)).then(() => { listo = ahora })
  return {
    hasta: async (ms: number) => {
      while (ahora < ms) { ahora += 50; await vi.advanceTimersByTimeAsync(50) }
      return listo
    },
  }
}

describe('finDeImpresion', () => {
  it('con cuadro: espera a que la cajera lo cierre (8 s), ⛔ sale antes', async () => {
    const r = correr((ms) => !(ms >= 500 && ms < 8000))
    expect(await r.hasta(7000)).toBeNull()
    const listo = await r.hasta(10000)
    expect(listo).toBeGreaterThanOrEqual(8000)
    expect(listo).toBeLessThan(9000)
  })

  it('sin cuadro (`--kiosk-printing`): ⛔ pierde el foco y sale a los 3 s', async () => {
    const listo = await correr(() => true).hasta(5000)
    expect(listo).toBeGreaterThanOrEqual(3000)
    expect(listo).toBeLessThan(4000)
  })

  it('el cuadro olvidado abierto ⛔ lo deja colgado: sale a los 3 min', async () => {
    const r = correr((ms) => ms < 500)
    expect(await r.hasta(170_000)).toBeNull()
    expect(await r.hasta(185_000)).not.toBeNull()
  })
})
