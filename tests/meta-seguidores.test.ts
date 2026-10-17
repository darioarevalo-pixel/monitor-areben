import { describe, it, expect } from 'vitest'
import { metricasDe, RE_SEGUIDOR, RE_PERFIL, CAMPOS_INSIGHTS } from '@/lib/meta-ads/metricas'

/**
 * 🔴 El caso que motivó todo, medido el 18-sep-2026 sobre `TRAFICO - STUNNED - PERFIL IG - 12/9`.
 *
 * La pantalla mostraba «14 seguidores · $1.773 cada uno» y los dos números eran falsos: lo que
 * contaba eran **«me gusta» de publicación**, porque `RE_SEGUIDOR` cerraba con `(^|\.)like$` y el
 * `action_type` `like` a secas entra por ahí. Los seguidores reales de la ventana fueron **+56**.
 *
 * Éstas son las acciones que la cuenta `4366752500136303` devolvió de verdad en esa ventana: ⛔ no
 * hay NINGUNA de seguimiento ni de visita al perfil.
 */
const ACCIONES_REALES = [
  { action_type: 'like', value: '14' },
  { action_type: 'link_click', value: '538' },
  { action_type: 'post_reaction', value: '31' },
  { action_type: 'onsite_conversion.post_net_like', value: '9' },
  { action_type: 'onsite_conversion.post_unlike', value: '2' },
  { action_type: 'page_engagement', value: '620' },
  { action_type: 'video_view', value: '1204' },
]

describe('qué cuenta el monitor como un seguidor', () => {
  it('⛔ NO cuenta el «me gusta» de publicación: `like` pelado no es un seguimiento', () => {
    expect(RE_SEGUIDOR.test('like')).toBe(false)
  })

  it('⛔ tampoco los parientes del me gusta', () => {
    for (const t of ['post_reaction', 'onsite_conversion.post_net_like', 'onsite_conversion.post_unlike']) {
      expect(RE_SEGUIDOR.test(t)).toBe(false)
    }
  })

  it('✅ sí cuenta el seguimiento, lo llame Meta como lo llame', () => {
    for (const t of ['follow', 'ig_follow', 'onsite_conversion.follow', 'page_like']) {
      expect(RE_SEGUIDOR.test(t)).toBe(true)
    }
  })

  it('sobre las acciones REALES de la campaña de Stunned, seguidores da 0 y ⛔ no 14', () => {
    const m = metricasDe({ spend: '24826.4', actions: ACCIONES_REALES })
    expect(m.seguidores).toBe(0)
    expect(m.perfil).toBe(0)
  })

  it('🔑 un 0 acá es «Meta no lo trajo», ⛔ no «no hubo»: la pantalla lo dibuja como «Sin visitas ni seguidores»', () => {
    // El cero es el estado honesto justamente porque ninguna acción de perfil viene en el array.
    expect(ACCIONES_REALES.some((a) => RE_PERFIL.test(a.action_type))).toBe(false)
    expect(ACCIONES_REALES.some((a) => RE_SEGUIDOR.test(a.action_type))).toBe(false)
  })
})

describe('los campos propios de insights (medido el 16-oct-2026)', () => {
  it('✅ `instagram_profile_follow` e `instagram_profile_visits` mandan sobre `actions`', () => {
    const m = metricasDe({ spend: '10362', actions: ACCIONES_REALES, instagram_profile_follow: '38', instagram_profile_visits: '254' })
    expect(m.seguidores).toBe(38)
    expect(m.perfil).toBe(254)
  })

  it('🔑 se piden: sin el campo en CAMPOS_INSIGHTS la foto lo deja en 0 callado', () => {
    expect(CAMPOS_INSIGHTS.split(',')).toEqual(expect.arrayContaining(['instagram_profile_follow', 'instagram_profile_visits']))
  })
})
