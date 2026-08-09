import { describe, expect, it } from 'vitest'
import { cotejar, cotejarCuerpo, igual, quizasJson, sinDiferencias } from '@/lib/meta-ads/cotejo'
import type { CuerpoReceta } from '@/lib/meta-ads/receta'

/**
 * Estos tests existen para una sola cosa: **probar que el cotejo sabe dar ROJO.**
 *
 * `scripts/crear-y-borrar-meta.mjs` crea un conjunto de verdad y le pregunta a este módulo si quedó
 * como se pidió. Un módulo que devolviera «sin diferencias» siempre pasaría el ensayo con cualquier
 * defecto adentro y nadie se enteraría — que es exactamente lo que advierte
 * `feedback_areben_ensayo_verde_con_defecto`. Por eso casi todos los casos de acá **mutan el objeto
 * que Meta devuelve** y exigen que la diferencia aparezca, con su ruta.
 */

/** El cuerpo del POST tal como sale de `recetaDeConjunto()` para un conjunto real de la pauta. */
const CUERPO: CuerpoReceta = {
  targeting: JSON.stringify({
    age_min: 18,
    age_max: 65,
    geo_locations: { countries: ['AR'] },
    publisher_platforms: ['facebook', 'instagram'],
    instagram_positions: ['stream', 'story', 'reels', 'explore_home', 'explore'],
  }),
  billing_event: 'IMPRESSIONS',
  optimization_goal: 'OFFSITE_CONVERSIONS',
  bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  daily_budget: '600000',
  promoted_object: JSON.stringify({ pixel_id: '506190972387584', custom_event_type: 'PURCHASE' }),
  attribution_spec: JSON.stringify([{ event_type: 'CLICK_THROUGH', window_days: 7 }]),
}

/**
 * Lo que Meta devuelve al releer el conjunto creado: lo pedido **más** lo que normaliza y completa.
 * Los agregados son reales — Meta expande `geo_locations`, reordena los emplazamientos y suma
 * campos que nadie mandó.
 */
const LEIDO: Record<string, unknown> = {
  id: '120251117342370999',
  name: 'ENSAYO borrar · GIRLHOOD FRIO',
  status: 'PAUSED',
  created_time: '2026-08-09T12:00:00-0300',
  targeting: {
    age_min: 18,
    age_max: 65,
    geo_locations: { countries: ['AR'], location_types: ['home', 'recent'] },
    publisher_platforms: ['instagram', 'facebook'],
    instagram_positions: ['explore', 'explore_home', 'reels', 'story', 'stream'],
    brand_safety_content_filter_levels: ['FACEBOOK_STANDARD', 'AN_STANDARD'],
    targeting_automation: { advantage_audience: 0 },
  },
  billing_event: 'IMPRESSIONS',
  optimization_goal: 'OFFSITE_CONVERSIONS',
  bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  daily_budget: '600000',
  promoted_object: { pixel_id: '506190972387584', custom_event_type: 'PURCHASE' },
  attribution_spec: [{ event_type: 'CLICK_THROUGH', window_days: 7 }],
}

/** Meta devuelto con un cambio puesto a mano: la mutación que el cotejo tiene que cazar. */
const con = (cambios: Record<string, unknown>) => ({ ...structuredClone(LEIDO), ...cambios })

describe('el caso bueno', () => {
  it('un conjunto que quedó como se pidió no tiene faltas ni cambios', () => {
    const dif = cotejarCuerpo(CUERPO, LEIDO)
    expect(dif.falta).toEqual([])
    expect(dif.cambio).toEqual([])
    expect(sinDiferencias(dif)).toBe(true)
  })

  it('lo que Meta agrega por su cuenta se informa aparte y NO cuenta como defecto', () => {
    const dif = cotejarCuerpo(CUERPO, LEIDO)
    const rutas = dif.agrega.map((a) => a.ruta)
    expect(rutas).toContain('targeting.brand_safety_content_filter_levels')
    expect(rutas).toContain('targeting.geo_locations.location_types')
    // ⛔ Los campos del objeto que nunca se pidieron (`created_time`, `id`, …) no son diferencias:
    // el cotejo recorre las claves del CUERPO, no las de la relectura.
    expect(rutas).not.toContain('created_time')
    expect(sinDiferencias(dif)).toBe(true)
  })

  it('el orden de un array de primitivas no es una diferencia: Meta reordena y no significa nada', () => {
    expect(igual(['facebook', 'instagram'], ['instagram', 'facebook'])).toBe(true)
    expect(igual(['a', 'b'], ['a', 'b', 'c'])).toBe(false)
    expect(igual(['a', 'b'], ['a', 'c'])).toBe(false)
  })

  it('un número devuelto como texto es el mismo número: así escribe la Graph', () => {
    expect(igual('600000', 600000)).toBe(true)
    expect(igual('600000', '600001')).toBe(false)
  })
})

