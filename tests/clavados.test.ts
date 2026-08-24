import { describe, it, expect } from 'vitest'
import {
  capitalParado, renglonClavado, resumirClavados, ventaPorProducto,
} from '@/lib/clavados/core.js'

/**
 * El recupero de los clavados. Lo que se prueba acá es lo que falla devolviendo un número
 * plausible: el recupero que se calcula sobre el estado de hoy en vez de sobre la venta de la
 * semana, y el costo cero que hace que todo dé 100 %.
 */

describe('lo que facturó cada producto marcado', () => {
  const ventas = [
    { id: 100, date_sale: '2026-08-10' },
    { id: 105, date_sale: '2026-08-13' },
    { id: 110, date_sale: '2026-08-20' }, // fuera de la semana, id en el medio del rango
  ]
  const detalles = [
    { sale_id: 100, product_id: 7, quantity: 2, total: 20000 },
    { sale_id: 105, product_id: 7, quantity: 1, total: 9000 },
    { sale_id: 105, product_id: 8, quantity: 1, total: 5000 },
    { sale_id: 110, product_id: 7, quantity: 9, total: 90000 }, // fuera de la semana
  ]
  const args = { ventas, detalles, desde: '2026-08-10', hasta: '2026-08-16' }

  it('🔴 filtra por la FECHA de la venta, no por el rango de sale_id', () => {
    const v = ventaPorProducto(args)
    expect(v.get('7')).toEqual({ mercaderia: 29000, unidades: 3 })
  })

  it('un producto sin ventas en el rango no aparece (y no es un cero inventado)', () => {
    expect(ventaPorProducto(args).has('99')).toBe(false)
  })
})

describe('🔴 el capital parado: null no es cero', () => {
  it('con costo y stock, es la multiplicación', () => {
    expect(capitalParado({ stock: 10, costo: 3500 })).toBe(35000)
  })

  it('sin costo (el sync no lo pudo leer) NO es medible', () => {
    // Son los 450 productos de BDI. Tratarlo como 0 haría que toda la marca diera 100 % de recupero.
    expect(capitalParado({ stock: 10, costo: null })).toBeNull()
    expect(capitalParado({ stock: 10, costo: undefined })).toBeNull()
  })

  it('🔴 costo CERO tampoco es medible', () => {
    // En Zattia son 769 de 2.676. Su capital parado daría 0 y el recupero 100 %: un número
    // perfecto y falso, que es peor que no tener número.
    expect(capitalParado({ stock: 10, costo: 0 })).toBeNull()
  })

  it('stock cero con costo bueno SÍ es medible: es un cero de verdad', () => {
    // Acá el cero afirma algo cierto —no queda capital parado— y por eso no se calla.
    expect(capitalParado({ stock: 0, costo: 3500 })).toBe(0)
  })
})

describe('el renglón de un clavado', () => {
  const clavado = { producto_id: 7, sku: 'ABC-1', nombre: 'Vestido rojo', marcado_en: '2026-07-01T10:00:00Z' }

  it('la plata sale de la venta del rango, no del estado de hoy', () => {
    // 🔴 El caso que ordena todo el módulo: se agotó (stock 0) y IGUAL cuenta lo que facturó.
    const r = renglonClavado({ clavado, venta: { mercaderia: 148200, unidades: 6 }, stock: 0, costo: 3500 })
    expect(r.recuperado).toBe(148200)
    expect(r.agotado).toBe(true)
    expect(r.parado).toBe(0)
    expect(r.pct).toBe(100)
  })

  it('con stock, el porcentaje es contra lo que todavía queda parado', () => {
    const r = renglonClavado({ clavado, venta: { mercaderia: 25000, unidades: 1 }, stock: 10, costo: 7500 })
    expect(r.parado).toBe(75000)
    expect(r.pct).toBeCloseTo(25, 5) // 25.000 / (75.000 + 25.000)
  })

  it('🔴 sin costo NO hay porcentaje, aunque haya recupero', () => {
    // Sin denominador el porcentaje sería recuperado/recuperado = 100 %, que es exactamente el
    // número que después alguien cita en una reunión.
    const r = renglonClavado({ clavado, venta: { mercaderia: 25000, unidades: 1 }, stock: 10, costo: null })
    expect(r.recuperado).toBe(25000)
    expect(r.parado).toBeNull()
    expect(r.pct).toBeNull()
  })

  it('un clavado que no vendió es 0 recuperado, no un hueco', () => {
    const r = renglonClavado({ clavado, venta: undefined, stock: 4, costo: 1000 })
    expect(r.recuperado).toBe(0)
    expect(r.parado).toBe(4000)
    expect(r.pct).toBe(0)
  })

  it('sin venta ni capital medible, el porcentaje es null y no NaN', () => {
    const r = renglonClavado({ clavado, venta: undefined, stock: 0, costo: 3500 })
    expect(r.pct).toBeNull()
  })
})

