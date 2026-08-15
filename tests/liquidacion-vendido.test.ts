import { describe, expect, it } from 'vitest'
import { enSale, lineasEnSale, primerDiaEnSale, ventanasDe } from '@/lib/liquidacion/vendido.core.js'
import { enSaleDelMes, ofertaHoy, resumirSale, type LineaSale } from '@/lib/liquidacion/vendido'
import { cortesDeVentas } from '@/lib/etl/helpers'
import { indexarTn } from '@/lib/tn'
import { puedeVer, puedeVerAlguna, SECCIONES_ANALISIS_VENTAS, type Perfil } from '@/lib/permisos'
import { PERM_CAT } from '@/lib/nav'
import type { Producto } from '@/lib/etl/tipos'

const perfil = (over: Partial<Perfil> = {}): Perfil => ({
  name: 'Ana',
  admin: false,
  cuenta: null,
  acceso: { bdi: {}, zattia: {} },
  funcion: [],
  ...over,
})

const ev = (pid: string, modo: 'poner' | 'sacar', cuando: string) => ({ pid, modo, cuando })

describe('ventanasDe — de la bitácora a "cuándo estuvo en sale"', () => {
  it('un poner y su sacar arman una ventana cerrada, en días', () => {
    const v = ventanasDe([ev('1', 'poner', '2026-08-13T12:30:00Z'), ev('1', 'sacar', '2026-08-19T18:00:00Z')])
    expect(v.get('1')).toEqual([{ desde: '2026-08-13', hasta: '2026-08-19' }])
  })

  it('un poner sin sacar deja la ventana abierta', () => {
    const v = ventanasDe([ev('1', 'poner', '2026-08-13T12:30:00Z')])
    expect(v.get('1')).toEqual([{ desde: '2026-08-13', hasta: null }])
  })

  it('🔑 el sacar CIERRA aunque haya dejado un precio (volver a la oferta previa)', () => {
    // `destino:'previa'` escribe una oferta al salir del sale. Si la ventana no cerrara ahí, todo
    // lo que ese producto venda de acá en adelante quedaría marcado como venta de liquidación.
    const v = ventanasDe([
      { pid: '1', modo: 'poner', cuando: '2026-08-13T12:00:00Z' },
      { pid: '1', modo: 'sacar', cuando: '2026-08-19T12:00:00Z' },
    ])
    expect(v.get('1')![0].hasta).toBe('2026-08-19')
    expect(enSale(v, '1', '2026-08-25')).toBe(false)
  })

  it('dos poner seguidos no abren dos ventanas (reprecificar es adentro del mismo sale)', () => {
    const v = ventanasDe([ev('1', 'poner', '2026-08-13T12:00:00Z'), ev('1', 'poner', '2026-08-15T12:00:00Z')])
    expect(v.get('1')).toEqual([{ desde: '2026-08-13', hasta: null }])
  })

  it('un sacar sin nada abierto se ignora', () => {
    const v = ventanasDe([ev('1', 'sacar', '2026-08-13T12:00:00Z')])
    expect(v.size).toBe(0)
  })

  it('los eventos llegan en cualquier orden y se ordenan por fecha', () => {
    const v = ventanasDe([ev('1', 'sacar', '2026-08-19T12:00:00Z'), ev('1', 'poner', '2026-08-13T12:00:00Z')])
    expect(v.get('1')).toEqual([{ desde: '2026-08-13', hasta: '2026-08-19' }])
  })

  it('un segundo ciclo abre una segunda ventana', () => {
    const v = ventanasDe([
      ev('1', 'poner', '2026-06-01T12:00:00Z'),
      ev('1', 'sacar', '2026-06-10T12:00:00Z'),
      ev('1', 'poner', '2026-08-13T12:00:00Z'),
    ])
    expect(v.get('1')).toEqual([
      { desde: '2026-06-01', hasta: '2026-06-10' },
      { desde: '2026-08-13', hasta: null },
    ])
    expect(enSale(v, '1', '2026-07-01')).toBe(false)
    expect(enSale(v, '1', '2026-08-14')).toBe(true)
  })

  it('🔑 el día del poner y el del sacar cuentan como en sale', () => {
    // La venta trae fecha pelada y el evento un timestamp: no se puede saber si la venta de las 11
    // fue antes de la escritura de las 12:30. Se marca de más —que hace mirar un producto— y no de
    // menos, que es no enterarse.
    const v = ventanasDe([ev('1', 'poner', '2026-08-13T12:30:00Z'), ev('1', 'sacar', '2026-08-19T18:00:00Z')])
    expect(enSale(v, '1', '2026-08-13')).toBe(true)
    expect(enSale(v, '1', '2026-08-19')).toBe(true)
    expect(enSale(v, '1', '2026-08-12')).toBe(false)
    expect(enSale(v, '1', '2026-08-20')).toBe(false)
  })

  it('primerDiaEnSale devuelve el día del primer poner de toda la bitácora', () => {
    const v = ventanasDe([ev('9', 'poner', '2026-08-13T12:00:00Z'), ev('1', 'poner', '2026-06-01T12:00:00Z')])
    expect(primerDiaEnSale(v)).toBe('2026-06-01')
    expect(primerDiaEnSale(new Map())).toBe(null)
  })
})

