/**
 * Banco de **Norte**.
 *
 * 🔑 **El caso que manda es `reproduce lo medido a mano`**, y está clavado a propósito con los
 * números reales del 17-ago-2026: sobre la ventana 6→16-ago salían **237,6 fundas por día** y, con
 * las tres importaciones sobre la mesa, entraban **479**. Esos dos números se midieron contra la
 * base antes de que existiera este archivo, y son el oráculo: si alguien toca una fórmula y ese
 * test se cae, **la fórmula está mal, no el test**.
 *
 * El resto de los casos defiende las decisiones que ya se pagaron caro una vez: los plazos cuentan
 * desde la factura y no desde la llegada, el stock no baja de cero, y una importación sin
 * condiciones no se cuenta con un costo inventado.
 */

import { describe, expect, it } from 'vitest'
import {
  avanceDeMeta,
  calendarioDePagos,
  coberturaDePagos,
  contribucionDiaria,
  diaDeAgotamiento,
  diasEntre,
  entradaDiaria,
  proyectarStock,
  ritmoDeSalida,
  salidaDiaria,
  sumarDias,
  veredicto,
} from '../lib/norte/core'
import type { ImportacionProyectada } from '../lib/norte/tipos'

// ── Los datos reales del 17-ago-2026 ──────────────────────────────────────────

/** Fundas vendidas por canal entre el 6 y el 16-ago (11 días), medidas contra la base. */
const VENTAS_MEDIDAS = [
  { canal: 'Mayorista', unidades: 2235 },
  { canal: 'Local', unidades: 178 },
  { canal: 'Tienda Nube', unidades: 168 },
  { canal: 'Otro', unidades: 33 },
]

/** Contribución por funda de cada canal, de la economía unitaria medida. */
const CONTRIB = { mayorista: 1046, local: 6401, online: 7920, otro: 9857 } as const

/** Las tres importaciones, como estaban el 6-ago: ninguna arribada todavía. */
const IMPORTACIONES: ImportacionProyectada[] = [
  { id: 'l1', desc: 'Lote 1', llega: '2026-08-06', unidades: 11000, arribada: false, condiciones: null },
  { id: 'l2', desc: 'Lote 2', llega: '2026-09-07', unidades: 14000, arribada: false, condiciones: null },
  { id: 'l3', desc: 'Lote 3', llega: '2026-10-15', unidades: 8500, arribada: false, condiciones: null },
]

describe('reproduce lo medido a mano el 17-ago-2026', () => {
  it('salen 237,6 fundas por día sobre la ventana 6→16-ago', () => {
    const ritmo = ritmoDeSalida(VENTAS_MEDIDAS, 11, CONTRIB)
    expect(salidaDiaria(ritmo)).toBeCloseTo(237.6, 1)
  })

  it('entran 479 fundas por día entre el 6-ago y el 15-oct', () => {
    // 33.500 unidades repartidas en los 70 días que van del 6-ago al 15-oct.
    expect(diasEntre('2026-08-06', '2026-10-15')).toBe(70)
    expect(entradaDiaria(IMPORTACIONES, '2026-08-06', '2026-10-15')).toBeCloseTo(478.6, 1)
  })

  it('el reparto por canal es el que se midió: mayorista 203, local 16, online 15', () => {
    const ritmo = ritmoDeSalida(VENTAS_MEDIDAS, 11, CONTRIB)
    const porCanal = Object.fromEntries(ritmo.map((r) => [r.canal, r.unidadesDia]))
    expect(porCanal.mayorista).toBeCloseTo(203.2, 1)
    expect(porCanal.local).toBeCloseTo(16.2, 1)
    expect(porCanal.online).toBeCloseTo(15.3, 1)
  })

  /**
   * ⚠️ **$466.639, no los $466.990 que anduvieron dando vueltas el 17-ago.**
   *
   * Aquel número salió de multiplicar las tasas diarias **ya redondeadas** (203,2 × 1.046 + …);
   * éste sale de las unidades crudas divididas por 11. La diferencia es de $351 —el 0,075%— y no
   * cambia ninguna decisión, pero el bueno es éste: redondear antes de multiplicar arrastra el
   * error a la escala del total. Si alguien vuelve con «pero era 466.990», la respuesta está acá.
   */
  it('la contribución diaria de las fundas da $466.639', () => {
    const ritmo = ritmoDeSalida(VENTAS_MEDIDAS, 11, CONTRIB)
    expect(contribucionDiaria(ritmo)).toBeCloseTo(466639, -2)
  })

  it('el veredicto es «no llega» y lo dice con los dos números adentro', () => {
    const v = veredicto(478.6, 237.6)
    expect(v.estado).toBe('no-llega')
    expect(Math.round(v.brechaDia)).toBe(241)
    expect(v.titular).toContain('479')
    expect(v.titular).toContain('238')
  })
})

