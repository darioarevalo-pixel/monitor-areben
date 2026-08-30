/**
 * La zona de Rendimiento. Lo que se fija acá es lo que decide plata:
 *
 *  1. **La FIRMA del desgaste** — CTR abajo con el CPM plano es la PIEZA; con el CPM arriba es la
 *     SUBASTA. Es el mutante que hay que ver caer: dar vuelta esas dos ramas hace que la pantalla
 *     diga «está caro Meta» justo donde el problema es el creativo, que es la conclusión cómoda y
 *     la equivocada.
 *  2. **El día en curso no entra.** El corte de las 20:00 escribe la fila de HOY a medias.
 *  3. **`SIN-COMPRAS` con el techo pasado es un ALTO probado**, no «todavía no sé».
 *  4. **Sin techo no se juzga.** ⛔ No se inventa un default.
 *  5. **El embudo vacío es `null`, nunca `0`.**
 */
import { describe, expect, it } from 'vitest'
import {
  CONV_APRENDIZAJE, DIAS_SERVIBLES, aprendizajeDe, armarZona, avisosPorCelda,
  celdasDeLaFoto, concentracionDe, desdeDe, desgasteDe, elegirCierre, elegirVentana, enVentana,
  fusionarVivo, ordenarCeldas, ultimoDiaCerrado, VENTANAS_ZONA, ventanaZona, veredictoDeCelda,
} from '@/lib/meta-ads/rendimiento'
import type { Celda, CeldaViva } from '@/lib/meta-ads/rendimiento'
import { sumarDias } from '@/lib/meta-ads/snapshot'

/** Una fila de la foto, con lo mínimo. `capturado_at` un día después ⇒ el día está CERRADO. */
function fila(over: Record<string, unknown> = {}) {
  const fecha = String(over.fecha ?? '2026-08-20')
  return {
    fecha,
    nivel: 'conjunto',
    objeto_id: 'a1',
    campaign_id: 'c1',
    adset_id: 'a1',
    nombre: 'CELDA',
    linea: 'bdi',
    estado_real: 'entregando',
    diario_crudo: 1000000,
    capturado_at: `${desdeDe(fecha, 0)}T10:00:00Z`.replace(fecha, sig(fecha)),
    spend: 1000,
    impresiones: 10000,
    clicks: 100,
    compras: 1,
    revenue: 3000,
    carritos: 10,
    checkouts: 5,
    lpv: 50,
    ...over,
  }
}
const sig = (f: string) => new Date(Date.parse(`${f}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
/** N días de una celda, del más viejo al más nuevo. */
function serie(n: number, desde: string, over: (i: number) => Record<string, unknown> = () => ({})) {
  return Array.from({ length: n }, (_, i) => {
    const fecha = new Date(Date.parse(`${desde}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10)
    return fila({ fecha, capturado_at: `${sig(fecha)}T10:00:00Z`, ...over(i) })
  })
}

describe('el día en curso', () => {
  it('un día capturado el mismo día NO cuenta como cerrado', () => {
    const filas = [
      fila({ fecha: '2026-08-24', capturado_at: '2026-08-25T10:00:00Z' }),
      fila({ fecha: '2026-08-25', capturado_at: '2026-08-25T20:00:00Z' }),
    ]
    expect(ultimoDiaCerrado(filas)).toBe('2026-08-24')
  })

  it('sin ninguna captura posterior no inventa un cierre', () => {
    expect(ultimoDiaCerrado([fila({ fecha: '2026-08-25', capturado_at: '2026-08-25T20:00:00Z' })])).toBe(null)
    expect(ultimoDiaCerrado([])).toBe(null)
  })

  it('🔴 el día parcial queda AFUERA de los totales de la zona', () => {
    const filas = [
      ...serie(2, '2026-08-23').map((f) => ({ ...f, nivel: 'campania', objeto_id: 'c1' })),
      // el día en curso, a medias, capturado hoy mismo
      { ...fila({ fecha: '2026-08-25', capturado_at: '2026-08-25T20:00:00Z', spend: 400 }), nivel: 'campania', objeto_id: 'c1' },
    ]
    const z = armarZona({ filas, techo: 5000, ventana: 2 })
    expect(z.hasta).toBe('2026-08-24')
    // 2 días × 1000, sin los 400 de hoy
    expect(z.totales.spend).toBe(2000)
  })
})

