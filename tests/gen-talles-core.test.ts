import { describe, it, expect } from 'vitest'
import {
  computarPendientes,
  emparejarMedidas,
  filtrarPendientes,
  generarHtml,
  limpiarData,
  parseTalles,
  tieneTablaVieja,
  tipoDesdeNombre,
  type MedidaImportada,
} from '@/lib/gen-talles/core'
import { GEN_TALLES_PLANTILLAS } from '@/lib/gen-talles/plantillas'
import { indexarTn, type TnProducto } from '@/lib/tn'
import { genTallesHTMLLegacy, tipoDesdeNombreLegacy } from './legacy-gen-talles'

describe('parseTalles', () => {
  it('separa por coma o salto de línea, trimea y descarta vacíos', () => {
    expect(parseTalles('S, M ,L\nXL,')).toEqual(['S', 'M', 'L', 'XL'])
    expect(parseTalles('')).toEqual([])
  })
})

describe('generarHtml · paridad BYTE-IDÉNTICA con genTallesHTML', () => {
  const casos: { tipo: string; talles: string[]; data: Record<string, string> }[] = [
    { tipo: 'remera', talles: ['S', 'M', 'L', 'XL'], data: { 'S|A': '46', 'M|A': '48', 'L|B': '65', 'XL|D': '60' } },
    { tipo: 'jean', talles: ['34', '36', '38'], data: { '34|A': '98', '36|C': '70', '38|D': '25' } },
    { tipo: 'vestido', talles: ['S', 'M'], data: {} }, // sin datos → guiones
    { tipo: 'top', talles: ['S', 'M', 'L', 'XL'], data: { 'S|A': '<b>ojo</b>', 'M|C': 'a & b "x"' } }, // escaping
  ]
  for (const c of casos) {
    it(`tipo ${c.tipo}`, () => {
      const plant = GEN_TALLES_PLANTILLAS[c.tipo]
      const port = generarHtml(plant, c.talles, c.data)
      const legacy = genTallesHTMLLegacy(plant, c.talles, c.data)
      expect(port).toBe(legacy)
    })
  }
})

describe('tipoDesdeNombre · paridad con _gtTipoDesdeNombre', () => {
  const nombres = ['Jean Río', 'Remera oversize', 'Vestido largo de fiesta', 'Buzo canguro', 'Camisa lino', 'Pantalón cargo', 'jeans mom']
  for (const n of nombres) {
    it(`"${n}"`, () => {
      expect(tipoDesdeNombre(n, GEN_TALLES_PLANTILLAS)).toBe(tipoDesdeNombreLegacy(n, GEN_TALLES_PLANTILLAS))
    })
  }
})

describe('limpiarData', () => {
  it('saca las claves que ya no corresponden a talle×medida vigente', () => {
    const plant = GEN_TALLES_PLANTILLAS.top // medidas A,B,C
    const data = { 'S|A': '1', 'S|D': 'viejo', 'M|B': '2', 'XXL|A': 'fuera' }
    expect(limpiarData(data, plant, ['S', 'M'])).toEqual({ 'S|A': '1', 'M|B': '2' })
  })
})

describe('emparejarMedidas', () => {
  const plant = GEN_TALLES_PLANTILLAS.jean // A=Largo, B=Contorno cadera, C=Contorno cintura, D=Tiro
  it('empareja por nombre exacto e insensible a acentos/orden', () => {
    const talles = ['34', '36']
    const medidas: MedidaImportada[] = [
      { nombre: 'Contorno cintura', valores: { '34': '70', '36': '72' } },
      { nombre: 'Largo', valores: { '34': '98', '36': '99' } },
    ]
    const gt = emparejarMedidas(talles, medidas, plant)
    expect(gt['34|C']).toBe('70') // cintura → C
    expect(gt['36|C']).toBe('72')
    expect(gt['34|A']).toBe('98') // largo → A
  })

  it('pase 2: uno contiene al otro (cintura ⊂ contorno cintura)', () => {
    const gt = emparejarMedidas(['34'], [{ nombre: 'Cintura', valores: { '34': '68' } }], plant)
    expect(gt['34|C']).toBe('68')
  })

  it('fallback por posición si nada empareja por nombre', () => {
    const gt = emparejarMedidas(['34'], [{ nombre: 'zzz', valores: { '34': '10' } }, { nombre: 'yyy', valores: { '34': '20' } }], plant)
    expect(gt['34|A']).toBe('10')
    expect(gt['34|B']).toBe('20')
  })
})