describe('el total del bloque', () => {
  const base = { producto_id: '1', sku: null, nombre: null, marcado_en: null, unidades: 0, stock: 1, agotado: false, pct: null }

  it('suma el recupero y el capital parado', () => {
    const r = resumirClavados([
      { ...base, recuperado: 100, parado: 900 },
      { ...base, recuperado: 50, parado: 450 },
    ])
    expect(r.recuperado).toBe(150)
    expect(r.parado).toBe(1350)
    expect(r.pct).toBeCloseTo(10, 5)
  })

  it('🔴 los que no tienen costo se cuentan aparte y NO entran al parado', () => {
    // Si entraran como 0, el denominador se achicaría y el porcentaje subiría solo. Contarlos es lo
    // que dice el tamaño de lo que el total NO está midiendo.
    const r = resumirClavados([
      { ...base, recuperado: 100, parado: 900 },
      { ...base, recuperado: 50, parado: null },
    ])
    expect(r.sinCosto).toBe(1)
    expect(r.parado).toBe(900)
    expect(r.productos).toBe(2)
  })

  it('🔴 con TODOS sin costo, el porcentaje es null — no 100 %', () => {
    // El defecto que encontró caminar prod el 24-ago-2026: BDI no tiene costos, así que `parado`
    // sumaba 0 y `recuperado / (0 + recuperado)` daba **100 % recuperado** con cero productos
    // medibles. Es exactamente el número que este módulo existe para no mostrar.
    const r = resumirClavados([{ ...base, recuperado: 802757, parado: null }])
    expect(r.sinCosto).toBe(1)
    expect(r.recuperado).toBe(802757)
    expect(r.pct).toBeNull()
  })

  it('🔴 el que no tiene costo tampoco aporta al NUMERADOR del porcentaje', () => {
    // Si aportara, cada clavado sin costo empujaría el porcentaje hacia arriba: el medible da
    // 100/(900+100) = 10 %, y sumarle los 500 del que no se puede medir lo llevaría a 40 %.
    const r = resumirClavados([
      { ...base, recuperado: 100, parado: 900 },
      { ...base, recuperado: 500, parado: null },
    ])
    expect(r.recuperado).toBe(600) // la plata que volvió de verdad, entera
    expect(r.pct).toBeCloseTo(10, 5) // pero el porcentaje sólo mira lo medible
  })

  it('cuenta los agotados, que son los que ya cerraron su ciclo', () => {
    const r = resumirClavados([
      { ...base, recuperado: 10, parado: 0, agotado: true },
      { ...base, recuperado: 10, parado: 100, agotado: false },
    ])
    expect(r.agotados).toBe(1)
  })

  it('sin clavados no explota ni inventa un porcentaje', () => {
    expect(resumirClavados([]).pct).toBeNull()
    expect(resumirClavados(undefined).productos).toBe(0)
  })
})
