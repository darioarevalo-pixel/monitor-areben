import { describe, it, expect } from 'vitest'
import {
  ESTADO_QUE_NO_CUENTA, MESES_DEL_MEDIDOR, SIN_NUMERO_LABEL,
  desdeDeLosMeses, medirPorMes, mesDelReclamo, mesDeLaVenta, mesesHasta,
} from '@/lib/reclamos/medidor.core.js'

/**
 * **El medidor: reclamos registrados por cada 100 ventas online** (§5 del plan del 30-ago-2026).
 *
 * 🔑 **Un instrumento nuevo se estrena reproduciendo una medición vieja.** El plan trae medidas a
 * mano contra la base de BDI las ventas online de abril a agosto de 2026 —**173 · 161 · 125 · 124 ·
 * 283**— y dice que hay **2 reclamos registrados en total**. El primer test de acá abajo hace pasar
 * esos mismos números por la función: si el instrumento no reproduce lo ya medido, lo que salga
 * después ⛔ no se puede leer.
 *
 * ⚠️ Y lo que este archivo cuida más que el número es **cuándo el instrumento se calla**: los meses
 * de antes de que el módulo registrara reclamos valen `0 / 173`, y dibujar ahí un cero **afirma que
 * nadie reclamó** en un mes en el que lo que pasaba es que nadie anotaba. Ese cero es el que
 * convertiría el primer mes con formulario público en «subió muchísimo».
 */

const venta = (date_sale: string, channel = 'Tienda Nube') => ({ date_sale, channel })
const reclamo = (created_at: string, estado = 'resuelto') => ({ created_at, estado })

/** Las ventas online reales de BDI, mes a mes, medidas contra la base el 30-ago-2026. */
const REAL = { '2026-03': 308, '2026-04': 173, '2026-05': 161, '2026-06': 125, '2026-07': 124, '2026-08': 283 }
const ventasReales = () =>
  Object.entries(REAL).flatMap(([mes, n]) => Array.from({ length: n }, () => venta(`${mes}-15`)))

describe('el instrumento, estrenado contra la medición vieja', () => {
  it('🔑 reproduce las ventas online de BDI de abril a agosto, y los 2 reclamos de agosto', () => {
    const meses = mesesHasta('2026-08')
    const filas = medirPorMes({
      meses,
      ventas: ventasReales(),
      reclamos: [reclamo('2026-08-26T14:00:00Z'), reclamo('2026-08-27T14:00:00Z', 'borrador')],
      desdeQueSeRegistra: '2026-08',
    })
    expect(filas.map((f) => f.ventas)).toEqual([308, 173, 161, 125, 124, 283])
    const agosto = filas[filas.length - 1]
    expect(agosto.reclamos).toBe(2)
    expect(agosto.cada100).toBeCloseTo(0.7067, 3)
  })
})

describe('qué cuenta arriba', () => {
  const meses = mesesHasta('2026-08', 2)

  /**
   * 🔴 **El numerador es el reclamo ABIERTO EN EL MES, ⛔ no el que hoy sigue abierto.** Un stock
   * dividido por un flujo da un número que ⛔ no existe: los reclamos vivos hoy arrastran los de
   * meses anteriores, y las ventas de agosto son sólo las de agosto.
   */
  it('🔴 cuenta por `created_at`, ⛔ no por el estado de hoy', () => {
    const filas = medirPorMes({
      meses,
      ventas: [venta('2026-07-02'), venta('2026-08-02')],
      // Uno de julio que sigue abierto, y uno de agosto ya cerrado.
      reclamos: [reclamo('2026-07-10T12:00:00Z', 'en_revision'), reclamo('2026-08-10T12:00:00Z', 'cerrado')],
      desdeQueSeRegistra: '2026-07',
    })
    expect(filas.map((f) => f.reclamos)).toEqual([1, 1])
  })

  /**
   * 🔑 **`anulado` ⛔ no cuenta, y ⛔ no es un criterio inventado acá**: es lo que ya dice el confirm
   * de la pantalla al anular — *«queda registrado pero deja de contar»*. Importa justo cuando el
   * alta pública empiece a producir duplicados, que es cuando este número se va a mirar.
   */
  it('🔴 el reclamo `anulado` ⛔ no infla el numerador', () => {
    const filas = medirPorMes({
      meses,
      ventas: [venta('2026-08-02'), venta('2026-08-03')],
      reclamos: [reclamo('2026-08-10T12:00:00Z'), reclamo('2026-08-11T12:00:00Z', ESTADO_QUE_NO_CUENTA)],
      desdeQueSeRegistra: '2026-08',
    })
    expect(filas[1].reclamos).toBe(1)
  })

  /**
   * 🔴 **El borde del huso.** `created_at` es UTC y `date_sale` es una fecha ya local: cortar los
   * dos por `slice(0,7)` manda al mes siguiente cada reclamo abierto **después de las 21:00 del
   * último día del mes**, contra ventas que se quedan donde estaban. Es el mismo borde que ya rompió
   * el test de la Agenda, y de noche el rojo aparece solo.
   */
  it('🔴 un reclamo de las 23:00 del 31 de agosto cuenta en AGOSTO, no en septiembre', () => {
    const filas = medirPorMes({
      meses: ['2026-08', '2026-09'],
      ventas: [venta('2026-08-02'), venta('2026-09-02')],
      reclamos: [reclamo('2026-09-01T02:00:00Z')], // 23:00 del 31-ago en Argentina
      desdeQueSeRegistra: '2026-08',
    })
    expect(filas.map((f) => f.reclamos)).toEqual([1, 0])
  })
})

