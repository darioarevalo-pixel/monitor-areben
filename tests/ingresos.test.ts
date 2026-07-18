import { describe, it, expect } from 'vitest'
import {
  bloqueIgualar,
  bloqueU,
  cargarBase,
  celdaGet,
  conItemsDerivados,
  derivarItems,
  driveId,
  esVideoUrl,
  estadoDe,
  filaIgualar,
  mesDe,
  mesLabel,
  normalizar,
  ordenarPorFecha,
  quitarDiseno,
  quitarModelo,
  resumen,
  setCelda,
  totalDiseno,
  totalModelo,
  totalU,
  ytId,
} from '@/lib/ingresos/core'
import type { Ingreso } from '@/lib/ingresos/tipos'

/** Generador de ids determinístico para los tests. */
function nidFactory() {
  let n = 0
  return () => 'id' + ++n
}

/** Un ingreso con un bloque de 2 modelos × 2 diseños y algunas cantidades. */
function ingresoBase(): Ingreso {
  return {
    id: 'g1',
    desc: 'Pedido 1',
    proveedor: 'China',
    fecha: '2025-08-01',
    estado: 'transito',
    nota: '',
    bloques: [
      {
        id: 'b1',
        nombre: 'IMD',
        modelos: [
          { id: 'm1', model: 'iPhone 15' },
          { id: 'm2', model: 'iPhone 16' },
        ],
        disenos: [
          { id: 'd1', nombre: 'Rosa', img: '' },
          { id: 'd2', nombre: 'Negro', img: '' },
        ],
        celdas: { m1: { d1: 3, d2: 2 }, m2: { d1: 5 } },
      },
    ],
    gallery: [],
  }
}

describe('ingresos/core — cálculos', () => {
  it('celdaGet / totales de bloque, modelo y diseño', () => {
    const b = ingresoBase().bloques[0]
    expect(celdaGet(b, 'm1', 'd1')).toBe(3)
    expect(celdaGet(b, 'm2', 'd2')).toBe(0)
    expect(totalModelo(b, 'm1')).toBe(5)
    expect(totalModelo(b, 'm2')).toBe(5)
    expect(totalDiseno(b, 'd1')).toBe(8)
    expect(totalDiseno(b, 'd2')).toBe(2)
    expect(bloqueU(b)).toBe(10)
  })

  it('totalU suma todos los bloques', () => {
    const g = ingresoBase()
    g.bloques.push({ id: 'b2', nombre: 'Formas', modelos: [{ id: 'm3', model: 'iPhone 14' }], disenos: [{ id: 'd3', nombre: 'X', img: '' }], celdas: { m3: { d3: 7 } } })
    expect(totalU(g)).toBe(17)
  })

  it('derivarItems suma por modelo across bloques', () => {
    const g = ingresoBase()
    g.bloques.push({ id: 'b2', nombre: 'Formas', modelos: [{ id: 'm3', model: 'iPhone 15' }], disenos: [{ id: 'd3', nombre: 'X', img: '' }], celdas: { m3: { d3: 4 } } })
    const items = derivarItems(g).sort((a, b) => a.model.localeCompare(b.model))
    // iPhone 15: 5 (b1) + 4 (b2) = 9; iPhone 16: 5
    expect(items).toEqual([
      { id: 'iPhone 15', model: 'iPhone 15', cantidad: 9 },
      { id: 'iPhone 16', model: 'iPhone 16', cantidad: 5 },
    ])
  })

  it('conItemsDerivados agrega items sin tocar el resto', () => {
    const g = ingresoBase()
    const out = conItemsDerivados(g)
    expect(out.items).toEqual(derivarItems(g))
    expect(out.bloques).toBe(g.bloques)
  })

  it('resumen: en camino excluye arribados', () => {
    const arribado = { ...ingresoBase(), id: 'g2', estado: 'arribado' as const }
    const r = resumen([ingresoBase(), arribado])
    expect(r.enCamino).toBe(1)
    expect(r.unidades).toBe(10)
  })
})

describe('ingresos/core — orden y fechas', () => {
  it('ordenarPorFecha: ascendente, sin fecha al final', () => {
    const mk = (id: string, fecha: string): Ingreso => ({ ...ingresoBase(), id, fecha })
    const out = ordenarPorFecha([mk('a', '2025-09-01'), mk('b', ''), mk('c', '2025-07-01')])
    expect(out.map((g) => g.id)).toEqual(['c', 'a', 'b'])
  })

  it('mesLabel / mesDe', () => {
    expect(mesLabel('2025-08-01')).toBe('Agosto 2025')
    expect(mesDe({ ...ingresoBase(), fecha: '' })).toBe('Sin fecha estimada')
    expect(mesDe({ ...ingresoBase(), fecha: '2025-12-15' })).toBe('Diciembre 2025')
  })

  it('estadoDe cae al primero si es desconocido', () => {
    expect(estadoDe('transito').lbl).toBe('En tránsito')
    expect(estadoDe('inexistente').k).toBe('cotizando')
  })
})

describe('ingresos/core — media', () => {
  it('ytId / driveId / esVideoUrl', () => {
    expect(ytId('https://youtu.be/abcdefghijk')).toBe('abcdefghijk')
    expect(ytId('https://www.youtube.com/watch?v=ABCDEFGHIJK')).toBe('ABCDEFGHIJK')
    expect(driveId('https://drive.google.com/file/d/1AbC_dEf/view')).toBe('1AbC_dEf')
    expect(esVideoUrl('https://youtu.be/x')).toBe(true)
    expect(esVideoUrl('https://ejemplo.com/foto.jpg')).toBe(false)
    expect(esVideoUrl('https://cdn.com/clip.mp4')).toBe(true)
  })
})

