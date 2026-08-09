import { describe, expect, it } from 'vitest'
import {
  conDiario,
  corregirTargeting,
  escalonesDeDiario,
  esRechazoDePresupuesto,
  minimoDeMensaje,
  recetaDeConjunto,
  tieneValor,
  VALIDAR_SOLO,
  type ConjuntoLeido,
} from '@/lib/meta-ads/receta'
import { armarPlanDuplicar } from '@/lib/meta-ads/planes'

/** La huella exacta que rompe `/copies` en la pauta real, medida el 9-ago-2026. */
const IG_ROTO = ['stream', 'story', 'reels', 'explore_home', 'profile_feed', 'ig_search']

const CONJUNTO: ConjuntoLeido = {
  id: '120251117342370478',
  name: 'GIRLHOOD FRIO - INTERESES 1 - 7/8',
  campaign_id: '120238696262900478',
  account_id: '1145878766790149',
  daily_budget: '600000',
  billing_event: 'IMPRESSIONS',
  optimization_goal: 'OFFSITE_CONVERSIONS',
  bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
  destination_type: 'UNDEFINED',
  pacing_type: ['standard'],
  start_time: '2026-08-07T17:58:14-0300',
  promoted_object: { pixel_id: '767249510732891', custom_event_type: 'PURCHASE', smart_pse_enabled: false },
  attribution_spec: [{ event_type: 'CLICK_THROUGH', window_days: 7 }],
  targeting: { geo_locations: { countries: ['AR'] }, publisher_platforms: ['instagram'], instagram_positions: IG_ROTO },
}

const ok = <T,>(r: { ok: true } & T | { ok: false; status: number; error: string }) => {
  if (!r.ok) throw new Error(`esperaba que armara y falló: ${r.error}`)
  return r
}

describe('corregirTargeting', () => {
  it('agrega «explore» cuando está «explore_home» y falta, y lo dice', () => {
    const r = corregirTargeting({ instagram_positions: IG_ROTO })
    expect(r.targeting.instagram_positions).toContain('explore')
    expect(r.notas.join(' ')).toMatch(/Explorar/)
  })

  it('NO toca un conjunto que ya tiene los dos', () => {
    const ya = ['stream', 'explore', 'explore_home']
    const r = corregirTargeting({ instagram_positions: ya })
    expect(r.targeting.instagram_positions).toEqual(ya)
    expect(r.notas).toEqual([])
  })

  it('NO agrega «explore» a uno que no tiene «explore_home»', () => {
    const r = corregirTargeting({ instagram_positions: ['stream', 'story'] })
    expect(r.targeting.instagram_positions).not.toContain('explore')
  })

  it('saca el campo que Meta eliminó y que la copia arrastraba', () => {
    const r = corregirTargeting({ targeting_optimization: 'none', geo_locations: { countries: ['AR'] } })
    expect(r.targeting.targeting_optimization).toBeUndefined()
    expect(r.targeting.geo_locations).toEqual({ countries: ['AR'] })
    expect(r.notas.join(' ')).toMatch(/targeting_optimization/)
  })

  it('no muta el targeting que recibe', () => {
    const original = { instagram_positions: [...IG_ROTO] }
    corregirTargeting(original)
    expect(original.instagram_positions).toEqual(IG_ROTO)
  })
})

