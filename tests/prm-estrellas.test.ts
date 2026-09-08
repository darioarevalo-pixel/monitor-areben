// **Lo que entró hace poco y ya se vende** — los candidatos a recompra de un proveedor.
//
// 🔑 Lo que fija este archivo son las formas en que esta cuenta afirma de más: el repuesto que se
// cuela como nuevo y trae el stock viejo adentro de su porcentaje, la venta anterior a la llegada
// contada como colocada, y los tres ceros que ⛔ no son ceros —el que llegó hoy, el que ⛔ no vendió
// y el producto que ⛔ no está en el espejo—.
import { describe, it, expect } from 'vitest'
import {
  estrellas,
  paraAvisar,
  UMBRAL_AVISO,
  VENTANAS_ESTRELLAS,
  type ProductoMovimiento,
  type VentaMovimiento,
} from '@/lib/prm/movimiento'

const HOY = '2026-09-08'

const prod = (
  id: string,
  unidades: number,
  desde: string | null,
  hasta: string | null = desde,
): ProductoMovimiento => ({
  clave: `zattia:${id}`,
  store: 'zattia',
  producto_id: id,
  nombre: `Producto ${id}`,
  sku: `SKU-${id}`,
  unidades,
  desde,
  hasta,
})

const venta = (id: string, fecha: string, unidades: number): VentaMovimiento => ({
  store: 'zattia',
  producto_id: id,
  fecha,
  unidades,
})

describe('estrellas · quién entra y quién ⛔ no', () => {
  it('sólo entra el que llegó por PRIMERA vez adentro de la ventana', () => {
    const r = estrellas(
      [prod('nuevo', 10, '2026-09-01'), prod('viejo', 10, '2026-06-17', '2026-06-17')],
      [],
      HOY,
      { dias: 30 },
    )
    expect(r.filas.map((f) => f.producto_id)).toEqual(['nuevo'])
  })

  it('🔴 el REPUESTO ⛔ no entra, y se cuenta aparte: su venta trae el stock viejo adentro', () => {
    // Llegó en junio y él lo volvió a traer el 1-sep. «Colocó el 60% de lo que trajo» sería falso:
    // parte de esas ventas salieron de unidades que ya estaban.
    const r = estrellas([prod('repuesto', 21, '2026-06-17', '2026-09-01')], [venta('repuesto', '2026-09-03', 7)], HOY, {
      dias: 30,
    })
    expect(r.filas).toEqual([])
    expect(r.repuestos).toBe(1)
  })

  it('un producto viejo que ⛔ no volvió a entrar ⛔ no es un repuesto: no se cuenta en ningún lado', () => {
    const r = estrellas([prod('viejo', 10, '2026-06-17', '2026-06-17')], [], HOY, { dias: 30 })
    expect(r.filas).toEqual([])
    expect(r.repuestos).toBe(0)
  })

  it('la ventana de 15 días deja afuera al de hace 28, y la de 30 lo trae', () => {
    const p = [prod('agosto', 5, '2026-08-11')]
    expect(estrellas(p, [], HOY, { dias: 15 }).filas).toEqual([])
    expect(estrellas(p, [], HOY, { dias: 30 }).filas.map((f) => f.producto_id)).toEqual(['agosto'])
  })

  it('las dos ventanas son las que nombró Bruno: el último mes o los últimos 15 días', () => {
    expect(VENTANAS_ESTRELLAS).toEqual([15, 30])
  })

  it('un producto sin fecha de llegada se CUENTA, ⛔ no se tira', () => {
    const r = estrellas([prod('sinfecha', 5, null, null)], [], HOY, { dias: 30 })
    expect(r.filas).toEqual([])
    expect(r.sinFecha).toBe(1)
  })
})

