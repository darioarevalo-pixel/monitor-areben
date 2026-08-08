import { describe, expect, it } from 'vitest'
import { KEYS_CROSS_MARCA, KEYS_SIN_PERMISO, PERM_CAT } from '@/lib/nav'

/**
 * `KEYS_CROSS_MARCA` son las secciones cuyo eje **no es la marca del sidebar** (hoy: Meta Ads, donde
 * una cuenta publicitaria trae dos marcas). El guard de `page.tsx` y el filtro del `Sidebar` les
 * preguntan si el perfil tiene la sección en ALGUNA marca, en vez de en la que está parado.
 *
 * 🔑 **Eso relaja el guard, así que el Set tiene que ser chico y verificable.** Estos casos son lo
 * que impide que se convierta en una puerta de atrás: una key acá adentro sigue exigiendo permiso —
 * lo que cambia es en qué marca se lo pregunta.
 */
describe('las secciones cuyo eje no es la marca', () => {
  it('todas existen en PERM_CAT: no se puede colar una key inventada', () => {
    const keys = new Set(PERM_CAT.map((p) => p.key))
    for (const k of KEYS_CROSS_MARCA) expect(keys.has(k)).toBe(true)
  })

  it('todas tienen más de una marca, o el cruce no significa nada', () => {
    // Con una sola marca, «tenerla en alguna» y «tenerla en esta» son lo mismo: la key estaría en el
    // Set por costumbre y no por necesidad, y el día que alguien la lea creería que hay un motivo.
    for (const k of KEYS_CROSS_MARCA) {
      const p = PERM_CAT.find((x) => x.key === k)
      expect(p?.brands.length ?? 0).toBeGreaterThan(1)
    }
  })

  it('⛔ ninguna es una sección SIN permiso: eso sería saltearse el guard, no cambiarle el eje', () => {
    for (const k of KEYS_CROSS_MARCA) expect(KEYS_SIN_PERMISO.has(k)).toBe(false)
  })

  it('es una excepción, no la regla', () => {
    // Si esto crece, el problema deja de ser Meta Ads y pasa a ser que la marca del sidebar no es el
    // eje de la app. Ahí se cambia el modelo, no se suma otra key.
    expect(KEYS_CROSS_MARCA.size).toBeLessThanOrEqual(3)
  })
})