describe('recetaDeConjunto', () => {
  it('🔴 NUNCA manda un sentinela: «UNDEFINED» es la forma en que Meta escribe «no está puesto»', () => {
    const r = ok(recetaDeConjunto(CONJUNTO))
    expect(r.cuerpo.destination_type).toBeUndefined()
    expect(Object.values(r.cuerpo)).not.toContain('UNDEFINED')
    expect(Object.values(r.cuerpo)).not.toContain('NONE')
  })

  it('sí manda el destination_type cuando es un valor de verdad', () => {
    const r = ok(recetaDeConjunto({ ...CONJUNTO, destination_type: 'INSTAGRAM_PROFILE' }))
    expect(r.cuerpo.destination_type).toBe('INSTAGRAM_PROFILE')
  })

  it('⛔ no decide el nombre, la campaña ni el estado: eso es del motor', () => {
    const r = ok(recetaDeConjunto(CONJUNTO))
    expect(r.cuerpo.name).toBeUndefined()
    expect(r.cuerpo.campaign_id).toBeUndefined()
    expect(r.cuerpo.status).toBeUndefined()
  })

  it('⛔ no copia el start_time del original, que está en el pasado', () => {
    const r = ok(recetaDeConjunto(CONJUNTO))
    expect(r.cuerpo.start_time).toBeUndefined()
  })

  it('el promoted_object va por lista blanca: lo que sólo se lee no se devuelve', () => {
    const r = ok(recetaDeConjunto(CONJUNTO))
    const po = JSON.parse(r.cuerpo.promoted_object)
    expect(po).toEqual({ pixel_id: '767249510732891', custom_event_type: 'PURCHASE' })
    expect(po.smart_pse_enabled).toBeUndefined()
  })

  it('lleva el targeting ya corregido', () => {
    const r = ok(recetaDeConjunto(CONJUNTO))
    expect(JSON.parse(r.cuerpo.targeting).instagram_positions).toContain('explore')
    expect(r.notas.length).toBe(1)
  })

  it('copia el diario tal cual: subirlo es una decisión que se toma después y contra Meta', () => {
    const r = ok(recetaDeConjunto(CONJUNTO))
    expect(r.cuerpo.daily_budget).toBe('600000')
  })

  it('sin presupuesto propio no inventa uno: la campaña es CBO y la plata vive arriba', () => {
    const r = ok(recetaDeConjunto({ ...CONJUNTO, daily_budget: undefined }))
    expect(r.cuerpo.daily_budget).toBeUndefined()
    expect(r.cuerpo.lifetime_budget).toBeUndefined()
  })

  it('🔴 un presupuesto TOTAL con la fecha de fin vencida NO se arma: hay que decidirla', () => {
    const r = recetaDeConjunto({
      ...CONJUNTO, daily_budget: undefined, lifetime_budget: '500000', end_time: '2024-06-07T21:45:35-0300',
    }, Date.parse('2026-08-09T12:00:00Z'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
  })

  it('un presupuesto TOTAL con fecha futura sí se arma, y se lleva la fecha', () => {
    const r = ok(recetaDeConjunto({
      ...CONJUNTO, daily_budget: undefined, lifetime_budget: '500000', end_time: '2026-12-01T00:00:00-0300',
    }, Date.parse('2026-08-09T12:00:00Z')))
    expect(r.cuerpo.lifetime_budget).toBe('500000')
    expect(r.cuerpo.end_time).toBe('2026-12-01T00:00:00-0300')
  })
})

describe('tieneValor', () => {
  it('trata los sentinelas de Meta como vacío', () => {
    expect(tieneValor('UNDEFINED')).toBe(false)
    expect(tieneValor('NONE')).toBe(false)
    expect(tieneValor('')).toBe(false)
    expect(tieneValor(null)).toBe(false)
    expect(tieneValor('IMPRESSIONS')).toBe(true)
    // ⚠️ El 0 es un valor: un `bid_amount` de cero no es lo mismo que uno sin poner.
    expect(tieneValor(0)).toBe(true)
  })
})

describe('esRechazoDePresupuesto', () => {
  it('lo reconoce por el subcódigo', () => {
    expect(esRechazoDePresupuesto({ error_subcode: 1885272, error_user_msg: 'lo que sea' })).toBe(true)
  })

  it('lo reconoce por el campo culpable', () => {
    expect(esRechazoDePresupuesto({ error_data: '{"blame_field_specs":[["daily_budget"]]}' })).toBe(true)
  })

  it('🔴 NO lo reconoce por el texto: el idioma del mensaje depende del token', () => {
    expect(esRechazoDePresupuesto({ error_user_msg: 'El presupuesto es demasiado bajo' })).toBe(false)
  })

  it('un rechazo de otra cosa no es de presupuesto', () => {
    expect(esRechazoDePresupuesto({ error_subcode: 1885183, error_data: '{"blame_field_specs":[["targeting"]]}' })).toBe(false)
    expect(esRechazoDePresupuesto(null)).toBe(false)
    expect(esRechazoDePresupuesto({ error_data: 'no es json' })).toBe(false)
  })
})

describe('minimoDeMensaje', () => {
  it('lee el importe que escribió Meta en es-AR', () => {
    expect(minimoDeMensaje('El presupuesto debe ser de más de $1.500,38.')).toBe(150038)
  })

  it('y el mismo importe en en-US, que es como llega con otro token', () => {
    expect(minimoDeMensaje('The budget must be more than $1,500.38.')).toBe(150038)
  })

  it('un importe sin decimales también sale en la unidad menor', () => {
    expect(minimoDeMensaje('más de $30.007')).toBe(3000700)
  })

  it('sin número devuelve null, y ahí el escalón siguiente se encarga', () => {
    expect(minimoDeMensaje('Presupuesto demasiado bajo')).toBeNull()
    expect(minimoDeMensaje('')).toBeNull()
  })
})

describe('escalonesDeDiario', () => {
  it('🔑 van de MENOR a MAYOR: la copia nace lo más parecida posible al original', () => {
    const e = escalonesDeDiario('más de $1.500,38', { minDiarioAlto: 375095, minDiarioCrudo: 3000755 })
    expect(e).toEqual([150038, 375095, 3000755])
  })

  it('sin número en el mensaje, quedan los dos que declara la cuenta', () => {
    expect(escalonesDeDiario('Presupuesto demasiado bajo', { minDiarioAlto: 375095, minDiarioCrudo: 3000755 }))
      .toEqual([375095, 3000755])
  })

  it('no repite un escalón que ya estaba', () => {
    expect(escalonesDeDiario('más de $3.750,95', { minDiarioAlto: 375095, minDiarioCrudo: 3000755 }))
      .toEqual([375095, 3000755])
  })
})

describe('conDiario', () => {
  it('sube y lo dice con los dos números', () => {
    const r = conDiario({ daily_budget: '150000' }, 150038)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.cuerpo.daily_budget).toBe('150038')
      expect(r.nota).toContain('150038')
      expect(r.nota).toMatch(/PAUSADA/)
    }
  })

  it('⛔ nunca BAJA un presupuesto: sólo existe para subir al mínimo', () => {
    expect(conDiario({ daily_budget: '600000' }, 150038).ok).toBe(false)
  })

  it('no le pone diario a un conjunto que no tiene (CBO)', () => {
    expect(conDiario({}, 150038).ok).toBe(false)
  })
})

