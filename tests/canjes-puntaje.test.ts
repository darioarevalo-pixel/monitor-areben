import { describe, it, expect } from 'vitest'
import {
  MINIMO_CANJES_CERRADOS, MINIMO_PARA_COMPARAR,
  calcularPuntaje, contextoDePuntaje, cpmDe, nivelDe, porQueNoHayPuntaje,
} from '@/lib/canjes/puntaje'
import type { CanjeVisible } from '@/lib/canjes/cliente'

/**
 * El puntaje es lo único del módulo que **opina sobre una persona**, y se construyó antes de tener
 * un solo canje cerrado en la base. Estos tests son la contención de eso: fijan el piso mínimo, que
 * una señal sin datos se apague en vez de valer cero, y que los canjes de otras marcas no se
 * cuenten como cumplidos.
 *
 * Si alguno de estos empieza a molestar, la pregunta correcta es si la fórmula sigue siendo honesta
 * — no cómo hacer que el test pase.
 */

let proximoId = 1

/** Un canje cerrado, con lo mínimo que mira el puntaje. */
function cerrado(campos: Partial<CanjeVisible> = {}): CanjeVisible {
  return {
    id: proximoId++,
    persona_id: 1,
    store: 'bdi',
    tipo: 'producto',
    estado: 'cerrado',
    tope_tipo: 'monto',
    pago_estado: 'no_aplica',
    compra_estado: 'hecho',
    stock_estado: 'hecho',
    envio_estado: 'hecho',
    aviso_estado: 'hecho',
    cerrado_incompleto: false,
    producto_no_conservado: false,
    created_at: '2026-06-01T00:00:00Z',
    ...campos,
  } as CanjeVisible
}

/** Un canje de otra marca: llega sin balance y sin cumplimiento. */
function ciego(campos: Partial<CanjeVisible> = {}): CanjeVisible {
  return {
    id: proximoId++,
    persona_id: 1,
    store: 'zattia',
    estado: 'cerrado',
    numero: 'C-0099',
    ciego: true,
    created_at: '2026-06-01T00:00:00Z',
    ...campos,
  } as CanjeVisible
}

const NADIE = { vetada: false }
const SIN_CONTEXTO = { medianaCpm: null, personasConCpm: 0 }

describe('el piso mínimo', () => {
  it.each([0, 1, 2])('con %i canjes cerrados no hay puntaje', (n) => {
    const p = calcularPuntaje(NADIE, Array.from({ length: n }, () => cerrado()), SIN_CONTEXTO)
    expect(p.hay).toBe(false)
    if (p.hay) return
    expect(p.motivo).toBe('pocos')
    expect(p.cerrados).toBe(n)
    expect(p.faltan).toBe(MINIMO_CANJES_CERRADOS - n)
  })

  it('con el mínimo justo ya hay puntaje', () => {
    const p = calcularPuntaje(NADIE, Array.from({ length: MINIMO_CANJES_CERRADOS }, () => cerrado()), SIN_CONTEXTO)
    expect(p.hay).toBe(true)
  })

  it('el piso es 3 y sube, no baja', () => {
    // Con dos casos toda fracción es 0, 50 o 100: no distingue a nadie de nadie.
    expect(MINIMO_CANJES_CERRADOS).toBeGreaterThanOrEqual(3)
  })

  it('los canjes abiertos no cuentan para el piso', () => {
    const canjes = [cerrado(), cerrado(), cerrado({ estado: 'en_curso' }), cerrado({ estado: 'preparando' })]
    const p = calcularPuntaje(NADIE, canjes, SIN_CONTEXTO)
    expect(p.hay).toBe(false)
    if (!p.hay) expect(p.cerrados).toBe(2)
  })

  it('explica cuánto falta, sin decir "no alcanza" y nada más', () => {
    const uno = calcularPuntaje(NADIE, [cerrado()], SIN_CONTEXTO)
    if (uno.hay) throw new Error('debería no haber puntaje')
    expect(porQueNoHayPuntaje(uno)).toContain('faltan 2')

    const dos = calcularPuntaje(NADIE, [cerrado(), cerrado()], SIN_CONTEXTO)
    if (dos.hay) throw new Error('debería no haber puntaje')
    expect(porQueNoHayPuntaje(dos)).toContain('falta 1')
    expect(porQueNoHayPuntaje(dos)).not.toContain('faltan 1')

    const cero = calcularPuntaje(NADIE, [], SIN_CONTEXTO)
    if (cero.hay) throw new Error('debería no haber puntaje')
    expect(porQueNoHayPuntaje(cero)).toContain('Todavía no cerró ningún canje')
  })
})

describe('los canjes de otras marcas', () => {
  it('no cuentan como cerrados: contarlos como cumplidos sería inventar', () => {
    const p = calcularPuntaje(NADIE, [cerrado(), cerrado(), ciego(), ciego()], SIN_CONTEXTO)
    expect(p.hay).toBe(false)
    if (p.hay) return
    expect(p.cerrados).toBe(2)
    expect(p.ciegos).toBe(2)
  })

  it('pero se avisan, porque si no el número parece equivocado', () => {
    const p = calcularPuntaje(NADIE, [cerrado(), ciego(), ciego()], SIN_CONTEXTO)
    if (p.hay) throw new Error('debería no haber puntaje')
    expect(porQueNoHayPuntaje(p)).toContain('2 canjes cerrados en otras marcas')
  })
})