describe('la firma del desgaste', () => {
  const catorce = (ctrCae: boolean, cpmSube: boolean) =>
    serie(14, '2026-08-11', (i) => {
      const nueva = i >= 7
      return {
        impresiones: 10000,
        clicks: nueva && ctrCae ? 50 : 100,
        spend: nueva && cpmSube ? 1500 : 1000,
      }
    }).map((f) => ({
      fecha: f.fecha, spend: f.spend, clicks: f.clicks, impresiones: f.impresiones, compras: 1, diarioCrudo: 1000000,
    }))

  it('🔑 CTR abajo con el CPM plano ⇒ es la PIEZA', () => {
    const d = desgasteDe(catorce(true, false), 7)
    expect(d.firma).toBe('pieza')
    expect(d.ctrDelta).toBeCloseTo(-50, 5)
    expect(d.cpmDelta).toBeCloseTo(0, 5)
  })

  it('🔑 CTR abajo con el CPM ARRIBA ⇒ es la SUBASTA', () => {
    const d = desgasteDe(catorce(true, true), 7)
    expect(d.firma).toBe('subasta')
    expect(d.cpmDelta).toBeCloseTo(50, 5)
  })

  it('el CTR que no cae es sano, aunque el CPM suba', () => {
    expect(desgasteDe(catorce(false, true), 7).firma).toBe('sano')
  })

  it('un CPM que BAJA no exculpa a la pieza: la subasta se abarató y la respuesta cayó igual', () => {
    const filas = catorce(true, false).map((f, i) => ({ ...f, spend: i >= 7 ? 500 : 1000 }))
    const d = desgasteDe(filas, 7)
    expect(d.cpmDelta).toBeLessThan(0)
    expect(d.firma).toBe('pieza')
  })

  it('sin dos ventanas completas dice por qué, ⛔ no inventa una firma', () => {
    const d = desgasteDe(catorce(true, false).slice(-8), 7)
    expect(d.firma).toBe('sin-datos')
    expect(d.motivo).toContain('14')
    expect(d.ctrDelta).toBe(null)
  })

  it('una mitad sin impresiones es «sin datos», ⛔ no un CTR de 0% que se lee como derrumbe', () => {
    const filas = catorce(false, false).map((f, i) => (i >= 7 ? { ...f, impresiones: 0, clicks: 0 } : f))
    const d = desgasteDe(filas, 7)
    expect(d.firma).toBe('sin-datos')
    expect(d.motivo).toContain('nueva')
  })
})

describe('el aprendizaje', () => {
  it('calcula el presupuesto que pide: 50 × CPA ÷ 7', () => {
    const c = celdasDeLaFoto(serie(7, '2026-08-18', () => ({ spend: 1400, compras: 1 })))[0]
    const a = aprendizajeDe(c)
    expect(a.convSemana).toBe(7)
    expect(a.faltan).toBe(CONV_APRENDIZAJE - 7)
    expect(a.cruza).toBe(false)
    // CPA = 9800/7 = 1400 ⇒ 50 × 1400 / 7 = 10.000
    expect(a.pide).toBeCloseTo(10000, 5)
  })

  it('🔴 marca el día en que el presupuesto cambió: ahí arrancó de cero el contador', () => {
    const c = celdasDeLaFoto(serie(7, '2026-08-18', (i) => ({ diario_crudo: i < 4 ? 1000000 : 1200000 })))[0]
    expect(aprendizajeDe(c).reiniciadoEl).toBe('2026-08-22')
  })

  it('un `null` al lado de un número ⛔ no es un cambio de presupuesto', () => {
    const c = celdasDeLaFoto(serie(7, '2026-08-18', (i) => ({ diario_crudo: i < 4 ? null : 1000000 })))[0]
    expect(aprendizajeDe(c).reiniciadoEl).toBe(null)
  })

  it('sin CPA medido el presupuesto que pide es `null`, ⛔ no 0', () => {
    const c = celdasDeLaFoto(serie(7, '2026-08-18', () => ({ compras: 0 })))[0]
    expect(aprendizajeDe(c).pide).toBe(null)
  })
})

describe('el veredicto de una celda', () => {
  const base = (over: Record<string, unknown> = {}) => celdasDeLaFoto(serie(7, '2026-08-18', () => over))[0]

  it('compra arriba del techo ⇒ ALTO y propone pausar, con el número al lado', () => {
    const c = base({ spend: 2000, compras: 1 })
    const v = veredictoDeCelda(c, { techo: 1000 })
    expect(v.clase).toBe('alto')
    expect(v.accion).toBe('pausar')
    expect(v.porque[0]).toContain('2000')
    expect(v.porque[0]).toContain('1000')
  })

  it('🔑 gastó más que el techo y compró CERO ⇒ es un alto probado, ⛔ no «midiendo»', () => {
    const c = base({ spend: 2000, compras: 0 })
    const v = veredictoDeCelda(c, { techo: 1000 })
    expect(v.clase).toBe('alto')
    expect(v.accion).toBe('pausar')
    expect(v.porque[0]).toContain('no compró NADA')
  })

  it('gastó MENOS que el techo y sin comprar ⇒ todavía no se puede juzgar', () => {
    const c = base({ spend: 100, compras: 0 })
    expect(veredictoDeCelda(c, { techo: 100000 }).clase).toBe('midiendo')
  })

  it('⛔ sin techo cargado no juzga ni inventa un default', () => {
    const v = veredictoDeCelda(base({ spend: 2000, compras: 1 }), { techo: 0 })
    expect(v.clase).toBe('sin-techo')
    expect(v.accion).toBe('mirar')
  })

  it('prendida y sin avisos gana a todo: es plata que creés que trabaja', () => {
    const c = base({ estado_real: 'sin-avisos', spend: 5000, compras: 0 })
    expect(veredictoDeCelda(c, { techo: 1000 }).clase).toBe('rota')
  })

  it('rinde y usa su diario ⇒ propone escalar', () => {
    // diario 1.000 (100000 crudo), gasta 990/día ⇒ 99% ; costo 495 sobre techo 1000 ⇒ 49%
    const c = base({ spend: 990, compras: 2, diario_crudo: 100000 })
    const v = veredictoDeCelda(c, { techo: 1000 })
    expect(v.clase).toBe('escalar')
    expect(v.accion).toBe('escalar')
  })

  it('🔑 rinde pero NO usa su diario ⇒ ok, y dice que subirle el techo no le manda un peso', () => {
    const c = base({ spend: 500, compras: 2, diario_crudo: 100000 })
    const v = veredictoDeCelda(c, { techo: 1000 })
    expect(v.clase).toBe('ok')
    expect(v.accion).toBe(null)
    expect(v.porque.join(' ')).toContain('no le manda un peso')
  })

  it('el desgaste NO cambia la clase: se suma como advertencia', () => {
    const c = base({ spend: 500, compras: 2 })
    const v = veredictoDeCelda(c, { techo: 1000, desgaste: { firma: 'pieza', ctrDelta: -42, cpmDelta: 1 } })
    expect(v.clase).toBe('ok')
    expect(v.porque.join(' ')).toContain('la PIEZA')
    expect(v.porque.join(' ')).toContain('clavado')
  })
})

