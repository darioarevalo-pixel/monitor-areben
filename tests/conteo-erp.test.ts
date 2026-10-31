import { describe, expect, it } from 'vitest'
import { ajustesDeConteo, conLibro, depositoDeLoc, depositoDeUbicacion, grandes, partirExcel, variantesEnErp } from '@/lib/erp/conteo-erp.core.js'
import { cortesDeFilas, lineaEnErp, lineasEnErp } from '@/lib/erp/corte.core.js'
import { conParteErp, filasExcel, lineasDeParteErp, textoAjustesErp } from '@/lib/conteo-deposito/core'

/* eslint-disable @typescript-eslint/no-explicit-any */
const fila = (o: Record<string, unknown>): any => ({ inventory_id: 1, product_id: 1, size_id: 10, product_name: 'x', size_name: 'M', store_name: 'Local', sku: 'RBE-1', barcode: 'b', available_quantity: 5, fuente: 'vivo', ...o })
const stu = fila({ inventory_id: 2, product_id: 2, size_id: 20, sku: 'STU-REM-0001-M', available_quantity: 9 })
const zat = fila({})
const ajusteFila = (o: Record<string, unknown>): any => ({ inventory_id: 1, product_code: '', producto: 'x', variante: 'M', ubicacion: 'Local', barcode: 'b', vivo: 5, dif: -1, nuevo: 4, sistema: 5, contado: 4, ...o })

describe('¿la línea ya está en el ERP? (erp_corte)', () => {
  const cortes = cortesDeFilas([{ linea: 'stunned', instante: new Date('2026-10-28T23:40:27.759Z') }, { linea: 'bdi', instante: '2026-11-16T03:00:00Z' }])
  it('hay fila y el instante ya pasó', () => {
    expect(lineaEnErp(cortes, 'stunned', new Date('2026-10-31T12:00:00Z'))).toBe(true)
    expect(lineaEnErp(cortes, 'stunned', new Date('2026-10-28T23:40:27.758Z'))).toBe(false)
  })
  it('BDI con fila FUTURA todavía ⛔; sin fila ⛔', () => {
    expect(lineaEnErp(cortes, 'bdi', new Date('2026-11-15T12:00:00Z'))).toBe(false)
    expect(lineaEnErp(cortes, 'bdi', new Date('2026-11-16T03:00:00Z'))).toBe(true)
    expect(lineaEnErp(cortes, 'zattia', new Date('2027-01-01T00:00:00Z'))).toBe(false)
  })
  it('sin cortes TIRA (⛔ un default que olvide el corte)', () => {
    expect(() => lineaEnErp(undefined as any, 'stunned')).toThrow(/erp_corte/)
  })
  it('las líneas de una base: Zattia lleva a Stunned', () => {
    const hoy = new Date('2026-10-31T12:00:00Z')
    expect(lineasEnErp(cortes, 'zattia', hoy)).toEqual(['stunned'])
    expect(lineasEnErp(cortes, 'bdi', hoy)).toEqual([])
    expect(lineasEnErp(cortes, 'bdi', new Date('2026-11-20T00:00:00Z'))).toEqual(['bdi'])
  })
})

describe('el «sistema» de una línea cortada es el libro', () => {
  const lineas = new Map([[1, 'zattia'], [2, 'stunned']])
  it('cambia sólo las de la línea cortada, con fuente erp y su línea; sin fila en el libro = 0', () => {
    const [z, s] = conLibro([zat, stu], lineas, ['stunned'], new Map([['2:20', 3]]))
    expect(z).toBe(zat)
    expect(s).toMatchObject({ available_quantity: 3, fuente: 'erp', linea: 'stunned', inventory_id: 2 })
    expect(conLibro([stu], lineas, ['stunned'], new Map())[0].available_quantity).toBe(0)
  })
  it('la línea sale del PRODUCTO, ⛔ del sku del vivo: un STU sin sku en GN igual va (proveedor STUNNED)', () => {
    const sinSku = fila({ inventory_id: 3, product_id: 3, size_id: 30, sku: '' })
    expect(conLibro([sinSku], new Map([[3, 'stunned']]), ['stunned'], new Map([['3:30', 4]]))[0]).toMatchObject({ fuente: 'erp', available_quantity: 4 })
  })
  it('Zattia cortada (23-nov): sus prendas también; sin corte, nada', () => {
    expect(variantesEnErp([zat, stu], lineas, ['zattia', 'stunned'])).toHaveLength(2)
    expect(variantesEnErp([zat, stu], lineas, [])).toEqual([])
  })
  it('BDI: el depósito del vivo es el Minorista; el de la ubicación sale del nombre de GN', () => {
    expect(depositoDeLoc('bdi', 'deposito')).toBe('deposito_minorista')
    expect(depositoDeLoc('zattia', 'local')).toBe('local')
    expect(depositoDeUbicacion('bdi', 'Deposito Minorista')).toBe('deposito_minorista')
    expect(depositoDeUbicacion('zattia', 'Deposito ')).toBe('deposito')
    expect(depositoDeUbicacion('zattia', 'Deposito Minorista')).toBeNull()
  })
})

