import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { resumenObjetivo, seExcede, estadoCuenta } from '@/lib/cuentas/core.core.js'

/**
 * Las cuentas manuales: juntar plata de clientes para algo que el dashboard no conoce.
 *
 * 🔑 **Lo que se fija acá es la regla que sostiene el circuito**, la misma que del lado de los
 * acreedores: *no se puede pedir dos veces la misma plata*. Con un acreedor el techo lo da el
 * dashboard; acá lo da un monto cargado a mano, y la resta contra lo ya comprometido es idéntica.
 *
 * Y el otro invariante, que es el que Bruno pidió con todas las letras: **la cuenta se apaga
 * cuando se llega al monto**, no cuando termina el mes.
 */

const objetivo = { id: 'o1', monto: 500_000 }

const c = (over: Partial<{ objetivo_id: string; estado: string; monto: number; monto_confirmado: number | null }>) => ({
  objetivo_id: 'o1',
  estado: 'prometido',
  monto: 0,
  monto_confirmado: null,
  ...over,
})

describe('la plata de una vuelta', () => {
  it('sin nada anotado, falta todo y se puede pedir todo', () => {
    const r = resumenObjetivo(objetivo, [])
    expect(r.juntado).toBe(0)
    expect(r.falta).toBe(500_000)
    expect(r.sePuedePedir).toBe(500_000)
    expect(r.completo).toBe(false)
  })

  it('🔑 lo comprometido y sin entrar NO baja lo que falta, pero SÍ lo que se puede pedir', () => {
    // Es la distinción entera: la plata prometida todavía no está, así que la cuota sigue sin
    // juntarse; pero pedírsela a otro cliente sería pedir dos veces lo mismo.
    const r = resumenObjetivo(objetivo, [c({ monto: 300_000 })])
    expect(r.falta).toBe(500_000)
    expect(r.sePuedePedir).toBe(200_000)
  })

  it('lo confirmado baja las dos', () => {
    const r = resumenObjetivo(objetivo, [c({ estado: 'confirmado', monto: 300_000, monto_confirmado: 300_000 })])
    expect(r.juntado).toBe(300_000)
    expect(r.falta).toBe(200_000)
    expect(r.sePuedePedir).toBe(200_000)
  })

  it('⚠️ lo juntado sale de lo que ENTRÓ, no de lo que se prometió', () => {
    // El cobro parcial: se comprometieron 300.000 y entraron 120.000. Sumar `monto` daría por
    // juntada plata que no llegó, y la cuenta se apagaría sin que se haya pagado nada.
    const r = resumenObjetivo(objetivo, [c({ estado: 'confirmado', monto: 300_000, monto_confirmado: 120_000 })])
    expect(r.juntado).toBe(120_000)
    expect(r.falta).toBe(380_000)
  })

  it('un cancelado no ocupa plata', () => {
    const r = resumenObjetivo(objetivo, [c({ estado: 'cancelado', monto: 300_000 })])
    expect(r.sePuedePedir).toBe(500_000)
  })

  it('⛔ los compromisos de OTRA vuelta no se cuentan', () => {
    const r = resumenObjetivo(objetivo, [c({ objetivo_id: 'otra', estado: 'confirmado', monto: 400_000, monto_confirmado: 400_000 })])
    expect(r.juntado).toBe(0)
    expect(r.falta).toBe(500_000)
  })

  it('🔑 al llegar al monto queda completo: es lo que apaga la cuenta', () => {
    const r = resumenObjetivo(objetivo, [
      c({ estado: 'confirmado', monto: 300_000, monto_confirmado: 300_000 }),
      c({ estado: 'confirmado', monto: 200_000, monto_confirmado: 200_000 }),
    ])
    expect(r.completo).toBe(true)
    expect(r.falta).toBe(0)
    expect(r.sePuedePedir).toBe(0)
  })

  it('los centavos de un cobro partido en tres no dejan la cuenta abierta para siempre', () => {
    // 100.000 en tres partes da 33.333,33 + 33.333,33 + 33.333,34. Sin la tolerancia de medio
    // centavo, una diferencia que no se ve en pantalla dejaría la cuenta prendida.
    const tres = { id: 'o2', monto: 100_000 }
    const r = resumenObjetivo(tres, [
      { objetivo_id: 'o2', estado: 'confirmado', monto: 33_333.33, monto_confirmado: 33_333.33 },
      { objetivo_id: 'o2', estado: 'confirmado', monto: 33_333.33, monto_confirmado: 33_333.33 },
      { objetivo_id: 'o2', estado: 'confirmado', monto: 33_333.34, monto_confirmado: 33_333.34 },
    ])
    expect(r.completo).toBe(true)
  })

  it('entrar de más completa igual y no deja un faltante negativo', () => {
    const r = resumenObjetivo(objetivo, [c({ estado: 'confirmado', monto: 500_000, monto_confirmado: 600_000 })])
    expect(r.falta).toBe(0)
    expect(r.sePuedePedir).toBe(0)
    expect(r.completo).toBe(true)
  })
})

describe('lo que entró de más se dice, no se rechaza', () => {
  it('cuenta la diferencia contra lo que faltaba', () => {
    expect(seExcede(200_000, 250_000)).toBe(50_000)
  })
  it('justo o de menos no se pasa', () => {
    expect(seExcede(200_000, 200_000)).toBe(0)
    expect(seExcede(200_000, 120_000)).toBe(0)
  })
})

describe('cómo se lee una cuenta', () => {
  it('⚠️ sin monto cargado está dormida, que es un estado normal y no un problema', () => {
    expect(estadoCuenta({ objetivo: null })).toBe('dormida')
    expect(estadoCuenta({ objetivo: { id: 'o1' } })).toBe('juntando')
    expect(estadoCuenta({ archivada: true, objetivo: { id: 'o1' } })).toBe('archivada')
  })
})

/**
 * 🔴 **El alambre: una cuenta manual NO le habla al dashboard.**
 *
 * Es la promesa entera de esta clase de cuenta —se usa igual con el dashboard caído, y el pago de
 * verdad se carga allá a mano—, y es de las que se rompen sin que nada falle: alcanza con que
 * alguien "unifique" el camino de confirmar y le agregue la llamada a la puerta. Ahí un compromiso
 * de la cuota del crédito empezaría a escribir pagos en el ledger contra un acreedor que no existe.
 */
describe('⛔ el handler de las cuentas no toca el dashboard', () => {
  const fuente = readFileSync(new URL('../api/_cuentas.js', import.meta.url), 'utf8')

  it('no conoce la puerta ni su secreto', () => {
    expect(fuente).not.toMatch(/DASHBOARD_PUENTE|puente\.core|x-puente-auth/)
  })

  it('no sale a la red', () => {
    // Un `fetch` acá sólo puede ser una llamada a otro sistema: este handler lee y escribe su
    // propia base y nada más.
    expect(fuente).not.toMatch(/\bfetch\s*\(/)
  })
})
