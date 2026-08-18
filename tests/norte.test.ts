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
  claveDeMeta,
  coberturaDePagos,
  contribucionDiaria,
  diaDeAgotamiento,
  diasEntre,
  entradaDiaria,
  medirMeta,
  proyectarStock,
  ritmoDeSalida,
  salidaDiaria,
  sumarDias,
  veredicto,
} from '../lib/norte/core'
import { MEDIDORES } from '../lib/norte/medidores'
import type { Canal, ImportacionProyectada, Medidor } from '../lib/norte/tipos'

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
  const meta = {
    key: 'ventas-online',
    label: '100 ventas online por día',
    medidor: 'unidades-dia' as const,
    canal: null,
    objetivo: 100,
  }
  const medido = (valor: number) => ({ valor, motivo: null })

  it('el número que ordena la conversación es «cuántas veces», no el porcentaje', () => {
    const a = avanceDeMeta(meta, medido(9.2), '2026-08-17')
    expect(a.pct).toBeCloseTo(9.2, 1)
    expect(a.veces).toBeCloseTo(10.9, 1)
    expect(a.falta).toBeCloseTo(90.8, 1)
  })

  it('con fecha objetivo calcula cuánto hay que sumar por semana', () => {
    const a = avanceDeMeta({ ...meta, fechaObjetivo: '2026-10-26' }, medido(9.2), '2026-08-17')
    expect(diasEntre('2026-08-17', '2026-10-26')).toBe(70)
    expect(a.porSemana).toBeCloseTo(90.8 / 10, 1)
  })

  it('sin fecha objetivo no inventa un ritmo', () => {
    expect(avanceDeMeta(meta, medido(9.2), '2026-08-17').porSemana).toBeNull()
  })

  it('con cero medido, «veces» es infinito y no NaN', () => {
    expect(avanceDeMeta(meta, medido(0), '2026-08-17').veces).toBe(Infinity)
  })

  // 🔑 La razón de ser del tipo `Medicion`: sin medido no se afirma un 0%, porque «no avanzamos» es
  // una afirmación sobre el negocio y «no se pudo medir» es una sobre el dato.
  it('sin medido no calcula un avance en cero: devuelve el motivo', () => {
    const a = avanceDeMeta(meta, { valor: null, motivo: 'el dashboard no está conectado' }, '2026-08-17')
    expect(a.medido).toBeNull()
    expect(a.pct).toBeNull()
    expect(a.falta).toBeNull()
    expect(a.veces).toBeNull()
    expect(a.porSemana).toBeNull()
    expect(a.motivo).toBe('el dashboard no está conectado')
  })
})

describe('medirMeta', () => {
  /** El ritmo real del 17-ago, con la contribución medida en prod el 18-ago. */
  const RITMO = ritmoDeSalida(VENTAS_MEDIDAS, 11, { mayorista: 1541, local: 7489, online: 7295, otro: 9857 })
  const ctx = { ritmo: RITMO, hayPlata: true }
  const meta = (medidor: Medidor, canal: Canal | null = null) => ({
    key: 'm',
    label: 'm',
    medidor,
    canal,
    objetivo: 1,
  })

  it('unidades por día de un canal es la fila de ese canal', () => {
    expect(medirMeta(meta('unidades-dia', 'online'), ctx).valor).toBeCloseTo(168 / 11, 2)
  })

  it('unidades por día sin canal es el mismo número del veredicto', () => {
    expect(medirMeta(meta('unidades-dia'), ctx).valor).toBeCloseTo(237.6, 1)
  })

  // 🔑 El defecto que este caso defiende: mayorista deja $1.541 y online $7.295, pero mayorista es
  // el 88% de las unidades. Promediar los cuatro canales parejo da ~$6.545 — más del triple de lo
  // que deja el negocio de verdad.
  it('la contribución por unidad de todos es PONDERADA, no el promedio de los promedios', () => {
    const unidades = 2235 + 178 + 168 + 33
    const plata = 2235 * 1541 + 178 * 7489 + 168 * 7295 + 33 * 9857
    expect(medirMeta(meta('contrib-unidad'), ctx).valor).toBeCloseTo(plata / unidades, 2)
    expect(medirMeta(meta('contrib-unidad'), ctx).valor).toBeLessThan(2500)
  })

  it('la contribución por día de un canal es unidades/día × lo que deja cada una', () => {
    expect(medirMeta(meta('contrib-dia', 'mayorista'), ctx).valor).toBeCloseTo((2235 / 11) * 1541, 0)
  })

  // 🔴 El caso de HOY: falta la env var del dashboard en el Vercel de Darío. Sin este corte la
  // pantalla mostraría «$0/día», que dice «no deja nada» — otra afirmación, y falsa.
  it('sin el dashboard conectado, la plata NO se mide en cero: dice por qué', () => {
    const m = medirMeta(meta('contrib-dia'), { ritmo: RITMO, hayPlata: false })
    expect(m.valor).toBeNull()
    expect(m.motivo).toMatch(/dashboard/)
  })

  it('pero las unidades sí se miden sin el dashboard: no dependen de la plata', () => {
    expect(medirMeta(meta('unidades-dia'), { ritmo: RITMO, hayPlata: false }).valor).toBeCloseTo(237.6, 1)
  })

  it('sin venta en la ventana no hay nada que medir, y no es un cero', () => {
    const m = medirMeta(meta('unidades-dia'), { ritmo: [], hayPlata: true })
    expect(m.valor).toBeNull()
    expect(m.motivo).toMatch(/venta/)
  })

  // Un canal que no vendió vendió CERO unidades —eso es un dato— pero no tiene contribución por
  // unidad: sin unidades no hay por qué dividir, y un «$0/funda» se leería como «no deja margen».
  it('un canal que no vendió da 0 unidades y null en plata', () => {
    expect(medirMeta(meta('unidades-dia', 'mayorista'), { ritmo: RITMO.filter((r) => r.canal !== 'mayorista'), hayPlata: true }).valor).toBe(0)
    expect(medirMeta(meta('contrib-unidad', 'mayorista'), { ritmo: RITMO.filter((r) => r.canal !== 'mayorista'), hayPlata: true }).valor).toBeNull()
  })
})