describe('qué cuenta abajo', () => {
  /**
   * 🔴 **El denominador es Tienda Nube, ⛔ no «todo lo online».** Un reclamo cuelga de una orden de
   * Tienda Nube (`orden_tn`): meter Mercadolibre o el local abajo agranda la población del divisor
   * con ventas que ⛔ **no pueden aparecer arriba** — y el cociente sale más bajo que la realidad
   * sin que nada avise. La clasificación se importa de `canalDe` y ⛔ no se copia.
   */
  it('🔴 sólo cuenta el canal online; local, mayorista, Mercadolibre y las técnicas quedan afuera', () => {
    const filas = medirPorMes({
      meses: ['2026-08'],
      ventas: [
        venta('2026-08-02'), venta('2026-08-03'),
        venta('2026-08-04', 'Mi Local'), venta('2026-08-05', 'Mayorista'),
        venta('2026-08-06', 'Mercadolibre'), venta('2026-08-07', 'Whatsapp'),
        venta('2026-08-08', 'Ninguno'),
      ],
      reclamos: [reclamo('2026-08-10T12:00:00Z')],
      desdeQueSeRegistra: '2026-08',
    })
    expect(filas[0].ventas).toBe(2)
    expect(filas[0].cada100).toBe(50)
  })
})

describe('cuándo el instrumento se CALLA', () => {
  /**
   * 🔴 **El cero que afirma.** Julio de 2026 da `0 reclamos / 124 ventas`, y dibujar «0,0 cada 100»
   * afirma que **nadie reclamó** en un mes en el que lo que pasaba es que **nadie registraba**: el
   * módulo entró en agosto. Ese cero es el que convierte el primer mes con formulario en un
   * aumento, que es exactamente lo que el plan pide ⛔ no dejar pasar.
   */
  it('🔴 los meses de antes del PRIMER reclamo registrado ⛔ no valen cero: dicen por qué no hay número', () => {
    const filas = medirPorMes({
      meses: mesesHasta('2026-08', 3),
      ventas: [venta('2026-06-02'), venta('2026-07-02'), venta('2026-08-02')],
      reclamos: [reclamo('2026-08-26T14:00:00Z')],
      desdeQueSeRegistra: '2026-08',
    })
    expect(filas.map((f) => f.sinNumero)).toEqual(['sin-registro', 'sin-registro', null])
    expect(filas.map((f) => f.cada100)).toEqual([null, null, 100])
    expect(SIN_NUMERO_LABEL['sin-registro']).toMatch(/todavía no se registraban/)
  })

  /**
   * 🔴 **Sin denominador ⛔ no hay cociente.** Un 0 dibujado sobre un mes sin ventas online afirma
   * que nadie reclamó cuando lo que pasó es que ⛔ no se vendió nada — y un `reclamos/0` sin este
   * corte dibuja `Infinity` o `NaN` en la pantalla.
   */
  it('🔴 un mes sin ventas online da `null`, ⛔ nunca 0 ni Infinity', () => {
    const filas = medirPorMes({
      meses: ['2026-08'],
      ventas: [venta('2026-08-02', 'Mi Local')],
      reclamos: [reclamo('2026-08-10T12:00:00Z')],
      desdeQueSeRegistra: '2026-08',
    })
    expect(filas[0].cada100).toBeNull()
    expect(filas[0].sinNumero).toBe('sin-ventas')
  })

  it('🔴 sin ningún reclamo registrado nunca, ⛔ ningún mes tiene número', () => {
    const filas = medirPorMes({
      meses: ['2026-07', '2026-08'],
      ventas: [venta('2026-07-02'), venta('2026-08-02')],
      reclamos: [],
      desdeQueSeRegistra: null,
    })
    expect(filas.every((f) => f.sinNumero === 'sin-registro' && f.cada100 === null)).toBe(true)
  })
})

describe('la ventana de meses', () => {
  it('son seis, del más viejo al más nuevo, y el último es el que está en curso', () => {
    const meses = mesesHasta('2026-08')
    expect(meses).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
    expect(meses.length).toBe(MESES_DEL_MEDIDOR)
    const filas = medirPorMes({ meses, ventas: [], reclamos: [], desdeQueSeRegistra: null })
    expect(filas.map((f) => f.enCurso)).toEqual([false, false, false, false, false, true])
  })

  it('🔴 cruza el año para atrás sin inventar un mes 0', () => {
    expect(mesesHasta('2026-01')).toEqual(['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01'])
  })

  it('el `desde` de la consulta es el primer día del primer mes', () => {
    expect(desdeDeLosMeses(mesesHasta('2026-08'))).toBe('2026-03-01')
    expect(desdeDeLosMeses([])).toBeNull()
  })

  it('una fecha que no se puede leer ⛔ no cae en ningún mes', () => {
    expect(mesDelReclamo(null)).toBeNull()
    expect(mesDelReclamo('cualquier cosa')).toBeNull()
    expect(mesDeLaVenta(null)).toBeNull()
    expect(mesDeLaVenta('2026-08-15')).toBe('2026-08')
  })
})
