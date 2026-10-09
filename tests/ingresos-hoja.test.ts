import { describe, it, expect } from 'vitest'
import { fechaCorta, ingresosPorLlegar, marcaComun, paginasHoja, POR_HOJA, tarjetasDe } from '@/lib/ingresos/hoja'
import type { Bloque, Ingreso } from '@/lib/ingresos/tipos'

function bloque(nombre: string, nDisenos: number, modelos = ['iPhone 15', 'iPhone 16 Pro']): Bloque {
  const ms = modelos.map((m, i) => ({ id: 'm' + i, model: m }))
  const ds = Array.from({ length: nDisenos }, (_, i) => ({ id: 'd' + i, nombre: `Case ${i + 1}`, img: 'x' }))
  const celdas: Bloque['celdas'] = {}
  ms.forEach((m) => (celdas[m.id] = Object.fromEntries(ds.map((d) => [d.id, 10]))))
  return { id: 'b-' + nombre, nombre, modelos: ms, disenos: ds, celdas }
}

function ingreso(over: Partial<Ingreso> = {}): Ingreso {
  return { id: 'g1', desc: 'IMPORTACION 3', proveedor: 'CHINA', fecha: '2026-10-20', estado: 'produccion', nota: '', bloques: [], gallery: [], ...over }
}

describe('hoja para la pizarra', () => {
  it('lo que viene: saca las arribadas y ordena por fecha', () => {
    const l = ingresosPorLlegar([
      ingreso({ id: 'a', fecha: '2026-12-01', estado: 'cotizando' }),
      ingreso({ id: 'b', fecha: '2026-07-01', estado: 'arribado' }),
      ingreso({ id: 'c', fecha: '2026-10-01', estado: 'transito' }),
    ])
    expect(l.map((g) => g.id)).toEqual(['c', 'a'])
  })

  it('cada material arranca en hoja nueva y se parte de a 8', () => {
    const p = paginasHoja([ingreso({ bloques: [bloque('ENCAPSULADO', 10), bloque('IMD', 3)] })])
    expect(p.map((x) => [x.material, x.parte, x.partes, x.tarjetas.length])).toEqual([
      ['ENCAPSULADO', 1, 2, POR_HOJA],
      ['ENCAPSULADO', 2, 2, 2],
      ['IMD', 1, 1, 3],
    ])
    expect(p[1].tarjetas[0].numero).toBe(9)
    expect(p[0].unidadesMaterial).toBe(200)
  })

  it('sólo los modelos que vienen, y la marca se dice una vez', () => {
    const b = bloque('IMD', 1, ['iPhone 15', 'iPhone 16 Pro', 'iPhone 17'])
    b.celdas.m2 = {}
    const { tarjetas, marca } = tarjetasDe(b)
    expect(marca).toBe('iPhone')
    expect(tarjetas[0].modelos).toEqual([
      { modelo: '15', cantidad: 10 },
      { modelo: '16 Pro', cantidad: 10 },
    ])
    expect(tarjetas[0].total).toBe(20)
  })

  it('sin nombre comercial lo dice; la columna vacía que sobró no sale', () => {
    const b = bloque('IMD', 2)
    b.disenos[0].nombre = ''
    b.disenos.push({ id: 'vacia', nombre: '', img: '' })
    const { tarjetas } = tarjetasDe(b)
    expect(tarjetas).toHaveLength(2)
    expect(tarjetas[0]).toMatchObject({ nombre: 'Diseño 1', sinNombre: true })
  })

  it('marcas mezcladas no se acortan', () => {
    expect(marcaComun(['iPhone 15', 'Samsung A55'])).toBe('')
    expect(marcaComun(['iPhone 15', 'iPhone'])).toBe('')
  })

  it('fecha corta', () => {
    expect(fechaCorta('2026-10-20')).toBe('20/10/2026')
    expect(fechaCorta('')).toBe('')
  })
})
