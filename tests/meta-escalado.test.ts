import { describe, expect, it } from 'vitest'
import {
  decidirEscalon,
  escalera,
  estaEsperando,
  faltanParaEscalar,
  HORAS_ESCALON_DEFECTO,
  HORAS_ESCALON_MINIMO,
  proximoEn,
  TOPE_ESCALONES,
  ultimoDiaCerrado,
} from '@/lib/meta-ads/escalado'
import { armarPlanEscalar, TIPOS_PASO, TIPOS_PLAN } from '@/lib/meta-ads/planes'
import { hayRacha, PASO_ESCALON, proximoDiario, ventanaDe, type FilaRegla, type Umbrales } from '@/lib/meta-ads/reglas'

/**
 * Los escalones son **lo único del módulo que sube plata sin que nadie esté mirando**. Todo lo demás
 * o propone, o lo aprieta una persona en el momento.
 *
 * Por eso lo que más se prueba acá no es que suba, sino **cuándo NO sube**, y en particular los dos
 * casos donde equivocarse cuesta plata todos los días hasta que alguien lo note:
 *
 * 1. **Sin foto no se sube.** Que el cron de las 06:30 falle no puede leerse como «viene bien».
 * 2. **El techo es el techo**, y se relee de la marca en cada escalón: bajarlo tiene que frenar lo
 *    que está en curso, no sólo lo que se arme después.
 *
 * Y uno donde equivocarse cuesta confianza: **frenar tiene que dejar un motivo escrito**. Un escalón
 * que no se dio y no dice por qué es indistinguible de uno que no corrió.
 */

const HOY = '2026-08-09'

const U: Umbrales = {
  roas_objetivo: 3,
  cpa_maximo: null,
  gasto_minimo: null,
  frecuencia_maxima: null,
  techo_diario_crudo: 2000000, // $20.000 por día
  dias_seguidos: 3,
}

function fila(over: Partial<FilaRegla> = {}): FilaRegla {
  return {
    fecha: HOY,
    nivel: 'conjunto',
    objeto_id: 'cj1',
    cuenta_id: '1145878766790149',
    nombre: 'GIRLHOOD FRIO - INTERESES 1',
    linea: 'bdi',
    estado: 'ACTIVE',
    estado_efectivo: 'ACTIVE',
    estado_real: null,
    diario_crudo: 600000,
    spend: 0,
    impresiones: 0,
    frecuencia: null,
    clicks: 0,
    compras: 0,
    revenue: 0,
    ...over,
  }
}

/** N días terminando en HOY, del más viejo al más nuevo. */
function dias(n: number, over: (i: number) => Partial<FilaRegla>): FilaRegla[] {
  return ventanaDe(HOY, n).reverse().map((fecha, i) => fila({ fecha, ...over(i) }))
}

/** Días con el ROAS que se le pida: gastó $1.000 y devolvió lo que haga falta. */
const conRoas = (n: number, roas: number) => dias(n, () => ({ spend: 1000, revenue: 1000 * roas }))

const pedido = (over: Record<string, unknown> = {}) => ({
  objetoId: 'cj1',
  nivel: 'conjunto' as const,
  diarioCrudo: 600000,
  filas: conRoas(7, 5),
  umbrales: U,
  hasta: HOY,
  ...over,
})

describe('escalera — la previsión', () => {
  it('sube de a 20% y se corta contra el techo en vez de pasarlo', () => {
    const v = escalera(1000000, 6, 1500000)
    expect(v[0]).toBe(1200000)
    expect(v[1]).toBe(1440000)
    // El último no es un 20%: es el pedacito que falta para llegar al tope.
    expect(v[2]).toBe(1500000)
    expect(v).toHaveLength(3)
  })

  it('devuelve menos escalones que los pedidos cuando el techo no da, y ninguno cuando ya llegó', () => {
    expect(escalera(1000000, 6, 1100000)).toEqual([1100000])
    expect(escalera(1500000, 6, 1500000)).toEqual([])
    expect(escalera(2000000, 6, 1500000)).toEqual([])
  })

  it('nunca pasa del tope de escalones ni acepta números raros', () => {
    expect(escalera(100000, 99, 99999999).length).toBeLessThanOrEqual(TOPE_ESCALONES)
    expect(escalera(0, 3, 1000000)).toEqual([])
    expect(escalera(100000, 0, 1000000)).toEqual([])
  })

  it('el paso es el mismo que usa el detector que propone escalar', () => {
    // Si el detector propusiera un 20% y la escalera armara otro, el plan no sería el que se ofreció.
    expect(proximoDiario(1000000, 99999999)).toBe(Math.round(1000000 * (1 + PASO_ESCALON)))
  })
})

