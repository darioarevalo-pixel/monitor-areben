import { describe, it, expect } from 'vitest'
import { crearCupon, descuento, dias, estado, filtrar, mensajeRecordatorio } from '@/lib/cupones/core'
import type { Cupon } from '@/lib/cupones/tipos'
import { cargarCuponesLegacy } from './legacy-cupones'

const HOY = '2026-07-18'

function cup(over: Partial<Cupon> = {}): Cupon {
  return {
    id: 'c1', nombre: 'Ana Pérez', tipo: 'porcentaje', valor: 15, unSoloUso: true, vence: '2026-08-01',
    fechaCreado: '2026-07-10', creadoPor: 'ana', usado: false, usadoFecha: '', anulado: false, ...over,
  }
}

describe('dias · paridad con _cupDias', () => {
  const legacy = cargarCuponesLegacy(HOY)
  const casos = ['2026-07-18', '2026-07-20', '2026-07-15', '2026-08-30', '']
  for (const v of casos) {
    it(`vence "${v}"`, () => {
      expect(dias(v, HOY)).toBe(legacy._cupDias(v || undefined))
    })
  }
})

describe('estado · paridad con cuponesEstado', () => {
  const legacy = cargarCuponesLegacy(HOY)
  const casos: Cupon[] = [
    cup({ anulado: true }), // anulado gana
    cup({ unSoloUso: true, usado: true }), // usado
    cup({ unSoloUso: false, usado: true }), // reutilizable usado → NO 'usado'
    cup({ vence: '2026-07-10' }), // vencido
    cup({ vence: '2026-07-18' }), // vence hoy → porvencer (0 <= 3)
    cup({ vence: '2026-07-21' }), // en 3d → porvencer
    cup({ vence: '2026-07-22' }), // en 4d → vigente
    cup({ vence: '' }), // sin vencimiento → vigente
    cup({ anulado: true, usado: true, vence: '2026-01-01' }), // anulado gana sobre todo
  ]
  for (let i = 0; i < casos.length; i++) {
    it(`caso ${i}`, () => {
      expect(estado(casos[i], HOY)).toBe(legacy.cuponesEstado(casos[i]))
    })
  }
})

describe('descuento · paridad con _cupDesc', () => {
  const legacy = cargarCuponesLegacy(HOY)
  const casos: Cupon[] = [
    cup({ tipo: 'porcentaje', valor: 15 }),
    cup({ tipo: 'monto', valor: 1500 }),
    cup({ tipo: 'monto', valor: 12345.67 }),
    cup({ tipo: 'porcentaje', valor: 0 }),
  ]
  for (let i = 0; i < casos.length; i++) {
    it(`caso ${i}`, () => {
      expect(descuento(casos[i])).toBe(legacy._cupDesc(casos[i]))
    })
  }
})

describe('filtrar', () => {
  const lista: Cupon[] = [
    cup({ id: 'a', nombre: 'Ana', vence: '2026-08-30' }), // vigente
    cup({ id: 'b', nombre: 'Bruno', codigo: 'BRU10', vence: '2026-07-20' }), // porvencer
    cup({ id: 'c', nombre: 'Carla', vence: '2026-07-01' }), // vencido
    cup({ id: 'd', nombre: 'Dana', unSoloUso: true, usado: true }), // usado
    cup({ id: 'e', nombre: 'Eva', anulado: true }), // anulado
  ]
  it('vigentes incluye vigente + porvencer', () => {
    expect(filtrar(lista, 'vigentes', '', HOY).map((x) => x.c.id).sort()).toEqual(['a', 'b'])
  })
  it('porvencer, usados, vencidos aíslan su estado', () => {
    expect(filtrar(lista, 'porvencer', '', HOY).map((x) => x.c.id)).toEqual(['b'])
    expect(filtrar(lista, 'usados', '', HOY).map((x) => x.c.id)).toEqual(['d'])
    expect(filtrar(lista, 'vencidos', '', HOY).map((x) => x.c.id)).toEqual(['c'])
  })
  it('todos incluye anulados', () => {
    expect(filtrar(lista, 'todos', '', HOY).length).toBe(5)
  })
  it('búsqueda cruza nombre y código', () => {
    expect(filtrar(lista, 'todos', 'carla', HOY).map((x) => x.c.id)).toEqual(['c'])
    expect(filtrar(lista, 'todos', 'bru10', HOY).map((x) => x.c.id)).toEqual(['b']) // por código
  })
})

describe('mensajeRecordatorio', () => {
  it('usa el primer nombre, el descuento y la fecha dd/mm/yyyy', () => {
    expect(mensajeRecordatorio(cup({ nombre: 'Ana Pérez', tipo: 'porcentaje', valor: 15, vence: '2026-08-01' }))).toBe(
      'Hola Ana! 🙌 Te recuerdo que tenés un descuento de 15% para usar en el local, vale hasta el 01/08/2026. ¡Te esperamos!',
    )
  })
  it('sin vencimiento omite la parte de la fecha', () => {
    expect(mensajeRecordatorio(cup({ nombre: 'Beto', tipo: 'monto', valor: 2000, vence: '' }))).toBe(
      'Hola Beto! 🙌 Te recuerdo que tenés un descuento de $2.000 para usar en el local. ¡Te esperamos!',
    )
  })
})

describe('crearCupon · validación y armado', () => {
  const meta = { id: 'X', hoy: HOY, usuario: 'jefe' }
  it('rechaza nombre vacío, valor <= 0 y sin vencimiento', () => {
    expect(crearCupon({ nombre: '', tipo: 'porcentaje', valor: 10, unSoloUso: true, vence: '2026-08-01' }, meta)).toEqual({ ok: false, error: 'Poné el nombre y apellido del cliente.' })
    expect(crearCupon({ nombre: 'Ana', tipo: 'porcentaje', valor: 0, unSoloUso: true, vence: '2026-08-01' }, meta)).toEqual({ ok: false, error: 'Poné el valor del descuento.' })
    expect(crearCupon({ nombre: 'Ana', tipo: 'porcentaje', valor: 10, unSoloUso: true, vence: '' }, meta)).toEqual({ ok: false, error: 'Poné hasta cuándo vale el cupón.' })
  })
  it('arma el cupón con defaults y creadoPor con fallback al usuario', () => {
    const r = crearCupon({ nombre: '  Ana Pérez ', telefono: ' 11-2222 ', tipo: 'monto', valor: '1500', codigo: ' ANA15 ', minimo: '5000', motivo: ' cumple ', unSoloUso: true, vence: '2026-08-01', creadoPor: '' }, meta)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.cupon).toMatchObject({
        id: 'X', nombre: 'Ana Pérez', telefono: '11-2222', tipo: 'monto', valor: 1500, codigo: 'ANA15',
        minimo: 5000, motivo: 'cumple', unSoloUso: true, vence: '2026-08-01', fechaCreado: HOY,
        creadoPor: 'jefe', usado: false, anulado: false,
      })
    }
  })
})
