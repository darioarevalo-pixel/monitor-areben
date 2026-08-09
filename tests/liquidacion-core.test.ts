import { describe, it, expect } from 'vitest'
import {
  anotarItem,
  armarItemDesdeProducto,
  avisos,
  contar,
  decidirItem,
  despejarItem,
  faltantes,
  itemsAplicables,
  precioDeSale,
  resumenCampania,
} from '@/lib/liquidacion'
import type { EstadoItem, LiquidacionItem } from '@/lib/liquidacion'
import { LIFESPAN_SIN_DATO, type Producto } from '@/lib/etl/tipos'

/**
 * Liquidación — el dominio.
 *
 * Lo que protegen estos tests es **plata de verdad**: el precio que sale de acá se le escribe a
 * Gestión Nube y rige en el local y en la tienda. Los dos que más importan:
 *
 *  - que el margen y el markup salgan de `lib/comisiones/core.ts` y no de una fórmula copiada acá
 *    (dos implementaciones = dos márgenes distintos para el mismo producto), y
 *  - que **un costo que no vino de Gestión Nube grite**. En julio de 2026, 428 productos de BDI
 *    quedaron costando cero en silencio: con costo cero, cualquier precio parece tener 100% de
 *    margen y la liquidación regala mercadería.
 */

function prod(over: Partial<Producto> = {}): Producto {
  return {
    id: 'p1',
    name: 'Campera puffer negra',
    sku: 'CAM-004',
    proveedor: null,
    category: null,
    retailer_price: 49900,
    unit_cost: 12400,
    sinCosto: false,
    margin: null,
    markup: null,
    ingresoMes: null, diasVivo: null,
    firstSale: null,
    lastSale: '2026-06-05',
    daysSinceLast: 61,
    sales7: 0,
    sales15: 1,
    sales30: 2,
    sales60: 3,
    sales90: 4,
    totalSales: 20,
    monthlySales: [],
    stock: 38,
    lifespan: 570,
    lifespanFirst: LIFESPAN_SIN_DATO,
    phase: { label: 'dormido', cls: '' },
    ...over,
  }
}

describe('armarItemDesdeProducto', () => {
  it('congela los números del momento y nace pendiente', () => {
    const i = armarItemDesdeProducto(prod())
    expect(i.pid).toBe('p1')
    expect(i.estado).toBe('pendiente')
    expect(i.foto.costo).toBe(12400)
    expect(i.foto.precioNormal).toBe(49900)
    expect(i.foto.stock).toBe(38)
    expect(i.foto.ventas90).toBe(4)
    expect(i.foto.diasSinVender).toBe(61)
    expect(i.decision.precioSale).toBeNull()
  })

  it('la vida útil centinela se guarda como "no se sabe", no como 99999 días', () => {
    expect(armarItemDesdeProducto(prod({ lifespan: LIFESPAN_SIN_DATO })).foto.vidaUtil).toBeNull()
    expect(armarItemDesdeProducto(prod({ lifespan: 570 })).foto.vidaUtil).toBe(570)
  })

  it('un promo de 0 en Tienda Nube es "no hay promo", no "sale gratis"', () => {
    expect(armarItemDesdeProducto(prod(), { promo: 0 }).foto.promoPrevia).toBeNull()
    expect(armarItemDesdeProducto(prod(), { promo: 39900 }).foto.promoPrevia).toBe(39900)
  })

  it('sin índice de Tienda Nube entra igual, sin foto', () => {
    expect(armarItemDesdeProducto(prod()).foto.imagen).toBeNull()
  })
})

describe('decidirItem', () => {
  it('por porcentaje redondea a terminar en 90, y el % guardado es el REAL', () => {
    const i = decidirItem(armarItemDesdeProducto(prod()), { pctDesc: 30 })
    // 49900 × 0,70 = 34.930 → redondear90 → 34.890
    expect(i.decision.precioSale).toBe(34890)
    expect(i.estado).toBe('definido')
    // El descuento que va a ver el cliente es 30,08%, redondeado a 30 — derivado del precio final,
    // no del 30 que se pidió.
    expect(i.decision.pctDesc).toBe(30)
  })

  it('por precio respeta lo que se tipeó: no se le mueve el número a quien lo decidió', () => {
    const i = decidirItem(armarItemDesdeProducto(prod()), { precioSale: 34500 })
    expect(i.decision.precioSale).toBe(34500)
  })

  it('el markup y el margen salen de comisiones/core (no hay una segunda fórmula acá)', () => {
    const i = decidirItem(armarItemDesdeProducto(prod()), { precioSale: 24800 })
    // markup = (24800/12400 − 1)×100 = 100 ; margen = (24800−12400)/24800×100 = 50
    expect(i.decision.markup).toBeCloseTo(100, 5)
    expect(i.decision.margen).toBeCloseTo(50, 5)
  })

  it('no muta el ítem original', () => {
    const base = armarItemDesdeProducto(prod())
    decidirItem(base, { pctDesc: 40 })
    expect(base.estado).toBe('pendiente')
    expect(base.decision.precioSale).toBeNull()
  })

  it('despejar lo devuelve a la pila pero le conserva la nota, que es de la persona', () => {
    const i = decidirItem(armarItemDesdeProducto(prod()), { pctDesc: 30 })
    const conNota = { ...i, decision: { ...i.decision, nota: 'ojo con el color' } }
    const vuelto = despejarItem(conNota)
    expect(vuelto.estado).toBe('pendiente')
    expect(vuelto.decision.precioSale).toBeNull()
    expect(vuelto.decision.nota).toBe('ojo con el color')
  })
})