describe('🔴 la configuración es de HOY, las métricas son de la ventana', () => {
  /**
   * Defecto real visto en prod el 26-ago-2026: `TEST UNBOXING x SIMILAR` se pausó el 25, la ventana
   * cerraba el 24, y la celda figuraba ACTIVE con el botón «Pausar» y el veredicto «apagala» encima
   * de algo ya apagado. La foto guarda la configuración en la fila del día en que se sacó.
   */
  const conPausaPosterior = () => [
    // La ventana: entregó caro los días 18 a 24.
    ...serie(7, '2026-08-18', () => ({ spend: 2000, compras: 1, estado: 'ACTIVE', estado_real: 'entregando' })),
    // Después de que la ventana cierra, alguien la pausó. Ese día NO entra en los totales.
    fila({ fecha: '2026-08-25', capturado_at: '2026-08-26T10:00:00Z', spend: 500, compras: 0, estado: 'PAUSED', estado_real: 'pausado' }),
  ]

  it('el estado sale del día más nuevo de TODA la foto, no del último de la ventana', () => {
    const z = armarZona({ filas: conPausaPosterior(), techo: 1000, hasta: '2026-08-24', ventana: 7 })
    const c = z.celdas[0]
    expect(c.estado).toBe('PAUSED')
    expect(c.estadoReal).toBe('pausado')
    // Pero el gasto sigue siendo el de la ventana: los 500 del día 25 no entran.
    expect(c.spend).toBe(14000)
  })

  it('⛔ sobre algo apagado NO propone apagarlo, y cuenta qué hacía', () => {
    const z = armarZona({ filas: conPausaPosterior(), techo: 1000, hasta: '2026-08-24', ventana: 7 })
    const v = z.celdas[0].veredicto
    expect(v.clase).toBe('apagada')
    expect(v.accion).toBe(null)
    expect(v.porque[0]).toContain('mientras entregó')
  })

  it('sin pausa posterior sigue diciendo lo que corresponde', () => {
    const filas = serie(7, '2026-08-18', () => ({ spend: 2000, compras: 1 }))
    const z = armarZona({ filas, techo: 1000, hasta: '2026-08-24', ventana: 7 })
    expect(z.celdas[0].veredicto.clase).toBe('alto')
    expect(z.celdas[0].veredicto.accion).toBe('pausar')
  })
})

describe('la concentración por pieza', () => {
  it('suma la misma pieza a través de las cajas y cuenta en cuántas corre', () => {
    const filas = [
      fila({ nivel: 'aviso', objeto_id: 'ad1', adset_id: 'a1', nombre: 'AD02 GIRLHOOD', spend: 300 }),
      fila({ nivel: 'aviso', objeto_id: 'ad2', adset_id: 'a2', nombre: 'AD02 GIRLHOOD', spend: 220 }),
      fila({ nivel: 'aviso', objeto_id: 'ad3', adset_id: 'a3', nombre: 'OTRA', spend: 480 }),
    ]
    const c = concentracionDe(filas)
    expect(c.total).toBe(1000)
    expect(c.mayor?.pieza).toBe('AD02 GIRLHOOD')
    expect(c.mayor?.gasto).toBe(520)
    expect(c.mayor?.cajas).toBe(2)
    expect(c.mayor?.pct).toBeCloseTo(52, 5)
  })

  it('⛔ no cuenta las filas de conjunto: la misma plata está en los cuatro niveles', () => {
    const filas = [
      fila({ nivel: 'aviso', objeto_id: 'ad1', nombre: 'P', spend: 100 }),
      fila({ nivel: 'conjunto', objeto_id: 'a1', nombre: 'P', spend: 100 }),
    ]
    expect(concentracionDe(filas).total).toBe(100)
  })
})

describe('las celdas', () => {
  it('⚠️ el nombre y el estado salen del día MÁS NUEVO, no del primero', () => {
    const filas = [
      fila({ fecha: '2026-08-18', nombre: 'VIEJO', estado_real: 'entregando', diario_crudo: 100000 }),
      fila({ fecha: '2026-08-19', nombre: 'NUEVO', estado_real: 'pausado', diario_crudo: 200000 }),
    ]
    const c = celdasDeLaFoto(filas)[0]
    expect(c.nombre).toBe('NUEVO')
    expect(c.estadoReal).toBe('pausado')
    expect(c.diario).toBe(2000)
  })

  it('«días» son los días con GASTO, no los de la serie', () => {
    const c = celdasDeLaFoto(serie(7, '2026-08-18', (i) => ({ spend: i < 3 ? 1000 : 0 })))[0]
    expect(c.serie.length).toBe(7)
    expect(c.diasConGasto).toBe(3)
  })

  it('enVentana incluye los dos bordes', () => {
    const filas = serie(5, '2026-08-18')
    expect(enVentana(filas, '2026-08-19', '2026-08-21')).toHaveLength(3)
  })
})