describe('ingresos/core — normalizar (migración de formato)', () => {
  it('formato viejo {modelos,disenos,celdas} → un bloque', () => {
    const viejo = {
      id: 'g1', desc: '', proveedor: '', fecha: '', estado: 'cotizando', nota: '',
      modelos: [{ id: 'm1', model: 'iPhone 15' }],
      disenos: [{ id: 'd1', nombre: 'Rosa', img: '' }],
      celdas: { m1: { d1: 4 } },
    } as unknown as Ingreso
    const g = normalizar(viejo, nidFactory())
    expect(g.bloques).toHaveLength(1)
    expect(g.bloques[0].modelos).toEqual([{ id: 'm1', model: 'iPhone 15' }])
    expect(g.bloques[0].celdas).toEqual({ m1: { d1: 4 } })
    expect(g.gallery).toEqual([])
    expect('modelos' in g).toBe(false)
    expect('celdas' in g).toBe(false)
  })

  it('formato más viejo {items} → bloque con diseño "General"', () => {
    const masViejo = {
      id: 'g1', desc: '', proveedor: '', fecha: '', estado: 'cotizando', nota: '',
      items: [{ id: 'm1', model: 'iPhone 15', cantidad: 6 }, { id: 'm2', model: 'iPhone 16', cantidad: 0 }],
    } as unknown as Ingreso
    const g = normalizar(masViejo, nidFactory())
    const b = g.bloques[0]
    expect(b.disenos).toHaveLength(1)
    expect(b.disenos[0].nombre).toBe('General')
    const did = b.disenos[0].id
    expect(b.celdas.m1[did]).toBe(6)
    expect(b.celdas.m2).toBeUndefined()
  })

  it('ya en formato bloques pasa igual + rellena defaults', () => {
    const g = normalizar(ingresoBase(), nidFactory())
    expect(g.bloques[0].nombre).toBe('IMD')
    expect(g.bloques[0].celdas).toEqual({ m1: { d1: 3, d2: 2 }, m2: { d1: 5 } })
  })
})

describe('ingresos/core — mutaciones inmutables', () => {
  it('setCelda setea > 0 y borra en 0, sin mutar el original', () => {
    const l = [ingresoBase()]
    const l2 = setCelda(l, 'g1', 'b1', 'm2', 'd2', '9')
    expect(celdaGet(l2[0].bloques[0], 'm2', 'd2')).toBe(9)
    expect(celdaGet(l[0].bloques[0], 'm2', 'd2')).toBe(0) // original intacto
    const l3 = setCelda(l2, 'g1', 'b1', 'm1', 'd1', '0')
    expect(celdaGet(l3[0].bloques[0], 'm1', 'd1')).toBe(0)
    expect(l3[0].bloques[0].celdas.m1.d1).toBeUndefined()
  })

  it('quitarModelo elimina la fila y sus celdas', () => {
    const l = quitarModelo([ingresoBase()], 'g1', 'b1', 'm1')
    const b = l[0].bloques[0]
    expect(b.modelos.map((m) => m.id)).toEqual(['m2'])
    expect(b.celdas.m1).toBeUndefined()
  })

  it('quitarDiseno elimina la columna en todas las filas', () => {
    const l = quitarDiseno([ingresoBase()], 'g1', 'b1', 'd1')
    const b = l[0].bloques[0]
    expect(b.disenos.map((d) => d.id)).toEqual(['d2'])
    expect(b.celdas.m1.d1).toBeUndefined()
    expect(b.celdas.m1.d2).toBe(2)
    expect(b.celdas.m2.d1).toBeUndefined()
  })

  it('filaIgualar copia la 1ª cantidad cargada al resto; null si no hay ninguna', () => {
    const l = filaIgualar([ingresoBase()], 'g1', 'b1', 'm1')
    expect(l).not.toBeNull()
    const b = l![0].bloques[0]
    expect(celdaGet(b, 'm1', 'd1')).toBe(3)
    expect(celdaGet(b, 'm1', 'd2')).toBe(3) // igualada a la 1ª (3)
    // fila sin cantidades (m2 tiene d1=5, así que uso un modelo vacío)
    const vacio = filaIgualar([ingresoBase()], 'g1', 'b1', 'mX')
    expect(vacio).toBeNull()
  })

  it('bloqueIgualar pone la misma cantidad en todo (o borra si 0)', () => {
    const l = bloqueIgualar([ingresoBase()], 'g1', 'b1', 4)
    expect(bloqueU(l[0].bloques[0])).toBe(4 * 2 * 2)
    const cero = bloqueIgualar([ingresoBase()], 'g1', 'b1', 0)
    expect(bloqueU(cero[0].bloques[0])).toBe(0)
  })

  it('cargarBase agrega los modelos base que faltan (sin duplicar)', () => {
    const l = cargarBase([ingresoBase()], 'g1', 'b1', nidFactory())
    const modelos = l[0].bloques[0].modelos.map((m) => m.model)
    // ya tenía iPhone 15 y 16: no se duplican; se suman los 13 restantes de la base (15)
    expect(modelos.filter((m) => m === 'iPhone 15')).toHaveLength(1)
    expect(modelos).toContain('iPhone 13')
    expect(modelos).toContain('iPhone 17 Pro Max')
  })
})
