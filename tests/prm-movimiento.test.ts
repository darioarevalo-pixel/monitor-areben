// Lo que le compramos a un proveedor y cómo se vendió eso.
//
// 🔑 Lo que fija este archivo son las tres formas en que esta cuenta se rompe callada: la serie con
// huecos que dibuja tres compras seguidas, el solape de un producto traído dos veces, y la cola de
// la curva hundida por productos que todavía no llegaron a esa semana.
import { describe, it, expect } from 'vitest'
import {
  comparativa,
  curva,
  esDeLaMarca,
  diasEntre,
  lunesDe,
  productosOrdenados,
  ritmo,
  semanas,
  type OcMovimiento,
  type ProductoMovimiento,
  type VentaMovimiento,
} from '@/lib/prm/movimiento'

const oc = (id: string, confirmada_at: string | null, contadas: number): OcMovimiento => ({
  id,
  store: 'bdi',
  oc_label: `OC-${id}`,
  confirmada_at,
  unidades_pedidas: contadas,
  unidades_contadas: contadas,
})
const prod = (id: string, unidades: number, desde: string | null): ProductoMovimiento => ({
  clave: `bdi:${id}`,
  store: 'bdi',
  producto_id: id,
  nombre: `Producto ${id}`,
  sku: `SKU-${id}`,
  unidades,
  desde,
})
const venta = (id: string, fecha: string, unidades: number): VentaMovimiento => ({
  store: 'bdi',
  producto_id: id,
  fecha,
  unidades,
})

describe('lunesDe', () => {
  it('un miércoles cae en su lunes', () => {
    expect(lunesDe('2026-09-02')).toBe('2026-08-31')
  })

  it('un lunes es su propio lunes', () => {
    expect(lunesDe('2026-08-31')).toBe('2026-08-31')
  })

  it('🔴 un DOMINGO cae en el lunes anterior, ⛔ no en el siguiente', () => {
    // La semana argentina arranca el lunes. Con la semana del domingo (el default de JS) la venta
    // del domingo se va a la semana que viene y cada semana queda corrida un día.
    expect(lunesDe('2026-08-30')).toBe('2026-08-24')
  })

  it('🔴 ⛔ no corre las fechas un día para atrás', () => {
    // `new Date('2026-08-25')` es medianoche UTC = el 24 a las 21:00 en Argentina. Toda esta
    // familia de cuentas se rompe ahí y la pantalla no lo dice.
    expect(lunesDe('2026-01-01')).toBe('2025-12-29')
    expect(diasEntre('2026-08-25', '2026-08-26')).toBe(1)
    expect(diasEntre('2026-08-26', '2026-08-25')).toBe(-1)
  })
})

describe('semanas', () => {
  it('🔴 las semanas sin nada van con CERO, ⛔ no se saltean', () => {
    // Con huecos, tres compras de meses distintos se dibujan pegadas y se leen como si comprara
    // todas las semanas.
    const s = semanas([oc('1', '2026-08-03T12:00:00Z', 100)], [venta('a', '2026-08-24', 5)], '2026-08-26')
    expect(s.map((x) => x.lunes)).toEqual(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'])
    expect(s[0]).toMatchObject({ compradas: 100, ocs: 1, vendidas: 0 })
    expect(s[1]).toMatchObject({ compradas: 0, ocs: 0, vendidas: 0 })
    expect(s[3]).toMatchObject({ compradas: 0, vendidas: 5 })
  })

  it('la serie llega hasta la semana de HOY aunque no haya pasado nada', () => {
    // Cortarla en el último dato deja la pantalla diciendo que la última semana fue la buena.
    const s = semanas([oc('1', '2026-08-03T12:00:00Z', 10)], [], '2026-08-26')
    expect(s[s.length - 1].lunes).toBe('2026-08-24')
  })

  it('🔴 ⛔ no muestra semanas anteriores a la ventana de ventas', () => {
    // Ahí hay compras y NO se preguntó por las ventas: un 0 al lado de una compra de junio sería
    // una afirmación sobre un pedazo que nadie miró.
    const s = semanas(
      [oc('1', '2026-06-03T12:00:00Z', 500), oc('2', '2026-08-17T12:00:00Z', 100)],
      [venta('a', '2026-08-19', 7)],
      '2026-08-26',
      '2026-08-10',
    )
    expect(s[0].lunes).toBe('2026-08-10')
    expect(s.reduce((a, x) => a + x.compradas, 0)).toBe(100)
  })

  it('dos órdenes en la misma semana se suman en una fila', () => {
    const s = semanas([oc('1', '2026-08-17T12:00:00Z', 40), oc('2', '2026-08-19T12:00:00Z', 60)], [], '2026-08-19')
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ ocs: 2, compradas: 100 })
  })

  it('una orden sin fecha ⛔ no inventa una semana', () => {
    expect(semanas([oc('1', null, 40)], [], '2026-08-19')).toEqual([])
  })
})