describe('decidirEscalon — cuándo NO se sube', () => {
  it('🔴 sin foto de la ventana FRENA: no saber cómo viene no es venir bien', () => {
    const d = decidirEscalon(pedido({ filas: [] }))
    expect(d.seguir).toBe(false)
    expect(d.sinFoto).toBe(true)
    expect(d.motivo).toMatch(/no se puede saber cómo viene/i)
  })

  it('🔴 una foto de OTRO objeto tampoco alcanza', () => {
    const d = decidirEscalon(pedido({ filas: conRoas(7, 5).map((f) => ({ ...f, objeto_id: 'otro' })) }))
    expect(d.seguir).toBe(false)
    expect(d.sinFoto).toBe(true)
  })

  it('🔴 y una foto vieja tampoco: fuera de la ventana es como si no estuviera', () => {
    const viejas = conRoas(7, 5).map((f) => ({ ...f, fecha: '2026-06-01' }))
    expect(decidirEscalon(pedido({ filas: viejas })).sinFoto).toBe(true)
  })

  it('sin umbrales definidos frena y DICE cuáles faltan, en vez de usar un default', () => {
    const vacios = { ...U, roas_objetivo: null, techo_diario_crudo: null }
    const d = decidirEscalon(pedido({ umbrales: vacios }))
    expect(d.seguir).toBe(false)
    // Sin ninguna de las dos varas faltan las dos, y el cartel las junta con un «o».
    expect(d.faltan?.sort()).toEqual(['cpa_maximo', 'roas_objetivo', 'techo_diario_crudo'])
    expect(d.motivo).toMatch(/«CPA máximo» o «ROAS objetivo»/)
    expect(d.motivo).toMatch(/Techo del presupuesto/)
  })

  /**
   * 🔴🔑 **La vara del guardarraíl y la del detector son la misma función, y este caso es el que lo
   * amarra.** Si `decidirEscalon` cortara por ROAS mientras el Panel propone por costo, la marca que
   * tiene ficha y no tiene ROAS objetivo vería la propuesta de subir y el motor la saltearía
   * pidiendo un número que nadie eligió — el Panel ofreciendo y el motor frenando por una condición
   * que no se ve. Ver `hayRacha()`.
   */
  it('con el techo de la ficha cargado, la vara pasa a ser el COSTO y no pide ROAS objetivo', () => {
    const porCosto = { ...U, roas_objetivo: null, cpa_maximo: 4000 }
    // Compra a $2.000 —el 50% del techo— cinco días seguidos: pasa.
    const barata = dias(5, () => ({ spend: 2000, compras: 1, revenue: 8000 }))
    const d = decidirEscalon(pedido({ umbrales: porCosto, filas: barata }))
    expect(d.seguir).toBe(true)
    expect(d.evidencia.vara).toBe('costo')
    expect(d.motivo).toMatch(/techo/)
  })

  it('y frena por FALTA DE AIRE aunque no haya un solo día caro, diciendo cuál de las dos fue', () => {
    const porCosto = { ...U, roas_objetivo: null, cpa_maximo: 4000 }
    // 95% del techo todos los días: ningún día «caro», y aun así no se le sube.
    const justa = dias(5, () => ({ spend: 3800, compras: 1, revenue: 8000 }))
    const d = decidirEscalon(pedido({ umbrales: porCosto, filas: justa }))
    expect(d.seguir).toBe(false)
    expect(d.evidencia.con_aire).toBe(false)
    expect(d.motivo).toMatch(/debajo del \d+% del techo/)
  })

  it('🔴 el techo se respeta contra el diario RELEÍDO, no contra el del plan', () => {
    // Alguien lo subió a mano en Ads Manager por encima del techo entre un escalón y el otro.
    const d = decidirEscalon(pedido({ diarioCrudo: 2500000 }))
    expect(d.seguir).toBe(false)
    expect(d.llegoAlTecho).toBe(true)
    // 🔑 La frase, y no sólo la bandera: **el techo está guardado dos veces** —el chequeo de arriba y
    // el `proximoDiario()` que devuelve `null`—, y sin fijar el texto una mutación que borra el
    // primero pasa en verde. Lo que se pierde ahí no es la seguridad sino la explicación: «ya está en
    // el techo, la escalada terminó» y «subirle el 20% lo dejaría donde está» no se leen igual.
    expect(d.motivo).toMatch(/La escalada terminó acá/)
  })

  it('bajar el techo de la marca frena una escalada en curso', () => {
    const antes = decidirEscalon(pedido())
    expect(antes.seguir).toBe(true)
    const despues = decidirEscalon(pedido({ umbrales: { ...U, techo_diario_crudo: 500000 } }))
    expect(despues.seguir).toBe(false)
    expect(despues.llegoAlTecho).toBe(true)
  })

  it('sin racha frena y el motivo trae los DOS números: los que pedía y los que lleva', () => {
    const d = decidirEscalon(pedido({ filas: conRoas(7, 1.2) }))
    expect(d.seguir).toBe(false)
    expect(d.motivo).toMatch(/3 días seguidos/)
    expect(d.evidencia.dias_seguidos).toBe(0)
    expect(d.evidencia.piden).toBe(3)
  })

  it('una racha cortada AYER no habilita el escalón de hoy', () => {
    // Cinco días buenos y el último malo: la racha se cuenta desde el final.
    const filas = conRoas(6, 5)
    filas[filas.length - 1] = { ...filas[filas.length - 1], revenue: 500 }
    const d = decidirEscalon(pedido({ filas }))
    expect(d.seguir).toBe(false)
    expect(d.evidencia.dias_seguidos).toBe(0)
  })

  it('un día sin gasto CORTA la racha en vez de saltearse', () => {
    const filas = conRoas(6, 5)
    filas[3] = { ...filas[3], spend: 0, revenue: 0 }
    const d = decidirEscalon(pedido({ filas }))
    // Quedan 2 días buenos después del hueco, y pedía 3.
    expect(d.evidencia.dias_seguidos).toBe(2)
    expect(d.seguir).toBe(false)
  })

  it('sin diario propio (CBO) frena y lo dice sin hablar de rendimiento', () => {
    const d = decidirEscalon(pedido({ diarioCrudo: 0 }))
    expect(d.seguir).toBe(false)
    expect(d.motivo).toMatch(/hereda de su campaña/i)
  })

  it('🔑 TODO freno deja un motivo escrito: un escalón mudo no se puede discutir', () => {
    const casos = [
      pedido({ filas: [] }),
      pedido({ diarioCrudo: 0 }),
      pedido({ diarioCrudo: 2500000 }),
      pedido({ filas: conRoas(7, 1) }),
      pedido({ umbrales: { ...U, roas_objetivo: null } }),
    ]
    for (const c of casos) {
      const d = decidirEscalon(c)
      expect(d.seguir).toBe(false)
      expect(d.motivo.length, JSON.stringify(c.umbrales)).toBeGreaterThan(20)
    }
  })
})

