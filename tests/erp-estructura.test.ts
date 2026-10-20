import { describe, expect, it } from 'vitest'
import { armarCuentas, armarEstructura, contarVistasCuentas, cuitConGuiones, filtrarCuentas } from '@/lib/erp/estructura.core.js'

describe('ERP › Configuración › Cuentas y Estructura', () => {
  const cuentas = [
    { id: 'a', titular: 'areben', nombre: 'Efectivo', banco: 'Areben', tipo: 'caja', activa: true },
    { id: 'b', titular: 'dario', nombre: 'Cuenta', banco: 'Mercado Pago', tipo: 'billetera', activa: true },
    { id: 'c', titular: 'areben', nombre: 'Vieja', banco: null, tipo: 'billetera', activa: false },
  ]
  const rutas = [
    { marca: 'zattia', canal: 'local', medio: 'efectivo', cuenta_real_id: 'a' },
    { marca: 'stunned', canal: 'local', medio: 'efectivo', cuenta_real_id: 'a' },
    { marca: 'zattia', canal: 'mayorista', medio: 'transferencia', cuenta_real_id: null },
  ]
  const filas = armarCuentas({ cuentas, rutas })

  it('cada cuenta dice qué rutas vigentes caen en ella; la que se elige en cada cobro ⛔ cuenta', () => {
    expect(filas[0]).toMatchObject({ nombre: 'Areben · Efectivo', titular: 'Areben', tipo: 'Caja', recibe: ['Stunned · Local · Efectivo', 'Zattia · Local · Efectivo'] })
    expect(filas[1].recibe).toEqual([])
    expect(contarVistasCuentas(filas)).toEqual({ activas: 2, con_ruta: 1, sin_ruta: 1, inactivas: 1 })
  })

  it('filtra por titular, tipo y buscador (también por lo que recibe)', () => {
    expect(filtrarCuentas(filas, { titular: 'dario' }).map((f) => f.id)).toEqual(['b'])
    expect(filtrarCuentas(filas, { vista: 'inactivas', tipo: 'billetera' }).map((f) => f.id)).toEqual(['c'])
    expect(filtrarCuentas(filas, { q: 'stunned' }).map((f) => f.id)).toEqual(['a'])
  })

  it('una fila por línea con sus depósitos, PV y razón social; Stunned dice que es línea de Zattia', () => {
    const e = armarEstructura({
      empresas: [{ id: 'areben', razon_social: 'AREBEN COMERCIAL SRL', cuit: '30718508181', condicion_iva: 'IVA Responsable Inscripto' }],
      marcas: [{ id: 'zattia', empresa_id: 'areben', nombre: 'Zattia', punto_venta: 5 }, { id: 'stunned', empresa_id: 'areben', nombre: 'Stunned', punto_venta: 5 }],
      depositos: [{ marca: 'zattia', id: 'local', nombre: 'Local', vende: true }, { marca: 'stunned', id: 'local', nombre: 'Local', vende: true }],
    })
    expect(e.map((f) => [f.nombre, f.linea, f.puntoVenta, f.depositos.length, f.razonSocial])).toEqual([
      ['Zattia', null, 5, 1, 'AREBEN COMERCIAL SRL'], ['Stunned', 'línea de Zattia', 5, 1, 'AREBEN COMERCIAL SRL'],
    ])
    expect(cuitConGuiones('30718508181')).toBe('30-71850818-1')
  })
})
