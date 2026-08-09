/**
 * «Cómo viene»: la ventana actual contra la anterior.
 *
 * Tres cosas amarra este archivo, y las tres pueden fallar **en silencio y de forma creíble**:
 *
 * 1. 🔴 **Que un período anterior que NO EXISTE no se dibuje como un cero.** Con el selector en 90
 *    días la foto no llega (arrancó el 11-may-2026) y un −100% sería falso, verosímil y de nadie.
 *    Es el mismo error que leer «0 saltos en 90 días» como «esto no pasa nunca».
 * 2. 🔴 **Que los totales salgan de UN nivel.** La misma plata está en los cuatro niveles de la
 *    tabla: sumarlos todos triplica el gasto y el número sigue pareciendo razonable.
 * 3. **Que la serie no tenga agujeros.** Un día sin filas que se saltea pega dos fechas lejanas y
 *    dibuja una continuidad que no pasó.
 */

import { describe, expect, it } from 'vitest'
import {
  MINIMO_COMPARABLE, comparar, diaDesplazado, diasEntre, puntosSparkline, serieDe, trazo, variacion, ventanasDe,
} from '@/lib/meta-ads/tendencia'

const HOY = '2026-08-09'
/** El día en que arrancó la foto de verdad, a nivel campaña. Medido contra la tabla el 9-ago-2026. */
const PRIMERA_FOTO = '2026-05-11'

type Fila = Record<string, unknown>

/** Una fila de la foto con lo mínimo, para no repetir diez campos por caso. */
function fila(over: Partial<Fila> = {}): Fila {
  return {
    fecha: '2026-08-08', nivel: 'campania', objeto_id: 'c1', linea: 'bdi',
    spend: 0, impresiones: 0, clicks: 0, compras: 0, revenue: 0, ...over,
  }
}

/** `n` días consecutivos terminando en `hasta`, del más viejo al más nuevo. */
function dias(hasta: string, n: number, over: (i: number, fecha: string) => Partial<Fila> = () => ({})): Fila[] {
  return Array.from({ length: n }, (_, i) => {
    const fecha = diaDesplazado(hasta, -(n - 1 - i)) as string
    return fila({ fecha, ...over(i, fecha) })
  })
}

describe('las ventanas', () => {
  it('🔑 ninguna incluye HOY: la foto de hoy es parcial y terminaría la serie en un pozo que no pasó', () => {
    const v = ventanasDe(HOY, 30, PRIMERA_FOTO)
    expect(v.actual.hasta).toBe('2026-08-08')
    expect(v.actual.desde).toBe('2026-07-10')
  })

  it('las dos son del mismo largo, contiguas, sin superponerse ni dejar un día en el medio', () => {
    const v = ventanasDe(HOY, 30, PRIMERA_FOTO)
    expect(v.anterior).not.toBeNull()
    expect(diasEntre(v.actual.desde, v.actual.hasta)).toBe(30)
    expect(diasEntre(v.anterior!.desde, v.anterior!.hasta)).toBe(30)
    // El día siguiente al final del anterior es el primero del actual.
    expect(diaDesplazado(v.anterior!.hasta, 1)).toBe(v.actual.desde)
    expect(v.recortado).toBe(false)
  })

  it('🔴 con 90 días pedidos y sólo 90 de foto, se RECORTAN las dos a 45 en vez de comparar contra el vacío', () => {
    const v = ventanasDe(HOY, 90, PRIMERA_FOTO)
    expect(v.recortado).toBe(true)
    expect(v.dias).toBe(45)
    expect(v.pedidos).toBe(90)
    expect(v.anterior).not.toBeNull()
    // Y lo que se comparó entra entero en la foto: nada de la ventana anterior cae antes del 11-may.
    expect(v.anterior!.desde >= PRIMERA_FOTO).toBe(true)
  })

  it('🔴 con menos de dos semanas de foto no hay comparación: `anterior` es null, que NO es «gastó cero»', () => {
    const v = ventanasDe(HOY, 30, diaDesplazado(HOY, -13) as string)
    expect(v.anterior).toBeNull()
    // La ventana actual sigue siendo la que pidió el Panel: los totales se muestran igual.
    expect(v.dias).toBe(30)
    expect(v.recortado).toBe(false)
  })

  it('el piso es una semana: menos que eso compara días de la semana, no pauta', () => {
    // 2×7 = 14 días de foto es exactamente el mínimo; con 13 no alcanza.
    expect(ventanasDe(HOY, 30, diaDesplazado(HOY, -14) as string).dias).toBe(MINIMO_COMPARABLE)
    expect(ventanasDe(HOY, 30, diaDesplazado(HOY, -13) as string).anterior).toBeNull()
  })

  it('sin foto no hay ventana anterior y no se rompe', () => {
    expect(ventanasDe(HOY, 30, null).anterior).toBeNull()
  })
})