describe('decidirEscalon — cuando sí', () => {
  it('sube el 20% partiendo del diario releído y devuelve de cuánto a cuánto', () => {
    const d = decidirEscalon(pedido())
    expect(d.seguir).toBe(true)
    expect(d.desdeCrudo).toBe(600000)
    expect(d.aCrudo).toBe(720000)
    expect(d.motivo).toMatch(/días seguidos por encima/)
  })

  it('🔴 parte de lo que dice META, no de lo que decía la foto ni el plan', () => {
    // La foto dice 600.000; Meta contesta 900.000 porque alguien lo movió a mano.
    const d = decidirEscalon(pedido({ diarioCrudo: 900000 }))
    expect(d.desdeCrudo).toBe(900000)
    expect(d.aCrudo).toBe(1080000)
  })

  it('el último escalón corta contra el techo y no lo pasa', () => {
    const d = decidirEscalon(pedido({ diarioCrudo: 1900000 }))
    expect(d.seguir).toBe(true)
    expect(d.aCrudo).toBe(2000000)
    expect(d.aCrudo!).toBeLessThanOrEqual(U.techo_diario_crudo!)
  })

  it('la evidencia guarda con qué se decidió, para poder revisarlo después', () => {
    const d = decidirEscalon(pedido())
    expect(d.evidencia.roas_objetivo).toBe(3)
    expect(d.evidencia.dias_seguidos).toBeGreaterThanOrEqual(3)
    expect(d.evidencia.techo_diario_crudo).toBe(2000000)
  })

  it('🔑 dice lo mismo que la racha que mira el detector: una sola cuenta, no dos', () => {
    const filas = conRoas(7, 5)
    const racha = hayRacha(filas, U)
    expect(decidirEscalon(pedido({ filas })).evidencia.dias_seguidos).toBe(racha.seguidos)
  })
})

