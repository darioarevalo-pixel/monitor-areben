import { describe, it, expect } from 'vitest'
import { agotadosQueNoCierran, canalDe, diasDeRango, rangoDeCampania, resultadoCampania } from '@/lib/liquidacion'
import type { LiquidacionItem } from '@/lib/liquidacion'
import type { LineaVenta } from '@/lib/liquidacion/ventas'

/**
 * Liquidación — el resultado de una campaña.
 *
 * Lo que protege este archivo es la afirmación más fuerte de la pantalla: **"este precio estuvo
 * puesto"**. Los precios se cargan a mano en Gestión Nube, así que entre la decisión y el cliente
 * hay una persona tipeando cuarenta productos; si el cómputo se equivoca acá, la pantalla dice que
 * la campaña salió bien cuando en realidad nunca llegó a la calle.
 *
 * Los dos que más importan:
 *
 *  - que una venta **mayorista** no cuente como "no se cargó el precio" (sale a precio mayorista, y
 *    mezclarla hunde el promedio de cualquier producto bien cargado), y
 *  - que las **ventas técnicas** del Monitor (Sesión de Fotos y Fallas, precio 0) no entren: una
 *    funda regalada tira el precio promedio al piso y marca un producto sano como mal cargado.
 */

function item(over: Partial<LiquidacionItem> = {}): LiquidacionItem {
  const base: LiquidacionItem = {
    pid: 'p1',
    estado: 'definido',
    foto: {
      nombre: 'Campera puffer negra',
      sku: 'CAM-004',
      costo: 12400,
      sinCosto: false,
      precioNormal: 49900,
      promoPrevia: null,
      stock: 40,
      ventas7: 0,
      ventas30: 3,
      ventas90: 9, // 0,1 por día
      vidaUtil: null,
      ultimaVenta: null,
      diasSinVender: 20,
      imagen: null,
    },
    decision: {
      precioSale: 34900,
      pctDesc: 30,
      markup: null,
      margen: null,
      nota: null,
      porQuien: null,
      cuando: null,
    },
    aplicacion: { aplicadoEn: null, variantesEscritas: null, categoriaSaleAgregada: false },
  }
  return {
    ...base,
    ...over,
    foto: { ...base.foto, ...(over.foto || {}) },
    decision: { ...base.decision, ...(over.decision || {}) },
  }
}

function linea(over: Partial<LineaVenta> = {}): LineaVenta {
  const unidades = over.unidades ?? 1
  const precio = over.precioUnitario ?? 34900
  return {
    pid: 'p1',
    fecha: '2026-08-03',
    canal: 'Mi Local',
    unidades,
    plata: over.plata ?? precio * unidades,
    precioUnitario: precio,
    ...over,
  }
}

const RANGO = { desde: '2026-08-01', hasta: '2026-08-10', enCurso: false }

describe('canalDe', () => {
  it('reconoce los seis canales que existen hoy en las dos marcas', () => {
    expect(canalDe('Mi Local')).toBe('local')
    expect(canalDe('Minorista')).toBe('local')
    expect(canalDe('Tienda Nube')).toBe('online')
    expect(canalDe('Mayorista')).toBe('mayorista')
    expect(canalDe('Otro Canal')).toBe('otro')
    expect(canalDe('Ninguno')).toBe('tecnica')
  })

  it('trata el canal vacío como venta técnica y no como venta real', () => {
    expect(canalDe(null)).toBe('tecnica')
    expect(canalDe('')).toBe('tecnica')
  })
})

describe('diasDeRango', () => {
  it('cuenta las dos puntas: del 1 al 10 son diez días', () => {
    expect(diasDeRango('2026-08-01', '2026-08-10')).toBe(10)
  })

  it('un solo día es un día, no cero — es lo que divide al ritmo', () => {
    expect(diasDeRango('2026-08-01', '2026-08-01')).toBe(1)
  })

  it('cruza el cambio de mes', () => {
    expect(diasDeRango('2026-07-30', '2026-08-02')).toBe(4)
  })
})