describe('partirExcel', () => {
  const vivo = { '1_10': zat, '2_20': { ...stu, fuente: 'erp', linea: 'stunned' } }
  it('las del libro van al ERP con su dif y su línea; el resto, al Excel', () => {
    const r = partirExcel([ajusteFila({}), ajusteFila({ inventory_id: 2, dif: 2 })], vivo)
    expect(r.excel.map((x: any) => x.inventory_id)).toEqual([1])
    expect(r.erp).toEqual([{ product_id: 2, size_id: 20, sku: 'STU-REM-0001-M', barcode: 'b', dif: 2, linea: 'stunned' }])
  })
  it('una prenda que ⛔ vino con el libro (línea sin corte) sigue al Excel, como hoy', () => {
    const r = partirExcel([ajusteFila({ inventory_id: 2 })], { '2_20': stu })
    expect(r.erp).toEqual([])
    expect(r.excel).toHaveLength(1)
  })
  it('conParteErp deja `rows` entera (se muestra) y filasExcel saca las del ERP', () => {
    const pv: any = { rows: [ajusteFila({}), ajusteFila({ inventory_id: 2, dif: 2 })] }
    const con = conParteErp(pv, vivo as any, 'ref-123456')
    expect(con.rows).toHaveLength(2)
    expect(con.erp?.ref).toBe('ref-123456')
    expect(filasExcel(con).map((x: any) => x.inventory_id)).toEqual([1])
    const sinErp: any = { rows: [ajusteFila({})] }
    expect(conParteErp(sinErp, vivo as any, 'ref-123456')).toBe(sinErp)
    expect(filasExcel(sinErp)).toBe(sinErp.rows)
  })
  it('los carteles nombran las líneas y los ajustes', () => {
    expect(lineasDeParteErp({ renglones: [{ linea: 'stunned' }, { linea: 'zattia' }, { linea: 'stunned' }] })).toBe('Stunned y Zattia')
    expect(lineasDeParteErp({ renglones: [{ linea: 'bdi' }] })).toBe('BDI')
    expect(textoAjustesErp([{ ajuste: 12 }, { ajuste: 13 }])).toBe(' Quedó ajustado en el ERP (A-12, A-13).')
    expect(textoAjustesErp(undefined)).toBe('')
  })
  it('aviso: las prendas que cambian ≥ 2 u (Bruno 30-oct)', () => {
    expect(grandes([{ dif: 1 }, { dif: -2 }, { dif: 3 }, { dif: -1 }]).map((r: any) => r.dif)).toEqual([-2, 3])
  })
})

