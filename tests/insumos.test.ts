// Lo que la sección Insumos deriva del libro. Todo puro: sin red y sin base.
//
// Cada `it` fija una regla escrita en `lib/insumos/core.ts` o en `sql/migrate-insumos.sql`. Las que
// más importan son las de los ceros: un cero que no se midió afirma, y en este módulo afirmaría
// «se contó y no hay ninguna» o «no se gasta nunca».
import { describe, it, expect } from 'vitest'
import {
  desdeCuandoCruzo,
  diasDeVida,
  mirarInsumo,
  paraReponer,
  paraSubir,
  patasDeTraslado,
  precioReferencia,
  ritmoDiario,
  serieDeStock,
  stockPor,
  stockTotal,
} from '../lib/insumos/core'
import { motivoInsumoInvalido, motivoMovimientoInvalido } from '../lib/insumos/core.core.js'
import { comprasPorDia } from '../lib/insumos/consumo.core.js'
import type { DiaCompras, Insumo, Movimiento } from '../lib/insumos/tipos'

const insumo = (p: Partial<Insumo> = {}): Insumo => ({
  id: 'in1', nombre: 'Bolsas chicas', tipo: 'comercial', unidad: 'unidad', bulto: 'caja',
  porBulto: 1000, marcas: [], minimo: 2, diasReposicion: null, consumo: {}, activo: true,
  nota: null, autor: 'Lorena', creado: '2026-08-01T00:00:00Z', actualizado: '2026-08-01T00:00:00Z', ...p,
})

let n = 0
const mov = (p: Partial<Movimiento> = {}): Movimiento => {
  n += 1
  return {
    id: `mv${n}`, insumoId: 'in1', tipo: 'compra', ubicacion: 'deposito', cantidad: 10,
    fecha: '2026-08-01', precioTotal: null, proveedor: null, comprobante: null, grupo: null,
    pata: null, usuario: 'Lorena', nota: null, creado: `2026-08-01T00:00:0${n % 10}Z`, ...p,
  }
}

describe('el stock sale del libro', () => {
  it('sin movimientos es null y NO cero — un 0 afirmaría que se contó y no hay ninguna', () => {
    expect(stockTotal([])).toBe(null)
    expect(stockPor([], 'deposito')).toBe(null)
  })

  it('un lugar que nunca se tocó sigue en null aunque otro tenga stock', () => {
    const movs = [mov({ ubicacion: 'deposito', cantidad: 100 })]
    expect(stockPor(movs, 'deposito')).toBe(100)
    expect(stockPor(movs, 'local-bdi')).toBe(null)
  })

  it('la compra suma y el consumo resta, con la cantidad SIEMPRE positiva', () => {
    const movs = [
      mov({ tipo: 'compra', cantidad: 100 }),
      mov({ tipo: 'consumo', cantidad: 30, fecha: '2026-08-02' }),
    ]
    expect(stockTotal(movs)).toBe(70)
  })

  it('el recuento CORTA el libro: lo anterior deja de contar', () => {
    const movs = [
      mov({ tipo: 'compra', cantidad: 100, fecha: '2026-08-01' }),
      mov({ tipo: 'recuento', cantidad: 12, fecha: '2026-08-05' }),
      mov({ tipo: 'consumo', cantidad: 2, fecha: '2026-08-06' }),
    ]
    expect(stockTotal(movs)).toBe(10)
  })

  it('el recuento corta SOLO su ubicación', () => {
    const movs = [
      mov({ ubicacion: 'deposito', cantidad: 100 }),
      mov({ ubicacion: 'local-bdi', cantidad: 40 }),
      mov({ tipo: 'recuento', ubicacion: 'local-bdi', cantidad: 5, fecha: '2026-08-05' }),
    ]
    expect(stockPor(movs, 'deposito')).toBe(100)
    expect(stockPor(movs, 'local-bdi')).toBe(5)
    expect(stockTotal(movs)).toBe(105)
  })

  it('un traslado NO cambia el total de la empresa: mueve de un lugar al otro', () => {
    const [salida, entrada] = patasDeTraslado({
      insumoId: 'in1', origen: 'deposito', destino: 'local-bdi', cantidad: 20, fecha: '2026-08-03',
    })
    const movs = [
      mov({ ubicacion: 'deposito', cantidad: 100 }),
      mov({ ...salida, fecha: '2026-08-03' } as Partial<Movimiento>),
      mov({ ...entrada, fecha: '2026-08-03' } as Partial<Movimiento>),
    ]
    expect(stockTotal(movs)).toBe(100)
    expect(stockPor(movs, 'deposito')).toBe(80)
    expect(stockPor(movs, 'local-bdi')).toBe(20)
  })

  it('dentro del mismo día manda el orden de carga, no el de la lista', () => {
    const compra = mov({ tipo: 'compra', cantidad: 50, fecha: '2026-08-04', creado: '2026-08-04T09:00:00Z' })
    const recuento = mov({ tipo: 'recuento', cantidad: 7, fecha: '2026-08-04', creado: '2026-08-04T18:00:00Z' })
    // Se pasan al revés a propósito: el recuento de la tarde tiene que ganar igual.
    expect(stockTotal([recuento, compra])).toBe(7)
  })
})

