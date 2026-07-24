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

  it('el área de una sección coincide con el grupo donde está en el menú', () => {
    // `resumen` es la excepción conocida: tiene área (Análisis) pero no está en el
    // menú — se llega por el Inicio. Si aparece en un grupo, tiene que ser el suyo.
    for (const cat of NAV_CATS) {
      for (const key of keysDeCat(cat)) {
        const p = PERM_CAT.find((x) => x.key === key)
        if (!p) {
          expect(KEYS_SIN_PERMISO.has(key), `'${key}' está en el nav sin permiso ni excepción`).toBe(true)
          continue
        }
        expect(p.area, `'${key}' está en el grupo '${cat.id}' pero su área dice '${p.area}'`).toBe(cat.id)
      }
    }
  })

  it('ninguna sección aparece en dos lugares del menú', () => {
    const vistas: string[] = NAV_CATS.flatMap(keysDeCat)
    const repetidas = vistas.filter((k, i) => vistas.indexOf(k) !== i)
    expect(repetidas).toEqual([])
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