describe('rangoDeCampania', () => {
  it('sin fecha de inicio no hay resultado posible', () => {
    expect(rangoDeCampania({ desde: null, hasta: '2026-08-30' }, '2026-08-10')).toBeNull()
  })

  it('corta en hoy la campaña que todavía no terminó', () => {
    const r = rangoDeCampania({ desde: '2026-08-01', hasta: '2026-08-30' }, '2026-08-10')
    expect(r).toEqual({ desde: '2026-08-01', hasta: '2026-08-10', enCurso: true })
  })

  it('una campaña sin fecha de fin también se corta en hoy y queda en curso', () => {
    const r = rangoDeCampania({ desde: '2026-08-01', hasta: null }, '2026-08-10')
    expect(r).toEqual({ desde: '2026-08-01', hasta: '2026-08-10', enCurso: true })
  })

  it('la que ya terminó se mide entera y no queda en curso', () => {
    const r = rangoDeCampania({ desde: '2026-07-01', hasta: '2026-07-15' }, '2026-08-10')
    expect(r).toEqual({ desde: '2026-07-01', hasta: '2026-07-15', enCurso: false })
  })
})

describe('resultadoCampania — si el precio llegó a estar puesto', () => {
  it('todo vendido al precio de sale: el precio estaba puesto', () => {
    const r = resultadoCampania([item()], [linea({ unidades: 4 })], RANGO)
    expect(r.items[0].carga).toBe('puesto')
    expect(r.items[0].unidadesAlSale).toBe(4)
    expect(r.sinCargar).toBe(0)
  })

  it('🔴 todo vendido a precio de lista: nadie lo cargó en Gestión Nube', () => {
    const r = resultadoCampania([item()], [linea({ unidades: 3, precioUnitario: 49900 })], RANGO)
    expect(r.items[0].carga).toBe('no_puesto')
    expect(r.items[0].unidadesALista).toBe(3)
    expect(r.sinCargar).toBe(1)
  })

  it('🔴 parte al sale y parte a lista: se cargó tarde, o en un canal solo', () => {
    const r = resultadoCampania(
      [item()],
      [
        linea({ unidades: 2, precioUnitario: 49900, canal: 'Tienda Nube' }),
        linea({ unidades: 5, precioUnitario: 34900, canal: 'Mi Local' }),
      ],
      RANGO,
    )
    expect(r.items[0].carga).toBe('a_medias')
    expect(r.aMedias).toBe(1)
    expect(r.items[0].porCanal.online.unidades).toBe(2)
    expect(r.items[0].porCanal.local.unidades).toBe(5)
  })

  it('un tercer precio no acusa a nadie: puede ser un descuento de caja', () => {
    const r = resultadoCampania([item()], [linea({ unidades: 1, precioUnitario: 31000 })], RANGO)
    expect(r.items[0].carga).toBe('otro_precio')
    expect(r.items[0].unidadesOtroPrecio).toBe(1)
  })

  it('los centavos del espejo no cuentan como otro precio', () => {
    const r = resultadoCampania([item()], [linea({ unidades: 1, precioUnitario: 34900.4 })], RANGO)
    expect(r.items[0].carga).toBe('puesto')
  })

  it('sin ventas no se afirma nada sobre la carga', () => {
    const r = resultadoCampania([item()], [], RANGO)
    expect(r.items[0].carga).toBe('sin_ventas')
    expect(r.sinCargar).toBe(0)
  })

  it('sin precio decidido tampoco', () => {
    const r = resultadoCampania(
      [item({ estado: 'pendiente', decision: { precioSale: null } as never })],
      [linea({ unidades: 2 })],
      RANGO,
    )
    expect(r.items[0].carga).toBe('sin_precio')
  })
})

describe('resultadoCampania — los canales que no se comparan', () => {
  it('🔑 una venta mayorista no marca el producto como mal cargado', () => {
    const r = resultadoCampania(
      [item()],
      [linea({ unidades: 6, precioUnitario: 12900, canal: 'Mayorista' }), linea({ unidades: 2 })],
      RANGO,
    )
    expect(r.items[0].carga).toBe('puesto')
    expect(r.items[0].unidades).toBe(2)
    expect(r.items[0].porCanal.mayorista.unidades).toBe(6)
  })

  it('🔑 una venta técnica a $0 no hunde el precio promedio', () => {
    const r = resultadoCampania(
      [item()],
      [linea({ unidades: 1, precioUnitario: 0, plata: 0, canal: 'Ninguno' }), linea({ unidades: 1 })],
      RANGO,
    )
    expect(r.items[0].precioReal).toBe(34900)
    expect(r.items[0].carga).toBe('puesto')
    expect(r.items[0].porCanal.tecnica.unidades).toBe(1)
  })
})