describe('desde cuándo está así', () => {
  it('es la fecha del movimiento que lo cruzó, NO la de hoy', () => {
    const movs = [
      mov({ tipo: 'compra', cantidad: 100, fecha: '2026-08-01' }),
      mov({ tipo: 'consumo', cantidad: 99, fecha: '2026-08-10' }),
      mov({ tipo: 'consumo', cantidad: 0, fecha: '2026-08-20' }),
    ]
    expect(desdeCuandoCruzo(serieDeStock(movs), (p) => p.total, 2)).toBe('2026-08-10')
  })

  it('si volvió a subir, la espera se cuenta desde la ÚLTIMA vez que bajó', () => {
    const movs = [
      mov({ tipo: 'compra', cantidad: 100, fecha: '2026-08-01' }),
      mov({ tipo: 'consumo', cantidad: 99, fecha: '2026-08-05' }),
      mov({ tipo: 'compra', cantidad: 50, fecha: '2026-08-08' }),
      mov({ tipo: 'consumo', cantidad: 50, fecha: '2026-08-15' }),
    ]
    expect(desdeCuandoCruzo(serieDeStock(movs), (p) => p.total, 2)).toBe('2026-08-15')
  })
})

describe('precio de referencia', () => {
  it('sin ninguna compra con precio es null, ⛔ no cero', () => {
    expect(precioReferencia([mov({ precioTotal: null })], '2026-08-28')).toBe(null)
  })

  it('con UNA sola compra no se rotula promedio', () => {
    const p = precioReferencia([mov({ tipo: 'compra', cantidad: 100, precioTotal: 5000, fecha: '2026-08-01' })], '2026-08-28')
    expect(p?.clase).toBe('ultima')
    expect(p?.unitario).toBe(50)
    expect(p?.compras).toBe(1)
  })

  it('pondera por CANTIDAD y no promedia unitarios', () => {
    const movs = [
      mov({ tipo: 'compra', cantidad: 10, precioTotal: 1000, fecha: '2026-08-01' }),   // $100
      mov({ tipo: 'compra', cantidad: 90, precioTotal: 1800, fecha: '2026-08-10' }),   // $20
    ]
    const p = precioReferencia(movs, '2026-08-28')
    // Ponderado: 2.800 / 100 = 28. El promedio de unitarios habría dado 60.
    expect(p?.unitario).toBe(28)
    expect(p?.clase).toBe('promedio')
  })

  it('un precio viejo se usa igual, pero la fecha viaja para que se vea que es viejo', () => {
    const p = precioReferencia([mov({ tipo: 'compra', cantidad: 10, precioTotal: 500, fecha: '2025-01-05' })], '2026-08-28')
    expect(p?.clase).toBe('ultima')
    expect(p?.desde).toBe('2025-01-05')
  })
})

