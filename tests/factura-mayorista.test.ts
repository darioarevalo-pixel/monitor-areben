import { describe, expect, it } from 'vitest'
import { leerFacturaLibre, leerRenglones, partePorMonto, productosPendientes, quedaPorFacturar, receptorMayorista, tipoMayorista } from '../lib/erp/factura-mayorista.core.js'

const CUIT = '30718508181'
const suma = (rs: Array<{ importe: number }>) => Math.round(rs.reduce((a, r) => a + r.importe * 100, 0)) / 100

describe('clase de la factura mayorista', () => {
  it('RI y monotributo ⇒ A (lo que acepta ARCA); exento y consumidor ⇒ B', () => {
    expect(tipoMayorista(1)).toBe(1)
    expect(tipoMayorista(6)).toBe(1)
    expect(tipoMayorista(4)).toBe(6)
    expect(tipoMayorista(5)).toBe(6)
  })
})

describe('receptorMayorista', () => {
  it('sin condición pide la condición', () => {
    expect(receptorMayorista({ doc: CUIT }).falta).toMatch(/condición/)
  })
  it('A con la ficha completa, sin guardar', () => {
    const r = receptorMayorista({ doc: CUIT, condicion_iva: 1, razon_social: 'AREBEN SRL', domicilio: 'Rosario' })
    expect(r).toMatchObject({ tipo: 1, guardar: false, receptor: { docTipo: 80, docNro: Number(CUIT), condicionIva: 1 } })
  })
  it('A sin CUIT válido o sin domicilio ⇒ falta', () => {
    expect(receptorMayorista({ doc: '30718508180', condicion_iva: 1, razon_social: 'X SA', domicilio: 'Rosario' }).falta).toMatch(/CUIT/)
    expect(receptorMayorista({ doc: CUIT, condicion_iva: 1, razon_social: 'X SA' }).falta).toMatch(/domicilio/)
  })
  it('lo pedido en el mismo paso completa la ficha y marca guardar', () => {
    const r = receptorMayorista({ doc: null }, { doc: CUIT, condicion: 'ri', razonSocial: 'X SA', domicilio: 'Calle 1' })
    expect(r).toMatchObject({ tipo: 1, guardar: true, ficha: { doc: CUIT, condicionIva: 1, razonSocial: 'X SA', domicilio: 'Calle 1' } })
  })
  it('B consumidor final sin documento ⇒ sin identificar', () => {
    expect(receptorMayorista({ condicion_iva: 5 }).receptor).toEqual({ docTipo: 99, docNro: 0, condicionIva: 5 })
    expect(receptorMayorista({ condicion_iva: 5, doc: '30123456' }).receptor).toEqual({ docTipo: 96, docNro: 30123456, condicionIva: 5 })
  })
})

describe('renglones de la factura LIBRE', () => {
  it('suma cantidad × precio en centavos', () => {
    const r = leerRenglones([{ descripcion: 'Fundas', cantidad: 100, unitario: 2000 }, { descripcion: 'Templados', cantidad: 3, unitario: 0.1 }])
    expect(r.total).toBe(200000.3)
    expect(r.renglones?.[1]).toEqual({ descripcion: 'Templados', cantidad: 3, unitario: 0.1, importe: 0.3 })
  })
  it('frena cantidad no entera, precio 0 y renglón sin texto', () => {
    expect(leerRenglones([{ descripcion: 'Fundas', cantidad: 1.5, unitario: 1 }]).error).toMatch(/entero/)
    expect(leerRenglones([{ descripcion: 'Fundas', cantidad: 1, unitario: 0 }]).error).toMatch(/mayor a 0/)
    expect(leerRenglones([{ descripcion: ' ', cantidad: 1, unitario: 1 }]).error).toMatch(/qué es/)
    expect(leerRenglones([]).error).toBeTruthy()
  })
  it('el cuerpo exige el cliente', () => {
    expect(leerFacturaLibre({ renglones: [{ descripcion: 'Fundas', cantidad: 1, unitario: 1 }] }).error).toMatch(/cliente/)
  })
})

describe('la PARTE por monto', () => {
  const vendidos = [
    { clave: '1:1', descripcion: 'Funda A', cantidad: 10, unitario: 5000 },
    { clave: '2:1', descripcion: 'Funda B', cantidad: 4, unitario: 3333.33 },
  ]
  it('ajustados: el total da JUSTO el monto, aunque el redondeo no cierre', () => {
    for (const monto of [1000, 12345.67, 33333.32, 60000]) {
      const r = partePorMonto({ pendientes: vendidos, monto })
      expect(r.total).toBe(monto)
      expect(suma(r.renglones)).toBe(monto)
      expect(r.renglones.every((x: { cantidad: number; unitario: number }) => x.cantidad > 0 && x.unitario > 0)).toBe(true)
      // ⛔ más unidades que las vendidas
      expect(r.renglones.reduce((a: number, x: { cantidad: number }) => a + x.cantidad, 0)).toBe(14)
    }
  })
  it('reales: a precio real, se acerca sin pasarse', () => {
    const r = partePorMonto({ pendientes: vendidos, monto: 23000, precios: 'reales' })
    expect(r.renglones).toEqual([{ clave: '1:1', descripcion: 'Funda A', cantidad: 4, unitario: 5000, importe: 20000 }])
    expect(r.total).toBe(20000)
    expect(partePorMonto({ pendientes: vendidos, monto: 100, precios: 'reales' }).error).toBeTruthy()
  })
  it('lo ya facturado en partes de antes ⛔ vuelve a entrar', () => {
    const p = productosPendientes(vendidos, [{ renglones: [{ clave: '1:1', cantidad: 10 }, { clave: '2:1', cantidad: 1 }] }])
    expect(p).toEqual([{ ...vendidos[1], cantidad: 3 }])
  })
  it('«Facturado $X de $Y»: lo acreditado por NC devuelve lugar', () => {
    expect(quedaPorFacturar(60000, [{ total: 20000 }, { total: 10000, acreditado: 10000 }])).toEqual({ total: 60000, facturado: 20000, queda: 40000 })
  })
})