describe('las mutaciones: el cotejo tiene que dar ROJO', () => {
  it('un campo pedido que Meta no guardó sale como FALTA, con su ruta', () => {
    const roto = con({})
    delete (roto.targeting as Record<string, unknown>).instagram_positions
    const dif = cotejarCuerpo(CUERPO, roto)
    expect(sinDiferencias(dif)).toBe(false)
    expect(dif.falta.map((f) => f.ruta)).toEqual(['targeting.instagram_positions'])
  })

  it('un presupuesto que Meta aceptó y guardó distinto sale como CAMBIO, con los dos valores', () => {
    const dif = cotejarCuerpo(CUERPO, con({ daily_budget: '150038' }))
    expect(sinDiferencias(dif)).toBe(false)
    expect(dif.cambio).toEqual([{ ruta: 'daily_budget', pedido: '600000', quedo: '150038' }])
  })

  it('el píxel cambiado se caza adentro del objeto anidado', () => {
    const roto = con({})
    ;(roto.promoted_object as Record<string, unknown>).pixel_id = '1234567890'
    const dif = cotejarCuerpo(CUERPO, roto)
    expect(dif.cambio.map((c) => c.ruta)).toEqual(['promoted_object.pixel_id'])
  })

  it('un emplazamiento de menos NO pasa: el largo del array manda antes que el contenido', () => {
    const roto = con({})
    ;(roto.targeting as Record<string, unknown>).instagram_positions = ['stream', 'story', 'reels', 'explore_home']
    const dif = cotejarCuerpo(CUERPO, roto)
    expect(dif.cambio.map((c) => c.ruta)).toEqual(['targeting.instagram_positions'])
  })

  it('la ventana de atribución cambiada se caza, y el array se reporta entero', () => {
    // Un array se compara y se reporta COMO UN TODO: la ruta es `attribution_spec` y no
    // `attribution_spec.0.window_days`. Con uno o dos elementos, ver los dos arrays enteros dice más
    // que un índice — y evita tener que decidir qué es «el mismo elemento» cuando el orden cambia.
    const dif = cotejarCuerpo(CUERPO, con({ attribution_spec: [{ event_type: 'CLICK_THROUGH', window_days: 1 }] }))
    expect(dif.cambio).toHaveLength(1)
    expect(dif.cambio[0].ruta).toBe('attribution_spec')
    expect(dif.cambio[0].quedo).toEqual([{ event_type: 'CLICK_THROUGH', window_days: 1 }])
  })

  it('un campo que vuelve vacío o nulo es una FALTA, no un cambio a vacío', () => {
    expect(cotejarCuerpo(CUERPO, con({ bid_strategy: null })).falta.map((f) => f.ruta)).toEqual(['bid_strategy'])
    expect(cotejarCuerpo(CUERPO, con({ bid_strategy: '' })).falta.map((f) => f.ruta)).toEqual(['bid_strategy'])
    expect(cotejarCuerpo(CUERPO, {}).falta).toHaveLength(Object.keys(CUERPO).length)
  })

  it('una rama entera que no volvió se reporta UNA vez, no hijo por hijo', () => {
    const roto = con({})
    delete (roto.targeting as Record<string, unknown>).geo_locations
    const dif = cotejarCuerpo(CUERPO, roto)
    expect(dif.falta.map((f) => f.ruta)).toEqual(['targeting.geo_locations'])
  })

  it('el objetivo de optimización cambiado —lo que más caro sale— no pasa desapercibido', () => {
    const dif = cotejarCuerpo(CUERPO, con({ optimization_goal: 'LINK_CLICKS' }))
    expect(dif.cambio).toEqual([
      { ruta: 'optimization_goal', pedido: 'OFFSITE_CONVERSIONS', quedo: 'LINK_CLICKS' },
    ])
  })
})

describe('el JSON que viaja adentro de un string', () => {
  it('el targeting se manda serializado y vuelve como objeto: se compara parseado', () => {
    // Sin el parseo, este caso daría «cambió» siempre y el ensayo sería un rojo permanente.
    const dif = cotejarCuerpo({ targeting: JSON.stringify({ age_min: 18 }) }, { targeting: { age_min: 18 } })
    expect(sinDiferencias(dif)).toBe(true)
  })

  it('un string que no es JSON se deja como está en vez de romper', () => {
    expect(quizasJson('IMPRESSIONS')).toBe('IMPRESSIONS')
    expect(quizasJson('{ roto')).toBe('{ roto')
    expect(quizasJson('{"a":1}')).toEqual({ a: 1 })
    expect(quizasJson(7)).toBe(7)
  })
})

describe('cotejar suelto', () => {
  it('compara dos valores planos y nombra la ruta cuando la hay', () => {
    expect(cotejar('a', 'a').cambio).toEqual([])
    expect(cotejar('a', 'b').cambio).toEqual([{ ruta: '(valor)', pedido: 'a', quedo: 'b' }])
    expect(cotejar('a', 'b', 'campo').cambio).toEqual([{ ruta: 'campo', pedido: 'a', quedo: 'b' }])
  })

  it('un objeto contra algo que no es objeto es un cambio, no una recorrida', () => {
    const dif = cotejar({ a: 1 }, 'texto', 'x')
    expect(dif.cambio).toHaveLength(1)
    expect(dif.falta).toEqual([])
  })
})