describe('estrellas · las cuentas', () => {
  it('🔴 lo vendido ANTES de la llegada ⛔ no cuenta como colocado: se cuenta aparte', () => {
    const r = estrellas(
      [prod('p', 10, '2026-09-01')],
      [venta('p', '2026-08-20', 4), venta('p', '2026-09-03', 5)],
      HOY,
      { dias: 30 },
    )
    expect(r.filas[0].vendidas).toBe(5)
    expect(r.filas[0].antes).toBe(4)
    expect(r.filas[0].colocado).toBeCloseTo(0.5)
  })

  it('la venta del MISMO día que llegó cuenta como colocada', () => {
    const r = estrellas([prod('p', 10, '2026-09-01')], [venta('p', '2026-09-01', 2)], HOY, { dias: 30 })
    expect(r.filas[0].vendidas).toBe(2)
    expect(r.filas[0].antes).toBe(0)
  })

  it('🔴 el que llegó HOY ⛔ no tiene ritmo cero: ⛔ no tiene ritmo', () => {
    const r = estrellas([prod('p', 10, HOY)], [venta('p', HOY, 3)], HOY, { dias: 30 })
    expect(r.filas[0].dias).toBe(0)
    expect(r.filas[0].porDia).toBeNull()
    expect(r.filas[0].seAgotaEn).toBeNull()
  })

  it('🔴 sin unidades compradas ⛔ no hay porcentaje: `null` y ⛔ no 0%', () => {
    const r = estrellas([prod('p', 0, '2026-09-01')], [venta('p', '2026-09-03', 2)], HOY, { dias: 30 })
    expect(r.filas[0].colocado).toBeNull()
  })

  it('«se termina en» sale del ritmo de estos días sobre lo que le queda de su compra', () => {
    // 12 compradas, 7 vendidas en 7 días = 1/día, quedan 5 ⇒ 5 días.
    const r = estrellas([prod('p', 12, '2026-09-01')], [venta('p', '2026-09-03', 7)], HOY, { dias: 30 })
    expect(r.filas[0].porDia).toBeCloseTo(1)
    expect(r.filas[0].seAgotaEn).toBeCloseTo(5)
  })

  it('el que ya colocó todo lo suyo da 0, y ⛔ no un negativo', () => {
    const r = estrellas([prod('p', 5, '2026-08-11')], [venta('p', '2026-08-21', 7)], HOY, { dias: 30 })
    expect(r.filas[0].seAgotaEn).toBe(0)
  })

  it('🔴 el que ⛔ no vendió nada da `null`, ⛔ no 0: un 0 lo pondría primero como si urgiera', () => {
    const r = estrellas([prod('p', 10, '2026-09-01')], [], HOY, { dias: 30 })
    expect(r.filas[0].seAgotaEn).toBeNull()
  })
})

describe('estrellas · el orden es «de qué me quedo sin primero»', () => {
  const productos = [
    prod('lento', 20, '2026-09-01'),
    prod('agotado', 5, '2026-08-11'),
    prod('rapido', 12, '2026-09-01'),
    prod('mudo', 10, '2026-09-01'),
  ]
  const ventas = [
    venta('lento', '2026-09-03', 2), // 0,29/día · quedan 18 ⇒ ~63 días
    venta('agotado', '2026-08-21', 5), // colocó todo ⇒ 0
    venta('rapido', '2026-09-03', 7), // 1/día · quedan 5 ⇒ 5 días
  ]

  it('primero el que ya se terminó, y el que ⛔ no vendió va al final', () => {
    const r = estrellas(productos, ventas, HOY, { dias: 30 })
    expect(r.filas.map((f) => f.producto_id)).toEqual(['agotado', 'rapido', 'lento', 'mudo'])
  })

  it('🔴 ⛔ NO ordena por vendidas: el que más vendió ⛔ no es el que primero hay que recomprar', () => {
    const r = estrellas(productos, ventas, HOY, { dias: 30 })
    // `rapido` vendió 7 y `agotado` 5, y aun así `agotado` va arriba.
    expect(r.filas[0].producto_id).toBe('agotado')
    expect(r.filas[0].vendidas).toBeLessThan(r.filas[1].vendidas)
  })

  it('a igual plazo manda el que más vendió: entre dos agotados, 5 unidades dicen más que 2', () => {
    const r = estrellas(
      [prod('chico', 2, '2026-08-11'), prod('grande', 5, '2026-08-11')],
      [venta('chico', '2026-08-21', 2), venta('grande', '2026-08-21', 5)],
      HOY,
      { dias: 30 },
    )
    expect(r.filas.map((f) => f.producto_id)).toEqual(['grande', 'chico'])
  })
})