describe('lineasEnSale — qué venta cayó adentro de una ventana', () => {
  const ventanas = ventanasDe([
    ev('1', 'poner', '2026-08-13T12:00:00Z'),
    ev('1', 'sacar', '2026-08-19T12:00:00Z'),
    ev('2', 'poner', '2026-08-13T12:00:00Z'),
  ])

  it('deja afuera lo vendido antes de poner el precio y después de sacarlo', () => {
    const out = lineasEnSale(
      [
        { pid: '1', sid: 'a', fecha: '2026-08-10', q: 3 },
        { pid: '1', sid: 'a', fecha: '2026-08-14', q: 2 },
        { pid: '1', sid: 'a', fecha: '2026-08-25', q: 5 },
      ],
      ventanas,
    )
    expect(out).toEqual([{ pid: '1', sid: 'a', fecha: '2026-08-14', u: 2 }])
  })

  it('un producto que nunca estuvo en la bitácora no aporta nada', () => {
    expect(lineasEnSale([{ pid: '77', sid: 'a', fecha: '2026-08-14', q: 1 }], ventanas)).toEqual([])
  })

  it('agrupa por producto, variante y día', () => {
    const out = lineasEnSale(
      [
        { pid: '1', sid: 'a', fecha: '2026-08-14', q: 1 },
        { pid: '1', sid: 'a', fecha: '2026-08-14', q: 2 },
        { pid: '1', sid: 'b', fecha: '2026-08-14', q: 1 },
        { pid: '2', sid: 'a', fecha: '2026-08-14', q: 4 },
      ],
      ventanas,
    )
    expect(out).toEqual([
      { pid: '1', sid: 'a', fecha: '2026-08-14', u: 3 },
      { pid: '1', sid: 'b', fecha: '2026-08-14', u: 1 },
      { pid: '2', sid: 'a', fecha: '2026-08-14', u: 4 },
    ])
  })

  it('`quantity` en null es UNA unidad, no cero', () => {
    const out = lineasEnSale([{ pid: '1', sid: 'a', fecha: '2026-08-14', q: null }], ventanas)
    expect(out).toEqual([{ pid: '1', sid: 'a', fecha: '2026-08-14', u: 1 }])
  })

  it('una línea sin fecha (venta que no cruzó) no se cuenta', () => {
    expect(lineasEnSale([{ pid: '1', sid: 'a', fecha: '', q: 2 }], ventanas)).toEqual([])
  })
})

describe('resumirSale — el bucketing, con los cortes del ETL', () => {
  // 🔑 **Un día que NO es hoy, a propósito.** Con la fecha del día corriendo el test, una
  // implementación que mirara el reloj (`Date.now()`) en vez del `hoy` que le pasan pasaría igual, y
  // el test no estaría probando nada — es el modo de falla de [[feedback_banco_mide_el_camino_real]].
  const hoy = new Date('2026-05-20T12:00:00Z')
  const dias = (n: number) => new Date(hoy.getTime() - n * 86400000).toISOString().slice(0, 10)
  const l = (fecha: string, u = 1, pid = '1', sid = 'a'): LineaSale => ({ pid, sid, fecha, u })

  it('reparte en 7 / 15 / 30 / 90 y en meses, acumulando', () => {
    const v = resumirSale([l(dias(2), 3), l(dias(10), 2), l(dias(40), 5)], ['1'], hoy)
    const p = v.porPid.get('1')!
    expect(p.s7).toBe(3)
    expect(p.s15).toBe(5)
    expect(p.s30).toBe(5)
    expect(p.s90).toBe(10)
    expect(p.total).toBe(10)
  })

  it('🔑 usa los MISMOS cortes que el ETL (mismo helper), no una copia', () => {
    const c = cortesDeVentas(hoy)
    const justoAdentro = new Date(c.c30.getTime() + 86400000).toISOString().slice(0, 10)
    const justoAfuera = new Date(c.c30.getTime() - 86400000).toISOString().slice(0, 10)
    const v = resumirSale([l(justoAdentro, 1), l(justoAfuera, 1)], ['1'], hoy)
    expect(v.porPid.get('1')!.s30).toBe(1)
    expect(v.porPid.get('1')!.s90).toBe(2)
  })

  it('el mes se lee de la fecha de la venta', () => {
    const v = resumirSale([l('2026-05-14', 2), l('2026-04-30', 3)], ['1'], hoy)
    expect(v.porPid.get('1')!.meses).toEqual({ '2026-05': 2, '2026-04': 3 })
    expect(v.meses).toEqual({ '2026-05': 2, '2026-04': 3 })
  })

  it('la variante se indexa con la clave `pid_sid` del ETL', () => {
    const v = resumirSale([l(dias(1), 2, '1', 'x'), l(dias(1), 5, '1', 'y')], ['1'], hoy)
    expect(v.porVar.get('1_x')!.s7).toBe(2)
    expect(v.porVar.get('1_y')!.s7).toBe(5)
    expect(v.porPid.get('1')!.s7).toBe(7)
  })

  it('un producto de la bitácora SIN ventas en sale queda listado pero sin fila', () => {
    // La diferencia importa: "estuvo en sale y no vendió" no es lo mismo que "no estuvo".
    const v = resumirSale([], ['1', '2'], hoy)
    expect(v.conBitacora.has('1')).toBe(true)
    expect(v.porPid.get('1')).toBeUndefined()
  })
})