describe('VALIDAR_SOLO', () => {
  it('es el parámetro que convierte el POST en una pregunta', () => {
    expect(JSON.parse(VALIDAR_SOLO.execution_options)).toEqual(['validate_only'])
  })
})

describe('armarPlanDuplicar con receta', () => {
  const receta = { cuerpo: { targeting: '{}', daily_budget: '600000' }, notas: [] }
  const base = {
    nivel: 'conjunto', objetoId: '111', cuentaId: '999', campaignId: '222',
    nombreOriginal: 'GIRLHOOD FRIO', copias: 1, censo: { avisos: [] }, receta,
  }

  it('el paso del conjunto ya NO es una copia: se crea desde la receta', () => {
    const r = ok(armarPlanDuplicar(base, ' · #abc1234'))
    expect(r.pasos[0].tipo).toBe('crear-conjunto')
    expect(r.pasos.some((p) => p.tipo === 'copiar-conjunto')).toBe(false)
    expect((r.pasos[0].pedido as Record<string, unknown>).cuerpo).toEqual(receta.cuerpo)
  })

  it('🔴 sin receta no arma nada: un conjunto sin configuración nace vacío', () => {
    const r = armarPlanDuplicar({ ...base, receta: null }, ' · #abc1234')
    expect(r.ok).toBe(false)
  })

  it('el paso lleva su marca, que es lo que permite adoptar en vez de reintentar', () => {
    const r = ok(armarPlanDuplicar(base, ' · #abc1234'))
    expect(r.pasos[0].marca).toBe(' · #abc1234-1')
  })

  it('una campaña arma un crear-conjunto por cada conjunto del censo', () => {
    const r = ok(armarPlanDuplicar({
      ...base, nivel: 'campania', objetoId: '222',
      censo: { conjuntos: [{ id: 'a', nombre: 'A', receta, avisos: [] }, { id: 'b', nombre: 'B', receta, avisos: [] }] },
      receta: null,
    }, ' · #abc1234'))
    expect(r.pasos.filter((p) => p.tipo === 'crear-conjunto')).toHaveLength(2)
  })
})
