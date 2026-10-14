/**
 * La venta de la Caja anotada también en el motor (opción (a), Bruno 14-oct): la entrada sale de la fila de
 * `caja_venta` tal cual, siempre en `prueba`, y el motor la acepta. Oráculo de punta a punta (14-oct): las 51
 * ventas en GN de la Caja de Zattia, leídas de prod, entraron a un Postgres local con 001+005+006 — 51 de 51,
 * $1.444.100 = la suma de la Caja, 80 líneas, 0 movimientos del libro, y repetidas = 51 `ya_existia`.
 */
import { describe, it, expect } from 'vitest'
import { anularEnMotor, entradaDelMotor, faltanEnMotor } from '../lib/caja/motor.core.js'
import { avisoDelMotor } from '../api/_caja-motor.js'
import { armarVenta } from '../motor/venta/armar.mjs'

const fila = {
  id: '6f1c2b8e-1111-4a2b-9c3d-000000000001', store: 'bdi', estado: 'en_gn', usuario: 'Sofi', creada_en: '2026-10-14T15:00:00.000Z',
  renglones: [
    { product_id: 10, size_id: 3, cantidad: 2, precio: 15000, descuento: 0, rebaja: 0, importe: 30000, nombre: 'Funda', talle: 'U', sku: 'BDI-1', foto: null },
    { product_id: 11, size_id: 4, cantidad: 1, precio: 10000, descuento: 10, rebaja: 0, importe: 9000, nombre: 'Funda 2', talle: 'U', sku: null },
  ],
  pagos: [{ cuenta: 14685, base: 39000, rebaja: 0, porcentaje: 15, descuento: 5850, redondeo: -50, monto: 33100, nombre: 'Efectivo' }],
  subtotal: 39000, total: 33100, paga_con: 40000, gn_sale_id: 999, gn_number: 123, mp_pago_id: null,
}
const conf = { marcas: { bdi: { empresa_id: 'areben', depositos: ['local'] } }, cuentas: [{ id: 'c-ef', marca: 'bdi', gn_cuenta_id: 14685 }] }

describe('entradaDelMotor', () => {
  it('la arma desde la fila guardada: origen caja, la clave es el id (el integration_id de GN), en prueba', () => {
    const e = entradaDelMotor(fila)
    expect(e).toMatchObject({ origen: 'caja', origen_ref: fila.id, marca: 'bdi', canal: 'local', deposito: 'local', usuario: 'Sofi', prueba: true, subtotal: 39000, total: 33100 })
    expect(e.lineas[0]).toEqual({ product_id: 10, size_id: 3, cantidad: 2, precio: 15000, descuento: 0, rebaja: 0, importe: 30000, sku: 'BDI-1' })
    expect(e.detalle).toEqual({ gn_sale_id: 999, gn_number: 123, paga_con: 40000 })
  })
  it('el motor la acepta y ⛔ mueve el libro', () => {
    const r = armarVenta(entradaDelMotor(fila), conf)
    expect(r.ok).toBe(true)
    expect('movimientos' in r && r.movimientos).toEqual([])
  })
  it('sin cajera anotada, «caja» (el motor exige quién)', () => {
    expect(entradaDelMotor({ ...fila, usuario: null }).usuario).toBe('caja')
  })
})

describe('faltanEnMotor', () => {
  it('sólo las en GN que el motor ⛔ tiene', () => {
    const ventas = [{ id: 'a', estado: 'en_gn' }, { id: 'b', estado: 'en_gn' }, { id: 'c', estado: 'error' }]
    expect(faltanEnMotor(ventas, ['a']).map((v) => v.id)).toEqual(['b'])
  })
})

describe('anularEnMotor (la anulada en GN)', () => {
  it('anula la confirmada en el motor, con el motivo de quién la vio; ⛔ la que ya está anulada ni la que el motor ⛔ tiene', () => {
    const anuladas = [
      { id: 'c1', anulada_en_gn: { por: 'cierre', en: '2026-10-14T20:00:00Z' } },
      { id: 'c2', anulada_en_gn: { por: 'sync', en: '2026-10-14T06:00:00Z' } },
      { id: 'c3', anulada_en_gn: { por: 'sync', en: '2026-10-14T06:00:00Z' } },
      { id: 'c4', anulada_en_gn: null },
    ]
    const enMotor = [
      { id: 'v1', origen_ref: 'c1', estado: 'confirmada' },
      { id: 'v2', origen_ref: 'c2', estado: 'confirmada' },
      { id: 'v3', origen_ref: 'c3', estado: 'anulada' },
      { id: 'v4', origen_ref: 'c4', estado: 'confirmada' },
    ]
    expect(anularEnMotor(anuladas, enMotor)).toEqual([
      { venta_id: 'v1', motivo: 'Anulada en GN (la vio el cierre de caja)', usuario: 'gn' },
      { venta_id: 'v2', motivo: 'Anulada en GN (la vio el sync diario)', usuario: 'gn' },
    ])
    expect(anularEnMotor(anuladas, [])).toEqual([])
  })
})

describe('avisoDelMotor', () => {
  it('callado sin conexión (todavía ⛔ prendido) o con todo bien; habla con un error o una que ⛔ entró', () => {
    expect(avisoDelMotor({ sinConexion: true }, 'x')).toBeNull()
    expect(avisoDelMotor({ anotadas: 1, yaEstaban: 0, fallidas: [] }, 'x')).toBeNull()
    expect(avisoDelMotor({ error: 'timeout' }, 'al mandar')).toBe('[caja→motor] al mandar: timeout')
    expect(avisoDelMotor({ anotadas: 0, yaEstaban: 0, fallidas: [{ id: 'abcdef123', codigo: 'CUENTA_DESCONOCIDA' }] }, 'repaso')).toContain('1 sin anotar — abcdef12 CUENTA_DESCONOCIDA')
  })
})
