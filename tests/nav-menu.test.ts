import { describe, it, expect } from 'vitest'
import { DETALLE_DE, puedeVer, puedeVerPropio, type Perfil } from '@/lib/permisos'
import { catsVisibles, keysDeCat, NAV_CATS, todasLasKeys } from '@/lib/nav'

const perfil = (over: Partial<Perfil> = {}): Perfil => ({
  name: 'Ana',
  admin: false,
  cuenta: null,
  acceso: { bdi: {}, zattia: {} },
  funcion: [],
  ...over,
})

const grupos = (p: Perfil | null, marca: 'bdi' | 'zattia' = 'zattia') => catsVisibles(p, marca).map((c) => c.id)
const keysDe = (p: Perfil | null, id: string, marca: 'bdi' | 'zattia' = 'zattia') =>
  catsVisibles(p, marca).find((c) => c.id === id)?.keys ?? []

/**
 * ── La puerta de Marketing (5-sep-2026) ──
 *
 * `sesion-fotos` volvió a ser una entrada del menú, y **sólo de Marketing**. El problema que este
 * archivo vigila es que el permiso para ABRIR esa pantalla lo tienen además Depósito, Local y
 * Administración —lo heredan de `solicitudes` por `DETALLE_DE`, que es lo que hace andar el botón
 * «Ver» de la lista unificada— así que preguntar con `puedeVer` les habría hecho aparecer un grupo
 * «Marketing» entero, de un solo renglón, en sidebars donde hoy no existe.
 *
 * 🔴 **No hay ningún test que renderice el Sidebar**: la lógica vive en `lib/nav.ts` como función
 * pura y acá es donde se sostiene. Si alguien vuelve `keyVisibleEnMenu` a `puedeVer`, se pone rojo.
 */
describe('nav — el menú pregunta por lo PROPIO, no por lo que puede abrir', () => {
  it('Depósito, Local y Administración ⛔ no ven el grupo Marketing', () => {
    expect(grupos(perfil({ funcion: ['deposito'] }))).not.toContain('marketing')
    expect(grupos(perfil({ funcion: ['local'] }))).not.toContain('marketing')
    expect(grupos(perfil({ funcion: ['administracion'] }))).not.toContain('marketing')
  })

  it('Marketing sí, y «Sesión de fotos» es su PRIMER renglón: es la puerta', () => {
    const u = perfil({ funcion: ['marketing'] })
    expect(grupos(u)).toContain('marketing')
    expect(keysDe(u, 'marketing')[0]).toBe('sesion-fotos')
  })

  /**
   * Las dos mitades de la misma decisión, juntas a propósito: el botón «Ver» de Depósito sigue
   * entrando a la pantalla, y el menú sigue sin mostrársela. Separadas, la próxima persona
   * "arregla" una y rompe la otra sin enterarse.
   */
  it('Depósito ABRE /sesion-fotos por el botón «Ver», pero ⛔ no la ve en el menú', () => {
    const u = perfil({ funcion: ['deposito'] })
    expect(puedeVer(u, 'zattia', 'sesion-fotos')).toBe(true)
    expect(puedeVerPropio(u, 'zattia', 'sesion-fotos')).toBe(false)
  })

  it('quien la tiene tildada a mano y sin función, la ve igual (compatibilidad)', () => {
    const u = perfil({ acceso: { bdi: { 'sesion-fotos': true }, zattia: {} } })
    expect(keysDe(u, 'marketing', 'bdi')).toContain('sesion-fotos')
  })

  it('el admin la ve, y una excepción de Config se la saca también del menú', () => {
    expect(keysDe(perfil({ admin: true }), 'marketing')).toContain('sesion-fotos')
    const recortado = perfil({ admin: true, acceso: { bdi: {}, zattia: { '-sesion-fotos': true } } })
    expect(keysDe(recortado, 'marketing')).not.toContain('sesion-fotos')
  })
})

/**
 * La red que evita que las dos funciones de permiso se separen sin que nadie lo note: `puedeVer`
 * y `puedeVerPropio` salen del MISMO cuerpo y sólo pueden diferir en las keys de `DETALLE_DE`.
 */
describe('nav — puedeVerPropio sólo se aparta en el detalle', () => {
  const PERFILES = [
    perfil({ funcion: ['deposito'] }),
    perfil({ funcion: ['local'] }),
    perfil({ funcion: ['marketing'] }),
    perfil({ funcion: ['administracion'] }),
    perfil({ funcion: ['direccion'] }),
    perfil(),
  ]

  it('contestan lo mismo en todas las keys que ⛔ no son detalle de otra', () => {
    const keys = todasLasKeys().filter((k) => !(k in DETALLE_DE))
    const distintas = keys.filter((k) =>
      PERFILES.some((p) => puedeVer(p, 'zattia', k) !== puedeVerPropio(p, 'zattia', k)),
    )
    expect(distintas).toEqual([])
  })

  it('y la diferencia existe justo donde tiene que existir', () => {
    const u = perfil({ funcion: ['deposito'] })
    for (const k of Object.keys(DETALLE_DE)) {
      expect(puedeVer(u, 'zattia', k)).toBe(true)
      expect(puedeVerPropio(u, 'zattia', k)).toBe(false)
    }
  })

  /**
   * ⚠️ Lo que hace falta acordarse: hoy `sesion-fotos` es la ÚNICA key de `DETALLE_DE` que está en
   * el menú. El día que entre `solicitudes-internas`, esta lista crece y hay que decidir de quién
   * es esa puerta — que crezca no es un problema, que crezca sin que nadie lo sepa, sí.
   */
  it('las keys de DETALLE_DE que están en el menú son UNA, y a propósito', () => {
    const enMenu = Object.keys(DETALLE_DE).filter((k) => NAV_CATS.some((c) => keysDeCat(c).includes(k)))
    expect(enMenu).toEqual(['sesion-fotos'])
  })
})