describe('precioDeSale', () => {
  it('es la MISMA regla que usa decidirItem: lo que el modal muestra es lo que se guarda', () => {
    const base = armarItemDesdeProducto(prod())
    for (const entrada of [{ pctDesc: 30 }, { pctDesc: 45.5 }, { precioSale: 34500 }, { precioSale: 12000.4 }]) {
      expect(precioDeSale(base.foto.precioNormal, entrada)).toBe(decidirItem(base, entrada).decision.precioSale)
    }
  })

  it('por porcentaje termina en 90 y por precio no se toca', () => {
    expect(precioDeSale(49900, { pctDesc: 30 })).toBe(34890)
    expect(precioDeSale(49900, { precioSale: 34500 })).toBe(34500)
  })
})

describe('anotarItem', () => {
  it('la nota va aparte de la decisión: se puede anotar uno sin precio', () => {
    const i = anotarItem(armarItemDesdeProducto(prod()), '  fuera de temporada  ')
    expect(i.decision.nota).toBe('fuera de temporada')
    expect(i.decision.precioSale).toBeNull()
    expect(i.estado).toBe('pendiente')
  })

  it('vaciar el campo deja null, no una cadena vacía (la grilla pregunta por null)', () => {
    const conNota = anotarItem(armarItemDesdeProducto(prod()), 'algo')
    expect(anotarItem(conNota, '   ').decision.nota).toBeNull()
    expect(anotarItem(conNota, null).decision.nota).toBeNull()
  })

  it('no muta el original ni le toca el precio decidido', () => {
    const decidido = decidirItem(armarItemDesdeProducto(prod()), { pctDesc: 30 })
    const anotado = anotarItem(decidido, 'quedan 3')
    expect(decidido.decision.nota).toBeNull()
    expect(anotado.decision.precioSale).toBe(decidido.decision.precioSale)
    expect(anotado.estado).toBe('definido')
  })
})

describe('avisos', () => {
  it('🔴 un costo que no vino de Gestión Nube es de nivel alto y NO se confunde con costo cero', () => {
    const a = avisos(armarItemDesdeProducto(prod({ sinCosto: true, unit_cost: 0 })))
    const alto = a.filter((x) => x.nivel === 'alto')
    expect(alto.length).toBeGreaterThan(0)
    expect(alto[0].texto).toContain('no vino de Gestión Nube')
    // Y no duplica el aviso de "costo $0 cargado": son dos cosas distintas y sólo una es cierta.
    expect(a.some((x) => x.texto.includes('costo $0 cargado'))).toBe(false)
  })

  it('un costo cero de verdad también avisa, con su propio texto', () => {
    const a = avisos(armarItemDesdeProducto(prod({ sinCosto: false, unit_cost: 0 })))
    expect(a.some((x) => x.nivel === 'alto' && x.texto.includes('costo $0'))).toBe(true)
  })

  it('un precio de sale por debajo del costo frena', () => {
    const i = decidirItem(armarItemDesdeProducto(prod()), { precioSale: 9900 })
    expect(avisos(i).some((x) => x.nivel === 'alto' && x.texto.includes('pierde plata'))).toBe(true)
  })

  it('un precio de sale que no baja nada frena', () => {
    const i = decidirItem(armarItemDesdeProducto(prod()), { precioSale: 52000 })
    expect(avisos(i).some((x) => x.nivel === 'alto' && x.texto.includes('no es menor'))).toBe(true)
  })

  it('si hoy ya está más barato en la tienda, avisa (medio: se decide igual)', () => {
    const base = armarItemDesdeProducto(prod(), { promo: 32000 })
    const i = decidirItem(base, { precioSale: 34890 })
    const a = avisos(i)
    expect(a.some((x) => x.nivel === 'medio' && x.texto.includes('ya está en oferta'))).toBe(true)
  })

  it('sin stock avisa, pero no frena: no es un error, es que no mueve nada', () => {
    const a = avisos(armarItemDesdeProducto(prod({ stock: 0 })))
    expect(a.some((x) => x.nivel === 'medio' && x.texto.includes('No queda stock'))).toBe(true)
    expect(a.some((x) => x.nivel === 'alto')).toBe(false)
  })

  it('un producto sano y bien definido no tiene ningún aviso', () => {
    const i = decidirItem(armarItemDesdeProducto(prod()), { pctDesc: 30 })
    expect(avisos(i)).toEqual([])
  })
})

