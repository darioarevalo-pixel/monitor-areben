import { describe, expect, it } from 'vitest'
import { cortada, pausadoEn as pausadoEnCrudo } from '@/lib/sync-tn/pausa.core.js'

const pausadoEn = (t: string, env: Record<string, string>) => pausadoEnCrudo(t, env as NodeJS.ProcessEnv)

describe('pausar el sync GN↔TN', () => {
  it('sin la variable, sólo está pausada la que ya CORTÓ (las otras corren como hoy)', () => {
    expect(pausadoEn('zattia', {})).toBe(false)
    expect(pausadoEn('bdi', { SYNC_GN_TN_PAUSADO: '' })).toBe(false)
  })
  it('Stunned cortó el 28-oct: pausada SIEMPRE, con o sin la variable (la pantalla ⛔ la tiene)', () => {
    expect(cortada('stunned')).toBe(true)
    expect(cortada('zattia')).toBe(false)
    expect(pausadoEn('stunned', {})).toBe(true)
    expect(pausadoEn('stunned', { SYNC_GN_TN_PAUSADO: 'zattia' })).toBe(true)
  })
  it('pausa sólo las tiendas de la lista, sin importar mayúsculas ni espacios', () => {
    const env = { SYNC_GN_TN_PAUSADO: ' Stunned , zattia' }
    expect(pausadoEn('stunned', env)).toBe(true)
    expect(pausadoEn('zattia', env)).toBe(true)
    expect(pausadoEn('bdi', env)).toBe(false)
  })
  it('una tienda que no existe FALLA: un typo no deja la llave apagada callada', () => {
    expect(() => pausadoEn('bdi', { SYNC_GN_TN_PAUSADO: 'stuned' })).toThrow(/tienda desconocida/)
  })
})