describe('ritmoDeSalida', () => {
  it('ordena por volumen y multiplica la contribución por las unidades', () => {
    const r = ritmoDeSalida([{ canal: 'Local', unidades: 10 }], 2, { local: 100 })
    expect(r[0]).toEqual({ canal: 'local', unidadesDia: 5, contribUnidad: 100, contribDia: 500 })
  })

  it('un canal sin contribución cargada suma unidades y aporta cero, en vez de inventar margen', () => {
    const r = ritmoDeSalida([{ canal: 'Mayorista', unidades: 10 }], 1, {})
    expect(r[0].unidadesDia).toBe(10)
    expect(r[0].contribDia).toBe(0)
  })

  it('con cero días devuelve vacío en vez de dividir por cero', () => {
    expect(ritmoDeSalida(VENTAS_MEDIDAS, 0, CONTRIB)).toEqual([])
  })
})

describe('entradaDiaria', () => {
  it('no cuenta una importación que ya arribó: su stock ya está en el depósito', () => {
    const arribado = IMPORTACIONES.map((i) => (i.id === 'l1' ? { ...i, arribada: true } : i))
    // Quedan 22.500 en 70 días.
    expect(entradaDiaria(arribado, '2026-08-06', '2026-10-15')).toBeCloseTo(321.4, 1)
  })

  it('no cuenta lo que llega fuera de la ventana', () => {
    expect(entradaDiaria(IMPORTACIONES, '2026-08-06', '2026-08-31')).toBeCloseTo(11000 / 25, 1)
  })

  it('ignora las que no tienen fecha cargada', () => {
    const sinFecha: ImportacionProyectada[] = [{ ...IMPORTACIONES[0], llega: '' }]
    expect(entradaDiaria(sinFecha, '2026-08-06', '2026-10-15')).toBe(0)
  })
})

describe('proyectarStock', () => {
  it('con el ritmo de hoy el stock SUBE en vez de bajar — que es el hallazgo', () => {
    const puntos = proyectarStock({
      stockInicial: 0,
      desde: '2026-08-06',
      hasta: '2026-10-15',
      importaciones: IMPORTACIONES,
      salidaDia: 237.6,
    })
    const final = puntos[puntos.length - 1]
    expect(final.fecha).toBe('2026-10-15')
    // Entran 33.500 y salen 237,6 × 70 ≈ 16.632 ⇒ quedan ~16.900.
    expect(final.stock).toBeGreaterThan(16000)
    expect(diaDeAgotamiento(puntos)).toBeNull()
  })

  it('el stock nunca baja de cero: lo que no hay no se vende', () => {
    const puntos = proyectarStock({
      stockInicial: 100,
      desde: '2026-08-06',
      hasta: '2026-08-16',
      importaciones: [],
      salidaDia: 50,
    })
    expect(puntos.every((p) => p.stock >= 0)).toBe(true)
    // 100 unidades a 50 por día son DOS días contando desde el día 0: se agota al cierre del 7.
    expect(diaDeAgotamiento(puntos)).toBe('2026-08-07')
  })

  it('suma la importación el día exacto en que llega', () => {
    const puntos = proyectarStock({
      stockInicial: 0,
      desde: '2026-09-06',
      hasta: '2026-09-08',
      importaciones: [IMPORTACIONES[1]],
      salidaDia: 0,
    })
    expect(puntos.map((p) => p.entra)).toEqual([0, 14000, 0])
  })
})