describe('resultadoCampania — la plata y el stock', () => {
  it('lo resignado se calcula sobre lo que se vendió, no sobre el stock entero', () => {
    // 4 unidades: $34.900 cobradas contra $49.900 de lista ⇒ $15.000 × 4.
    const r = resultadoCampania([item()], [linea({ unidades: 4 })], RANGO)
    expect(r.liquidados.plata).toBe(139600)
    expect(r.liquidados.plataALista).toBe(199600)
    expect(r.liquidados.resignado).toBe(60000)
  })

  it('el porcentaje del stock movido sale del stock que había al entrar', () => {
    const r = resultadoCampania([item({ foto: { stock: 40 } as never })], [linea({ unidades: 10 })], RANGO)
    expect(r.items[0].pctStockMovido).toBe(25)
  })

  it('sin stock inicial no se inventa un porcentaje', () => {
    const r = resultadoCampania([item({ foto: { stock: 0 } as never })], [], RANGO)
    expect(r.items[0].pctStockMovido).toBeNull()
  })
})

describe('resultadoCampania — el levante', () => {
  it('mide el ritmo de la campaña contra los 90 días previos de la foto', () => {
    // ventas90 = 9 ⇒ 0,1 por día. 5 unidades en 10 días ⇒ 0,5 por día ⇒ 5×.
    const r = resultadoCampania([item()], [linea({ unidades: 5 })], RANGO)
    expect(r.items[0].ritmoPrevio).toBeCloseTo(0.1)
    expect(r.items[0].ritmoDurante).toBeCloseTo(0.5)
    expect(r.items[0].levante).toBeCloseTo(5)
  })

  it('🔑 lo que no vendía nada no tiene levante infinito: no hay proporción, hay arranque', () => {
    const r = resultadoCampania([item({ foto: { ventas90: 0 } as never })], [linea({ unidades: 5 })], RANGO)
    expect(r.items[0].levante).toBeNull()
    expect(r.items[0].ritmoDurante).toBeCloseTo(0.5)
  })
})

describe('resultadoCampania — los descartados son el grupo de control', () => {
  const liquidado = item({ pid: 'p1' })
  const descartado = item({ pid: 'p2', estado: 'descartado', decision: { precioSale: null } as never })

  it('los descartados no entran en lo liquidado, y viceversa', () => {
    const r = resultadoCampania(
      [liquidado, descartado],
      [linea({ pid: 'p1', unidades: 5 }), linea({ pid: 'p2', unidades: 4, precioUnitario: 49900 })],
      RANGO,
    )
    expect(r.liquidados.productos).toBe(1)
    expect(r.liquidados.unidades).toBe(5)
    expect(r.control.productos).toBe(1)
    expect(r.control.unidades).toBe(4)
  })

  it('un descartado que vendió igual que un liquidado deja ver que el descuento no hacía falta', () => {
    const r = resultadoCampania(
      [liquidado, descartado],
      [linea({ pid: 'p1', unidades: 5 }), linea({ pid: 'p2', unidades: 5, precioUnitario: 49900 })],
      RANGO,
    )
    expect(r.liquidados.levante).toBeCloseTo(r.control.levante as number)
  })

  it('cuenta los que no se movieron ni una unidad', () => {
    const r = resultadoCampania([liquidado, item({ pid: 'p3' })], [linea({ pid: 'p1', unidades: 2 })], RANGO)
    expect(r.liquidados.sinMoverse).toBe(1)
  })

  it('un pendiente sin precio no ensucia ninguno de los dos bloques', () => {
    const r = resultadoCampania(
      [liquidado, item({ pid: 'p9', estado: 'pendiente', decision: { precioSale: null } as never })],
      [linea({ pid: 'p1', unidades: 1 })],
      RANGO,
    )
    expect(r.liquidados.productos).toBe(1)
    expect(r.control.productos).toBe(0)
    expect(r.items).toHaveLength(2)
  })
})

/**
 * La caminata corta: de los que el sistema da por agotados, cuáles no cierran.
 *
 * 🔑 **El test que más importa es el del mayorista y las ventas técnicas.** Dos funciones de este
 * mismo archivo miran las mismas líneas con reglas opuestas y las dos están bien:
 * `resultadoCampania` los excluye —salen a otro precio y hunden el promedio— y esta los cuenta
 * —descuentan stock igual—. Copiar el filtro de canal de una a la otra es el error natural, y deja
 * a la pantalla acusando al local de perder prendas que salieron bien.
 */