describe('estrellas · el stock de hoy', () => {
  it('viene del mapa que le pasan, sumado por producto', () => {
    const r = estrellas([prod('p', 10, '2026-09-01')], [], HOY, {
      dias: 30,
      stock: new Map([['zattia:p', 4]]),
    })
    expect(r.filas[0].stock).toBe(4)
  })

  it('🔴 el producto que ⛔ no está en el espejo da `null`, ⛔ no 0: un 0 dispara una recompra al pedo', () => {
    const r = estrellas([prod('p', 10, '2026-09-01')], [], HOY, { dias: 30, stock: new Map() })
    expect(r.filas[0].stock).toBeNull()
  })

  it('🔴 sin mapa —la marca ⛔ no contestó— también es `null`', () => {
    const r = estrellas([prod('p', 10, '2026-09-01')], [], HOY, { dias: 30, stock: null })
    expect(r.filas[0].stock).toBeNull()
  })

  it('🔴 el stock ⛔ NO se resta de la compra, y por eso puede ser mayor que lo que queda', () => {
    // Medido el 8-sep-2026: TOP TERRA compró 5, vendió 5 y tiene 5 en Gestión Nube. Si la cuenta
    // fuera `comprado − vendido`, acá tendría que dar 0 — y el dato real dice 5.
    const r = estrellas([prod('terra', 5, '2026-08-11')], [venta('terra', '2026-08-21', 5)], HOY, {
      dias: 30,
      stock: new Map([['zattia:terra', 5]]),
    })
    expect(r.filas[0].seAgotaEn).toBe(0)
    expect(r.filas[0].stock).toBe(5)
  })
})

describe('paraAvisar · cuándo esto merece un mail', () => {
  const fila = (vendidas: number, seAgotaEn: number | null) =>
    ({ vendidas, seAgotaEn }) as Parameters<typeof paraAvisar>[0]

  it('avisa el que se termina esta semana y vendió lo suficiente', () => {
    expect(paraAvisar(fila(7, 5))).toBe(true)
  })

  it('🔴 con una o dos unidades ⛔ no avisa: ⛔ no hay ritmo, hay dos clientas', () => {
    expect(paraAvisar(fila(2, 0))).toBe(false)
  })

  it('🔴 y con el plazo largo tampoco, por más que haya vendido', () => {
    expect(paraAvisar(fila(30, 45))).toBe(false)
  })

  it('el que ⛔ no vendió nada ⛔ no avisa: `seAgotaEn` en `null` ⛔ no es un plazo corto', () => {
    expect(paraAvisar(fila(0, null))).toBe(false)
  })

  it('el umbral se puede pisar sin tocar la regla', () => {
    expect(paraAvisar(fila(2, 3), { vendidas: 1, seAgotaEn: 7 })).toBe(true)
  })

  it('🔴 `filas.filter(paraAvisar)` ⛔ NO devuelve una lista vacía: el índice ⛔ no es un umbral', () => {
    // El segundo argumento que `filter` pasa es el índice. Con un número ahí, `u.vendidas` es
    // `undefined` y toda comparación da `false`: la lista vuelve vacía y ⛔ nada avisa. Medido el
    // 8-sep-2026 contra la base real — el contador decía 5 y la lista salía en blanco.
    // ⚠️ En TypeScript esto ⛔ no compila —el tipo del segundo argumento lo frena, y es la mejor
    // defensa—, pero `scripts/*.mjs` ⛔ no pasa por `tsc`: ahí el índice entra igual. Por eso el
    // núcleo ignora lo que ⛔ no es un umbral, y esto lo clava.
    const conIndice = paraAvisar as unknown as (f: unknown, i: unknown) => boolean
    const filas = [fila(7, 5), fila(1, 0), fila(9, 2)]
    expect(filas.filter(conIndice).length).toBe(2)
  })

  it('los dos números del umbral están donde los lee el mail Y la pantalla', () => {
    expect(UMBRAL_AVISO).toEqual({ vendidas: 3, seAgotaEn: 7 })
  })
})
