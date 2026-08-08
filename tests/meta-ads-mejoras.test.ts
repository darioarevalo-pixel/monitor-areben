import { describe, expect, it } from 'vitest'
import { bloqueoDeLaCopia, copiaCondenada } from '@/lib/meta-ads/mejoras'
import type { AvisoMejoras, RespuestaMejoras } from '@/lib/meta-ads/tipos'

/**
 * ¿Meta va a aceptar esta copia?
 *
 * Los casos salen de lo MEDIDO en prod el 8-ago-2026 sobre las 6 campañas que entregan (55 avisos):
 * 31 llevan el campo `standard_enhancements` que Meta deprecó y 24 no, **y los dos tipos se crearon
 * el mismo día** —así que no hay ninguna regla temporal de la que agarrarse—. Un solo aviso con el
 * campo tumba la copia entera, y por eso el conteo por conjunto es lo único que decide.
 */

const aviso = (o: Partial<AvisoMejoras>): AvisoMejoras => ({
  id: '1',
  nombre: 'AD 01',
  conjunto: 'cj-1',
  estado: 'ACTIVE',
  creativo: 'cr-1',
  creado: '2026-08-07T12:00:00+0000',
  obsoleto: false,
  enroll: null,
  spec: { creative_features_spec: {} },
  ...o,
})

/** Un aviso como los 31 que llevan el campo: el `enroll` no cambia el veredicto, la presencia sí. */
const conElCampo = (o: Partial<AvisoMejoras> = {}) => aviso({
  obsoleto: true,
  enroll: 'OPT_IN',
  spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_IN' } } },
  ...o,
})

const respuesta = (ads: AvisoMejoras[], sinSpec: string | null = null) => ({
  ok: true as const,
  dato: {
    campania: '120238908991840478',
    ads,
    conjuntos: [],
    creativosConsultados: ads.length,
    creativosTotales: ads.length,
    sinSpec,
  } as RespuestaMejoras,
})

describe('el corte es por conjunto, que es lo que se duplica', () => {
  it('🔑 un conjunto LIMPIO dentro de una campaña sucia no se marca como imposible', () => {
    // Es el caso real que salió bien: `TEST INTERESES 1 (6) BDI - 7/8` es limpio y está en una
    // campaña donde otros conjuntos llevan el campo. Contar los de la campaña lo condenaría.
    const r = respuesta([
      aviso({ id: '1', conjunto: 'limpio' }),
      conElCampo({ id: '2', conjunto: 'sucio' }),
      conElCampo({ id: '3', conjunto: 'sucio' }),
    ])
    const b = bloqueoDeLaCopia('conjunto', 'limpio', r)
    expect(b).toMatchObject({ fase: 'ok', avisos: 1, obsoletos: 0, pasaElTope: false })
    expect(copiaCondenada(b)).toBe(false)
  })

  it('duplicar la CAMPAÑA sí cuenta los avisos de todos sus conjuntos', () => {
    const r = respuesta([
      aviso({ id: '1', conjunto: 'limpio' }),
      conElCampo({ id: '2', conjunto: 'sucio' }),
    ])
    const b = bloqueoDeLaCopia('campania', '120238908991840478', r)
    expect(b).toMatchObject({ fase: 'ok', avisos: 2, obsoletos: 1 })
    expect(copiaCondenada(b)).toBe(true)
  })

  it('un solo aviso con el campo alcanza para condenar la copia', () => {
    const r = respuesta([
      aviso({ id: '1', conjunto: 'cj' }),
      aviso({ id: '2', conjunto: 'cj' }),
      conElCampo({ id: '3', conjunto: 'cj', nombre: 'HOT SALE - TIKTOK' }),
    ])
    const b = bloqueoDeLaCopia('conjunto', 'cj', r)
    expect(b).toMatchObject({ fase: 'ok', avisos: 3, obsoletos: 1, nombres: ['HOT SALE - TIKTOK'] })
    expect(copiaCondenada(b)).toBe(true)
  })

  it('⚠️ sin avisos la copia sale siempre: no hay ningún anuncio que crear', () => {
    const b = bloqueoDeLaCopia('conjunto', 'vacio', respuesta([conElCampo({ conjunto: 'otro' })]))
    expect(b).toMatchObject({ fase: 'ok', avisos: 0, obsoletos: 0 })
    expect(copiaCondenada(b)).toBe(false)
  })
})

describe('el `OPT_OUT` cuenta igual, y es a propósito', () => {
  it('la PRESENCIA del campo condena, esté prendido o apagado', () => {
    // Meta no dice «está prendido»: dice «incluir el campo quedó obsoleto». La diferencia no se pudo
    // medir (no hay conjunto con todos sus avisos en OPT_OUT, y duplicar no existe a nivel aviso),
    // así que se avisa de más en vez de prometer que va a salir.
    const apagado = conElCampo({
      enroll: 'OPT_OUT',
      spec: { creative_features_spec: { standard_enhancements: { enroll_status: 'OPT_OUT' } } },
    })
    expect(bloqueoDeLaCopia('conjunto', 'cj-1', respuesta([apagado]))).toMatchObject({ obsoletos: 1 })
  })
})

describe('el tope de la vía síncrona', () => {
  it('más de 3 avisos: el servidor lo rechaza antes de tocar Meta', () => {
    const ads = [1, 2, 3, 4].map((n) => aviso({ id: String(n), conjunto: 'cj' }))
    const b = bloqueoDeLaCopia('conjunto', 'cj', respuesta(ads))
    expect(b).toMatchObject({ fase: 'ok', avisos: 4, obsoletos: 0, pasaElTope: true })
    // Condena aunque ningún creativo tenga el campo: es el otro motivo, y desde afuera se ven igual.
    expect(copiaCondenada(b)).toBe(true)
  })

  it('exactamente 3 entran', () => {
    const ads = [1, 2, 3].map((n) => aviso({ id: String(n), conjunto: 'cj' }))
    expect(bloqueoDeLaCopia('conjunto', 'cj', respuesta(ads))).toMatchObject({ pasaElTope: false })
  })
})

describe('lo que NO se sabe no se cuenta como limpio', () => {
  it('🔴 si Meta no devolvió los creativos, contesta «no se sabe» y no «se puede copiar»', () => {
    // Sin el spec, `obsoleto` es false para todos: dar eso por bueno sería decir que la copia va a
    // salir sin haber mirado nada.
    const ciego = aviso({ spec: null })
    const b = bloqueoDeLaCopia('conjunto', 'cj-1', respuesta([ciego], '(#100) Tried accessing nonexisting field'))
    expect(b.fase).toBe('sin-datos')
    expect(copiaCondenada(b)).toBe(false)
  })

  it('un spec faltante suelto (sin error de Meta) se cuenta pero no tapa el veredicto', () => {
    const r = respuesta([aviso({ id: '1', conjunto: 'cj' }), aviso({ id: '2', conjunto: 'cj', spec: null })])
    expect(bloqueoDeLaCopia('conjunto', 'cj', r)).toMatchObject({ fase: 'ok', avisos: 2, sinSpec: 1 })
  })

  it('si la lectura falló, se dice el motivo y duplicar sigue habilitado', () => {
    const b = bloqueoDeLaCopia('conjunto', 'cj', { ok: false, motivo: 'HTTP 502' })
    expect(b.fase).toBe('sin-datos')
    expect(copiaCondenada(b)).toBe(false)
  })

  it('un aviso no se duplica, así que no se le contesta con un número', () => {
    expect(bloqueoDeLaCopia('aviso', 'x', respuesta([]))).toMatchObject({ fase: 'sin-datos' })
  })
})
