import { describe, expect, it } from 'vitest'
import { ajusteDeConteo, conLibro, depositoDeUbicacion, partirExcel, variantesStunned } from '@/lib/erp/conteo-stunned.core.js'
import { conParteErp, filasExcel } from '@/lib/conteo-deposito/core'

/* eslint-disable @typescript-eslint/no-explicit-any */
const fila = (o: Record<string, unknown>): any => ({ inventory_id: 1, product_id: 1, size_id: 10, product_name: 'x', size_name: 'M', store_name: 'Local', sku: 'RBE-1', barcode: 'b', available_quantity: 5, fuente: 'vivo', ...o })
const stu = fila({ inventory_id: 2, product_id: 2, size_id: 20, sku: 'STU-REM-0001-M', available_quantity: 9 })
const zat = fila({})
const ajusteFila = (o: Record<string, unknown>): any => ({ inventory_id: 1, product_code: '', producto: 'x', variante: 'M', ubicacion: 'Local', barcode: 'b', vivo: 5, dif: -1, nuevo: 4, sistema: 5, contado: 4, ...o })

describe('el «sistema» de Stunned es el libro', () => {
  it('cambia sólo las STU, con fuente erp; sin fila en el libro = 0', () => {
    const [z, s] = conLibro([zat, stu], new Map([['2:20', 3]]))
    expect(z).toBe(zat)
    expect(s).toMatchObject({ available_quantity: 3, fuente: 'erp', inventory_id: 2 })
    expect(conLibro([stu], new Map())[0].available_quantity).toBe(0)
  })
  it('pide al libro sólo las variantes STU', () => {
    expect(variantesStunned([zat, stu])).toEqual([{ product_id: 2, size_id: 20 }])
  })
  it('el depósito sale del nombre de GN, con el espacio de Zattia', () => {
    expect(depositoDeUbicacion('Deposito ')).toBe('deposito')
    expect(depositoDeUbicacion('Local')).toBe('local')
  })
})

describe('partirExcel', () => {
  const vivo = { '1_10': zat, '2_20': { ...stu, fuente: 'erp' } }
  it('las STU con libro van al ERP con su dif; el resto, al Excel', () => {
    const r = partirExcel([ajusteFila({}), ajusteFila({ inventory_id: 2, dif: 2 })], vivo)
    expect(r.excel.map((x: any) => x.inventory_id)).toEqual([1])
    expect(r.erp).toEqual([{ product_id: 2, size_id: 20, sku: 'STU-REM-0001-M', barcode: 'b', dif: 2 }])
  })
  it('una STU que ⛔ vino con el libro (llave apagada) sigue al Excel, como hoy', () => {
    const r = partirExcel([ajusteFila({ inventory_id: 2 })], { '2_20': stu })
    expect(r.erp).toEqual([])
    expect(r.excel).toHaveLength(1)
  })
  it('conParteErp deja `rows` entera (se muestra) y filasExcel saca las de Stunned', () => {
    const pv: any = { rows: [ajusteFila({}), ajusteFila({ inventory_id: 2, dif: 2 })] }
    const con = conParteErp(pv, vivo as any, 'ref-123456')
    expect(con.rows).toHaveLength(2)
    expect(con.erp?.ref).toBe('ref-123456')
    expect(filasExcel(con).map((x: any) => x.inventory_id)).toEqual([1])
    const sinStu: any = { rows: [ajusteFila({})] }
    expect(conParteErp(sinStu, vivo as any, 'ref-123456')).toBe(sinStu)
    expect(filasExcel(sinStu)).toBe(sinStu.rows)
  })
})

describe('ajusteDeConteo', () => {
  const lineas = new Map([[2, 'stunned'], [3, 'stunned'], [1, 'zattia']])
  const b = (o: Record<string, unknown> = {}): any => ({
    ubicacion: 'Local', resumen: { modo: 'estandar' },
    erp: { ref: 'abcdef-1234', renglones: [{ product_id: 2, size_id: 20, sku: 'STU-A', barcode: 'x', dif: -2 }] }, ...o,
  })
  it('lo contado = libro AHORA + dif (una venta en el medio ⛔ se cuenta dos veces)', () => {
    const a: any = ajusteDeConteo(b(), 'zattia', lineas, new Map([['2:20', 4]]))
    expect(a).toEqual({ linea: 'stunned', deposito: 'local', motivo: 'conteo', ref: 'conteo:abcdef-1234', detalle: 'Conteo del monitor (estandar)',
      renglones: [{ product_id: 2, size_id: 20, sku: 'STU-A', barcode: 'x', contado: 2 }] })
  })
  it('nunca menos de 0', () => {
    const a: any = ajusteDeConteo(b(), 'zattia', lineas, new Map([['2:20', 1]]))
    expect(a.renglones[0].contado).toBe(0)
  })
  it('sin parte ERP, o sólo dif 0 ⇒ null', () => {
    expect(ajusteDeConteo({ ubicacion: 'Local' }, 'zattia', lineas, new Map())).toBeNull()
    expect(ajusteDeConteo(b({ erp: { ref: 'abcdef-1234', renglones: [{ product_id: 2, size_id: 20, dif: 0 }] } }), 'zattia', lineas, new Map())).toBeNull()
  })
  it('frena: una prenda que ⛔ es de Stunned (la línea la decide el servidor)', () => {
    const r: any = ajusteDeConteo(b({ erp: { ref: 'abcdef-1234', renglones: [{ product_id: 1, size_id: 10, sku: 'RBE-1', dif: 1 }] } }), 'zattia', lineas, new Map())
    expect(r.error).toMatch(/no es de Stunned/)
  })
  it('frena: BDI, depósito desconocido, sin ref, repetida, dif inválida', () => {
    expect((ajusteDeConteo(b(), 'bdi', lineas, new Map()) as any).error).toBeTruthy()
    expect((ajusteDeConteo(b({ ubicacion: 'Deposito Minorista' }), 'zattia', lineas, new Map()) as any).error).toMatch(/Depósito/)
    expect((ajusteDeConteo(b({ erp: { ref: 'x', renglones: [{ product_id: 2, size_id: 20, dif: 1 }] } }), 'zattia', lineas, new Map()) as any).error).toMatch(/identificador/)
    const dos = [{ product_id: 2, size_id: 20, dif: 1 }, { product_id: 2, size_id: 20, dif: 1 }]
    expect((ajusteDeConteo(b({ erp: { ref: 'abcdef-1234', renglones: dos } }), 'zattia', lineas, new Map()) as any).error).toMatch(/dos veces/)
    expect((ajusteDeConteo(b({ erp: { ref: 'abcdef-1234', renglones: [{ product_id: 2, size_id: 20, dif: 1.5 }] } }), 'zattia', lineas, new Map()) as any).error).toBeTruthy()
  })
  it('el depósito de Zattia («Deposito » con espacio) es el `deposito` de Stunned', () => {
    expect((ajusteDeConteo(b({ ubicacion: 'Deposito ' }), 'zattia', lineas, new Map()) as any).deposito).toBe('deposito')
  })
})