describe('a alguien vetado no se le calcula un número', () => {
  it('aunque tenga canjes de sobra', () => {
    const canjes = Array.from({ length: 8 }, () => cerrado())
    const p = calcularPuntaje({ vetada: true }, canjes, SIN_CONTEXTO)
    expect(p.hay).toBe(false)
    if (!p.hay) {
      expect(p.motivo).toBe('vetada')
      expect(porQueNoHayPuntaje(p)).toContain('vetada')
    }
  })
})

describe('cumplimiento', () => {
  const tres = () => [cerrado(), cerrado(), cerrado()]

  it('tres de tres completos es 100', () => {
    const p = calcularPuntaje(NADIE, tres(), SIN_CONTEXTO)
    if (!p.hay) throw new Error('debería haber puntaje')
    expect(p.dimensiones.find((d) => d.clave === 'cumplimiento')?.valor).toBe(100)
    expect(p.total).toBe(100)
    expect(p.nivel).toBe('alta')
  })

  it('un cierre incompleto lo baja', () => {
    const p = calcularPuntaje(NADIE, [cerrado(), cerrado(), cerrado({ cerrado_incompleto: true })], SIN_CONTEXTO)
    if (!p.hay) throw new Error('debería haber puntaje')
    expect(p.dimensiones.find((d) => d.clave === 'cumplimiento')?.valor).toBeCloseTo(66.67, 1)
  })

  it('haber vendido o devuelto lo que le mandamos también penaliza', () => {
    const p = calcularPuntaje(NADIE, [cerrado(), cerrado(), cerrado({ producto_no_conservado: true })], SIN_CONTEXTO)
    if (!p.hay) throw new Error('debería haber puntaje')
    const dim = p.dimensiones.find((d) => d.clave === 'cumplimiento')
    expect(dim?.valor).toBeCloseTo(66.67, 1)
    expect(dim?.detalle).toContain('no conservó')
  })

  it('cero de tres es cero, y eso ya es una respuesta', () => {
    const p = calcularPuntaje(NADIE, Array.from({ length: 3 }, () => cerrado({ cerrado_incompleto: true })), SIN_CONTEXTO)
    if (!p.hay) throw new Error('debería haber puntaje')
    expect(p.total).toBe(0)
    expect(p.nivel).toBe('baja')
  })
})

describe('la nota del equipo', () => {
  it('va de 1–5 a 0–100: un 1 es la nota más baja que se puede poner, no un cero', () => {
    const conNota = (n: number) => cerrado({ balance_puntaje_manual: n })
    const cinco = calcularPuntaje(NADIE, [conNota(5), conNota(5), conNota(5)], SIN_CONTEXTO)
    const unos = calcularPuntaje(NADIE, [conNota(1), conNota(1), conNota(1)], SIN_CONTEXTO)
    if (!cinco.hay || !unos.hay) throw new Error('debería haber puntaje')
    expect(cinco.dimensiones.find((d) => d.clave === 'nota')?.valor).toBe(100)
    expect(unos.dimensiones.find((d) => d.clave === 'nota')?.valor).toBe(0)
  })

  it('promedia sólo los canjes que tienen nota', () => {
    const canjes = [
      cerrado({ balance_puntaje_manual: 4 }),
      cerrado({ balance_puntaje_manual: 2 }),
      cerrado(), // sin nota: no arrastra el promedio a cero
    ]
    const p = calcularPuntaje(NADIE, canjes, SIN_CONTEXTO)
    if (!p.hay) throw new Error('debería haber puntaje')
    const dim = p.dimensiones.find((d) => d.clave === 'nota')
    expect(dim?.valor).toBe(50) // promedio 3 de 5
    expect(dim?.detalle).toContain('2 canjes')
  })

  it('ignora notas fuera de la escala en vez de creerles', () => {
    const canjes = [cerrado({ balance_puntaje_manual: 9 }), cerrado({ balance_puntaje_manual: 0 }), cerrado()]
    const p = calcularPuntaje(NADIE, canjes, SIN_CONTEXTO)
    if (!p.hay) throw new Error('debería haber puntaje')
    expect(p.dimensiones.find((d) => d.clave === 'nota')?.valor).toBeNull()
  })
})