/**
 * 🔴 **El defecto que 33 tests en verde no vieron y que apareció a la primera corrida contra la
 * pauta real** (9-ago-2026). Todas las series de arriba terminan en un día completo; las de verdad
 * terminan en el día EN CURSO, que la foto escribe a las 06:30 con lo poquito que se juntó.
 *
 * Con ese día adentro, la racha —que se cuenta desde el día más nuevo hacia atrás— cortaba siempre
 * en cero: **ningún conjunto de la cuenta pasaba el guardarraíl, ni con el ROAS objetivo en 1,5×**.
 * La función entera estaba muerta y en verde.
 */
describe('🔴 el día en curso no cuenta', () => {
  // La serie de «TEST BROAD BDI» tal como estaba el 9-ago a las 17 h, redondeada. El último día
  // gastó $335 contra los ~$2.700 de un día normal, y todavía no registró una sola venta.
  const REAL = [
    { fecha: '2026-08-03', spend: 2739, revenue: 21584 },
    { fecha: '2026-08-04', spend: 2428, revenue: 123477 },
    { fecha: '2026-08-05', spend: 2228, revenue: 0 },
    { fecha: '2026-08-06', spend: 2739, revenue: 98571 },
    { fecha: '2026-08-07', spend: 3308, revenue: 81935 },
    { fecha: '2026-08-08', spend: 2560, revenue: 39332 },
    // 👇 el día en curso, a medio juntar
    { fecha: '2026-08-09', spend: 335, revenue: 0 },
  ].map((d) => fila(d))

  it('ultimoDiaCerrado devuelve AYER, nunca hoy', () => {
    expect(ultimoDiaCerrado(Date.parse('2026-08-09T17:00:00Z'))).toBe('2026-08-08')
    // Y aguanta el cruce de mes sin ayuda.
    expect(ultimoDiaCerrado(Date.parse('2026-09-01T02:00:00Z'))).toBe('2026-08-31')
  })

  it('con el día en curso adentro, un conjunto de 22× da racha 0 y NO sube', () => {
    const d = decidirEscalon(pedido({ filas: REAL, hasta: '2026-08-09' }))
    expect(d.seguir).toBe(false)
    expect(d.evidencia.dias_seguidos).toBe(0)
  })

  it('✅ cortando en el último día cerrado, el mismo conjunto pasa', () => {
    const d = decidirEscalon(pedido({ filas: REAL, hasta: ultimoDiaCerrado(Date.parse('2026-08-09T17:00:00Z'))! }))
    expect(d.seguir).toBe(true)
    // Tres días seguidos por encima de 3×: el 6, el 7 y el 8. El 5 (revenue 0) corta la racha.
    expect(d.evidencia.dias_seguidos).toBe(3)
  })
})

describe('el tiempo entre escalones', () => {
  it('se cuenta desde AHORA, así un plan que esperó tres días no vence tres escalones de golpe', () => {
    const ahora = Date.parse('2026-08-09T10:00:00Z')
    expect(proximoEn(ahora, 24)).toBe('2026-08-10T10:00:00.000Z')
  })

  it('no se puede pedir menos que el mínimo: un escalón sin un día no deja ver el anterior', () => {
    const ahora = Date.parse('2026-08-09T10:00:00Z')
    const t = Date.parse(proximoEn(ahora, 1)!)
    expect((t - ahora) / 3600000).toBe(HORAS_ESCALON_MINIMO)
  })

  it('sin horas usa el defecto', () => {
    const ahora = Date.parse('2026-08-09T10:00:00Z')
    const t = Date.parse(proximoEn(ahora)!)
    expect((t - ahora) / 3600000).toBe(HORAS_ESCALON_DEFECTO)
  })

  it('estaEsperando mira el futuro y acepta las dos grafías (base y pantalla)', () => {
    const ahora = Date.parse('2026-08-09T10:00:00Z')
    expect(estaEsperando({ proximo_en: '2026-08-10T10:00:00Z' }, ahora)).toBe(true)
    expect(estaEsperando({ proximoEn: '2026-08-10T10:00:00Z' }, ahora)).toBe(true)
    expect(estaEsperando({ proximo_en: '2026-08-08T10:00:00Z' }, ahora)).toBe(false)
    expect(estaEsperando({ proximo_en: null }, ahora)).toBe(false)
  })
})