describe('el ritmo', () => {
  const compras: DiaCompras[] = Array.from({ length: 30 }, (_, i) => ({
    fecha: `2026-08-${String(i + 1).padStart(2, '0')}`, local: 10, online: 4, mayorista: 0,
  }))

  it('atado a las ventas: una bolsa por compra del canal', () => {
    const i = insumo({ consumo: { modo: 'por-venta', canal: 'local', porVenta: 1 } })
    const r = ritmoDiario(i, [], { bdi: compras, zattia: compras }, '2026-08-28')
    expect(r?.fuente).toBe('ventas')
    expect(r?.porDia).toBeCloseTo(20, 6) // dos marcas × 10 por día
  })

  it('la marca sale del insumo: uno de Zattia no suma las ventas de BDI', () => {
    const i = insumo({ marcas: ['zattia'], consumo: { modo: 'por-venta', canal: 'local', porVenta: 1 } })
    const r = ritmoDiario(i, [], { bdi: compras, zattia: compras }, '2026-08-28')
    expect(r?.porDia).toBeCloseTo(10, 6)
  })

  it('HOY no entra: el día en curso está a medias', () => {
    const conHoy: DiaCompras[] = [...compras, { fecha: '2026-08-28', local: 1, online: 0, mayorista: 0 }]
    const i = insumo({ marcas: ['bdi'], consumo: { modo: 'por-venta', canal: 'local', porVenta: 1 } })
    const r = ritmoDiario(i, [], { bdi: conHoy }, '2026-08-28')
    expect(r?.dias).toBe(27) // del 2 al 27 de agosto (ventana de 30 días cerrada), sin el 28
    expect(r?.porDia).toBe(10)
  })

  it('sin ningún día con ventas es null, ⛔ no cero', () => {
    const i = insumo({ consumo: { modo: 'por-venta', canal: 'local', porVenta: 1 } })
    expect(ritmoDiario(i, [], {}, '2026-08-28')).toBe(null)
  })

  it('medido a mano: con UNA sola anotación no hay ritmo', () => {
    const movs = [mov({ tipo: 'consumo', cantidad: 5, fecha: '2026-08-27' })]
    expect(ritmoDiario(insumo(), movs, {}, '2026-08-28')).toBe(null)
  })

  it('medido a mano: con dos, sale del libro', () => {
    const movs = [
      mov({ tipo: 'consumo', cantidad: 5, fecha: '2026-08-18' }),
      mov({ tipo: 'consumo', cantidad: 5, fecha: '2026-08-25' }),
    ]
    const r = ritmoDiario(insumo(), movs, {}, '2026-08-28')
    expect(r?.fuente).toBe('libro')
    expect(r?.porDia).toBeCloseTo(1, 6) // 10 en 10 días
  })

  it('los días de vida son null si falta cualquiera de las dos mitades', () => {
    expect(diasDeVida(null, { porDia: 3, fuente: 'libro', dias: 10, observaciones: 2 })).toBe(null)
    expect(diasDeVida(30, null)).toBe(null)
  })
})

describe('hay que reponer', () => {
  it('sin nada contado no dispara nada: nadie miró', () => {
    expect(paraReponer(insumo(), [], null)).toEqual({ comprar: null, subir: [] })
  })

  it('dispara con el ANTEÚLTIMO, que es la regla escrita del puesto', () => {
    const movs = [mov({ tipo: 'compra', cantidad: 5 }), mov({ tipo: 'consumo', cantidad: 3, fecha: '2026-08-09' })]
    const r = paraReponer(insumo({ minimo: 2 }), movs, null)
    expect(r.comprar?.motivo).toBe('unidades')
    expect(r.comprar?.desde).toBe('2026-08-09')
  })

  it('dispara también por DÍAS: lo que queda no cubre lo que tarda en llegar', () => {
    const movs = [mov({ tipo: 'compra', cantidad: 100, fecha: '2026-08-02' })]
    const ritmo = { porDia: 10, fuente: 'ventas' as const, dias: 30, observaciones: 300 }
    const r = paraReponer(insumo({ minimo: 2, diasReposicion: 15 }), movs, ritmo)
    expect(r.comprar?.motivo).toBe('dias')
    expect(r.comprar?.dias).toBe(10)
  })

  it('sin dias_reposicion NO se inventa el corte por días', () => {
    const movs = [mov({ tipo: 'compra', cantidad: 100 })]
    const ritmo = { porDia: 10, fuente: 'ventas' as const, dias: 30, observaciones: 300 }
    expect(paraReponer(insumo({ minimo: 2, diasReposicion: null }), movs, ritmo).comprar).toBe(null)
  })

  it('un lugar en CERO teniendo en otro no se compra: se sube', () => {
    const movs = [
      mov({ ubicacion: 'deposito', cantidad: 500 }),
      mov({ ubicacion: 'local-bdi', cantidad: 40, fecha: '2026-08-02' }),
      mov({ tipo: 'consumo', ubicacion: 'local-bdi', cantidad: 40, fecha: '2026-08-11' }),
    ]
    const r = paraReponer(insumo({ minimo: 2 }), movs, null)
    expect(r.comprar).toBe(null)
    expect(r.subir).toEqual([{ ubicacion: 'local-bdi', hay: 500, desde: '2026-08-11' }])
  })

  it('un lugar que nunca tuvo NO es un lugar que se quedó sin', () => {
    const movs = [mov({ ubicacion: 'deposito', cantidad: 500 })]
    expect(paraReponer(insumo(), movs, null).subir).toEqual([])
  })

  it('lo que hay que subir se agrupa por LUGAR: es un viaje, no N', () => {
    const vistas = [
      mirarInsumo(insumo({ id: 'a' }), [
        mov({ insumoId: 'a', ubicacion: 'deposito', cantidad: 500 }),
        mov({ insumoId: 'a', ubicacion: 'local-bdi', cantidad: 10, fecha: '2026-08-02' }),
        mov({ insumoId: 'a', tipo: 'consumo', ubicacion: 'local-bdi', cantidad: 10, fecha: '2026-08-06' }),
      ], {}, '2026-08-28'),
      mirarInsumo(insumo({ id: 'b' }), [
        mov({ insumoId: 'b', ubicacion: 'deposito', cantidad: 500 }),
        mov({ insumoId: 'b', ubicacion: 'local-bdi', cantidad: 10, fecha: '2026-08-02' }),
        mov({ insumoId: 'b', tipo: 'consumo', ubicacion: 'local-bdi', cantidad: 10, fecha: '2026-08-09' }),
      ], {}, '2026-08-28'),
    ]
    const g = paraSubir(vistas)
    expect(g).toHaveLength(1)
    expect(g[0].ubicacion).toBe('local-bdi')
    expect(g[0].vistas).toHaveLength(2)
    // La espera es la del que hace MÁS que falta, no la del último.
    expect(g[0].desde).toBe('2026-08-06')
  })
})