describe('rendimiento', () => {
  const conCpm = (cpm: number) => cerrado({ balance_cpm: cpm, balance_alcance: 10000 })

  it('el CPM de una persona es el promedio de sus canjes', () => {
    expect(cpmDe([conCpm(100), conCpm(300)])).toBe(200)
    expect(cpmDe([cerrado()])).toBeNull()
    // Un CPM en 0 no es "gratis", es que no se cargó: no entra.
    expect(cpmDe([conCpm(0), conCpm(200)])).toBe(200)
  })

  it('menor CPM es mejor: igual a la mediana da 50, la mitad da 100, el doble da 25', () => {
    const ctx = { medianaCpm: 200, personasConCpm: 5 }
    const de = (cpm: number) => {
      const p = calcularPuntaje(NADIE, [conCpm(cpm), conCpm(cpm), conCpm(cpm)], ctx)
      if (!p.hay) throw new Error('debería haber puntaje')
      return p.dimensiones.find((d) => d.clave === 'rendimiento')?.valor
    }
    expect(de(200)).toBe(50)
    expect(de(100)).toBe(100)
    expect(de(400)).toBe(25)
  })

  it('no se pasa de 100 por más barata que sea', () => {
    const ctx = { medianaCpm: 1000, personasConCpm: 5 }
    const p = calcularPuntaje(NADIE, [conCpm(1), conCpm(1), conCpm(1)], ctx)
    if (!p.hay) throw new Error('debería haber puntaje')
    expect(p.dimensiones.find((d) => d.clave === 'rendimiento')?.valor).toBe(100)
  })

  it('sin suficiente gente con CPM no se compara nada', () => {
    const padron = [
      { canjes: [conCpm(100)] },
      { canjes: [conCpm(300)] },
    ]
    const ctx = contextoDePuntaje(padron)
    expect(ctx.medianaCpm).toBeNull() // dos no alcanzan
    expect(ctx.personasConCpm).toBe(2)
    expect(MINIMO_PARA_COMPARAR).toBeGreaterThanOrEqual(3)

    const p = calcularPuntaje(NADIE, [conCpm(100), conCpm(100), conCpm(100)], ctx)
    if (!p.hay) throw new Error('debería haber puntaje')
    const dim = p.dimensiones.find((d) => d.clave === 'rendimiento')
    expect(dim?.valor).toBeNull()
    expect(dim?.detalle).toContain('todavía no hay con qué compararlo')
  })

  it('la mediana sale del padrón entero y no de la persona que se está mirando', () => {
    const ctx = contextoDePuntaje([
      { canjes: [conCpm(100)] },
      { canjes: [conCpm(200)] },
      { canjes: [conCpm(900)] },
      { canjes: [cerrado()] }, // sin CPM: no aporta
    ])
    expect(ctx.medianaCpm).toBe(200)
    expect(ctx.personasConCpm).toBe(3)
  })
})

describe('una señal sin datos se apaga, no vale cero', () => {
  it('sin nota ni CPM, el cumplimiento se lleva todo el peso', () => {
    const p = calcularPuntaje(NADIE, [cerrado(), cerrado(), cerrado()], SIN_CONTEXTO)
    if (!p.hay) throw new Error('debería haber puntaje')
    const cump = p.dimensiones.find((d) => d.clave === 'cumplimiento')
    expect(cump?.peso).toBe(100)
    expect(p.dimensiones.filter((d) => d.valor == null).every((d) => d.peso === 0)).toBe(true)
    // Si las apagadas valieran cero, esto daría 45 en vez de 100.
    expect(p.total).toBe(100)
  })

  it('con las tres señales, los pesos suman 100 y el total queda en el medio', () => {
    const ctx = { medianaCpm: 200, personasConCpm: 5 }
    const canjes = [
      cerrado({ balance_puntaje_manual: 3, balance_cpm: 200, balance_alcance: 10000 }),
      cerrado({ balance_puntaje_manual: 3, balance_cpm: 200, balance_alcance: 10000 }),
      cerrado({ balance_puntaje_manual: 3, balance_cpm: 200, balance_alcance: 10000 }),
    ]
    const p = calcularPuntaje(NADIE, canjes, ctx)
    if (!p.hay) throw new Error('debería haber puntaje')
    expect(p.dimensiones.reduce((a, d) => a + d.peso, 0)).toBe(100)
    // 100×45 + 50×30 + 50×25 = 7250 / 100
    expect(p.total).toBe(73)
    expect(p.nivel).toBe('media')
  })

  it('cada dimensión explica de dónde salió: el número tiene que poder discutirse', () => {
    const p = calcularPuntaje(NADIE, [cerrado(), cerrado(), cerrado()], SIN_CONTEXTO)
    if (!p.hay) throw new Error('debería haber puntaje')
    expect(p.dimensiones.every((d) => d.detalle.length > 10)).toBe(true)
    expect(p.dimensiones.find((d) => d.clave === 'cumplimiento')?.detalle).toContain('Cumplió 3 de 3 canjes')
    expect(p.dimensiones.find((d) => d.clave === 'nota')?.detalle).toContain('Nadie le puso nota')
  })
})

describe('los niveles', () => {
  it.each([
    [100, 'alta'], [75, 'alta'], [74, 'media'], [50, 'media'], [49, 'baja'], [0, 'baja'],
  ])('%i es %s', (n, esperado) => {
    expect(nivelDe(n as number)).toBe(esperado)
  })
})