describe('el embudo sumado', () => {
  it('🔴 sin una sola fila que lo midiera vuelve `null`, ⛔ nunca 0', () => {
    const t = sumarDias([
      { spend: 100, carritos: null, checkouts: null, lpv: null },
      { spend: 100, carritos: null, checkouts: null, lpv: null },
    ])
    expect(t.carritos).toBe(null)
    expect(t.checkouts).toBe(null)
    expect(t.lpv).toBe(null)
    expect(t.diasConEmbudo.carritos).toBe(0)
  })

  it('con filas mezcladas suma sólo las que tenían el dato, y dice cuántas eran', () => {
    const t = sumarDias([
      { spend: 100, carritos: null },
      { spend: 100, carritos: 7 },
      { spend: 100, carritos: 3 },
    ])
    expect(t.carritos).toBe(10)
    expect(t.diasConEmbudo.carritos).toBe(2)
  })

  it('un cero medido sigue siendo un cero', () => {
    const t = sumarDias([{ spend: 100, carritos: 0 }])
    expect(t.carritos).toBe(0)
    expect(t.diasConEmbudo.carritos).toBe(1)
  })

  it('🔴 `link_clicks` se suma con la misma regla: sin ninguna fila que lo midiera vuelve `null`', () => {
    const t = sumarDias([
      { spend: 100, clicks: 50, link_clicks: null },
      { spend: 100, clicks: 50, link_clicks: null },
    ])
    // ⛔ Si cayera en el grupo de `clicks` —que suma con `Number(null) || 0`— acá diría 0, y 0
    // afirma "nadie hizo click al link". Estas filas no pueden afirmar eso.
    expect(t.link_clicks).toBe(null)
    expect(t.clicks).toBe(100)
  })

  it('🔴 `link_clicks` arrancó DESPUÉS que el resto del embudo: los contadores no coinciden', () => {
    // La frontera real: `lpv` nació el 23-ago-2026 y `link_clicks` el 27. Una ventana de 7 días
    // que cruce las dos fechas tiene días con lpv y sin link_clicks. Calcular la tasa
    // click→landing sobre los días de la ventana entera la subestimaría, porque el numerador
    // tendría días que el denominador no.
    const t = sumarDias([
      { spend: 100, lpv: 40, link_clicks: null },
      { spend: 100, lpv: 40, link_clicks: null },
      { spend: 100, lpv: 40, link_clicks: 80 },
    ])
    expect(t.diasConEmbudo.lpv).toBe(3)
    expect(t.diasConEmbudo.link_clicks).toBe(1)
    // 120/80 = 150%, un imposible. El guard es comparar los contadores ANTES de dividir.
    expect(t.lpv! / t.link_clicks!).toBeGreaterThan(1)
  })
})

/**
 * LOS AVISOS DE CADA CELDA — «no sé qué creativo está dentro».
 *
 * 🔴 **El mutante que hay que ver caer es uno solo y es caro**: `agruparAvisos()` agrupa por
 * `objeto_id` a secas, así que un mismo aviso corriendo en varias cajas colapsa en una fila con la
 * suma de todas. El caso está MEDIDO en este repo —`AD02 - GIRLHOOD COLLECTION` corre en tres
 * conjuntos y es el 52% del gasto de BDI—, así que no partir por `adset_id` antes de agrupar hace
 * que cada caja muestre los números de las otras dos, y eso miente con cara de dato.
 */
