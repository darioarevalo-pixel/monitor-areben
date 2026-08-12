/**
 * «Después» en el cartel de una novedad importante.
 *
 * Se prueba `vigentes(mapa, ahora)`, que es lo único con lógica: el resto del módulo es leer y
 * escribir localStorage, que en Node no existe (los tests corren en `environment: 'node'`).
 */

import { describe, expect, it } from 'vitest'
import { claveDe, MINUTOS_POSTERGAR, vigentes, type MapaPostergadas } from '@/lib/novedades/postergar'

const AHORA = 1_770_000_000_000

describe('vigentes', () => {
  it('la vencida se cae', () => {
    const m: MapaPostergadas = { 'bruno|n1|1': AHORA - 1 }
    expect(vigentes(m, AHORA)).toEqual({})
  })

  it('a falta de un minuto sigue postergada', () => {
    const m: MapaPostergadas = { 'bruno|n1|1': AHORA + 60_000 }
    expect(vigentes(m, AHORA)).toEqual(m)
  })

  it('limpia sólo las vencidas y deja las vivas', () => {
    const m: MapaPostergadas = { 'bruno|n1|1': AHORA - 1, 'bruno|n2|1': AHORA + 5_000 }
    expect(vigentes(m, AHORA)).toEqual({ 'bruno|n2|1': AHORA + 5_000 })
  })

  it('aguanta un mapa roto sin explotar: lo que no es número no cuenta', () => {
    const m = { 'bruno|n1|1': 'mañana' } as unknown as MapaPostergadas
    expect(vigentes(m, AHORA)).toEqual({})
    expect(vigentes(undefined as unknown as MapaPostergadas, AHORA)).toEqual({})
  })
})

describe('la clave', () => {
  it('lleva el usuario, así dos personas en el mismo navegador no se pisan', () => {
    expect(claveDe('Local', 'n1', 1)).not.toBe(claveDe('Depósito', 'n1', 1))
  })

  it('lleva la versión: subirla tiene que volver a frenar a todos', () => {
    expect(claveDe('bruno', 'n1', 1)).not.toBe(claveDe('bruno', 'n1', 2))
  })

  it('el usuario va en minúsculas, igual que en el visto de los avisos', () => {
    expect(claveDe('Bruno', 'n1', 1)).toBe(claveDe('bruno', 'n1', 1))
  })

  it('sin sesión no se pierde el postergado, entra como anónimo', () => {
    expect(claveDe(null, 'n1', 1)).toBe('(anon)|n1|1')
  })
})

describe('cuánto dura', () => {
  it('son 10 minutos, y el número está en un solo lugar', () => {
    expect(MINUTOS_POSTERGAR).toBe(10)
  })
})
