import { describe, it, expect } from 'vitest'
import {
  anotarItem,
  armarItemDesdeProducto,
  avisos,
  confirmarItem,
  contar,
  decidirItem,
  despejarItem,
  faltanRevisar,
  faltantes,
  itemsAplicables,
  objetados,
  objetarItem,
  pidsPorAplicar,
  precioDeSale,
  reprecificar,
  TOPE_APLICAR,
  resumenCampania,
  revisionDe,
  tipoDe,
} from '@/lib/liquidacion'
import type { EstadoItem, LiquidacionItem, TipoCampania } from '@/lib/liquidacion'
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
    ingresoMes: null, ingresoFecha: null, diasVivo: null,
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

  it('🔑 cada aviso viaja con su clave: el modal lo filtra por identidad, no por texto', () => {
    // El de `ya-en-oferta` se oculta mientras el precio está precargado y nadie lo tocó (ahí no
    // advierte nada: describe el punto de partida). Si eso se filtrara por el texto, cambiarle una
    // palabra al cartel lo haría reaparecer en silencio y ningún test se enteraría.
    const base = armarItemDesdeProducto(prod(), { promo: 32000 })
    const i = decidirItem(base, { precioSale: 32000 })
    expect(avisos(i).map((x) => x.clave)).toContain('ya-en-oferta')

    // Y las claves son únicas dentro de una misma tanda: se usan de `key` al dibujarlas.
    const roto = decidirItem(armarItemDesdeProducto(prod({ sinCosto: true, unit_cost: 0, stock: 0 })), { precioSale: 99000 })
    const claves = avisos(roto).map((x) => x.clave)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('las dos ramas del costo no comparten clave: `sin-costo` no es `costo-cero`', () => {
    expect(avisos(armarItemDesdeProducto(prod({ sinCosto: true, unit_cost: 0 }))).map((x) => x.clave)).toContain('sin-costo')
    expect(avisos(armarItemDesdeProducto(prod({ sinCosto: false, unit_cost: 0 }))).map((x) => x.clave)).toContain('costo-cero')
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
    expect(contar(items)).toEqual({ total: 3, pendientes: 1, definidos: 1, confirmados: 0, descartados: 1, aplicados: 0 })
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
  it('🔑 pide CONFIRMADO: un precio sin segunda mirada no se escribe en Gestión Nube', () => {
    // Si acá entrara un `definido`, la pestaña Revisión sería un cartel y no una puerta.
    const definido = decidirItem(armarItemDesdeProducto(prod({ id: 'a' })), { pctDesc: 30 })
    const confirmado = confirmarItem({ ...definido, pid: 'e' }, 'Darío')
    const pendiente = armarItemDesdeProducto(prod({ id: 'b' }))
    const descartado = { ...decidirItem(armarItemDesdeProducto(prod({ id: 'c' })), { pctDesc: 30 }), estado: 'descartado' as const }
    const aplicado = { ...definido, pid: 'd', estado: 'aplicado' as const }

    expect(itemsAplicables([definido, confirmado, pendiente, descartado, aplicado]).map((i) => i.pid)).toEqual(['e'])
  })
})

describe('pidsPorAplicar', () => {
  const definido = decidirItem(armarItemDesdeProducto(prod({ id: 'a' })), { pctDesc: 30 })
  const confirmado = confirmarItem({ ...definido, pid: 'b' }, 'Darío')
  const aplicado = { ...confirmado, pid: 'c', estado: 'aplicado' as const }
  const descartado = { ...definido, pid: 'd', estado: 'descartado' as const }
  const todos = [definido, confirmado, aplicado, descartado]

  it('poner: los confirmados, sin los que ya están puestos', () => {
    expect(pidsPorAplicar(todos, 'poner')).toEqual(['b'])
  })

  it('sacar: sólo los que hoy tienen precio puesto en Gestión Nube', () => {
    expect(pidsPorAplicar(todos, 'sacar')).toEqual(['c'])
  })

  it('🔑 poner y sacar no se pisan: ningún pid está en las dos listas', () => {
    // `aplicado` significa "su precio está puesto AHORA". Si un pid cayera en las dos, aplicar y
    // sacar se estarían peleando por el mismo producto y el último en correr ganaría.
    const poner = new Set(pidsPorAplicar(todos, 'poner'))
    expect(pidsPorAplicar(todos, 'sacar').some((pid) => poner.has(pid))).toBe(false)
  })

  it('🔑 lo aplicado sale de la lista: volver a apretar no reescribe lo hecho', () => {
    // Es lo que hace que cortar a la mitad y retomar sea gratis, sin llevar la cuenta en ningún lado.
    const yaEsta = [{ ...confirmado, estado: 'aplicado' as const }]
    expect(pidsPorAplicar(yaEsta, 'poner')).toEqual([])
  })

  it('un confirmado sin precio no se escribe', () => {
    const sinPrecio = confirmarItem({ ...armarItemDesdeProducto(prod({ id: 'e' })), pid: 'e' }, 'Darío')
    expect(pidsPorAplicar([sinPrecio], 'poner')).toEqual([])
  })

  it('el tope por viaje lo fija el límite de Gestión Nube, no el gusto', () => {
    // 2 consultas por segundo ⇒ 1200 ms entre producto y producto ⇒ cinco entran en ~7 s.
    expect(TOPE_APLICAR).toBe(5)
  })
})

describe('reprecificar', () => {
  it('🔑 calcula sobre el precio de LISTA, no sobre el sale vigente', () => {
    // Encadenar descuentos sobre lo ya descontado da números que nadie puede reconstruir: «20% al
    // cerrar» tiene que significar lo mismo mire quien mire.
    const alCincuenta = decidirItem(armarItemDesdeProducto(prod({ id: 'a', retailer_price: 50000 })), { pctDesc: 50 })
    expect(alCincuenta.decision.precioSale).toBe(precioDeSale(50000, { pctDesc: 50 }))

    const [reprecificado] = reprecificar([alCincuenta], 20, 'Bruno')
    expect(reprecificado.decision.precioSale).toBe(precioDeSale(50000, { pctDesc: 20 }))
  })

  it('respeta el redondeo de siempre en vez de una cuenta nueva', () => {
    const item = armarItemDesdeProducto(prod({ id: 'b', retailer_price: 52490 }))
    const [r] = reprecificar([item], 20, null)
    // 52490 × 0,8 = 41.992 → termina en 90, como todo precio de la casa.
    expect(r.decision.precioSale).toBe(41990)
  })

  it('🔑 deja los ítems en «definido»: un precio nuevo es un precio que nadie miró', () => {
    const confirmado = confirmarItem(decidirItem(armarItemDesdeProducto(prod({ id: 'c' })), { pctDesc: 40 }), 'Darío')
    const [r] = reprecificar([confirmado], 20, 'Bruno')
    expect(r.estado).toBe('definido')
    expect(revisionDe(r).porQuien).toBeNull()
  })

  it('no toca los descartados ni los que no tienen precio de lista', () => {
    const descartado = { ...armarItemDesdeProducto(prod({ id: 'd' })), estado: 'descartado' as const }
    const sinLista = armarItemDesdeProducto(prod({ id: 'e', retailer_price: 0 }))
    expect(reprecificar([descartado, sinLista], 20, null)).toEqual([])
  })
})

describe('la segunda mirada', () => {
  const conPrecio = (id: string) => decidirItem(armarItemDesdeProducto(prod({ id })), { pctDesc: 30 }, 'Bruno')

  it('confirmar sin tocar el precio no lo mueve, y deja quién y cuándo', () => {
    const i = conPrecio('a')
    const c = confirmarItem(i, 'Darío')
    expect(c.estado).toBe('confirmado')
    expect(c.decision.precioSale).toBe(i.decision.precioSale)
    expect(revisionDe(c).porQuien).toBe('Darío')
    expect(revisionDe(c).cuando).toBeTypeOf('number')
    expect(revisionDe(c).precioAnterior).toBeNull()
  })

  it('🔑 confirmar cambiando el precio guarda contra qué lo cambió', () => {
    // Sin `precioAnterior`, `decision.porQuien` ya quedó pisado con el nombre del revisor y el que
    // lo había puesto no tiene forma de ver qué le movieron.
    const i = conPrecio('a')
    const c = confirmarItem(i, 'Darío', { precioSale: 19990 })
    expect(c.estado).toBe('confirmado')
    expect(c.decision.precioSale).toBe(19990)
    expect(revisionDe(c).precioAnterior).toBe(i.decision.precioSale)
  })

  it('confirmar con el MISMO precio no inventa un cambio', () => {
    const i = conPrecio('a')
    const c = confirmarItem(i, 'Darío', { precioSale: i.decision.precioSale! })
    expect(revisionDe(c).precioAnterior).toBeNull()
  })

  it('objetar deja el precio donde está y lo devuelve a definido, no a pendiente', () => {
    // Objetar no es borrar: quien lo puso tiene que ver qué número se cuestionó.
    const i = conPrecio('a')
    const o = objetarItem(i, 'Darío', 'queda abajo del costo con la comisión de TN')
    expect(o.estado).toBe('definido')
    expect(o.decision.precioSale).toBe(i.decision.precioSale)
    expect(revisionDe(o).objecion).toBe('queda abajo del costo con la comisión de TN')
  })

  it('objetar sin motivo no se puede: una devolución muda se lee igual que "no lo miré"', () => {
    expect(() => objetarItem(conPrecio('a'), 'Darío', '   ')).toThrow()
  })

  it('🔴 un precio nuevo BORRA la revisión, venga de una confirmación o de una objeción', () => {
    // Si la objeción quedara pegada, acusaría al número nuevo de algo que era del viejo; y una
    // confirmación que sobrevive a un cambio de precio dice que alguien miró lo que nunca vio.
    const objetado = objetarItem(conPrecio('a'), 'Darío', 'muy bajo')
    const reprecio = decidirItem(objetado, { pctDesc: 20 }, 'Bruno')
    expect(reprecio.estado).toBe('definido')
    expect(revisionDe(reprecio).objecion).toBeNull()

    const confirmado = confirmarItem(conPrecio('b'), 'Darío')
    const recambiado = decidirItem(confirmado, { pctDesc: 25 }, 'Bruno')
    expect(recambiado.estado).toBe('definido')
    expect(revisionDe(recambiado).porQuien).toBeNull()
  })

  it('despejar el precio también se lleva la revisión', () => {
    const c = confirmarItem(conPrecio('a'), 'Darío')
    expect(revisionDe(despejarItem(c)).porQuien).toBeNull()
  })

  it('faltanRevisar cuenta los definidos, objetados incluidos; los confirmados no', () => {
    const sinMirar = conPrecio('a')
    const objetado = objetarItem(conPrecio('b'), 'Darío', 'muy bajo')
    const confirmado = confirmarItem(conPrecio('c'), 'Darío')
    const pendiente = armarItemDesdeProducto(prod({ id: 'd' }))
    const items = [sinMirar, objetado, confirmado, pendiente]

    expect(faltanRevisar(items).map((i) => i.pid)).toEqual(['a', 'b'])
    expect(objetados(items).map((i) => i.pid)).toEqual(['b'])
  })

  it('un ítem viejo sin el campo `revision` no rompe', () => {
    const viejo = { ...conPrecio('a') } as LiquidacionItem
    delete viejo.revision
    expect(revisionDe(viejo).porQuien).toBeNull()
    expect(faltanRevisar([viejo]).map((i) => i.pid)).toEqual(['a'])
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

/**
 * El tipo de campaña: lo que cambia y lo que NO.
 *
 * 🔑 **El motor es el mismo.** Un ajuste de precio se escribe con el mismo `aplicar`, se guarda con
 * el mismo `decidirItem` y se redondea igual. Lo único que el tipo mueve son los avisos que dan por
 * sentado que el precio nuevo baja — y en un ajuste eso no es un descuido, es lo que se vino a
 * hacer.
 */
describe('tipo de campaña', () => {
  const arriba = () => decidirItem(armarItemDesdeProducto(prod(), { promo: 32000 }), { precioSale: 60000 })
  const conPrecio = (over: Partial<Producto>, decision: { precioSale: number }): LiquidacionItem =>
    decidirItem(armarItemDesdeProducto(prod(over)), decision)

  it('en una liquidación, un precio que no baja frena', () => {
    const claves = avisos(arriba(), 'liquidacion').map((a) => a.clave)
    expect(claves).toContain('no-es-descuento')
    expect(claves).toContain('ya-en-oferta')
  })

  it('en un ajuste, esos dos avisos no van: describen lo que se vino a hacer', () => {
    const claves = avisos(arriba(), 'ajuste').map((a) => a.clave)
    expect(claves).not.toContain('no-es-descuento')
    expect(claves).not.toContain('ya-en-oferta')
  })

  it('🔴 pero el ajuste NO apaga los que hablan de plata: bajo costo sigue frenando', () => {
    // Apagar por tipo tiene que ser una lista corta y explícita. El día que `apaga` se convierta en
    // "los altos molestan", un ajuste puede escribir un precio abajo del costo sin que nada avise.
    const bajoCosto = decidirItem(armarItemDesdeProducto(prod()), { precioSale: 9900 })
    expect(avisos(bajoCosto, 'ajuste').map((a) => a.clave)).toContain('bajo-costo')
    expect(avisos(armarItemDesdeProducto(prod({ sinCosto: true, unit_cost: 0 })), 'ajuste').map((a) => a.clave)).toContain('sin-costo')
  })

  it('una promo puntual avisa igual que una liquidación', () => {
    expect(avisos(arriba(), 'promo').map((a) => a.clave)).toEqual(avisos(arriba(), 'liquidacion').map((a) => a.clave))
  })

  it('sin tipo se lee como liquidación: el default avisa de MÁS, nunca de menos', () => {
    expect(avisos(arriba()).map((a) => a.clave)).toEqual(avisos(arriba(), 'liquidacion').map((a) => a.clave))
    expect(tipoDe(null)).toBe('liquidacion')
    expect(tipoDe({})).toBe('liquidacion')
    expect(tipoDe({ tipo: 'basura' as TipoCampania })).toBe('liquidacion')
    expect(tipoDe({ tipo: 'ajuste' })).toBe('ajuste')
  })

  it('🔴 una SUBA resta en lo que se resigna, no cuenta cero', () => {
    // El `Math.max(0, …)` que había escondía los productos que quedaron arriba del precio de lista:
    // en una liquidación eso es un error que el resumen tapaba, y en un ajuste que sube a propósito
    // el número directamente no cerraba.
    const baja = conPrecio({ id: 'a', stock: 10, retailer_price: 10000, unit_cost: 1000 }, { precioSale: 7000 })
    const sube = conPrecio({ id: 'b', stock: 10, retailer_price: 10000, unit_cost: 1000 }, { precioSale: 12000 })
    expect(resumenCampania([sube]).resigna).toBe(-20000)
    expect(resumenCampania([baja, sube]).resigna).toBe(10000)
  })

  it('y el conteo de problemas sigue al tipo', () => {
    const items = [arriba()]
    expect(resumenCampania(items, 'liquidacion').conProblema).toBe(1)
    expect(resumenCampania(items, 'ajuste').conProblema).toBe(0)
  })
})