describe('avisosPorCelda — un aviso en varias cajas es varias filas, no una suma', () => {
  /** El mismo aviso `ad1` corriendo en dos conjuntos, con gastos distintos. */
  const enDosCajas = [
    fila({ nivel: 'aviso', objeto_id: 'ad1', adset_id: 'a1', nombre: 'AD02 - GIRLHOOD', spend: 5000, compras: 1 }),
    fila({ nivel: 'aviso', objeto_id: 'ad1', adset_id: 'a2', nombre: 'AD02 - GIRLHOOD', spend: 300, compras: 0 }),
    fila({ nivel: 'aviso', objeto_id: 'ad2', adset_id: 'a1', nombre: 'AD01 - UNBOXING', spend: 900, compras: 2 }),
  ]

  it('🔴 cada caja ve SUS números del aviso compartido, ⛔ no la suma de las dos', () => {
    const m = avisosPorCelda(enDosCajas)
    const enA1 = m.get('a1')!.find((a) => a.id === 'ad1')!
    const enA2 = m.get('a2')!.find((a) => a.id === 'ad1')!
    expect(enA1.spend).toBe(5000)
    expect(enA2.spend).toBe(300)
    // Y la suma de las dos NO aparece en ningún lado: si apareciera, la caja chica se leería como
    // la que se lleva la plata.
    expect(enA1.spend + enA2.spend).toBe(5300)
    expect(m.get('a1')!.some((a) => a.spend === 5300)).toBe(false)
  })

  it('cada caja lista sólo los avisos que corrieron en ella', () => {
    const m = avisosPorCelda(enDosCajas)
    expect(m.get('a1')!.map((a) => a.id).sort()).toEqual(['ad1', 'ad2'])
    expect(m.get('a2')!.map((a) => a.id)).toEqual(['ad1'])
  })

  it('⛔ NO cuenta las filas de conjunto: la misma plata está en los cuatro niveles de la foto', () => {
    // Si contara el nivel `conjunto`, el gasto de los avisos duplicaría al de su propia celda.
    const m = avisosPorCelda([...enDosCajas, fila({ nivel: 'conjunto', objeto_id: 'a1', adset_id: 'a1', spend: 99999 })])
    expect(m.get('a1')!.some((a) => a.spend === 99999)).toBe(false)
    expect(m.get('a1')!.reduce((s, a) => s + a.spend, 0)).toBe(5900)
  })

  it('una fila de aviso sin `adset_id` no cuelga de ninguna caja en vez de colgar de la equivocada', () => {
    const m = avisosPorCelda([fila({ nivel: 'aviso', objeto_id: 'ad9', adset_id: null, spend: 700 })])
    expect(m.size).toBe(0)
  })

  it('⛔ el aviso NO trae `estado`: en una ventana vieja diría «pausado» para todo', () => {
    // La configuración se escribe sólo en la fila del día en que se sacó la foto. Es la misma regla
    // que obligó a `configDeHoy()` para las celdas.
    const a = avisosPorCelda(enDosCajas).get('a1')![0]
    expect('estado' in a).toBe(false)
  })

  it('sin compras el costo por compra va NULL, ⛔ no 0', () => {
    const a = avisosPorCelda(enDosCajas).get('a2')![0]
    expect(a.compras).toBe(0)
    expect(a.cpa).toBe(null)
  })

  it('armarZona cuelga los avisos de SU celda, y son los de la ventana', () => {
    const filas = [
      fila({ fecha: '2026-08-20', nivel: 'conjunto', objeto_id: 'a1', adset_id: 'a1', spend: 1000 }),
      fila({ fecha: '2026-08-20', nivel: 'aviso', objeto_id: 'ad1', adset_id: 'a1', nombre: 'AD01', spend: 1000 }),
      // Fuera de la ventana de un día: ⛔ no tiene que sumar, o la fila diría «gastó $1.000» y
      // adentro habría avisos por $9.000.
      fila({ fecha: '2026-08-10', nivel: 'aviso', objeto_id: 'ad1', adset_id: 'a1', nombre: 'AD01', spend: 8000 }),
    ]
    const z = armarZona({ filas, techo: 5000, hasta: '2026-08-20', ventana: 7 })
    const celda = z.celdas.find((c) => c.id === 'a1')!
    expect(celda.avisos.map((a) => a.id)).toEqual(['ad1'])
    expect(celda.avisos[0].spend).toBe(1000)
  })

  it('una celda sin filas de aviso trae la lista VACÍA, ⛔ no `undefined`', () => {
    const z = armarZona({
      filas: [fila({ fecha: '2026-08-20', nivel: 'conjunto', objeto_id: 'a1', adset_id: 'a1' })],
      techo: 5000, hasta: '2026-08-20', ventana: 7,
    })
    expect(z.celdas[0].avisos).toEqual([])
  })
})

/**
 * MIRAR UN DÍA SUELTO — «hoy, ayer, y hace 3 días».
 *
 * 🔴 **El riesgo más caro de toda esta tanda está acá, y no es de formato.** `veredicto()` sobre un
 * día suelto manda a PAUSAR una celda que ese día gastó más de lo que sale un cliente y no trajo
 * ninguno. Las compras son grumosas y Meta reatribuye hacia atrás varios días ⇒ **una vista de un
 * día que propone apagar es una vista que hace apagar cosas que rinden.**
 *
 * ⇒ la regla que ya tenía `armarZona` se extiende: las MÉTRICAS son de la ventana, la CONFIGURACIÓN
 * es de HOY, y el VEREDICTO es de la ventana de JUICIO — nunca de un día suelto.
 */
