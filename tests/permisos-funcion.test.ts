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

  it('quien tenía Sesión de fotos entra a Solicitudes (la sección que la absorbió)', () => {
    const u = perfil({ acceso: { bdi: { 'sesion-fotos': true }, zattia: {} } })
    expect(puedeVer(u, 'bdi', 'solicitudes')).toBe(true)
    expect(puedeVer(u, 'zattia', 'solicitudes')).toBe(false) // sigue siendo por marca
    const i = perfil({ acceso: { bdi: {}, zattia: { 'solicitudes-internas': true } } })
    expect(puedeVer(i, 'zattia', 'solicitudes')).toBe(true)
  })

  it('sin función ni permiso, no ve nada', () => {
    expect(puedeVer(perfil(), 'bdi', 'cupones')).toBe(false)
    expect(puedeVer(null, 'bdi', 'cupones')).toBe(false)
  })

  /**
   * 🔴 Meta salió de adentro de Marketing y pasó a ser área propia (`meta`) el 9-ago-2026.
   *
   * Mover el área es quitar el acceso: `seccionesDeFuncion()` expande por área, así que si la
   * función `marketing` no lista también `'meta'`, todo el equipo de marketing pierde Meta de un
   * deploy para el otro. No se leería como un permiso faltante sino como «Meta desapareció», que
   * es la clase de bug que nadie reporta bien.
   *
   * 🔑 Y **el espejo `PERM_CAT.area` ↔ `SECCION_AREA` no lo caza**: las dos dirían `'meta'`
   * felizmente. Por eso el test va acá, contra el efecto —quién la ve— y no contra la estructura.
   */
  it('quien tiene la función marketing sigue viendo Meta después de sacarla de Marketing', () => {
    const u = perfil({ funcion: ['marketing'] })
    expect(puedeVer(u, 'bdi', 'meta-ads')).toBe(true)
    expect(puedeVer(u, 'zattia', 'meta-ads')).toBe(true)
    // Y no perdió nada de lo que ya tenía en su área vieja.
    expect(puedeVer(u, 'bdi', 'canjes')).toBe(true)
    expect(puedeVer(u, 'bdi', 'calendario')).toBe(true)
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