// 🔑 El defecto que este bloque defiende no está en ninguna fórmula: es que el catálogo y el motor
// se separen. Agregar un medidor a `medidores.core.js` sin enseñarle a `medirMeta` a medirlo deja
// una meta que se puede cargar, se guarda bien y **nunca muestra un número** — sin error, sin
// warning, sin nada que falle. La pantalla se ve igual que si el dato todavía no hubiera llegado.
describe('el catálogo de medidores y el motor no se pueden separar', () => {
  const RITMO = ritmoDeSalida(VENTAS_MEDIDAS, 11, { mayorista: 1541, local: 7489, online: 7295, otro: 9857 })

  it('el motor sabe medir TODOS los medidores del catálogo', () => {
    for (const m of MEDIDORES) {
      const medicion = medirMeta({ key: m.key, label: m.label, medidor: m.key, canal: null, objetivo: 1 }, {
        ritmo: RITMO,
        hayPlata: true,
      })
      expect(medicion.valor, `${m.key} no se pudo medir: ${medicion.motivo}`).not.toBeNull()
      expect(Number.isFinite(medicion.valor as number), `${m.key} midió algo que no es un número`).toBe(true)
    }
  })

  it('todo medidor declara su unidad: es la razón por la que existe el catálogo', () => {
    for (const m of MEDIDORES) expect(m.unidad, m.key).toMatch(/.+\/.+/)
  })

  // `necesitaPlata` es lo que la pantalla usa para explicar por qué falta un número. Si un medidor
  // lo declara mal, con el dashboard caído mostraría un cero en vez del motivo.
  it('`necesitaPlata` coincide con lo que el motor hace sin dashboard', () => {
    for (const m of MEDIDORES) {
      const sinPlata = medirMeta({ key: m.key, label: m.label, medidor: m.key, canal: null, objetivo: 1 }, {
        ritmo: RITMO,
        hayPlata: false,
      })
      expect(sinPlata.valor === null, m.key).toBe(m.necesitaPlata)
    }
  })
})

describe('claveDeMeta', () => {
  it('saca la clave del nombre, sin acentos ni signos', () => {
    expect(claveDeMeta('400 fundas por día')).toBe('400-fundas-por-dia')
  })

  // 🔑 El guardado es un upsert: dos metas con la misma clave NO dan error, se pisan.
  it('no repite una clave que ya existe', () => {
    expect(claveDeMeta('Meta', ['meta'])).toBe('meta-2')
    expect(claveDeMeta('Meta', ['meta', 'meta-2'])).toBe('meta-3')
  })

  it('un nombre sin letras usables igual da una clave', () => {
    expect(claveDeMeta('¿?')).toBe('meta')
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