describe('ritmo', () => {
  // 🔑 Las dos puntas de la ventana de 7 días: el 20 es el séptimo día contando hoy y ENTRA; el 19
  // es el octavo y queda afuera. Una ventana de 7 que empieza en hoy−7 son ocho días.
  const vs = [venta('a', '2026-08-26', 10), venta('a', '2026-08-20', 20), venta('a', '2026-08-19', 5), venta('a', '2026-07-20', 100)]

  it('cuenta los últimos 7 y 30 días, con hoy adentro y sin un día de más', () => {
    const r = ritmo(vs, '2026-08-26')
    expect(r.d7).toBe(30)
    expect(r.d30).toBe(35)
    expect(r.porDia7).toBeCloseTo(30 / 7)
  })

  it('🔑 dice cuál fue la ÚLTIMA venta', () => {
    // El día de hoy casi siempre está a medias —el espejo se sincroniza una vez por día—, así que
    // «0 hoy» sin esta fecha se lee como que se cortaron las ventas.
    expect(ritmo(vs, '2026-08-26').ultima).toBe('2026-08-26')
    expect(ritmo([], '2026-08-26').ultima).toBeNull()
  })
})

describe('curva', () => {
  it('🔴 lo vendido ANTES de la primera llegada NO entra a la semana 0: se cuenta aparte', () => {
    // Es la prueba a la vista de que el producto no es sólo de este proveedor. Medido en producción:
    // CaseMe&Co compró 793 unidades y sus productos vendieron 968.
    const c = curva(
      [prod('a', 100, '2026-08-10T12:00:00Z')],
      [venta('a', '2026-08-01', 40), venta('a', '2026-08-12', 10)],
      '2026-08-26',
    )
    expect(c.antes).toBe(40)
    expect(c.puntos[0]).toMatchObject({ semana: 0, unidades: 10 })
  })

  it('🔴 el denominador son los productos MADUROS, ⛔ no todos', () => {
    // `a` llegó hace 2 semanas y `b` hace 0. En la semana 2 sólo `a` puede tener dato: dividir por
    // los dos hunde la cola y la curva dice «se deja de vender» cuando el otro no llegó todavía.
    const c = curva(
      [prod('a', 10, '2026-08-12T12:00:00Z'), prod('b', 10, '2026-08-26T12:00:00Z')],
      [venta('a', '2026-08-26', 6)],
      '2026-08-26',
    )
    expect(c.puntos[0].maduros).toBe(2)
    expect(c.puntos[2]).toMatchObject({ semana: 2, unidades: 6, maduros: 1, promedio: 6 })
  })

  it('🔑 un producto entra UNA vez, por su primera llegada', () => {
    // El servidor ya colapsa las órdenes en un producto con su `desde` más viejo. Por semana de
    // orden, un producto traído dos veces contaría dos veces el solape — casi el doble.
    const c = curva([prod('a', 200, '2026-08-12T12:00:00Z')], [venta('a', '2026-08-13', 5)], '2026-08-26')
    expect(c.puntos[0].maduros).toBe(1)
    expect(c.puntos.reduce((s, p) => s + p.unidades, 0)).toBe(5)
  })

  it('🔴 una semana sin ningún producto maduro da `null`, ⛔ no 0', () => {
    const c = curva([prod('a', 10, '2026-08-24T12:00:00Z')], [], '2026-08-26')
    expect(c.puntos).toHaveLength(1)
    expect(c.puntos[0].promedio).toBe(0)
  })

  it('los productos sin fecha se CUENTAN, no se tiran', () => {
    const c = curva([prod('a', 10, null), prod('b', 10, '2026-08-24T12:00:00Z')], [], '2026-08-26')
    expect(c.sinFecha).toBe(1)
  })
})

