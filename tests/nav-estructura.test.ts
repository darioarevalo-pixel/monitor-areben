import { describe, it, expect } from 'vitest'
import { keysDeCat, NAV_CATS, PERM_CAT, todasLasKeys, KEYS_SIN_PERMISO } from '@/lib/nav'

/**
 * Invariantes de la estructura del menú, ahora que `lib/nav.datos.ts` se edita a mano
 * (antes se generaba desde el index.html del legacy y el `--check` del generador hacía
 * de red).
 *
 * Estos tests son esa red: al mover una sección de grupo o crear un subgrupo, lo que
 * se rompe tiene que romperse acá y no en la cara del equipo — una key duplicada en
 * dos grupos, una sección sin área, o un subgrupo que deja una sección fuera del menú.
 */
describe('estructura del nav', () => {
  it('cada sección tiene un área y el área es un grupo real del nav', () => {
    const grupos = new Set(NAV_CATS.map((c) => c.id))
    for (const p of PERM_CAT) {
      expect(p.area, `la sección '${p.key}' no tiene área`).toBeTruthy()
      expect(grupos.has(p.area), `el área '${p.area}' de '${p.key}' no es un grupo del nav`).toBe(true)
    }
  })

  it('el área de una sección es uno de los grupos donde aparece en el menú', () => {
    // Una sección PUEDE colgar de varios sectores cuando es compartida — `solicitudes`
    // aparece en Local, Depósito, Marketing y Administración, con el rótulo de cada uno.
    // Lo que no puede es que su área no sea ninguno de esos lugares: el área es donde la
    // busca Config y de quién la hereda por función.
    const grupos = new Map<string, string[]>()
    for (const cat of NAV_CATS) {
      for (const key of keysDeCat(cat)) {
        grupos.set(key, [...(grupos.get(key) ?? []), cat.id])
      }
    }
    for (const [key, donde] of grupos) {
      const p = PERM_CAT.find((x) => x.key === key)
      if (!p) {
        expect(KEYS_SIN_PERMISO.has(key), `'${key}' está en el nav sin permiso ni excepción`).toBe(true)
        continue
      }
      expect(donde, `'${key}' cuelga de ${donde.join('/')} pero su área dice '${p.area}'`).toContain(p.area)
    }
  })

  it('una sección repetida en varios grupos tiene rótulo propio donde no es su área', () => {
    // Si `solicitudes` se llama igual en Marketing que en Administración, el sector no se
    // reconoce en el menú: por eso `NavCat.labels`. Se exige donde la sección es "prestada".
    const cuenta = NAV_CATS.flatMap(keysDeCat).reduce<Record<string, number>>((a, k) => ({ ...a, [k]: (a[k] || 0) + 1 }), {})
    for (const cat of NAV_CATS) {
      for (const key of keysDeCat(cat)) {
        const p = PERM_CAT.find((x) => x.key === key)
        if (!p || cuenta[key] < 2 || p.area === cat.id) continue
        expect(cat.labels?.[key], `'${key}' cuelga de '${cat.id}' sin rótulo propio`).toBeTruthy()
      }
    }
  })

  it('las keys del menú son keys válidas', () => {
    const validas = new Set(todasLasKeys())
    for (const key of NAV_CATS.flatMap(keysDeCat)) {
      expect(validas.has(key), `la key '${key}' del menú no existe`).toBe(true)
    }
  })

  it('keysDeCat incluye las de los subgrupos (si no, quedan fuera del menú)', () => {
    const cat = { id: 'x', label: 'X', keys: ['a'], grupos: [{ id: 'y', label: 'Y', keys: ['b', 'c'] }] }
    expect(keysDeCat(cat)).toEqual(['a', 'b', 'c'])
    expect(keysDeCat({ id: 'z', label: 'Z', keys: ['a'] })).toEqual(['a'])
  })
})
