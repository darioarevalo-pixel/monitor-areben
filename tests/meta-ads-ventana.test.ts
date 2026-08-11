import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { UMBRALES_ETAPA } from '@/lib/meta-ads/etapas.core.js'
import {
  DIAS_CENSO,
  elegirDias,
  elegirRango,
  PRESET_DEFECTO,
  PRESETS_RENDIMIENTO,
} from '@/lib/meta-ads/ventana.core.js'

/**
 * 🔴 **Pedir 7 días y que contesten 30, diciendo `dias: 30`.**
 *
 * Es lo que hacía la API hasta el 11-ago-2026, en cuatro lugares distintos. Lo que hace grave a
 * este defecto no es la ventana equivocada: es que **el número que devuelve es plausible**, así que
 * nadie del otro lado tiene con qué darse cuenta. Se descubrió midiendo 1, 3, 7, 14, 30 y 90 contra
 * producción: sólo 90 cambiaba el resultado.
 *
 * La regla que prueban estas pruebas es una sola: **ausente → el defecto, servible → eso, pedido y
 * no servible → un error que nombre lo que sí hay.** Sustituir en silencio es la única de las tres
 * que miente.
 */
describe('elegirDias — el censo tiene dos ventanas, y las demás se rechazan', () => {
  it('sin pedir nada, la de siempre', () => {
    expect(elegirDias(undefined)).toEqual({ dias: UMBRALES_ETAPA.dias })
    expect(elegirDias(null)).toEqual({ dias: UMBRALES_ETAPA.dias })
    // Vacío es no haber pedido: `?dias=` sale de un selector sin elegir, no de una intención.
    expect(elegirDias('')).toEqual({ dias: UMBRALES_ETAPA.dias })
    expect(elegirDias('   ')).toEqual({ dias: UMBRALES_ETAPA.dias })
  })

  it('las dos que existen se sirven, y da igual que vengan como texto', () => {
    expect(elegirDias('30')).toEqual({ dias: 30 })
    expect(elegirDias('90')).toEqual({ dias: 90 })
    expect(elegirDias(90)).toEqual({ dias: 90 })
  })

  it('🔴 una ventana corta NO se sirve callada con la larga', () => {
    // Éste es el caso exacto que se midió en producción. Antes devolvía `{ dias: 30 }`.
    for (const pedido of ['1', '3', '7', '14', '60']) {
      const r = elegirDias(pedido)
      expect(r.dias).toBeUndefined()
      expect(r.error).toContain(pedido)
    }
  })

  it('el error nombra las ventanas que sí hay, para no dejar a nadie adivinando', () => {
    const r = elegirDias('7')
    expect(r.error).toContain('30')
    expect(r.error).toContain('90')
  })

  it('lo que no es un número entero tampoco pasa de contrabando', () => {
    // `parseInt('30abc')` da 30: lee hasta donde entiende y descarta el resto. Esa indulgencia es
    // de la misma familia que el defecto que estamos cerrando.
    for (const basura of ['abc', '30abc', '3.5', '0', '-30', 'NaN', 'Infinity']) {
      expect(elegirDias(basura).error).toBeTruthy()
    }
  })

  it('la lista de permitidos es un parámetro, y el defecto es el primero', () => {
    expect(elegirDias(undefined, [7, 14])).toEqual({ dias: 7 })
    expect(elegirDias('14', [7, 14])).toEqual({ dias: 14 })
    expect(elegirDias('30', [7, 14]).error).toBeTruthy()
  })

  it('🔑 las ventanas SALEN de `UMBRALES_ETAPA`, no están escritas de nuevo', () => {
    // Si alguien cambia el criterio en un solo lado, esto se cae acá y no en producción tres
    // semanas después. Era una de las cuatro copias que tenía los números adentro.
    expect(DIAS_CENSO).toEqual([UMBRALES_ETAPA.dias, UMBRALES_ETAPA.diasAmplio])
  })
})

describe('elegirRango — el modo rendimiento', () => {
  it('sin nada, los últimos 30 días, y el eco dice cuál se miró', () => {
    expect(elegirRango({})).toEqual({ qs: `date_preset=${PRESET_DEFECTO}`, eco: PRESET_DEFECTO })
  })

  it('un preset de la lista viaja tal cual', () => {
    expect(elegirRango({ preset: 'last_7d' })).toEqual({ qs: 'date_preset=last_7d', eco: 'last_7d' })
  })

  it('🔴 un preset que no existe NO cae al de siempre', () => {
    const r = elegirRango({ preset: 'last_60d' })
    expect(r.qs).toBeUndefined()
    expect(r.error).toContain('last_60d')
    expect(r.error).toContain('last_30d')
  })

  it('un rango de fechas gana sobre el preset, y viaja como `time_range`', () => {
    const r = elegirRango({ since: '2026-08-01', until: '2026-08-10', preset: 'last_7d' })
    expect(r.qs).toBe(`time_range=${encodeURIComponent(JSON.stringify({ since: '2026-08-01', until: '2026-08-10' }))}`)
    expect(r.eco).toEqual({ since: '2026-08-01', until: '2026-08-10' })
  })

  it('🔴 una fecha mal escrita es un error, no un motivo para contestar otra cosa', () => {
    // Antes, `since=ayer` caía al preset y devolvía los últimos 30 días con cara de rango pedido.
    expect(elegirRango({ since: 'ayer', until: '2026-08-10' }).error).toBeTruthy()
    expect(elegirRango({ since: '2026-8-1', until: '2026-08-10' }).error).toBeTruthy()
    // Media fecha tampoco: pedir un rango y mandar una sola punta es un pedido incompleto, no la
    // ausencia de pedido.
    expect(elegirRango({ since: '2026-08-01' }).error).toBeTruthy()
    expect(elegirRango({ until: '2026-08-10' }).error).toBeTruthy()
  })

  it('un rango al revés se rechaza nombrando las dos puntas', () => {
    const r = elegirRango({ since: '2026-08-10', until: '2026-08-01' })
    expect(r.error).toContain('2026-08-10')
    expect(r.error).toContain('2026-08-01')
  })
})

/**
 * El espejo entre la lista que ACEPTA la puerta y el tipo que OFRECE el cliente.
 *
 * Hasta ahora las dos listas estaban escritas aparte y nada las amarraba. Con la puerta rechazando
 * lo que no conoce —que es el cambio de esta tanda— despegarlas dejó de ser cosmético: un preset
 * nuevo en el tipo y no en la lista es una pantalla que pide algo y se come un 400.
 *
 * Es texto contra texto a propósito, igual que `meta-ads-despacho.test.ts`: el tipo no existe en
 * tiempo de ejecución.
 */
describe('meta-ads — la puerta acepta todos los períodos que el cliente puede ofrecer', () => {
  const tipos = readFileSync(join(__dirname, '..', 'lib/meta-ads/tipos.ts'), 'utf8')
  const bloque = tipos.slice(tipos.indexOf('export type PresetMetaAds'))
  const delTipo = [...bloque.slice(0, bloque.indexOf('\n\n')).matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1])

  it('el tipo lista varios períodos (si esto da cero, la extracción se rompió)', () => {
    expect(delTipo.length).toBeGreaterThan(5)
  })

  it('ni uno del tipo queda afuera de la puerta', () => {
    expect([...delTipo].sort()).toEqual([...PRESETS_RENDIMIENTO].sort())
  })
})