describe('la variación', () => {
  it('🔑 vuelve como PROPORCIÓN, que es lo que come `pctFirmado`', () => {
    expect(variacion(116.4, 100)).toBeCloseTo(0.164, 5)
  })

  it('🔴 con base 0 devuelve null: de la nada no se crece un porcentaje', () => {
    expect(variacion(500, 0)).toBeNull()
    expect(variacion(0, 0)).toBeNull()
  })

  it('con un lado en null —el CPA sin compras— tampoco inventa un número', () => {
    expect(variacion(null, 100)).toBeNull()
    expect(variacion(100, null)).toBeNull()
  })

  it('una caída da negativo', () => {
    expect(variacion(67, 100)).toBeCloseTo(-0.33, 5)
  })
})

describe('comparar', () => {
  const ventanas = ventanasDe(HOY, 30, PRIMERA_FOTO)
  const visibles = ['bdi', 'zattia'] as never

  it('🔴 la misma plata en los cuatro niveles NO se cuenta cuatro veces: sólo mira `campania`', () => {
    const dia = '2026-08-08'
    const filas = [
      fila({ fecha: dia, nivel: 'cuenta', objeto_id: 'act', spend: 100 }),
      fila({ fecha: dia, nivel: 'campania', objeto_id: 'c1', spend: 100 }),
      fila({ fecha: dia, nivel: 'conjunto', objeto_id: 's1', spend: 100 }),
      fila({ fecha: dia, nivel: 'aviso', objeto_id: 'a1', spend: 100 }),
    ]
    expect(comparar(filas, { ventanas, visibles }).total.actual.gasto).toBe(100)
  })

  it('reparte cada ventana por su fecha y calcula el delta contra la anterior', () => {
    const filas = [
      ...dias(ventanas.actual.hasta, 30, () => ({ spend: 10, compras: 1, revenue: 40 })),
      ...dias(ventanas.anterior!.hasta, 30, () => ({ spend: 5, compras: 1, revenue: 30 })),
    ]
    const c = comparar(filas, { ventanas, visibles })
    expect(c.total.actual.gasto).toBe(300)
    expect(c.total.anterior!.gasto).toBe(150)
    expect(variacion(c.total.actual.gasto, c.total.anterior!.gasto)).toBe(1)
  })

  it('🔑 el ROAS se recalcula desde los totales; no es el promedio de los ROAS diarios', () => {
    const filas = [
      fila({ fecha: '2026-08-08', spend: 1, revenue: 100 }),   // ROAS del día: 100×
      fila({ fecha: '2026-08-07', spend: 999, revenue: 999 }), // ROAS del día: 1×
    ]
    const t = comparar(filas, { ventanas, visibles }).total.actual
    // El promedio de 100 y 1 sería 50,5. El de los totales es 1.099/1.000.
    expect(t.roas).toBeCloseTo(1.099, 3)
  })

  it('🔴 el CPA sin compras es null, no 0: un 0 se lee «salió gratis»', () => {
    const filas = [fila({ fecha: '2026-08-08', spend: 50_000, compras: 0 })]
    expect(comparar(filas, { ventanas, visibles }).total.actual.cpa).toBeNull()
  })

  it('la plata de una campaña SIN MARCA no entra en el total, pero se cuenta aparte', () => {
    const filas = [
      fila({ fecha: '2026-08-08', linea: 'bdi', spend: 100 }),
      fila({ fecha: '2026-08-08', linea: null, objeto_id: 'c9', spend: 33 }),
    ]
    const c = comparar(filas, { ventanas, visibles })
    expect(c.total.actual.gasto).toBe(100)
    expect(c.sinLinea.actual).toBe(33)
  })

  it('una línea que el perfil NO ve queda afuera del total y del reparto', () => {
    const filas = [
      fila({ fecha: '2026-08-08', linea: 'bdi', spend: 100 }),
      fila({ fecha: '2026-08-08', linea: 'stunned', objeto_id: 'c2', spend: 700 }),
    ]
    const c = comparar(filas, { ventanas, visibles })
    expect(c.total.actual.gasto).toBe(100)
    expect(c.porLinea.stunned).toBeUndefined()
  })

  it('sin ventana anterior, `anterior` viaja en null en el total y en cada marca', () => {
    const v = ventanasDe(HOY, 30, null)
    const c = comparar([fila({ fecha: '2026-08-08', spend: 10 })], { ventanas: v, visibles })
    expect(c.total.anterior).toBeNull()
    expect(c.porLinea.bdi!.anterior).toBeNull()
    expect(c.sinLinea.anterior).toBeNull()
  })

  it('`diasConGasto` cuenta los días que entregaron, no las filas que hay', () => {
    const filas = [
      fila({ fecha: '2026-08-08', spend: 10 }),
      fila({ fecha: '2026-08-07', spend: 0 }),
      fila({ fecha: '2026-08-06', objeto_id: 'c2', spend: 5 }),
      fila({ fecha: '2026-08-06', objeto_id: 'c3', spend: 5 }),
    ]
    // Cuatro filas, tres fechas, y sólo dos días con gasto.
    expect(comparar(filas, { ventanas, visibles }).total.actual.diasConGasto).toBe(2)
  })
})