describe('elegirVentana y elegirCierre — lo que el servidor sabe contestar', () => {
  it('🔴 la BARRA ofrece un subconjunto de lo que el servidor sabe: si no, un botón daría 400', () => {
    // ⚠️ Se mide sobre `VENTANAS_ZONA` y ⛔ ya no sobre `DIAS_ZONA`. Al pasar la barra a ventanas con
    // nombre (`Hoy` · `Hoy y ayer` · 3 · 7 · 14 · 30) esa constante dejó de ser «lo que ofrece la
    // barra» **y el test siguió verde mirándola**: un botón nuevo de 5 días habría dado 400 sin que
    // nada avisara. Es la misma trampa de siempre — un test que vigila la constante que YA no manda.
    const deLaFoto = VENTANAS_ZONA.filter((v) => !v.vivo)
    expect(deLaFoto.length).toBeGreaterThan(0)
    for (const v of deLaFoto) expect(DIAS_SERVIBLES).toContain(v.dias)
  })

  it('⚠️ y las VIVAS no le piden esa ventana al servidor: le piden la de juicio', () => {
    // `Hoy` cubre 1 día y `Hoy y ayer` 2 — y **2 ⛔ no está en `DIAS_SERVIBLES`**, a propósito: esas
    // dos salen de Meta en vivo y a la foto se le sigue pidiendo la ventana de juicio, porque el
    // veredicto ⛔ no se calcula sobre un día parcial. Si algún día una viva le pidiera su propio
    // `dias` a la zona, esto lo recuerda.
    expect(VENTANAS_ZONA.filter((v) => v.vivo).map((v) => v.dias)).toEqual([1, 2])
    expect(DIAS_SERVIBLES).not.toContain(2)
  })

  it('acepta el día suelto y los tres días, a los que se llega por la tira', () => {
    expect(elegirVentana(1)).toEqual({ dias: 1 })
    expect(elegirVentana(3)).toEqual({ dias: 3 })
  })

  it('lo que no está en la lista es 400 con el motivo, ⛔ no un default en silencio', () => {
    expect(elegirVentana(2).error).toContain('1, 3, 7, 14, 30')
    expect(elegirVentana('quince').error).toBeTruthy()
  })

  it('sin `hasta` el cierre es el último día cerrado', () => {
    expect(elegirCierre('', { cierreReal: '2026-08-24' })).toEqual({ hasta: '2026-08-24' })
    expect(elegirCierre(null, { cierreReal: '2026-08-24' })).toEqual({ hasta: '2026-08-24' })
  })

  it('🔴 un `hasta` POSTERIOR al último cerrado es un ERROR, ⛔ nunca un recorte silencioso', () => {
    // Recortarlo «para ser amable» sería dibujar medio día como si fuera entero, que es el defecto
    // original de toda esta sección.
    const r = elegirCierre('2026-08-26', { cierreReal: '2026-08-24' })
    expect(r.hasta).toBe(undefined)
    expect(r.error).toContain('2026-08-24')
  })

  it('un `hasta` anterior a lo leído dice que falta FOTO, ⛔ no que ese día no gastó nadie', () => {
    const r = elegirCierre('2026-01-01', { cierreReal: '2026-08-24', primeraLeida: '2026-07-15' })
    expect(r.error).toContain('2026-07-15')
  })

  it('una fecha mal formada es 400, ⛔ no una comparación de strings que pase de casualidad', () => {
    expect(elegirCierre('ayer', { cierreReal: '2026-08-24' }).error).toBeTruthy()
    expect(elegirCierre('24/08/2026', { cierreReal: '2026-08-24' }).error).toBeTruthy()
  })

  it('🔴 y la caza aunque caiga JUSTO ENTRE las dos puntas, que es cuando los otros guards no la ven', () => {
    // `'2026-08-1'` (un día truncado) es mayor que `2026-07-15` y menor que `2026-08-24` como
    // string ⇒ los dos chequeos de rango la dejan pasar. Sin el guard del FORMATO se iría a
    // `desdeDe()` y devolvería una ventana vacía **en silencio**, que se lee «ese día no gastó
    // nadie». Los dos casos de arriba no prueban esto: los caza el rango, no el formato.
    const ctx = { cierreReal: '2026-08-24', primeraLeida: '2026-07-15' }
    expect(elegirCierre('2026-08-1', ctx).error).toBeTruthy()
    expect(elegirCierre('2026-08-1x', ctx).error).toBeTruthy()
  })
})

describe('la ventana de JUICIO — un día suelto no puede mandar a apagar', () => {
  /** Una celda que el 24 gastó mucho sin comprar, pero que en la semana compra bien. */
  const malUnDia = [
    ...['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23'].map((f) =>
      fila({ fecha: f, spend: 2000, compras: 2 })),
    fila({ fecha: '2026-08-24', spend: 9000, compras: 0 }),
  ]

  it('🔴 con ventana de 1 día, una celda que ese día no compró NO se manda a pausar', () => {
    const z = armarZona({ filas: malUnDia, techo: 3000, hasta: '2026-08-24', ventana: 1 })
    const c = z.celdas[0]
    // Las MÉTRICAS son del día: es lo que se vino a poder mirar.
    expect(c.spend).toBe(9000)
    expect(c.compras).toBe(0)
    // Pero el VEREDICTO es de la semana, donde compró 12 veces a $1.000.
    expect(c.veredicto.accion).not.toBe('pausar')
    expect(z.ventanaJuicio).toBe(7)
  })

  it('y con ventana de 7 la MISMA celda se juzga igual: el juicio no cambia con el zoom', () => {
    const a = armarZona({ filas: malUnDia, techo: 3000, hasta: '2026-08-24', ventana: 1 })
    const b = armarZona({ filas: malUnDia, techo: 3000, hasta: '2026-08-24', ventana: 7 })
    expect(a.celdas[0].veredicto.clase).toBe(b.celdas[0].veredicto.clase)
  })

  it('con una ventana MÁS LARGA que 7 el juicio la sigue: ⛔ no se clava en una semana', () => {
    const z = armarZona({ filas: malUnDia, techo: 3000, hasta: '2026-08-24', ventana: 30 })
    expect(z.ventanaJuicio).toBe(30)
  })

  it('una celda que está mal de verdad SIGUE mandando a apagar: el guard no apaga el veredicto', () => {
    const malSiempre = ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', '2026-08-24']
      .map((f) => fila({ fecha: f, spend: 9000, compras: 0 }))
    const z = armarZona({ filas: malSiempre, techo: 3000, hasta: '2026-08-24', ventana: 1 })
    expect(z.celdas[0].veredicto.accion).toBe('pausar')
  })

  it('el `hasta` ancla de verdad: pedir el 20 no trae lo del 24', () => {
    const z = armarZona({ filas: malUnDia, techo: 3000, hasta: '2026-08-20', ventana: 1 })
    expect(z.hasta).toBe('2026-08-20')
    expect(z.celdas[0].spend).toBe(2000)
  })
})

