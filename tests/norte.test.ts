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
  estadoDeCompra,
  medirMeta,
  pagosEstimados,
  proyectarStock,
  ritmoDeSalida,
  stockArribado,
  stockDeLoImportado,
  desdeElPrimerIngreso,
  disenosArribados,
  vendidoDeLoImportado,
  salidaDiaria,
  sinCondiciones,
  sumarDias,
  veredicto,
} from '../lib/norte/core'
import { MEDIDORES } from '../lib/norte/medidores'
import type { Canal, ImportacionProyectada, Medidor } from '../lib/norte/tipos'

// ── Los datos reales del 17-ago-2026 ──────────────────────────────────────────

/** Fundas vendidas por canal entre el 6 y el 16-ago (11 días), medidas contra la base. */
/**
 * ⚠️ **Está AGREGADO: una fila por canal, no una por venta.** Sirve para las unidades, que es para
 * lo que se midió a mano el 17-ago-2026. ⛔ **No sirve para `ventasDia`**: acá «mayorista» son 2.235
 * fundas en UNA fila, y en producción son cientos de compras. Un caso de compras que se apoye en
 * este fixture da un número sin sentido y verde. Los de `ventas-dia` van con fixture propio.
 */
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
  { id: 'l1', desc: 'Lote 1', llega: '2026-08-06', unidades: 11000, arribada: false, bloques: [b('b1', 'IMD', 11000)], condiciones: null },
  { id: 'l2', desc: 'Lote 2', llega: '2026-09-07', unidades: 14000, arribada: false, bloques: [b('b1', 'IMD', 14000)], condiciones: null },
  { id: 'l3', desc: 'Lote 3', llega: '2026-10-15', unidades: 8500, arribada: false, bloques: [b('b1', 'IMD', 8500)], condiciones: null },
]