describe('calendarioDePagos', () => {
  const conCondiciones: ImportacionProyectada[] = [
    {
      ...IMPORTACIONES[0],
      condiciones: {
        ingresoId: 'l1',
        fechaFactura: '2026-08-07',
        costoUnitario: 1.08,
        moneda: 'USD',
        unidades: null,
        cuotas: [
          { dias: 30, pct: 50, fecha: '2026-09-07' },
          { dias: 60, pct: 50, fecha: '2026-10-07' },
        ],
        nota: '',
      },
    },
  ]

  it('la fecha pactada gana sobre el cálculo por días', () => {
    const pagos = calendarioDePagos(conCondiciones, 1380)
    // A 30 días del 7-ago la aritmética daría 6-sep; el proveedor cobra el 7.
    expect(pagos.map((p) => p.fecha)).toEqual(['2026-09-07', '2026-10-07'])
    expect(sumarDias('2026-08-07', 30)).toBe('2026-09-06')
  })

  it('convierte a pesos a la cotización que se le pasa, y guarda el monto en dólares', () => {
    const pagos = calendarioDePagos(conCondiciones, 1380)
    expect(pagos[0].moneda).toBe('USD')
    expect(pagos[0].monto).toBeCloseTo((11000 * 1.08) / 2, 2)
    expect(pagos[0].montoPesos).toBeCloseTo(((11000 * 1.08) / 2) * 1380, 0)
  })

  it('una importación sin condiciones NO aparece con un costo inventado', () => {
    expect(calendarioDePagos(IMPORTACIONES, 1380)).toEqual([])
  })

  it('cae a los días cuando no hay fecha pactada', () => {
    const sinFechas = conCondiciones.map((i) => ({
      ...i,
      condiciones: { ...i.condiciones!, cuotas: [{ dias: 30, pct: 100 }] },
    }))
    expect(calendarioDePagos(sinFechas, 1)[0].fecha).toBe('2026-09-06')
  })
})

describe('coberturaDePagos', () => {
  it('acumula la deuda: el segundo pago se mide contra los dos juntos', () => {
    const pagos = [
      { fecha: '2026-09-07', importacionId: 'l1', etiqueta: '1', monto: 100, moneda: 'ARS' as const, montoPesos: 100 },
      { fecha: '2026-10-07', importacionId: 'l1', etiqueta: '2', monto: 100, moneda: 'ARS' as const, montoPesos: 100 },
    ]
    const cob = coberturaDePagos(pagos, '2026-08-07', 10)
    expect(cob[0].contribAcumulada).toBe(310) // 31 días × 10
    expect(cob[0].cobertura).toBeCloseTo(3.1, 2)
    expect(cob[1].cobertura).toBeCloseTo(610 / 200, 2)
  })
})

describe('avanceDeMeta', () => {
  const meta = { key: 'ventas-online', label: '100 ventas online por día', unidad: 'ventas/día', objetivo: 100, medido: 9.2 }

  it('el número que ordena la conversación es «cuántas veces», no el porcentaje', () => {
    const a = avanceDeMeta(meta, '2026-08-17')
    expect(a.pct).toBeCloseTo(9.2, 1)
    expect(a.veces).toBeCloseTo(10.9, 1)
    expect(a.falta).toBeCloseTo(90.8, 1)
  })

  it('con fecha objetivo calcula cuánto hay que sumar por semana', () => {
    const a = avanceDeMeta({ ...meta, fechaObjetivo: '2026-10-26' }, '2026-08-17')
    expect(diasEntre('2026-08-17', '2026-10-26')).toBe(70)
    expect(a.porSemana).toBeCloseTo(90.8 / 10, 1)
  })

  it('sin fecha objetivo no inventa un ritmo', () => {
    expect(avanceDeMeta(meta, '2026-08-17').porSemana).toBeNull()
  })

  it('con cero medido, «veces» es infinito y no NaN', () => {
    expect(avanceDeMeta({ ...meta, medido: 0 }, '2026-08-17').veces).toBe(Infinity)
  })
})

describe('veredicto', () => {
  it('empata dentro del 10% ⇒ ajustado', () => {
    expect(veredicto(479, 472).estado).toBe('ajustado')
  })

  it('sale más de lo que entra ⇒ holgado', () => {
    expect(veredicto(100, 200).estado).toBe('holgado')
  })

  it('sin importaciones cargadas lo dice, en vez de cantar que sobra ritmo', () => {
    const v = veredicto(0, 237)
    expect(v.estado).toBe('sin-datos')
    expect(v.titular).toContain('importaciones')
  })
})
