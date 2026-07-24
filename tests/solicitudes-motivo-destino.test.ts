import { describe, it, expect } from 'vitest'
import { marcasQueVe, puedePedir } from '@/lib/solicitudes/overview'
import { motivosDe, MOTIVOS, necesitaAprobacion, presetPorMotivo, PRESET_FOTOS, PRESET_INTERNAS } from '@/components/solicitudes/preset'
import type { Perfil } from '@/lib/permisos'
import type { Marca } from '@/lib/nav'

const perfil = (over: Partial<Perfil> = {}): Perfil => ({ name: 'Ana', admin: false, cuenta: null, acceso: { bdi: {}, zattia: {} }, funcion: [], ...over })
const TODAS: Marca[] = ['bdi', 'zattia']

/**
 * El modelo de la Fase 2: motivo (para qué sale) y destino (si vuelve) son ejes
 * independientes. Lo que se prueba acá es que el COMPORTAMIENTO cuelgue del destino y no
 * de la sección por la que se entró — que era la confusión vieja.
 */
describe('solicitudes — motivo y destino', () => {
  it('la aprobación la pide el destino, no el motivo', () => {
    expect(necesitaAprobacion({ tipo: 'consumo' })).toBe(true)
    expect(necesitaAprobacion({ tipo: 'retornable' })).toBe(false)
    // El caso que antes era imposible: una foto que NO vuelve (un templado que se pega).
    expect(necesitaAprobacion({ tipo: 'consumo' })).toBe(true)
  })

  it('"Sesión de fotos" es un motivo más, y elige el cajón de fotos', () => {
    expect(MOTIVOS).toContain('Sesión de fotos')
    expect(presetPorMotivo('Sesión de fotos').kind).toBe(PRESET_FOTOS.kind)
    expect(presetPorMotivo('Video/contenido').kind).toBe(PRESET_INTERNAS.kind)
    expect(presetPorMotivo('Muestra').kind).toBe(PRESET_INTERNAS.kind)
  })

  it('sin motivo (solicitudes históricas de fotos) cae en el cajón de fotos', () => {
    expect(presetPorMotivo(undefined).kind).toBe(PRESET_FOTOS.kind)
  })

  it('los motivos elegibles no cruzan de cajón (la venta GN sale a nombre del preset)', () => {
    expect(motivosDe(PRESET_FOTOS)).toEqual(['Sesión de fotos'])
    expect(motivosDe(PRESET_INTERNAS)).not.toContain('Sesión de fotos')
    expect(motivosDe(PRESET_INTERNAS).length).toBe(MOTIVOS.length - 1)
  })
})

describe('solicitudes — quién pide', () => {
  it('piden Marketing, Administración, Dirección y los admins', () => {
    expect(puedePedir(perfil({ admin: true }))).toBe(true)
    expect(puedePedir(perfil({ funcion: ['marketing'] }))).toBe(true)
    expect(puedePedir(perfil({ funcion: ['administracion'] }))).toBe(true)
    expect(puedePedir(perfil({ funcion: ['direccion'] }))).toBe(true)
  })

  it('Local y Depósito ejecutan: no piden', () => {
    expect(puedePedir(perfil({ funcion: ['local'] }))).toBe(false)
    expect(puedePedir(perfil({ funcion: ['deposito'] }))).toBe(false)
    expect(puedePedir(perfil({ funcion: ['local', 'deposito'] }))).toBe(false)
  })

  it('quien tiene Local Y Marketing sí pide (la función que habilita gana)', () => {
    expect(puedePedir(perfil({ funcion: ['local', 'marketing'] }))).toBe(true)
  })

  it('sin función asignada sigue pudiendo (no dejamos gente afuera al deployar)', () => {
    expect(puedePedir(perfil())).toBe(true)
  })
})

describe('solicitudes — qué marcas ve cada uno', () => {
  it('Administración y Dirección ven las dos juntas', () => {
    expect(marcasQueVe(perfil({ funcion: ['administracion'] }), 'bdi', TODAS)).toEqual(TODAS)
    expect(marcasQueVe(perfil({ funcion: ['direccion'] }), 'bdi', TODAS)).toEqual(TODAS)
    expect(marcasQueVe(perfil({ admin: true }), 'zattia', TODAS)).toEqual(TODAS)
  })

  it('Local y Depósito ven SOLO la marca activa (están parados en un local)', () => {
    expect(marcasQueVe(perfil({ funcion: ['local'] }), 'zattia', TODAS)).toEqual(['zattia'])
    expect(marcasQueVe(perfil({ funcion: ['deposito'] }), 'bdi', TODAS)).toEqual(['bdi'])
  })

  it('Marketing ve la marca activa (trabaja por marca)', () => {
    expect(marcasQueVe(perfil({ funcion: ['marketing'] }), 'bdi', TODAS)).toEqual(['bdi'])
  })

  it('con marca fija, solo esa — aunque sea admin', () => {
    expect(marcasQueVe(perfil({ cuenta: 'zattia', admin: true }), 'bdi', TODAS)).toEqual(['zattia'])
  })
})