describe('productosOrdenados', () => {
  it('ordena por vendidas y desempata por compradas', () => {
    const filas = productosOrdenados(
      [prod('a', 10, '2026-08-01T12:00:00Z'), prod('b', 99, '2026-08-01T12:00:00Z'), prod('c', 5, '2026-08-01T12:00:00Z')],
      [venta('a', '2026-08-10', 7), venta('c', '2026-08-10', 7)],
      '2026-08-26',
    )
    expect(filas.map((f) => f.producto_id)).toEqual(['a', 'c', 'b'])
    expect(filas[2].vendidas).toBe(0)
  })

  it('🔴 el que no cumplió una semana ⛔ no tiene ritmo: `null`, no un número inflado', () => {
    const filas = productosOrdenados([prod('a', 10, '2026-08-24T12:00:00Z')], [venta('a', '2026-08-25', 3)], '2026-08-26')
    expect(filas[0].semanasEnCalle).toBe(0)
    expect(filas[0].porSemana).toBeNull()
  })

  it('con semanas en la calle, el ritmo sale', () => {
    const filas = productosOrdenados([prod('a', 10, '2026-08-12T12:00:00Z')], [venta('a', '2026-08-25', 6)], '2026-08-26')
    expect(filas[0].semanasEnCalle).toBe(2)
    expect(filas[0].porSemana).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Los proveedores comparados entre sí
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe('comparativa', () => {
  const locales = [
    { id: 'pl1', nombre: 'ALMA', proveedor_id_ingresos: 1 },
    { id: 'pl2', nombre: 'MALABICHA', proveedor_id_ingresos: 2 },
    { id: 'pl3', nombre: 'SIN ENGANCHE', proveedor_id_ingresos: null },
  ]
  const ocs = [
    { ...oc('o1', '2026-08-10T12:00:00Z', 100), proveedor_id: 1 },
    { ...oc('o2', '2026-08-20T12:00:00Z', 50), proveedor_id: 1 },
    { ...oc('o3', '2026-08-15T12:00:00Z', 30), proveedor_id: 2 },
  ]
  const linea = (oc_ref: string, producto_id: string | null, cantidad_contada: number) => ({
    oc_ref, store: 'bdi', producto_id, cantidad_contada,
  })

  it('🔴 un producto que trajeron DOS cuenta entero en los dos, y cada fila lo dice', () => {
    // Repartir la venta sería inventar de quién se vendió cada unidad; dársela a uno solo sería
    // mentirle al otro. Medido en producción: pasa en 2 de 349 productos.
    const filas = comparativa(
      locales,
      ocs,
      [linea('o1', 'SWEATER', 100), linea('o3', 'SWEATER', 30)],
      [{ store: 'bdi', producto_id: 'SWEATER', unidades: 80 }],
      30,
    )
    expect(filas.map((f) => f.nombre)).toEqual(['ALMA', 'MALABICHA'])
    expect(filas[0].vendidas).toBe(80)
    expect(filas[1].vendidas).toBe(80)
    expect(filas[0].compartidos).toBe(1)
    expect(filas[1].compartidos).toBe(1)
  })

  it('un producto de uno solo ⛔ no figura como compartido', () => {
    const filas = comparativa(
      locales,
      ocs,
      [linea('o1', 'PROPIO', 100), linea('o3', 'OTRO', 30)],
      [{ store: 'bdi', producto_id: 'PROPIO', unidades: 9 }],
      30,
    )
    expect(filas.find((f) => f.nombre === 'ALMA')).toMatchObject({ vendidas: 9, compartidos: 0, productos: 1 })
  })

  it('🔴 lo que no cruzó SUMA en comprado y se cuenta aparte', () => {
    // Sacarlo del total haría que el proveedor entregara menos de lo que entregó; callarlo haría
    // que uno sin cruce parezca uno que no vende.
    const filas = comparativa(locales, ocs, [linea('o1', null, 40), linea('o2', 'X', 50)], [], 30)
    const alma = filas.find((f) => f.nombre === 'ALMA')!
    expect(alma.comprado).toBe(90)
    expect(alma.sinCruce).toEqual({ lineas: 1, unidades: 40 })
  })

  it('cuenta las órdenes y toma la fecha de la ÚLTIMA', () => {
    const alma = comparativa(locales, ocs, [], [], 30).find((f) => f.nombre === 'ALMA')!
    expect(alma.ocs).toBe(2)
    expect(alma.ultima).toBe('2026-08-20')
  })

  it('🔴 un local sin enganche ⛔ no entra: sus ceros no significan nada', () => {
    expect(comparativa(locales, ocs, [], [], 30).map((f) => f.nombre)).not.toContain('SIN ENGANCHE')
  })

  it('el ritmo divide por la ventana pedida, ⛔ no por una fija', () => {
    const filas = comparativa(locales, ocs, [linea('o1', 'X', 10)], [{ store: 'bdi', producto_id: 'X', unidades: 60 }], 30)
    expect(filas[0].porDia).toBe(2)
    const otra = comparativa(locales, ocs, [linea('o1', 'X', 10)], [{ store: 'bdi', producto_id: 'X', unidades: 60 }], 90)
    expect(otra[0].porDia).toBeCloseTo(60 / 90)
  })
})

describe('comparativa · las marcas de cada proveedor', () => {
  it('🔴 cada fila dice de qué marcas son sus órdenes', () => {
    // Es lo que deja que la pantalla dibuje «?» en vez de un 0 cuando una base no contesta. Sin
    // esto, el día que falte una credencial 28 de 34 filas dirían «vendió 0», que es falso.
    const filas = comparativa(
      [{ id: 'pl1', nombre: 'UNO', proveedor_id_ingresos: 1 }],
      [{ ...oc('o1', '2026-08-10T12:00:00Z', 10), proveedor_id: 1 }],
      [
        { oc_ref: 'o1', store: 'bdi', producto_id: 'a', cantidad_contada: 5 },
        { oc_ref: 'o1', store: 'zattia', producto_id: 'b', cantidad_contada: 5 },
      ],
      [],
      30,
    )
    expect(filas[0].stores.sort()).toEqual(['bdi', 'zattia'])
  })
})

describe('esDeLaMarca', () => {
  it('entra en la sección de la marca a la que le compramos', () => {
    expect(esDeLaMarca({ marcas: ['bdi'] }, 'bdi')).toBe(true)
    expect(esDeLaMarca({ marcas: ['bdi'] }, 'zattia')).toBe(false)
  })

  it('🔴 SIN órdenes entra en las DOS: ⛔ no es «de ninguna marca»', () => {
    // Un local de Flores cargado a mano antes de la primera compra sirve para la marca que sea.
    // Esconderlo lo perdería justo cuando hay que ir a verlo.
    expect(esDeLaMarca({ marcas: [] }, 'bdi')).toBe(true)
    expect(esDeLaMarca({ marcas: [] }, 'zattia')).toBe(true)
    expect(esDeLaMarca({ marcas: null }, 'bdi')).toBe(true)
    expect(esDeLaMarca({}, 'zattia')).toBe(true)
  })

  it('🔑 el que le vende a las dos aparece en las dos, sin que nadie lo tilde', () => {
    // Hoy no hay ninguno (28 de Zattia y 6 de BDI, ninguno cruzado). El día que lo haya, sale solo.
    expect(esDeLaMarca({ marcas: ['bdi', 'zattia'] }, 'bdi')).toBe(true)
    expect(esDeLaMarca({ marcas: ['bdi', 'zattia'] }, 'zattia')).toBe(true)
  })
})