describe('resumenCampania', () => {
  const item = (over: Partial<Producto>, decision?: { pctDesc: number } | { precioSale: number }): LiquidacionItem => {
    const base = armarItemDesdeProducto(prod(over))
    return decision ? decidirItem(base, decision) : base
  }

  it('cuenta por estado', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b' }, { pctDesc: 30 }),
      { ...item({ id: 'c' }), estado: 'descartado' as const },
    ]
    expect(contar(items)).toEqual({ total: 3, pendientes: 1, definidos: 1, descartados: 1, aplicados: 0 })
  })

  it('🔑 el descuento promedio va ponderado por STOCK, no por producto', () => {
    // 40% en un producto de 3 unidades y 10% en uno de 200 no es "25% de descuento": es 10,4%.
    const items = [
      item({ id: 'a', stock: 3, retailer_price: 10000, unit_cost: 1000 }, { pctDesc: 40 }),
      item({ id: 'b', stock: 200, retailer_price: 10000, unit_cost: 1000 }, { pctDesc: 10 }),
    ]
    const r = resumenCampania(items)
    // Los % reales tras redondear a 90 son 40 y 10; ponderados: (40×3 + 10×200) / 203 ≈ 10,44
    expect(r.descPromedio).toBeCloseTo(10.44, 1)
  })

  it('sin nada definido, el descuento promedio es null y no 0', () => {
    expect(resumenCampania([item({ id: 'a' })]).descPromedio).toBeNull()
  })

  it('los descartados no cuentan en la plata parada: ya se decidió que no van', () => {
    const vivo = item({ id: 'a', stock: 10, unit_cost: 1000 })
    const muerto = { ...item({ id: 'b', stock: 10, unit_cost: 1000 }), estado: 'descartado' as const }
    expect(resumenCampania([vivo, muerto]).plataInmovilizada).toBe(10000)
  })

  it('lo que se resigna es contra el precio de lista, por unidad de stock', () => {
    const i = item({ id: 'a', stock: 10, retailer_price: 10000, unit_cost: 1000 }, { precioSale: 7000 })
    expect(resumenCampania([i]).resigna).toBe(30000)
  })

  it('cuenta cuántos ítems tienen un problema que frena', () => {
    const items = [
      item({ id: 'a' }, { pctDesc: 30 }),
      item({ id: 'b', sinCosto: true, unit_cost: 0 }),
    ]
    expect(resumenCampania(items).conProblema).toBe(1)
  })
})

describe('itemsAplicables', () => {
  it('sólo los definidos con precio: un pendiente o un descartado no se escriben en Gestión Nube', () => {
    const definido = decidirItem(armarItemDesdeProducto(prod({ id: 'a' })), { pctDesc: 30 })
    const pendiente = armarItemDesdeProducto(prod({ id: 'b' }))
    const descartado = { ...decidirItem(armarItemDesdeProducto(prod({ id: 'c' })), { pctDesc: 30 }), estado: 'descartado' as const }
    const aplicado = { ...definido, pid: 'd', estado: 'aplicado' as const }

    expect(itemsAplicables([definido, pendiente, descartado, aplicado]).map((i) => i.pid)).toEqual(['a'])
  })
})

describe('faltantes', () => {
  const productos = [prod({ id: 'a' }), prod({ id: 'b' }), prod({ id: 'c' })]

  it('sin campaña (mapa vacío) faltan todos', () => {
    expect(faltantes(productos, {}).map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('saca los que ya están, sea cual sea su estado', () => {
    const ya: Record<string, EstadoItem> = { a: 'pendiente', b: 'definido' }
    expect(faltantes(productos, ya).map((p) => p.id)).toEqual(['c'])
  })

  it('🔑 un descartado cuenta como presente: ya se lo miró y se dijo que no', () => {
    expect(faltantes(productos, { a: 'descartado' }).map((p) => p.id)).toEqual(['b', 'c'])
  })

  it('con todos adentro no falta ninguno', () => {
    expect(faltantes(productos, { a: 'pendiente', b: 'definido', c: 'aplicado' })).toEqual([])
  })

  it('un pid de la campaña que ya no está en el ETL no inventa un producto', () => {
    expect(faltantes(productos, { z: 'definido' }).map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })
})
