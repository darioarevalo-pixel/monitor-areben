import { describe, it, expect } from 'vitest'
import { ACCESO_POR_FUNCION, estaExcluido, funcionQueDa, marcaExcluir, puedeSub, puedeVer, seccionesDeFuncion, type Perfil } from '@/lib/permisos'
import { PERM_CAT } from '@/lib/nav'

const perfil = (over: Partial<Perfil> = {}): Perfil => ({
  name: 'Ana',
  admin: false,
  cuenta: null,
  acceso: { bdi: {}, zattia: {} },
  funcion: [],
  ...over,
})

/**
 * La precedencia de `puedeVer` es la garantía de que activar las funciones no le sacó
 * el acceso a nadie: el permiso tildado sigue mandando sobre la ausencia de función, y
 * lo único que le gana a una función es la excepción explícita.
 */
describe('permisos — precedencia de puedeVer', () => {
  it('el admin ve todo, aun con excepción puesta', () => {
    const u = perfil({ admin: true, acceso: { bdi: { [marcaExcluir('reposicion')]: true }, zattia: {} } })
    expect(puedeVer(u, 'bdi', 'reposicion')).toBe(true)
  })

  it('el permiso tildado sigue valiendo (compatibilidad: nadie pierde acceso)', () => {
    const u = perfil({ acceso: { bdi: { reposicion: true }, zattia: {} } })
    expect(puedeVer(u, 'bdi', 'reposicion')).toBe(true)
    expect(puedeVer(u, 'zattia', 'reposicion')).toBe(false) // el permiso es por marca
  })

  it('la función alcanza sin tildar nada', () => {
    const u = perfil({ funcion: ['local'] })
    expect(puedeVer(u, 'bdi', 'cupones')).toBe(true) // área local
    expect(puedeVer(u, 'bdi', 'postventa')).toBe(false) // área administración
  })

  it('la excepción le gana a la función, y solo en su marca', () => {
    const u = perfil({ funcion: ['local'], acceso: { bdi: { [marcaExcluir('cupones')]: true }, zattia: {} } })
    expect(puedeVer(u, 'bdi', 'cupones')).toBe(false)
    expect(puedeVer(u, 'zattia', 'cupones')).toBe(true)
    expect(estaExcluido(u, 'bdi', 'cupones')).toBe(true)
  })

  it('sin función ni permiso, no ve nada', () => {
    expect(puedeVer(perfil(), 'bdi', 'cupones')).toBe(false)
    expect(puedeVer(null, 'bdi', 'cupones')).toBe(false)
  })
})

describe('permisos — qué da cada función', () => {
  it('cada función apunta a áreas que existen en el nav', () => {
    const areas = new Set(PERM_CAT.map((p) => p.area))
    for (const [f, cfg] of Object.entries(ACCESO_POR_FUNCION)) {
      for (const a of cfg.areas) expect(areas.has(a), `la función '${f}' apunta al área inexistente '${a}'`).toBe(true)
      for (const k of cfg.keys ?? []) expect(PERM_CAT.some((p) => p.key === k), `la función '${f}' apunta a la sección inexistente '${k}'`).toBe(true)
    }
  })

  it('Local trae lo del local y Administración lo suyo (incluida Reposición, que se mudó)', () => {
    expect(seccionesDeFuncion('local')).toContain('etiquetas')
    expect(seccionesDeFuncion('administracion')).toContain('reposicion')
    expect(seccionesDeFuncion('administracion')).toContain('caducados')
    expect(seccionesDeFuncion('local')).not.toContain('reposicion')
  })

  it('las tres funciones que ejecutan solicitudes las ven', () => {
    for (const f of ['marketing', 'deposito', 'administracion'] as const) {
      expect(seccionesDeFuncion(f)).toContain('solicitudes')
    }
  })

  it('funcionQueDa dice por qué función llega (para explicarlo en Config)', () => {
    expect(funcionQueDa(perfil({ funcion: ['local'] }), 'cupones')).toBe('local')
    expect(funcionQueDa(perfil({ funcion: ['local'] }), 'postventa')).toBeNull()
  })

  it('los sub-permisos NUNCA vienen por función (son las acciones sensibles)', () => {
    const u = perfil({ funcion: ['local'] })
    expect(puedeVer(u, 'bdi', 'conteo')).toBe(true)
    expect(puedeSub(u, 'bdi', 'conteo', 'aplicar')).toBe(false) // aplicar el ajuste de stock, no
    expect(puedeSub(u, 'bdi', 'cupones', 'crear')).toBe(false)
  })
})