describe('lo que no se puede guardar', () => {
  it('un precio en 0 no pasa: 0 no es «no lo sé», y hundiría el promedio', () => {
    expect(motivoMovimientoInvalido({ insumoId: 'in1', tipo: 'compra', ubicacion: 'deposito', cantidad: 1, fecha: '2026-08-01', precioTotal: 0 }))
      .toMatch(/precio/)
    expect(motivoMovimientoInvalido({ insumoId: 'in1', tipo: 'compra', ubicacion: 'deposito', cantidad: 1, fecha: '2026-08-01', precioTotal: null }))
      .toBe(null)
  })

  it('una ubicación que no existe no pasa: no aparecería en ninguna suma', () => {
    expect(motivoMovimientoInvalido({ insumoId: 'in1', tipo: 'compra', ubicacion: 'galpon', cantidad: 1, fecha: '2026-08-01' }))
      .toMatch(/ubicación/)
  })

  it('una fecha que no existe no pasa aunque tenga forma de fecha', () => {
    expect(motivoMovimientoInvalido({ insumoId: 'in1', tipo: 'compra', ubicacion: 'deposito', cantidad: 1, fecha: '2026-02-31' }))
      .toMatch(/día real/)
  })

  it('media pata de un traslado no pasa', () => {
    expect(motivoMovimientoInvalido({ insumoId: 'in1', tipo: 'traslado', ubicacion: 'deposito', cantidad: 1, fecha: '2026-08-01' }))
      .toMatch(/salida y entrada/)
  })

  it('un bulto que no trae nada no es un bulto (y sería una división por cero)', () => {
    expect(motivoInsumoInvalido({ ...insumo(), porBulto: 0 })).toMatch(/bulto/)
  })

  it('dias_reposicion en 0 no pasa: apagaría el corte pareciendo que lo prende', () => {
    expect(motivoInsumoInvalido({ ...insumo(), diasReposicion: 0 })).toMatch(/reponerse/)
    expect(motivoInsumoInvalido({ ...insumo(), diasReposicion: null })).toBe(null)
  })
})

describe('las compras por día', () => {
  it('cuenta FILAS y no unidades, y saca las ventas técnicas', () => {
    const v = [
      { date_sale: '2026-08-01', channel: 'Mi Local' },
      { date_sale: '2026-08-01', channel: 'Tienda Nube' },
      { date_sale: '2026-08-01', channel: 'Ninguno' },
    ]
    expect(comprasPorDia(v, '2026-08-01', '2026-08-31')).toEqual([{ fecha: '2026-08-01', local: 1, online: 1, mayorista: 0 }])
  })

  it('un día sin ninguna venta NO sale en la lista: no es un día de cero bolsas', () => {
    const v = [{ date_sale: '2026-08-03', channel: 'Mi Local' }]
    expect(comprasPorDia(v, '2026-08-01', '2026-08-05')).toHaveLength(1)
  })
})
