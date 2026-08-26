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
  CONV_APRENDIZAJE, aprendizajeDe, armarZona, celdasDeLaFoto, concentracionDe, desdeDe,
  desgasteDe, enVentana, ultimoDiaCerrado, veredictoDeCelda,
} from '@/lib/meta-ads/rendimiento'
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
})