function b(id: string, nombre: string, unidades: number, disenos: string[] = []) {
  return { id, nombre, unidades, disenos }
}

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
    expect(r[0]).toEqual({ canal: 'local', unidadesDia: 5, ventasDia: 0.5, contribUnidad: 100, contribDia: 500 })
  })

  it('cuenta COMPRAS y FUNDAS sobre las mismas filas, y no son el mismo número', () => {
    // Dos compras que se llevan 10 fundas entre las dos, en dos días.
    const r = ritmoDeSalida(
      [
        { canal: 'Online', unidades: 7 },
        { canal: 'Online', unidades: 3 },
      ],
      2,
      {},
    )
    expect(r[0].unidadesDia).toBe(5)
    expect(r[0].ventasDia).toBe(1)
  })

  it('una venta de CERO unidades igual es una compra: suma al ritmo de ventas y no al de fundas', () => {
    // Una devolución, o una que factura cero. Son dos preguntas distintas y se contestan distinto.
    const r = ritmoDeSalida(
      [
        { canal: 'Online', unidades: 4 },
        { canal: 'Online', unidades: 0 },
      ],
      1,
      {},
    )
    expect(r[0].unidadesDia).toBe(4)
    expect(r[0].ventasDia).toBe(2)
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

// ── La economía de una compra: el costo por MATERIAL y los peldaños ───────────
//
// Los tres bloques son los de la IMPORTACION 2 real de BDI, medidos contra el KV el 18-ago-2026:
// TRANSPARENTE CON COLOR 1.132 + IMD 6.549 + FUNDA CON DISEÑO ENCAPSULADO 6.480 = 14.161, que es
// exactamente el total del pedido. Los precios son los del rango conocido: US$1,08 las comunes y
// US$1,35 las encapsuladas.

const BLOQUES = [b('t', 'TRANSPARENTE CON COLOR', 1132), b('i', 'IMD', 6549), b('e', 'FUNDA CON DISEÑO ENCAPSULADO', 6480)]

const IMP2: ImportacionProyectada = {
  id: 'imp2',
  desc: 'IMPORTACION 2',
  llega: '2026-08-28',
  unidades: 14161,
  arribada: false,
  bloques: BLOQUES,
  condiciones: null,
}

function condiciones(extra: Partial<NonNullable<ImportacionProyectada['condiciones']>> = {}) {
  return {
    ingresoId: 'imp2',
    fechaFactura: '',
    costos: [
      { bloqueId: 't', nombre: 'TRANSPARENTE CON COLOR', costo: 1.08, unidades: null },
      { bloqueId: 'i', nombre: 'IMD', costo: 1.08, unidades: null },
      { bloqueId: 'e', nombre: 'FUNDA CON DISEÑO ENCAPSULADO', costo: 1.35, unidades: null },
    ],
    moneda: 'USD' as const,
    cuotas: [
      { dias: 30, pct: 50 },
      { dias: 60, pct: 50 },
    ],
    nota: '',
    confirmado: false,
    fechaIngreso: '',
    cotizacion: null,
    ...extra,
  }
}

/** El total real: cada material a su precio. */
const TOTAL_IMP2 = 1132 * 1.08 + 6549 * 1.08 + 6480 * 1.35

describe('el costo va por material y no se promedia', () => {
  it('el total es la suma de cada material a SU precio', () => {
    const e = estadoDeCompra({ ...IMP2, condiciones: condiciones() })
    expect(e.total).toBeCloseTo(17043.48, 2)
    expect(e.unidades).toBe(14161)
  })

  it('el promedio de los tres precios daría OTRO número: por eso no se promedia', () => {
    // (1,08 + 1,08 + 1,35) / 3 × 14.161 = 16.568,37 — casi US$500 menos, sobre la misma compra.
    const promedio = ((1.08 + 1.08 + 1.35) / 3) * 14161
    expect(promedio).toBeCloseTo(16568.37, 2)
    expect(Math.abs(TOTAL_IMP2 - promedio)).toBeGreaterThan(400)
  })

  it('un material sin costo NO se totaliza a medias: la compra queda incompleta y lo nombra', () => {
    const e = estadoDeCompra({
      ...IMP2,
      condiciones: condiciones({ costos: condiciones().costos.filter((c) => c.bloqueId !== 'e') }),
    })
    expect(e.peldano).toBe('incompleta')
    // El total de los dos cargados sería 8.295,48: una deuda MÁS CHICA que la real, con cara de completa.
    expect(e.total).toBe(0)
    expect(e.falta).toContain('FUNDA CON DISEÑO ENCAPSULADO')
    expect(e.sinCosto.map((x) => x.id)).toEqual(['e'])
  })

  it('🔑 un costo en CERO no es un material gratis: cuenta como sin cargar', () => {
    // Lo cazó un mutante: con `>= 0` la compra se veía costeada y el total salía sin ese material,
    // más chico que el real y sin que nada avisara. Un 0 en un costo es «todavía no lo sé».
    const costos = condiciones().costos.map((c) => (c.bloqueId === 'e' ? { ...c, costo: 0 } : c))
    const e = estadoDeCompra({ ...IMP2, condiciones: condiciones({ costos }) })
    expect(e.peldano).toBe('incompleta')
    expect(e.sinCosto.map((x) => x.id)).toEqual(['e'])
  })

  it('las unidades facturadas de un material pisan a las del pedido', () => {
    const costos = condiciones().costos.map((c) => (c.bloqueId === 'e' ? { ...c, unidades: 6000 } : c))
    const e = estadoDeCompra({ ...IMP2, condiciones: condiciones({ costos }) })
    expect(e.unidades).toBe(1132 + 6549 + 6000)
    expect(e.total).toBeCloseTo(1132 * 1.08 + 6549 * 1.08 + 6000 * 1.35, 2)
  })

  it('un costo cuyo material ya no está NO suma, y se nombra en vez de descontarse callado', () => {
    const costos = [...condiciones().costos, { bloqueId: 'zz', nombre: 'BLOQUE BORRADO', costo: 9, unidades: 5000 }]
    const e = estadoDeCompra({ ...IMP2, condiciones: condiciones({ costos }) })
    expect(e.total).toBeCloseTo(TOTAL_IMP2, 2)
    expect(e.huerfanos.map((h) => h.nombre)).toEqual(['BLOQUE BORRADO'])
  })
})

describe('los peldaños: cada dato cargado sube uno, y el número no empeora', () => {
  it('sin confirmar es ESTIMADA y cuenta desde la llegada estimada', () => {
    const e = estadoDeCompra({ ...IMP2, condiciones: condiciones() })
    expect(e.peldano).toBe('estimada')
    expect(e.desde).toBe('2026-08-28')
    expect(e.base).toBe('llegada')
    expect(e.falta).toContain('confirmar el ingreso')
  })

  it('confirmada sin factura cuenta desde la fecha de INGRESO, que ya es firme', () => {
    const e = estadoDeCompra({ ...IMP2, condiciones: condiciones({ confirmado: true, fechaIngreso: '2026-08-30' }) })
    expect(e.peldano).toBe('confirmada')
    expect(e.desde).toBe('2026-08-30')
    expect(e.base).toBe('ingreso')
    expect(e.falta).toContain('factura')
  })

  it('el tilde sin su fecha NO alcanza: sigue estimando contra la llegada y pide la fecha', () => {
    const e = estadoDeCompra({ ...IMP2, condiciones: condiciones({ confirmado: true }) })
    expect(e.peldano).toBe('estimada')
    expect(e.base).toBe('llegada')
    expect(e.falta).toBe('la fecha de ingreso real')
  })

  it('con factura es FIRME y cuenta desde ella, no desde el ingreso ni desde la llegada', () => {
    const e = estadoDeCompra({
      ...IMP2,
      condiciones: condiciones({ confirmado: true, fechaIngreso: '2026-08-30', fechaFactura: '2026-08-20' }),
    })
    expect(e.peldano).toBe('firme')
    expect(e.desde).toBe('2026-08-20')
    expect(e.base).toBe('factura')
    expect(e.falta).toBeNull()
  })

  it('sin cuotas no se proyecta nada: falta cuánto se paga en cada una', () => {
    const e = estadoDeCompra({ ...IMP2, condiciones: condiciones({ cuotas: [] }) })
    expect(e.peldano).toBe('incompleta')
    expect(e.falta).toContain('cuotas')
  })

  it('sin fecha de llegada y sin ingreso confirmado no hay contra qué contar', () => {
    const e = estadoDeCompra({ ...IMP2, llega: '', condiciones: condiciones() })
    expect(e.peldano).toBe('incompleta')
    expect(e.falta).toContain('fecha de llegada')
  })
})

describe('calendarioDePagos', () => {
  const firme: ImportacionProyectada[] = [
    {
      ...IMPORTACIONES[0],
      condiciones: {
        ingresoId: 'l1',
        fechaFactura: '2026-08-07',
        costos: [{ bloqueId: 'b1', nombre: 'IMD', costo: 1.08, unidades: null }],
        moneda: 'USD',
        cuotas: [
          { dias: 30, pct: 50, fecha: '2026-09-07' },
          { dias: 60, pct: 50, fecha: '2026-10-07' },
        ],
        nota: '',
        confirmado: true,
        fechaIngreso: '2026-08-06',
        // Los cheques salen diferidos al recibir la mercadería: esta compra ya está pesificada.
        cotizacion: 1380,
      },
    },
  ]

  it('la fecha pactada gana sobre el cálculo por días', () => {
    const pagos = calendarioDePagos(firme)
    // A 30 días del 7-ago la aritmética daría 6-sep; el proveedor cobra el 7.
    expect(pagos.map((p) => p.fecha)).toEqual(['2026-09-07', '2026-10-07'])
    expect(sumarDias('2026-08-07', 30)).toBe('2026-09-06')
  })

  it('el peso sale de la cotización DE LA COMPRA, y el monto en dólares se guarda igual', () => {
    const pagos = calendarioDePagos(firme)
    expect(pagos[0].moneda).toBe('USD')
    expect(pagos[0].monto).toBeCloseTo((11000 * 1.08) / 2, 2)
    expect(pagos[0].montoPesos).toBeCloseTo(((11000 * 1.08) / 2) * 1380, 0)
  })

  // 🔴 El defecto que este caso defiende: antes el peso salía de un `useState(1380)` de la pantalla
  // y SIEMPRE había un número, aunque nadie supiera a cuánto se había pesificado la deuda. La
  // columna decía «En pesos» y se leía como deuda.
  it('sin cotización cargada NO inventa un peso: lo deja en null', () => {
    const sinPesificar = firme.map((i) => ({ ...i, condiciones: { ...i.condiciones!, cotizacion: null } }))
    const pagos = calendarioDePagos(sinPesificar)
    expect(pagos[0].monto).toBeCloseTo((11000 * 1.08) / 2, 2)
    expect(pagos[0].montoPesos).toBeNull()
  })

  it('una compra en ARS ya está en pesos: el monto ES el peso, sin cotización de por medio', () => {
    const enPesos = firme.map((i) => ({
      ...i,
      condiciones: { ...i.condiciones!, moneda: 'ARS' as const, cotizacion: null },
    }))
    const pagos = calendarioDePagos(enPesos)
    expect(pagos[0].montoPesos).toBe(pagos[0].monto)
  })

  it('una importación sin condiciones NO aparece con un costo inventado', () => {
    expect(calendarioDePagos(IMPORTACIONES)).toEqual([])
  })

  it('cae a los días cuando no hay fecha pactada', () => {
    const sinFechas = firme.map((i) => ({
      ...i,
      condiciones: { ...i.condiciones!, cuotas: [{ dias: 30, pct: 100 }] },
    }))
    expect(calendarioDePagos(sinFechas)[0].fecha).toBe('2026-09-06')
  })

  // 🔴 El defecto que estos dos casos defienden se vio en producción el 18-ago-2026, sobre $16,8M:
  // la pantalla decía «contada desde la fecha de ingreso» de una fecha que había escrito una
  // persona, y encima prometía que se iba a mover. Una pactada no se mueve. `base` no alcanza para
  // contestarlo: existe siempre, pero cuando hay fecha pactada no se usó para nada.
  it('un pago DICE si su fecha es pactada o calculada, y no se deduce de `base`', () => {
    const pagos = calendarioDePagos(firme)
    expect(pagos.every((p) => p.pactada)).toBe(true)
    // `base` sigue estando y sigue siendo 'factura': por eso sola no distingue los dos casos.
    expect(pagos[0].base).toBe('factura')
  })

  it('cuando la pactada NO coincide con el cálculo, la fecha es la pactada y se dice', () => {
    const sinFechas = firme.map((i) => ({
      ...i,
      condiciones: { ...i.condiciones!, cuotas: [{ dias: 30, pct: 100 }] },
    }))
    const calculado = calendarioDePagos(sinFechas)[0]
    const pactado = calendarioDePagos(firme)[0]
    expect(calculado.pactada).toBe(false)
    expect(pactado.pactada).toBe(true)
    // Y son fechas distintas: si `pactada` no existiera, las dos filas se verían iguales.
    expect(calculado.fecha).not.toBe(pactado.fecha)
  })

  it('🔑 una compra SIN confirmar no es deuda: no aparece acá aunque tenga costo y factura', () => {
    const conFacturaSinTilde = firme.map((i) => ({
      ...i,
      condiciones: { ...i.condiciones!, confirmado: false },
    }))
    expect(calendarioDePagos(conFacturaSinTilde)).toEqual([])
    expect(pagosEstimados(conFacturaSinTilde)).toHaveLength(2)
  })
})

describe('pagosEstimados', () => {
  const estimada = [{ ...IMP2, condiciones: condiciones() }]

  it('cuenta los plazos desde la llegada estimada y lo dice', () => {
    const pagos = pagosEstimados(estimada)
    expect(pagos.map((p) => p.fecha)).toEqual(['2026-09-27', '2026-10-27'])
    expect(pagos.every((p) => p.base === 'llegada')).toBe(true)
    expect(pagos.every((p) => !p.firme)).toBe(true)
  })

  it('confirmada, las mismas cuotas se corren a la fecha de ingreso real', () => {
    const conf = [{ ...IMP2, condiciones: condiciones({ confirmado: true, fechaIngreso: '2026-09-02' }) }]
    expect(pagosEstimados(conf).map((p) => p.fecha)).toEqual(['2026-10-02', '2026-11-01'])
  })

  it('🔑 lo estimado y la deuda no se pisan: ningún pago está en las dos listas', () => {
    const mezcla = [
      { ...IMP2, condiciones: condiciones() },
      {
        ...IMP2,
        id: 'imp2b',
        condiciones: condiciones({ confirmado: true, fechaIngreso: '2026-08-30', fechaFactura: '2026-08-20' }),
      },
    ]
    const firmes = calendarioDePagos(mezcla)
    const estimados = pagosEstimados(mezcla)
    expect(firmes).toHaveLength(2)
    expect(estimados).toHaveLength(2)
    expect(firmes.every((p) => p.importacionId === 'imp2b')).toBe(true)
    expect(estimados.every((p) => p.importacionId === 'imp2')).toBe(true)
  })

  it('el monto sale del mismo total que la deuda: son la misma cuenta', () => {
    expect(pagosEstimados(estimada).reduce((a, p) => a + p.monto, 0)).toBeCloseTo(TOTAL_IMP2, 2)
  })
})

describe('sinCondiciones', () => {
  it('dice QUÉ le falta a cada una, no sólo que falta algo', () => {
    const faltantes = sinCondiciones([IMP2, { ...IMP2, id: 'otra', condiciones: condiciones({ cuotas: [] }) }])
    expect(faltantes.map((f) => f.imp.id)).toEqual(['imp2', 'otra'])
    expect(faltantes[0].falta).toBe('el costo de cada material')
    expect(faltantes[1].falta).toContain('cuotas')
  })

  it('una compra que ya se puede estimar no figura como faltante', () => {
    expect(sinCondiciones([{ ...IMP2, condiciones: condiciones() }])).toEqual([])
  })
})

describe('coberturaDePagos', () => {
  it('acumula la deuda: el segundo pago se mide contra los dos juntos', () => {
    const pagos = [
      { fecha: '2026-09-07', importacionId: 'l1', etiqueta: '1', monto: 100, moneda: 'ARS' as const, montoPesos: 100, firme: true, base: 'factura' as const, pactada: false },
      { fecha: '2026-10-07', importacionId: 'l1', etiqueta: '2', monto: 100, moneda: 'ARS' as const, montoPesos: 100, firme: true, base: 'factura' as const, pactada: false },
    ]
    const cob = coberturaDePagos(pagos, '2026-08-07', 10)
    expect(cob[0].contribAcumulada).toBe(310) // 31 días × 10
    expect(cob[0].cobertura).toBeCloseTo(3.1, 2)
    expect(cob[1].cobertura).toBeCloseTo(610 / 200, 2)
  })

  // 🔴 La cobertura es ACUMULADA: un pago sin pesificar no rompe sólo su fila, rompe todas las de
  // abajo. Saltearlo daría una deuda MÁS CHICA que la real y una cobertura que tranquiliza de más —
  // el mismo error que «un material sin costo no se totaliza a medias», pero sobre el flujo de caja.
  it('un pago sin pesificar corta la cobertura de ahí en adelante, en vez de saltearlo', () => {
    const pagos = [
      { fecha: '2026-09-07', importacionId: 'l1', etiqueta: '1', monto: 100, moneda: 'ARS' as const, montoPesos: 100, firme: true, base: 'factura' as const, pactada: false },
      { fecha: '2026-10-07', importacionId: 'l2', etiqueta: '2', monto: 100, moneda: 'USD' as const, montoPesos: null, firme: true, base: 'factura' as const, pactada: false },
      { fecha: '2026-11-07', importacionId: 'l3', etiqueta: '3', monto: 100, moneda: 'ARS' as const, montoPesos: 100, firme: true, base: 'factura' as const, pactada: false },
    ]
    const cob = coberturaDePagos(pagos, '2026-08-07', 10)
    expect(cob[0].cobertura).toBeCloseTo(3.1, 2) // el primero todavía se puede
    expect(cob[1].cobertura).toBeNull()
    expect(cob[2].cobertura).toBeNull() // ⛔ y el de abajo TAMBIÉN, aunque él sí tenga su peso
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

// 🔴 El defecto que este bloque defiende llegó a producción el 18-ago-2026: la pantalla decía «el
// depósito queda vacío HOY» con 35.157 unidades adentro, porque `stockInicial` era un 0 escrito
// fijo y la proyección sólo contaba lo que TODAVÍA NO había llegado. Estuvo enmascarado mientras
// una importación ya arribada figuraba «en tránsito»: le inyectaba sus unidades el primer día.
describe('stockArribado', () => {
  const imp = (over: Partial<ImportacionProyectada>): ImportacionProyectada => ({
    id: 'x',
    desc: 'X',
    llega: '2026-08-01',
    unidades: 100,
    arribada: true,
    bloques: [b('b1', 'IMD', 60), b('b2', 'Relieve', 40)],
    condiciones: null,
    ...over,
  })

  it('suma lo que YA llegó, y no lo que está por llegar', () => {
    expect(stockArribado([imp({}), imp({ id: 'y', arribada: false })])).toBe(100)
  })

  it('sin ninguna arribada da 0, que acá sí es el número correcto', () => {
    expect(stockArribado([imp({ arribada: false })])).toBe(0)
  })

  // 🔑 Mismo criterio que el costeo: si se facturaron más unidades que las pedidas, las que
  // ingresaron son las facturadas. Contar las del pedido diría que entró menos de lo que entró.
  it('usa las unidades FACTURADAS cuando están cargadas, no las del pedido', () => {
    const conFacturadas = imp({
      condiciones: {
        ingresoId: 'x',
        fechaFactura: '',
        costos: [{ bloqueId: 'b1', nombre: 'IMD', costo: 1, unidades: 90 }],
        moneda: 'USD' as const,
        cotizacion: null,
        cuotas: [],
        nota: '',
        confirmado: false,
        fechaIngreso: '',
      },
    })
    // 90 facturadas del bloque 1 + 40 del pedido del bloque 2, que no tiene override.
    expect(stockArribado([conFacturadas])).toBe(130)
  })

  it('sin bloques cae a las unidades de la importación, en vez de contar cero', () => {
    expect(stockArribado([imp({ bloques: [] })])).toBe(100)
  })
})

describe('lo que queda de lo importado', () => {
  const imp = (over: Partial<ImportacionProyectada>): ImportacionProyectada => ({
    id: 'x',
    desc: 'X',
    llega: '2026-07-27',
    unidades: 100,
    arribada: true,
    bloques: [b('b1', 'IMD', 100)],
    condiciones: null,
    ...over,
  })
  const conIngreso = (id: string, llega: string, fechaIngreso: string, unidades: number) =>
    imp({
      id,
      llega,
      unidades,
      bloques: [b('b1', 'IMD', unidades)],
      condiciones: {
        ingresoId: id,
        fechaFactura: '',
        costos: [],
        moneda: 'USD' as const,
        cotizacion: null,
        cuotas: [],
        nota: '',
        confirmado: true,
        fechaIngreso,
      },
    })

  it('prefiere la fecha de ingreso REAL sobre la llegada estimada', () => {
    // En la IMPORTACION 1 son el 3-ago y el 27-jul: contar desde la estimada descontaría una semana
    // de ventas que todavía no tenían esa mercadería.
    expect(desdeElPrimerIngreso([conIngreso('a', '2026-07-27', '2026-08-03', 100)])).toBe('2026-08-03')
  })

  it('cae a la llegada cuando no hay fecha de ingreso cargada', () => {
    expect(desdeElPrimerIngreso([imp({})])).toBe('2026-07-27')
  })

  it('sin ninguna arribada no hay desde cuándo contar', () => {
    expect(desdeElPrimerIngreso([imp({ arribada: false })])).toBeNull()
  })

  // 🔑 El defecto que este caso defiende: lo arribado es un POZO COMÚN. Restarle a cada importación
  // «lo vendido desde SU llegada» contaría dos veces las ventas del período solapado, y con dos
  // compras el descuento saldría casi el doble del real.
  it('con dos arribadas cuenta desde la MÁS VIEJA, una sola vez', () => {
    const dos = [conIngreso('a', '2026-07-01', '2026-07-05', 100), conIngreso('b', '2026-08-01', '2026-08-03', 200)]
    expect(desdeElPrimerIngreso(dos)).toBe('2026-07-05')
    expect(stockArribado(dos)).toBe(300)
    // 120 vendidas desde el 5-jul, no 120 por cada una.
    expect(stockDeLoImportado(dos, 120)).toBe(180)
  })

  it('descuenta lo vendido de lo que ingresó', () => {
    expect(stockDeLoImportado([imp({})], 30)).toBe(70)
  })

  // ⚠️ Si se vendió más de lo importado, la diferencia salió de mercadería anterior que esta
  // sección no conoce. El remanente es CERO: un negativo se le restaría a lo que está por llegar.
  it('nunca da negativo, aunque se haya vendido más de lo que trajeron', () => {
    expect(stockDeLoImportado([imp({})], 400)).toBe(0)
  })

  it('sin nada arribado el remanente es 0, no lo que está por llegar', () => {
    expect(stockDeLoImportado([imp({ arribada: false })], 0)).toBe(0)
  })
})

// 🔴 El defecto que este bloque defiende llegó a producción el 18-ago-2026 y lo cazó Bruno mirando
// el número: la pantalla descontaba TODA la venta de la marca —4.914 unidades— cuando las de esa
// importación eran 2.873. El resto era mayorista de stock viejo, otros diseños y productos que ni
// son fundas. El stock remanente salía 2.041 más bajo que el real, hacia el lado que tranquiliza.
describe('vendidoDeLoImportado', () => {
  const prods = [
    { id: '1051805', name: 'LUCKY CASE' },
    { id: '607144', name: 'LUCKY CASE' }, // la ficha vieja del MISMO diseño
    { id: '607154', name: 'LUCKY CASE MAYORISTA' }, // otro producto, de otra compra
    { id: '900', name: 'Pop Case BLACK' },
    { id: '999', name: 'FUNDA VIEJA' },
  ]

  it('cuenta sólo los diseños de la compra, y no toda la venta de la marca', () => {
    const r = vendidoDeLoImportado({
      disenos: ['Lucky Case'],
      productos: prods,
      detalles: [
        { product_id: '1051805', quantity: 10 },
        { product_id: '999', quantity: 500 }, // otra funda: NO es de esta importación
      ],
    })
    expect(r.unidades).toBe(10)
  })

  // 🔑 Lo marcó Bruno: «lucky case mayorista es viejo». Un cruce por «contiene» se lo llevaba puesto.
  it('el cruce es EXACTO: «LUCKY CASE MAYORISTA» no es «Lucky Case»', () => {
    const r = vendidoDeLoImportado({
      disenos: ['Lucky Case'],
      productos: prods,
      detalles: [{ product_id: '607154', quantity: 40 }],
    })
    expect(r.unidades).toBe(0)
  })

  // 🔑 En GN el mismo diseño puede tener dos fichas (una vieja y una nueva). Quedarse con la
  // primera —como hace `indiceNombresGN`, que sólo contesta «existe»— perdería sus ventas enteras.
  it('suma TODOS los productos que se llaman igual, no el primero', () => {
    const r = vendidoDeLoImportado({
      disenos: ['Lucky Case'],
      productos: prods,
      detalles: [
        { product_id: '1051805', quantity: 10 },
        { product_id: '607144', quantity: 7 },
      ],
    })
    expect(r.unidades).toBe(17)
  })

  it('ignora acentos, mayúsculas y espacios de más, como el ✓ de Compras', () => {
    const r = vendidoDeLoImportado({
      disenos: ['  pop   case black '],
      productos: prods,
      detalles: [{ product_id: '900', quantity: 5 }],
    })
    expect(r.unidades).toBe(5)
  })

  // ⚠️ Lo que NO está en la grilla no se descuenta, y eso se va en silencio hacia el lado que
  // tranquiliza. Por eso `cruzados` viaja con el número y la pantalla lo muestra.
  it('dice contra cuántos diseños cruzó, para que el faltante no sea invisible', () => {
    const r = vendidoDeLoImportado({
      disenos: ['Lucky Case', 'Sam Case'], // Sam Case no tiene producto en el espejo
      productos: prods,
      detalles: [{ product_id: '1051805', quantity: 10 }],
    })
    expect(r.cruzados).toBe(1)
  })

  it('sin diseños cargados no descuenta nada, y lo dice con cruzados en 0', () => {
    const r = vendidoDeLoImportado({ disenos: [], productos: prods, detalles: [{ product_id: '1051805', quantity: 10 }] })
    expect(r).toEqual({ unidades: 0, cruzados: 0 })
  })
})

describe('disenosArribados', () => {
  const imp = (arribada: boolean, disenos: string[]) => ({
    id: 'x', desc: 'X', llega: '2026-08-01', unidades: 10, arribada,
    bloques: [{ id: 'b', nombre: 'IMD', unidades: 10, disenos }],
    condiciones: null,
  })

  it('sólo los de las arribadas: lo que no llegó no pudo venderse de esta compra', () => {
    expect(disenosArribados([imp(true, ['Sam Case']), imp(false, ['Otra Case'])])).toEqual(['sam case'])
  })

  it('no repite el mismo diseño cargado en dos bloques', () => {
    expect(disenosArribados([imp(true, ['Sam Case']), imp(true, ['SAM CASE'])])).toEqual(['sam case'])
  })

  it('descarta los diseños sin nombre, que no cruzarían con nada', () => {
    expect(disenosArribados([imp(true, ['', '  ', 'Sam Case'])])).toEqual(['sam case'])
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
  // 🔑 El defecto que estos dos casos defienden: que «100 por día» se cargue contra el medidor
  // equivocado. Fundas y compras NO son el mismo número —una compra lleva varias fundas— y el
  // avance saldría plausible y falso, que es exactamente lo que el catálogo vino a evitar.
  it('compras por día NO es lo mismo que fundas por día', () => {
    // Tres compras online que se llevan 12 fundas entre las tres, en dos días.
    const r = ritmoDeSalida(
      [
        { canal: 'Tienda Nube', unidades: 6 },
        { canal: 'Tienda Nube', unidades: 4 },
        { canal: 'Tienda Nube', unidades: 2 },
      ],
      2,
      {},
    )
    const c = { ritmo: r, hayPlata: true }
    expect(medirMeta(meta('ventas-dia', 'online'), c).valor).toBe(1.5)
    expect(medirMeta(meta('unidades-dia', 'online'), c).valor).toBe(6)
  })

  it('compras por día sin canal suma los canales, y se mide sin dashboard', () => {
    const r = ritmoDeSalida(
      [
        { canal: 'Tienda Nube', unidades: 6 },
        { canal: 'Local', unidades: 4 },
      ],
      1,
      {},
    )
    expect(medirMeta(meta('ventas-dia'), { ritmo: r, hayPlata: false }).valor).toBe(2)
  })

  it('un canal que no vendió da 0 unidades y null en plata', () => {
    expect(medirMeta(meta('unidades-dia', 'mayorista'), { ritmo: RITMO.filter((r) => r.canal !== 'mayorista'), hayPlata: true }).valor).toBe(0)
    expect(medirMeta(meta('contrib-unidad', 'mayorista'), { ritmo: RITMO.filter((r) => r.canal !== 'mayorista'), hayPlata: true }).valor).toBeNull()
    // Las compras siguen la misma regla que las unidades: cero compras es un dato, no un hueco.
    expect(medirMeta(meta('ventas-dia', 'mayorista'), { ritmo: RITMO.filter((r) => r.canal !== 'mayorista'), hayPlata: true }).valor).toBe(0)
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