describe('la llave con la que se abre la puerta del servidor', () => {
  // 🔴 El antecedente: `KEYS_SIN_PERMISO` estaba escrita, prolija y **no le daba acceso a nadie**,
  // porque nadie la consumía. Acá se prueba lo que la constante promete: que sus tres keys son
  // secciones de verdad y que abren con el permiso de Análisis, no con el de Liquidación.
  it('las tres keys existen en PERM_CAT y son de Análisis', () => {
    for (const k of SECCIONES_ANALISIS_VENTAS) {
      const cat = PERM_CAT.find((c) => c.key === k)
      expect(cat, `la sección "${k}" no existe`).toBeTruthy()
      expect(cat!.area).toBe('analisis')
    }
  })

  it('con SOLO «Por producto» se lee la marca; sin ninguna de las tres, no', () => {
    const conProductos = perfil({ acceso: { bdi: { productos: true }, zattia: {} } })
    expect(puedeVerAlguna(conProductos, 'bdi', SECCIONES_ANALISIS_VENTAS)).toBe(true)
    // Y no hace falta tener Liquidación: es el punto del cambio.
    expect(puedeVer(conProductos, 'bdi', 'liquidacion')).toBe(false)

    const sinNada = perfil({ acceso: { bdi: { cupones: true }, zattia: {} } })
    expect(puedeVerAlguna(sinNada, 'bdi', SECCIONES_ANALISIS_VENTAS)).toBe(false)
  })

  it('la puerta es por marca: con Análisis en BDI no se leen las de Zattia', () => {
    const soloBdi = perfil({ acceso: { bdi: { productos: true }, zattia: {} } })
    expect(puedeVerAlguna(soloBdi, 'zattia', SECCIONES_ANALISIS_VENTAS)).toBe(false)
  })
})

describe('enSaleDelMes — la marca de Ventas mensuales', () => {
  it('da las unidades y el porcentaje del mes', () => {
    expect(enSaleDelMes({ '2026-08': 71 }, '2026-08', 697)).toEqual({ u: 71, pct: 10 })
  })

  it('🔑 nunca se pasa del total del mes, aunque las fuentes no cierren', () => {
    // El total sale de la vista materializada y esto de `venta_detalles`: un «80 de 75» se leería
    // como que la pantalla está rota y arrastraría la desconfianza al resto de la tabla.
    expect(enSaleDelMes({ '2026-08': 80 }, '2026-08', 75)).toEqual({ u: 75, pct: 100 })
  })

  it('un mes sin ventas de sale, o sin items, no inventa un porcentaje', () => {
    expect(enSaleDelMes({}, '2026-08', 697)).toEqual({ u: 0, pct: 0 })
    expect(enSaleDelMes({ '2026-08': 5 }, '2026-08', 0)).toEqual({ u: 0, pct: 0 })
  })
})

describe('ofertaHoy — el punto ciego, en presente', () => {
  const p = { id: '1', name: 'TOP AUREA', sku: 'TA1' } as Producto

  it('una promo menor que la lista es oferta', () => {
    const idx = indexarTn([{ id: 9, name: 'TOP AUREA', sku: 'TA1', price: 20000, promo_price: 12000 }])
    expect(ofertaHoy(p, idx)).toBe(true)
  })

  it('🔑 una promo que NO es menor que la lista no es oferta', () => {
    // Pasa cuando sube la lista y queda la promo vieja arriba. Marcarlo diría que el producto está
    // liquidado cuando en realidad está más caro que su propia oferta.
    const idx = indexarTn([{ id: 9, name: 'TOP AUREA', sku: 'TA1', price: 20000, promo_price: 25000 }])
    expect(ofertaHoy(p, idx)).toBe(false)
  })

  it('sin promo, sin precio o sin match no hay oferta', () => {
    expect(ofertaHoy(p, indexarTn([{ id: 9, name: 'TOP AUREA', sku: 'TA1', price: 20000 }]))).toBe(false)
    expect(ofertaHoy(p, indexarTn([{ id: 9, name: 'OTRA COSA', sku: 'ZZZ', price: 20000, promo_price: 1 }]))).toBe(false)
    expect(ofertaHoy(p, null)).toBe(false)
  })
})
