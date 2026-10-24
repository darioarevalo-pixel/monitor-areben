import { describe, expect, it } from 'vitest'
import { pausadoEn as pausadoEnCrudo } from '@/lib/sync-tn/pausa.core.js'

const pausadoEn = (t: string, env: Record<string, string>) => pausadoEnCrudo(t, env as NodeJS.ProcessEnv)

describe('pausar el sync GN↔TN', () => {
  it('sin la variable, ninguna tienda está pausada (todo corre como hoy)', () => {
    expect(pausadoEn('stunned', {})).toBe(false)
    expect(pausadoEn('zattia', { SYNC_GN_TN_PAUSADO: '' })).toBe(false)
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
