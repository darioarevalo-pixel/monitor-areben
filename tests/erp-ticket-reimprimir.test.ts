import { describe, expect, it } from 'vitest'
import { origenDelCambio, piezasDeFicha } from '@/lib/erp/ticket-erp'
import type { FichaDeVenta } from '@/lib/erp/cliente'

/** ERP › Ventas · imprimir el ticket (Bruno, 29-oct): las mismas piezas que el POS. */
const ficha = (x: Partial<FichaDeVenta> = {}) => ({
  venta: { numero: 32, marca: 'stunned', total: 12591, subtotal: 12591 },
  lineas: [{ id: 'l1', n: 1, producto: '913520', talle: '7', nombre: 'Remera Scottish', talleNombre: 'S', sku: 'STU-REM-0005-S', cantidad: 1, precio: 12591, descuento: 0, rebaja: 0, importe: 12591 }],
  pagos: [{ cuenta: 'Pago Nube', medio: 'otro', monto: 12591, base: null, porcentaje: null }],
  original: null,
  ...x,
}) as unknown as FichaDeVenta

describe('piezasDeFicha', () => {
  it('la venta online: la prenda con su talle y el logo de Stunned, el cobro con el nombre de su cuenta', () => {
    const p = piezasDeFicha(ficha())
    expect(p.renglones).toEqual([{ nombre: 'Remera Scottish', talle: 'S', cantidad: 1, precio: 12591, importe: 12591, stunned: true }])
    expect(p.pagos).toEqual([{ cuenta: 1, porcentaje: 0, descuento: 0, redondeo: 0, monto: 12591 }])
    expect(p.nombre(1)).toBe('Pago Nube')
  })
  it('el saldo a favor y lo que quedó a cuenta ⛔ son cobros: el saldo va aparte, como en el POS', () => {
    const p = piezasDeFicha(ficha({ pagos: [{ cuenta: 'Saldo', medio: 'saldo', monto: 3000, base: null, porcentaje: null }, { cuenta: 'Efectivo', medio: 'efectivo', monto: 500, base: null, porcentaje: null }] } as never))
    expect(p.pagos.map((x) => x.monto)).toEqual([500])
    expect(p.nombre(1)).toBe('Efectivo')
    expect(p.saldoUsado).toBe(3000)
  })
  it('lo que vuelve en un cambio queda en negativo (el ticket dice DEVUELVE)', () => {
    const l = ficha().lineas[0]
    const p = piezasDeFicha(ficha({ lineas: [{ ...l, cantidad: -1, importe: -12591 }, { ...l, id: 'l2', n: 2, talleNombre: 'M' }] } as never))
    expect(p.renglones.map((r) => [r.cantidad, r.talle])).toEqual([[-1, 'S'], [1, 'M']])
  })
})

describe('origenDelCambio (como useCambio.comprobanteDe)', () => {
  it('del ERP, de Gestión Nube o sin ticket', () => {
    expect(origenDelCambio(null, { numero: 25 } as never)).toBe('Venta #25')
    expect(origenDelCambio({ fecha: '2026-10-27', numero: '30970', gn_venta: '1551664' } as never, null)).toBe('Venta #30970 de Gestión Nube')
    expect(origenDelCambio({ sin_ticket: true }, null)).toBe('Sin ticket')
    expect(origenDelCambio(null, null)).toBe('Sin ticket')
  })
})