describe('ajustesDeConteo', () => {
  const lineas = new Map([[2, 'stunned'], [3, 'stunned'], [1, 'zattia'], [9, 'zattia']])
  const b = (o: Record<string, unknown> = {}): any => ({
    ubicacion: 'Local', resumen: { modo: 'estandar' },
    erp: { ref: 'abcdef-1234', renglones: [{ product_id: 2, size_id: 20, sku: 'STU-A', barcode: 'x', dif: -2 }] }, ...o,
  })
  it('lo contado = libro AHORA + dif (una venta en el medio ⛔ se cuenta dos veces)', () => {
    const a: any = ajustesDeConteo(b(), 'zattia', lineas, ['stunned'], new Map([['2:20', 4]]))
    expect(a).toEqual([{ linea: 'stunned', deposito: 'local', motivo: 'conteo', ref: 'conteo:abcdef-1234', detalle: 'Conteo del monitor (estandar)',
      renglones: [{ product_id: 2, size_id: 20, sku: 'STU-A', barcode: 'x', contado: 2 }] }])
  })
  it('UN ajuste por línea (Zattia y Stunned cortadas, el depósito de Zattia las mezcla)', () => {
    const renglones = [{ product_id: 2, size_id: 20, dif: 1 }, { product_id: 9, size_id: 90, dif: -1 }, { product_id: 3, size_id: 30, dif: 2 }]
    const a: any = ajustesDeConteo(b({ ubicacion: 'Deposito ', erp: { ref: 'abcdef-1234', renglones } }), 'zattia', lineas, ['zattia', 'stunned'], new Map([['9:90', 5]]))
    expect(a.map((x: any) => [x.linea, x.deposito, x.renglones.length])).toEqual([['stunned', 'deposito', 2], ['zattia', 'deposito', 1]])
    expect(a.find((x: any) => x.linea === 'zattia').renglones[0].contado).toBe(4)
  })
  it('BDI desde su corte: depósito minorista, línea bdi', () => {
    const a: any = ajustesDeConteo(b({ ubicacion: 'Deposito Minorista', erp: { ref: 'abcdef-1234', renglones: [{ product_id: 7, size_id: 70, dif: 1 }] } }), 'bdi', new Map([[7, 'bdi']]), ['bdi'], new Map())
    expect(a).toMatchObject([{ linea: 'bdi', deposito: 'deposito_minorista', renglones: [{ contado: 1 }] }])
  })
  it('nunca menos de 0', () => {
    const a: any = ajustesDeConteo(b(), 'zattia', lineas, ['stunned'], new Map([['2:20', 1]]))
    expect(a[0].renglones[0].contado).toBe(0)
  })
  it('sin parte ERP, o sólo dif 0 ⇒ []', () => {
    expect(ajustesDeConteo({ ubicacion: 'Local' }, 'zattia', lineas, ['stunned'], new Map())).toEqual([])
    expect(ajustesDeConteo(b({ erp: { ref: 'abcdef-1234', renglones: [{ product_id: 2, size_id: 20, dif: 0 }] } }), 'zattia', lineas, ['stunned'], new Map())).toEqual([])
  })
  it('frena: una prenda de una línea SIN corte (la línea la decide el servidor)', () => {
    const r: any = ajustesDeConteo(b({ erp: { ref: 'abcdef-1234', renglones: [{ product_id: 1, size_id: 10, sku: 'RBE-1', dif: 1 }] } }), 'zattia', lineas, ['stunned'], new Map())
    expect(r.error).toMatch(/Gestión Nube/)
    const desconocido: any = ajustesDeConteo(b({ erp: { ref: 'abcdef-1234', renglones: [{ product_id: 99, size_id: 10, dif: 1 }] } }), 'zattia', lineas, ['stunned'], new Map())
    expect(desconocido.error).toMatch(/catálogo/)
  })
  it('frena: depósito desconocido, sin ref, repetida, dif inválida', () => {
    expect((ajustesDeConteo(b({ ubicacion: 'Deposito Minorista' }), 'zattia', lineas, ['stunned'], new Map()) as any).error).toMatch(/Depósito/)
    expect((ajustesDeConteo(b({ erp: { ref: 'x', renglones: [{ product_id: 2, size_id: 20, dif: 1 }] } }), 'zattia', lineas, ['stunned'], new Map()) as any).error).toMatch(/identificador/)
    const dos = [{ product_id: 2, size_id: 20, dif: 1 }, { product_id: 2, size_id: 20, dif: 1 }]
    expect((ajustesDeConteo(b({ erp: { ref: 'abcdef-1234', renglones: dos } }), 'zattia', lineas, ['stunned'], new Map()) as any).error).toMatch(/dos veces/)
    expect((ajustesDeConteo(b({ erp: { ref: 'abcdef-1234', renglones: [{ product_id: 2, size_id: 20, dif: 1.5 }] } }), 'zattia', lineas, ['stunned'], new Map()) as any).error).toBeTruthy()
  })
})