describe('pendientes de tabla', () => {
  const tn = (over: Partial<TnProducto>): TnProducto => ({ id: '1', name: 'x', sku: null, ...over })
  const productos = [
    { name: 'Jean Río', sku: 'JEAN-1', stock: 5, ingresoMes: '2026-05' },
    { name: 'Remera Base', sku: 'REM-1', stock: 0, ingresoMes: '2026-06' },
    { name: 'Buzo Nuevo', sku: 'BUZO-1', stock: 3, ingresoMes: null },
    { name: 'Sin match', sku: 'ZZZ', stock: 9, ingresoMes: '2026-04' },
  ]
  const tnProducts: TnProducto[] = [
    tn({ id: 10, sku: 'JEAN-1', name: 'Jean Río', raw_desc: '<p>desc</p><table>vieja</table>', categories: ['Jeans'], has_desc: true }),
    tn({ id: 11, sku: 'REM-1', name: 'Remera Base', raw_desc: '<p>solo desc</p>', categories: ['Remeras'], has_desc: true }),
    tn({ id: 12, sku: 'BUZO-1', name: 'Buzo Nuevo', raw_desc: '', categories: [], has_desc: false }), // sin tabla ni desc → excluido
  ]
  const idx = indexarTn(tnProducts)

  it('incluye los que tienen tabla vieja o descripción y no están guardados', () => {
    const base = computarPendientes(productos, idx, {})
    expect(base.map((p) => p.nombre).sort()).toEqual(['Jean Río', 'Remera Base'])
    const jean = base.find((p) => p.nombre === 'Jean Río')!
    expect(jean.tablaVieja).toBe(true)
    expect(jean.categoriasTN).toEqual(['Jeans'])
    const rem = base.find((p) => p.nombre === 'Remera Base')!
    expect(rem.tablaVieja).toBe(false) // solo desc, sin <table>
  })

  it('excluye los ya guardados en el KV', () => {
    const base = computarPendientes(productos, idx, { '10': { tipo: 'jean', talles: '', gtData: {} } })
    expect(base.map((p) => p.nombre)).toEqual(['Remera Base'])
  })

  it('filtrarPendientes: estado, stock, categoría, mes + orden por stock desc', () => {
    const base = computarPendientes(productos, idx, {})
    expect(filtrarPendientes(base, { estado: 'vieja', categoria: '', mes: '', soloStock: false }).map((p) => p.nombre)).toEqual(['Jean Río'])
    expect(filtrarPendientes(base, { estado: 'sin', categoria: '', mes: '', soloStock: false }).map((p) => p.nombre)).toEqual(['Remera Base'])
    expect(filtrarPendientes(base, { estado: 'todas', categoria: '', mes: '', soloStock: true }).map((p) => p.nombre)).toEqual(['Jean Río']) // Remera stock 0
    expect(filtrarPendientes(base, { estado: 'todas', categoria: 'Remeras', mes: '', soloStock: false }).map((p) => p.nombre)).toEqual(['Remera Base'])
    expect(filtrarPendientes(base, { estado: 'todas', categoria: '', mes: '2026-05', soloStock: false }).map((p) => p.nombre)).toEqual(['Jean Río'])
  })
})

describe('tieneTablaVieja', () => {
  it('detecta firma propia o cualquier <table>', () => {
    expect(tieneTablaVieja('<!--AREBEN-TALLES-INI-->x')).toBe(true)
    expect(tieneTablaVieja('<div><TABLE>x</TABLE></div>')).toBe(true)
    expect(tieneTablaVieja('<p>solo texto</p>')).toBe(false)
    expect(tieneTablaVieja(undefined)).toBe(false)
  })
})