describe('la serie del sparkline', () => {
  const ventanas = ventanasDe(HOY, 30, PRIMERA_FOTO)

  it('🔴 tiene un punto por día, sin agujeros: un día sin filas entra en cero', () => {
    const s = serieDe([fila({ fecha: '2026-08-08', spend: 10 })], ventanas)
    expect(s.length).toBe(60)
    expect(s[0].fecha).toBe(ventanas.anterior!.desde)
    expect(s[s.length - 1].fecha).toBe(ventanas.actual.hasta)
    expect(s.filter((p) => p.gasto === 0).length).toBe(59)
  })

  it('el tramo cambia exactamente en el primer día de la ventana actual', () => {
    const s = serieDe([], ventanas)
    const primerActual = s.findIndex((p) => p.tramo === 'actual')
    expect(s[primerActual].fecha).toBe(ventanas.actual.desde)
    expect(s[primerActual - 1].tramo).toBe('anterior')
    // Y una vez que pasó a «actual» no vuelve.
    expect(s.slice(primerActual).every((p) => p.tramo === 'actual')).toBe(true)
  })

  it('suma las filas del mismo día en un solo punto', () => {
    const s = serieDe([
      fila({ fecha: '2026-08-08', objeto_id: 'c1', spend: 10, compras: 1 }),
      fila({ fecha: '2026-08-08', objeto_id: 'c2', spend: 5, compras: 2 }),
    ], ventanas)
    const ultimo = s[s.length - 1]
    expect(ultimo.gasto).toBe(15)
    expect(ultimo.compras).toBe(3)
  })

  it('⛔ no lleva ratios: un ROAS de un día con dos compras es ruido', () => {
    const s = serieDe([fila({ fecha: '2026-08-08', spend: 1, revenue: 100 })], ventanas)
    expect(s[0]).not.toHaveProperty('roas')
    expect(s[0]).not.toHaveProperty('cpa')
  })
})

describe('la geometría del sparkline', () => {
  it('🔑 el piso es 0 y no el mínimo: una variación del 2% no se dibuja como una montaña', () => {
    const p = puntosSparkline([100, 102], 100, 20)
    // Con auto-escala entre mín y máx, el 100 iría al piso y el 102 al techo: la línea cruzaría el
    // cuadro entero por dos puntos de diferencia. Con piso en 0, los dos quedan arriba y pegados.
    expect(p[1].y).toBe(1)
    expect(Math.abs(p[0].y - p[1].y)).toBeLessThan(1)
    // Y la altura significa plata: el que vale menos está más abajo, en proporción a su valor.
    const alturaDe = (y: number) => 19 - y
    expect(alturaDe(p[0].y) / alturaDe(p[1].y)).toBeCloseTo(100 / 102, 5)
  })

  it('todo en cero es una línea chata ABAJO: no gastó nada, y eso se ve', () => {
    const p = puntosSparkline([0, 0, 0], 100, 20)
    expect(p.every((q) => q.y === 19)).toBe(true)
  })

  it('el primero y el último tocan los bordes horizontales', () => {
    const p = puntosSparkline([1, 2, 3], 120, 26)
    expect(p[0].x).toBe(0)
    expect(p[2].x).toBe(120)
  })

  it('con un solo valor no hay línea, pero el punto va al medio y no a un NaN', () => {
    const p = puntosSparkline([5], 120, 26)
    expect(p).toHaveLength(1)
    expect(p[0].x).toBe(60)
    expect(Number.isFinite(p[0].y)).toBe(true)
  })

  it('sin valores no devuelve nada y el trazo queda vacío', () => {
    expect(puntosSparkline([], 120, 26)).toEqual([])
    expect(trazo([])).toBe('')
  })

  it('un negativo —que no debería existir— se clava en el piso en vez de salirse del cuadro', () => {
    const p = puntosSparkline([-50, 100], 100, 20)
    expect(p[0].y).toBe(19)
  })
})