/**
 * 🔴 **El día EN CURSO adentro de la tabla, sin que el veredicto se contagie.**
 *
 * Bruno pidió mirar hoy y «hoy y ayer» en la zona (30-ago-2026). La foto sólo tiene días cerrados,
 * así que esos dos salen de Meta en vivo — y ahí aparece el riesgo que ordena todo este bloque:
 * **medio día de gasto contra medio día de compras da un costo por compra que no existe.** A las 10
 * de la mañana casi toda celda «compra carísimo» y a las 22 casi ninguna. Un veredicto sacado de ahí
 * manda a apagar cosas que rinden, que es el defecto original de esta sección.
 *
 * ⇒ La regla, y es la única que importa: **se reemplazan las MEDICIONES, ⛔ nunca el JUICIO.**
 */
describe('fusionarVivo — los números son de hoy, el veredicto es de la ventana', () => {
  const celda = (o: Partial<Celda> = {}): Celda => ({
    id: '1', nombre: 'GIRLHOOD FRIO', linea: 'bdi', campaignId: 'c1', cuentaId: 'a1', moneda: 'ARS',
    estado: 'ACTIVE', estadoReal: 'ACTIVE', diario: 10000, spend: 50304, impresiones: 100000,
    clicks: 2000, compras: 4, revenue: 40000, ctr: 2, cpc: 25, cpm: 503, roas: 0.8, carritos: 30,
    checkouts: 12, lpv: 900, costo: 12576, costoCarrito: 1676, diasConGasto: 5, desde: '2026-08-20',
    hasta: '2026-08-29', serie: [], desgaste: desgasteDe([]), aprendizaje: aprendizajeDe({ serie: [] }),
    avisos: [],
    veredicto: {
      clase: 'alto', titulo: 'Compra muy arriba del techo', accion: 'pausar',
      porque: ['Compra a $12.576 contra un techo de $6.668 —el 189%— en 5 días.'],
      pctTecho: 189, pctDiario: 100,
    },
    ...o,
  } as Celda)

  const viva = (o: Partial<CeldaViva> = {}): CeldaViva => ({
    id: '1', nombre: 'GIRLHOOD FRIO', linea: 'bdi', campania: 'C', estado: 'ACTIVE', diario: 10000,
    spend: 5000, impresiones: 10000, clicks: 200, compras: 2, revenue: 12000, ctr: 2, cpm: 500,
    carritos: 4, checkouts: 2, lpv: 90, costo: 2500, ...o,
  })

  it('🔴 el veredicto NO se recalcula, aunque hoy la celda esté regalada', () => {
    // Hoy compra a $2.500 contra un techo de $6.668: sobre este día sola diría «escalá». La foto
    // dice que en 5 días compra a $12.576. Gana la foto — y ésta es la aserción que sostiene todo.
    const r = fusionarVivo([celda()], [viva()], { linea: 'bdi', techo: 6668 })
    expect(r.celdas).toHaveLength(1)
    expect(r.celdas[0].veredicto.clase).toBe('alto')
    expect(r.celdas[0].veredicto.accion).toBe('pausar')
    expect(r.celdas[0].veredicto.porque[0]).toContain('189%')
  })

  it('las MEDICIONES sí son las de hoy, y los DOS porcentajes se recalculan', () => {
    const r = fusionarVivo([celda()], [viva()], { linea: 'bdi', techo: 6668 })
    const c = r.celdas[0]
    expect(c.spend).toBe(5000)
    expect(c.compras).toBe(2)
    expect(c.costo).toBe(2500)
    // 🔑 Sin esto la columna «% techo» mostraría el 189% de la semana al lado de un costo de hoy de
    // $2.500 — el tercer «número que existe y no significa» de este módulo.
    expect(Math.round(c.veredicto.pctTecho!)).toBe(37)
    // Y `pctDiario` recién acá quiere decir lo que su nombre dice: cuánto de la caja de HOY se usó.
    expect(c.veredicto.pctDiario).toBe(50)
    expect(c.diasConGasto).toBe(1)
  })

  it('⛔ sin techo cargado el % es `null` y ⛔ nunca 0: no juzgable ⛔ no es perfecto', () => {
    const r = fusionarVivo([celda()], [viva()], { linea: 'bdi', techo: 0 })
    expect(r.celdas[0].veredicto.pctTecho).toBeNull()
  })

  it('⛔ sin compras hoy el % del techo es `null`: no hay denominador', () => {
    const r = fusionarVivo([celda()], [viva({ compras: 0 })], { linea: 'bdi', techo: 6668 })
    expect(r.celdas[0].veredicto.pctTecho).toBeNull()
    expect(r.celdas[0].costo).toBe(0)
  })

  it('una celda que arrancó HOY entra con `midiendo` y ⛔ no propone nada', () => {
    // Dejarla afuera escondería justo la celda que alguien acaba de prender, que es cuando más se
    // mira. Y `midiendo` es la clase que ni suma ni corta: no hay con qué juzgarla.
    const r = fusionarVivo([], [viva({ id: '99', nombre: 'NUEVA' })], { linea: 'bdi', techo: 6668 })
    expect(r.celdas[0].veredicto.clase).toBe('midiendo')
    expect(r.celdas[0].veredicto.accion).toBeNull()
    // Y su desgaste sale de la función de verdad con la serie vacía: dice POR QUÉ no hay dato.
    expect(r.celdas[0].desgaste.firma).toBe('sin-datos')
    expect(r.celdas[0].desgaste.motivo).toBeTruthy()
  })

  it('🔴 lo que hoy no entregó se CUENTA, ⛔ no se dibuja con ceros ni desaparece', () => {
    // Una tabla de ceros a las 9 de la mañana esconde las tres celdas que sí están corriendo; y
    // desaparecer sin decirlo hace creer que se apagaron.
    const r = fusionarVivo(
      [celda(), celda({ id: '2', nombre: 'DORMIDA', estado: 'ACTIVE' }), celda({ id: '3', nombre: 'APAGADA', estado: 'PAUSED' })],
      [viva()],
      { linea: 'bdi', techo: 6668 },
    )
    expect(r.celdas.map((c) => c.id)).toEqual(['1'])
    // Sólo la ACTIVA que no apareció. La pausada no entregó porque está pausada: no es noticia.
    expect(r.sinEntrega).toEqual(['DORMIDA'])
  })

  it('filtra por línea, pero `sin-linea` PASA: es el único lugar donde se arregla', () => {
    const r = fusionarVivo([], [
      viva({ id: 'a', linea: 'bdi' }),
      viva({ id: 'b', linea: 'zattia' }),
      viva({ id: 'c', linea: 'sin-linea' }),
    ], { linea: 'bdi', techo: 6668 })
    expect(r.celdas.map((c) => c.id)).toEqual(['a', 'c'])
  })

  it('ordena por gasto de HOY y ⛔ no por el de la ventana', () => {
    const r = fusionarVivo(
      [celda({ id: '1', spend: 90000 }), celda({ id: '2', spend: 10 })],
      [viva({ id: '1', spend: 100 }), viva({ id: '2', nombre: 'B', spend: 9000 })],
      { linea: 'bdi', techo: 6668 },
    )
    expect(r.celdas.map((c) => c.id)).toEqual(['2', '1'])
  })
})