describe('agotadosQueNoCierran', () => {
  const agotado = { p1: 0 }

  it('el que cierra solo no aparece: entró con 2, salieron 2, el sistema dice 0', () => {
    const items = [item({ pid: 'p1', foto: { stock: 2 } as never })]
    expect(agotadosQueNoCierran(items, [linea({ pid: 'p1', unidades: 2 })], agotado)).toHaveLength(0)
  })

  it('el que se agotó sin vender nada dice cuántas prendas hay en algún lado', () => {
    const items = [item({ pid: 'p1', foto: { nombre: 'BODY SOUTH', stock: 2 } as never })]
    const [a] = agotadosQueNoCierran(items, [], agotado)
    expect(a.nombre).toBe('BODY SOUTH')
    expect(a.salieron).toBe(0)
    expect(a.diferencia).toBe(2)
  })

  it('el que vendió más de lo que había da la diferencia al revés', () => {
    const items = [item({ pid: 'p1', foto: { nombre: 'JEAN TORIN', stock: 2 } as never })]
    const [a] = agotadosQueNoCierran(items, [linea({ pid: 'p1', unidades: 3 })], agotado)
    expect(a.diferencia).toBe(-1)
  })

  it('🔴 cuenta el mayorista y las ventas técnicas: descuentan stock igual que una venta de local', () => {
    const items = [item({ pid: 'p1', foto: { stock: 3 } as never })]
    const lineas = [
      linea({ pid: 'p1', unidades: 1, canal: 'Mi Local' }),
      linea({ pid: 'p1', unidades: 1, canal: 'Mayorista' }),
      linea({ pid: 'p1', unidades: 1, canal: 'Ninguno', plata: 0, precioUnitario: 0 }),
    ]
    expect(agotadosQueNoCierran(items, lineas, agotado)).toHaveLength(0)
  })

  it('el que todavía tiene stock no es una caminata, por mal que cierre la cuenta', () => {
    const items = [item({ pid: 'p1', foto: { stock: 9 } as never })]
    expect(agotadosQueNoCierran(items, [], { p1: 4 })).toHaveLength(0)
  })

  it('sin fila en el inventario no se acusa: no se sabe si está agotado o si no cruzó', () => {
    const items = [item({ pid: 'p1', foto: { stock: 2 } as never })]
    expect(agotadosQueNoCierran(items, [], {})).toHaveLength(0)
  })

  it('un descartado también se camina: la pregunta es física, no del precio que se le puso', () => {
    const items = [item({ pid: 'p1', estado: 'descartado', foto: { stock: 1 } as never })]
    expect(agotadosQueNoCierran(items, [], agotado)).toHaveLength(1)
  })

  it('primero el que más lejos está de cerrar', () => {
    const items = [
      item({ pid: 'p1', foto: { stock: 1 } as never }),
      item({ pid: 'p2', foto: { stock: 5 } as never }),
      item({ pid: 'p3', foto: { stock: 2 } as never }),
    ]
    const r = agotadosQueNoCierran(items, [], { p1: 0, p2: 0, p3: 0 })
    expect(r.map((a) => a.pid)).toEqual(['p2', 'p3', 'p1'])
  })
})

/**
 * El rango se filtra acá adentro y no se da por hecho: la pantalla baja las ventas **hasta hoy**
 * para poder conciliar el stock, así que una campaña cerrada recibe líneas posteriores a su fin.
 */
describe('resultadoCampania · el corte del rango', () => {
  it('una venta posterior al fin de la campaña no entra en sus números', () => {
    const r = resultadoCampania(
      [item({ pid: 'p1' })],
      [linea({ pid: 'p1', unidades: 3, fecha: '2026-08-14' })],
      RANGO,
    )
    expect(r.liquidados.unidades).toBe(0)
  })

  it('ni una anterior al inicio', () => {
    const r = resultadoCampania(
      [item({ pid: 'p1' })],
      [linea({ pid: 'p1', unidades: 3, fecha: '2026-07-28' })],
      RANGO,
    )
    expect(r.liquidados.unidades).toBe(0)
  })

  it('la del rango sí', () => {
    const r = resultadoCampania(
      [item({ pid: 'p1' })],
      [linea({ pid: 'p1', unidades: 3, fecha: '2026-08-10' })],
      RANGO,
    )
    expect(r.liquidados.unidades).toBe(3)
  })
})