describe('armarPlanEscalar', () => {
  const base = { objetoId: '120200', nivel: 'conjunto', nombre: 'INTERESES 1', desdeCrudo: 1000000, escalones: 3, techoCrudo: 1500000 }

  it('arma un paso por escalón, todos de tipo escalon y sin marca', () => {
    const r = armarPlanEscalar(base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pasos).toHaveLength(3)
    for (const p of r.pasos) {
      expect(p.tipo).toBe('escalon')
      // No crea nada: no hay nombre donde anotar una marca ni nada que sondear.
      expect(p.marca).toBeNull()
    }
    expect(r.pasos[0].rotulo).toMatch(/Escalón 1 de 3/)
  })

  it('🔑 nace con los escalones que ENTRAN, no con los que se pidieron', () => {
    // De 1.000.000 al techo de 1.100.000 entra uno solo: el plan tiene que verse posible al mirarlo,
    // no descubrirse imposible al ejecutarlo con cuatro pasos que dicen todos lo mismo.
    const r = armarPlanEscalar({ ...base, escalones: 5, techoCrudo: 1100000 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.pasos).toHaveLength(1)
    expect(r.previsto?.recortada).toBe(true)
  })

  it('el valor de cada paso es una PREVISIÓN y está marcado como tal', () => {
    const r = armarPlanEscalar(base)
    if (!r.ok) return
    expect(r.pasos[0].pedido?.previstoCrudo).toBe(1200000)
    expect(r.previsto?.valores).toEqual([1200000, 1440000, 1500000])
  })

  it('sin techo no arma nada: «subí mientras aguante» sin freno no es un plan', () => {
    const r = armarPlanEscalar({ ...base, techoCrudo: 0 })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(409)
    expect(r.error).toMatch(/techo/i)
  })

  it('rechaza lo que no se puede escalar: sin diario propio, ya en el techo, o fuera de rango', () => {
    expect(armarPlanEscalar({ ...base, desdeCrudo: 0 }).ok).toBe(false)
    expect(armarPlanEscalar({ ...base, desdeCrudo: 1500000 }).ok).toBe(false)
    expect(armarPlanEscalar({ ...base, escalones: 0 }).ok).toBe(false)
    expect(armarPlanEscalar({ ...base, escalones: TOPE_ESCALONES + 1 }).ok).toBe(false)
    expect(armarPlanEscalar({ ...base, objetoId: 'no-numerico' }).ok).toBe(false)
    expect(armarPlanEscalar({ ...base, nivel: 'aviso' }).ok).toBe(false)
  })

  it('las horas nunca bajan del mínimo, aunque se pidan menos', () => {
    const r = armarPlanEscalar({ ...base, horas: 1 })
    if (!r.ok) return
    expect(r.previsto?.horas).toBe(HORAS_ESCALON_MINIMO)
  })
})

describe('la forma del tipo de paso y del tipo de plan', () => {
  it('el escalón es reintentable y no crea nada: un valor absoluto se repite sin consecuencia', () => {
    expect(TIPOS_PASO.escalon.reintentable).toBe(true)
    expect(TIPOS_PASO.escalon.crea).toBe(false)
    expect(TIPOS_PASO.escalon.guardarrail).toBe(true)
  })

  it('🔑 escalar pide el MISMO permiso que la acción que ejecuta, igual que mover plata', () => {
    expect(TIPOS_PLAN.escalar.sub).toBe('presupuesto')
    expect(TIPOS_PLAN.escalar.sub).toBe(TIPOS_PLAN['mover-plata'].sub)
  })

  it('el guardarraíl pide exactamente los umbrales del preset que propone escalar', () => {
    expect(faltanParaEscalar({}).sort()).toEqual(['cpa_maximo', 'roas_objetivo', 'techo_diario_crudo'])
    expect(faltanParaEscalar(U)).toEqual([])
  })
})