describe('VENTANAS_ZONA — la barra dice de dónde sale cada número', () => {
  it('las dos primeras son en vivo y las demás de la foto', () => {
    expect(VENTANAS_ZONA.filter((v) => v.vivo).map((v) => v.k)).toEqual(['hoy', 'hoy_ayer'])
    // 🔑 «3 días» NO es vivo, y por eso termina ayer. Si algún día pasara a `vivo: true` sin traer
    // anteayer de algún lado, la barra estaría mintiendo sobre qué días entran.
    expect(ventanaZona('3')!.vivo).toBe(false)
    expect(ventanaZona('hoy_ayer')!.dias).toBe(2)
  })

  it('⛔ una clave que no existe contesta `null`, ⛔ no un default en silencio', () => {
    // Es la misma regla que `elegirVentana`: sustituir en silencio es la única de las tres opciones
    // que miente, y un parámetro que la propia UI no puede pedir mal es el que nadie prueba.
    expect(ventanaZona('99')).toBeNull()
    expect(ventanaZona('')).toBeNull()
  })
})

/**
 * 🔴 **Lo apagado al fondo** — *«estaría bueno que las pautas apagadas se ordenen abajo de todo»*.
 *
 * Antes ordenaba sólo por gasto, así que una celda apagada ayer después de gastar $50.000 se quedaba
 * **primera**, arriba de las que están corriendo hoy — y es la única fila donde ⛔ no hay nada que
 * decidir: `apagada` es la clase que ⛔ no propone nada.
 */
describe('ordenarCeldas — lo apagado abajo, y adentro por gasto', () => {
  const c = (id: string, spend: number, clase: string) =>
    ({ id, spend, veredicto: { clase } }) as unknown as Celda

  it('las apagadas van al fondo aunque hayan gastado más que nadie', () => {
    const r = ordenarCeldas([
      c('apagada-cara', 50000, 'apagada'),
      c('viva-chica', 100, 'ok'),
      c('viva-grande', 900, 'alto'),
    ])
    expect(r.map((x) => x.id)).toEqual(['viva-grande', 'viva-chica', 'apagada-cara'])
  })

  it('adentro de cada grupo sigue mandando el gasto', () => {
    // Sin el desempate, el orden de adentro queda a merced de cómo vino la consulta — la clase de
    // cosa que cambia sola entre dos lecturas.
    const r = ordenarCeldas([c('a', 10, 'apagada'), c('b', 900, 'apagada'), c('c', 5, 'ok')])
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })

  it('⛔ no muta el arreglo que recibe', () => {
    // `armarZona` y `fusionarVivo` la llaman sobre listas que después se siguen usando.
    const entrada = [c('a', 1, 'apagada'), c('b', 2, 'ok')]
    ordenarCeldas(entrada)
    expect(entrada.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('mira `veredicto.clase` y ⛔ NO `estado`', () => {
    // 🔑 La clase ya resolvió que la CONFIGURACIÓN es de hoy (`configDeHoy`); `estado` en una
    // ventana vieja está congelado en el último día de la foto. Mirar `estado` acá volvería a traer
    // el defecto que esa función existe para curar: una celda pausada ayer figura ACTIVE.
    const congelada = { id: 'x', spend: 1, estado: 'ACTIVE', veredicto: { clase: 'apagada' } } as unknown as Celda
    const viva = { id: 'y', spend: 0, estado: 'PAUSED', veredicto: { clase: 'ok' } } as unknown as Celda
    expect(ordenarCeldas([congelada, viva]).map((x) => x.id)).toEqual(['y', 'x'])
  })
})
