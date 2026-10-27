import { describe, expect, it } from 'vitest'
import { armarFilasGastos, contarVistasGasto, filtrarGasto, leerMonto, rangoGasto, resumenGastos, validarGasto } from '@/lib/erp/gastos.core.js'

/**
 * **ERP › Ventas › Gastos, el núcleo**: la comisión que sale sola de los cobros llega SUMADA ⇒ una fila; lo cargado a mano, una
 * fila por gasto; los números de arriba salen del total del motor; un monto con signo menos corrige uno de más.
 */
const datos = {
  desde: '2026-10-01', hasta: '2026-10-27', total: 1_010_000, por_tipo: { comision: 450_000, impuesto: 200_000, otro: 360_000 },
  comisionAutomatica: 412_000, cobrosSinComision: 3,
  gastos: [
    { id: '1', fecha: '2026-10-17', tipo: 'otro', monto: 21_000, detalle: 'Cadete · 6 envíos', cuenta: 'Caja de efectivo', origen: 'manual', venta_id: null, usuario: 'Bruno', linea: 'zattia' },
    { id: '2', fecha: '2026-10-20', tipo: 'impuesto', monto: 200_000, detalle: 'IIBB septiembre', cuenta: null, origen: 'manual', venta_id: null, usuario: 'Bruno', linea: 'zattia' },
    { id: '3', fecha: '2026-10-21', tipo: 'comision', monto: 38_000, detalle: 'Comisión de Mercado Libre', cuenta: null, origen: 'manual', venta_id: null, usuario: 'Darío', linea: 'zattia' },
  ],
}

describe('armarFilasGastos', () => {
  const filas = armarFilasGastos(datos)
  it('la comisión automática es UNA fila al final del período, y los cargados van por fecha, el más nuevo arriba', () => {
    expect(filas.map((f) => f.id)).toEqual(['comisiones-automaticas', '3', '2', '1'])
    expect(filas[0]).toMatchObject({ carga: 'automatica', tipo: 'comision', monto: 412_000, fecha: '2026-10-27', quien: null })
    expect(filas[3]).toMatchObject({ carga: 'manual', quien: 'Bruno', cuenta: 'Caja de efectivo' })
  })
  it('sin comisión automática no inventa la fila', () => {
    expect(armarFilasGastos({ ...datos, comisionAutomatica: 0 }).map((f) => f.id)).toEqual(['3', '2', '1'])
  })
  it('las vistas cuentan y filtran', () => {
    expect(contarVistasGasto(filas)).toEqual({ todos: 4, automaticos: 1, a_mano: 3 })
    expect(filtrarGasto(filas, 'a_mano').every((f) => f.carga === 'manual')).toBe(true)
    expect(filtrarGasto(filas, 'automaticos')).toHaveLength(1)
  })
})

describe('resumenGastos', () => {
  it('toma el total del motor; la comisión a mano es lo que sobra de la automática; avisa los cobros sin tasa', () => {
    expect(resumenGastos(datos)).toEqual({ total: 1_010_000, comision: 450_000, comisionAutomatica: 412_000, comisionAMano: 38_000, impuesto: 200_000, otro: 360_000, sinComision: 3 })
  })
})

describe('leerMonto y validarGasto', () => {
  it('entiende el monto como se escribe en Argentina', () => {
    expect(leerMonto('21.000')).toBe(21000)
    expect(leerMonto('1.234,50')).toBe(1234.5)
    expect(leerMonto('-500')).toBe(-500)
    expect(leerMonto('− 1.000,5')).toBe(-1000.5)
    expect(leerMonto('1234.5')).toBe(1234.5)
    expect(leerMonto('$ 300')).toBe(300)
    expect(leerMonto('abc')).toBeNull()
    expect(leerMonto('')).toBeNull()
  })
  const ok = { fecha: '2026-10-27', tipo: 'otro', monto: '21.000', detalle: ' Cadete ', cuenta: ' ', linea: 'zattia' }
  it('arma lo que se manda: detalle recortado, cuenta vacía ⇒ nada', () => {
    expect(validarGasto(ok)).toEqual({ gasto: { linea: 'zattia', fecha: '2026-10-27', tipo: 'otro', monto: 21000, detalle: 'Cadete', cuenta: undefined } })
    expect(validarGasto({ ...ok, monto: '-21.000' }).gasto?.monto).toBe(-21000)
  })
  it('«Envío de una devolución» sale como gasto «otro» con su rótulo, una sola vez', () => {
    expect(validarGasto({ ...ok, tipo: 'envio_devolucion', detalle: 'pedido 4790, Correo' }).gasto).toMatchObject({ tipo: 'otro', detalle: 'Envío de devolución · pedido 4790, Correo' })
    expect(validarGasto({ ...ok, tipo: 'envio_devolucion', detalle: 'Envío de devolución #295' }).gasto?.detalle).toBe('Envío de devolución #295')
  })
  it('dice qué falta, en palabras', () => {
    expect(validarGasto({ ...ok, monto: '0' }).error).toMatch(/distinto de cero/)
    expect(validarGasto({ ...ok, monto: '' }).error).toMatch(/distinto de cero/)
    expect(validarGasto({ ...ok, detalle: '  ' }).error).toMatch(/de qué es/)
    expect(validarGasto({ ...ok, fecha: '' }).error).toMatch(/fecha/)
    expect(validarGasto({ ...ok, tipo: 'x' }).error).toMatch(/tipo/)
  })
})

describe('rangoGasto', () => {
  it('es el de Cajas: este mes hasta hoy', () => {
    expect(rangoGasto('mes', '2026-10-27')).toEqual({ desde: '2026-10-01', hasta: '2026-10-27' })
  })
})
