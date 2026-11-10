import { describe, expect, it, vi } from 'vitest'
import { accionesDeCheque, chequeParaMandar, cuentasParaCobrar, diasHasta, faltaDelCheque, filtrarCheques } from '@/lib/erp/cheque.core.js'
import { permisoErpDe } from '@/lib/permisos'
import { entradaInvalida } from '@/lib/erp/entrada.core.js'
import { cobrarCuentaErp, cobrarVentaErp } from '../api/_erp-ventas.js'
import { accionDeCheque, chequeDelCobro } from '../api/_erp-cheques.js'
import { cuentasSueltas } from '@/lib/erp/formas-pago.core.js'

// Los cheques recibidos (motor sql/079; Bruno 10-nov): sólo admin, baja la deuda al recibirlo, la cuenta se elige al depositar.
const CH = '00000000-0000-0000-0000-0000000000c9'
const C = '00000000-0000-0000-0000-0000000000c1'
const R = '00000000-0000-0000-0000-00000000aaaa'
const datos = { tipo: 'fisico', numero: '0001234', banco: 'Nación', librador: 'Mayorista SRL', librador_cuit: '', vence_el: '2026-11-20' }

describe('El núcleo', () => {
  it('la cuenta «Cheque» sólo la ve un admin', () => {
    const cuentas = [{ id: 1, medio: 'transferencia' }, { id: 2, medio: 'cheque' }]
    expect(cuentasParaCobrar(cuentas, true).map((c) => c.id)).toEqual([1, 2])
    expect(cuentasParaCobrar(cuentas, false).map((c) => c.id)).toEqual([1])
  })
  it('qué le falta al cheque, en el orden de la ventana', () => {
    expect(faltaDelCheque({ ...datos, numero: ' ' })).toMatch(/número/)
    expect(faltaDelCheque({ ...datos, banco: '' })).toMatch(/banco/)
    expect(faltaDelCheque({ ...datos, librador: '' })).toMatch(/firma/)
    expect(faltaDelCheque({ ...datos, vence_el: '' })).toMatch(/fecha de pago/)
    expect(faltaDelCheque({ ...datos, librador_cuit: '20-123' })).toMatch(/CUIT/)
    expect(faltaDelCheque(datos)).toBeNull()
  })
  it('lo que viaja: sin vacíos', () => {
    expect(chequeParaMandar(datos)).toEqual({ tipo: 'fisico', numero: '0001234', banco: 'Nación', librador: 'Mayorista SRL', vence_el: '2026-11-20' })
    expect(chequeParaMandar({ ...datos, tipo: 'echeq', librador_cuit: '20-12345678-6' })).toMatchObject({ tipo: 'echeq', librador_cuit: '20123456786' })
  })
  it('depositar desde su fecha de pago; acreditar sólo depositado; rechazar desde cartera o depositado', () => {
    expect(accionesDeCheque({ estado: 'en_cartera', vence_el: '2026-11-20' }, '2026-11-19')).toEqual({ depositar: false, depositarDesde: '2026-11-20', acreditar: false, rechazar: true })
    expect(accionesDeCheque({ estado: 'en_cartera', vence_el: '2026-11-20' }, '2026-11-20')).toMatchObject({ depositar: true, depositarDesde: null })
    expect(accionesDeCheque({ estado: 'depositado', vence_el: '2026-11-20' }, '2026-11-25')).toEqual({ depositar: false, depositarDesde: null, acreditar: true, rechazar: true })
    for (const estado of ['acreditado', 'rechazado', 'anulado']) {
      expect(accionesDeCheque({ estado, vence_el: '2026-11-20' }, '2026-11-25')).toEqual({ depositar: false, depositarDesde: null, acreditar: false, rechazar: false })
    }
  })
  it('días hasta la fecha de pago y la lista ordenada por fecha', () => {
    expect(diasHasta('2026-11-20', '2026-11-18')).toBe(2)
    expect(diasHasta('2026-11-01', '2026-11-03')).toBe(-2)
    const l = [{ id: 'b', estado: 'en_cartera', vence_el: '2026-12-01', numero: '2', banco: 'Galicia', librador: 'X', cliente: 'Ana' }, { id: 'a', estado: 'depositado', vence_el: '2026-11-01', numero: '1', banco: 'Nación', librador: 'Y', cliente: 'Bea' }]
    expect(filtrarCheques(l).map((c) => c.id)).toEqual(['a', 'b'])
    expect(filtrarCheques(l, { estado: 'en_cartera' }).map((c) => c.id)).toEqual(['b'])
    expect(filtrarCheques(l, { q: 'nacion' }).map((c) => c.id)).toEqual(['a'])
  })
  it('«Cargar venta» ⛔ ofrece la cuenta «Cheque» (entra por Cobrar)', () => {
    expect(cuentasSueltas({ formas: [], cuentas: [{ id: 'x', medio: 'cheque' }, { id: 'y', medio: 'otro' }] }).map((c: { id: string }) => c.id)).toEqual(['y'])
  })
})

describe('Permisos y entrada', () => {
  it('la cartera y las tres acciones son sólo de admin', () => {
    expect(permisoErpDe({ method: 'GET', vista: 'cheques' })).toBe('configurar')
    for (const accion of ['cheque-depositar', 'cheque-acreditar', 'cheque-rechazar']) expect(permisoErpDe({ method: 'POST', accion })).toBe('configurar')
  })
  it('el validador las conoce', () => {
    expect(entradaInvalida({ method: 'GET', query: { vista: 'cheques', marca: 'bdi', linea: 'bdi', prueba: '1' } })).toBeNull()
    expect(entradaInvalida({ method: 'POST', body: { accion: 'cheque-rechazar', marca: 'bdi', chequeId: CH, motivo: 'sin fondos' } })).toBeNull()
  })
})

describe('El servidor', () => {
  const motor = () => ({ registrarPagoACuenta: vi.fn(async (_db: unknown, _e: Record<string, unknown>) => ({ ok: true, pago: {}, cuenta: 0 })) })
  const base = { clienteId: C, linea: 'bdi', monto: 100, cuenta: '7', ref: 'abcdef12', prueba: false }
  it('«Cobrar» le pasa el cheque al motor (las dos puertas)', async () => {
    let m = motor()
    await cobrarCuentaErp({ marca: 'bdi', body: { ...base, cheque: datos }, usuario: 'x' }, { cuenta: m, db: {} })
    expect(m.registrarPagoACuenta.mock.calls[0][1]).toMatchObject({ cheque: { numero: '0001234', vence_el: '2026-11-20' } })
    m = motor()
    await cobrarVentaErp({ marca: 'bdi', body: { ...base, ventaId: CH, saldo: 100, cheque: datos }, usuario: 'x' }, { cuenta: m, db: {} })
    expect(m.registrarPagoACuenta.mock.calls[0][1]).toMatchObject({ cheque: { banco: 'Nación' } })
  })
  it('sin cheque ⛔ manda el campo; uno mal formado ⛔ llega al motor', async () => {
    const m = motor()
    await cobrarCuentaErp({ marca: 'bdi', body: base, usuario: 'x' }, { cuenta: m, db: {} })
    expect(m.registrarPagoACuenta.mock.calls[0][1]).not.toHaveProperty('cheque')
    expect(chequeDelCobro({ cheque: 'x' })).toHaveProperty('error')
    expect((await cobrarCuentaErp({ marca: 'bdi', body: { ...base, cheque: [1] }, usuario: 'x' }, { cuenta: motor(), db: {} })).status).toBe(400)
  })
  it('«Cheque» sin sus datos: el motor lo frena y la respuesta es 400 (⛔ 409); lo demás del motor sigue en 409', async () => {
    const rechaza = (codigo: string) => ({ registrarPagoACuenta: vi.fn(async () => ({ ok: false, error: { codigo, mensaje: 'Faltan los datos del cheque', campo: 'cheque' } })) })
    expect(await cobrarCuentaErp({ marca: 'bdi', body: base, usuario: 'x' }, { cuenta: rechaza('ENTRADA_INVALIDA'), db: {} })).toEqual({ status: 400, error: 'Faltan los datos del cheque (ENTRADA_INVALIDA)' })
    expect((await cobrarVentaErp({ marca: 'bdi', body: { ...base, ventaId: CH, saldo: 100 }, usuario: 'x' }, { cuenta: rechaza('ENTRADA_INVALIDA'), db: {} })).status).toBe(400)
    expect((await cobrarCuentaErp({ marca: 'bdi', body: base, usuario: 'x' }, { cuenta: rechaza('CHEQUE_REPETIDO'), db: {} })).status).toBe(409)
  })

  const conMotor = (filas: Record<string, unknown[]>) => async (_m: string, _t: string, fn: (pg: unknown) => unknown) =>
    fn({ query: async (sql: string) => ({ rows: sql.includes('to_regclass') ? [{ hay: filas.hay ?? true }] : sql.includes('from cheque') ? filas.cheque ?? [] : [] }) })
  const m = () => ({
    depositarCheque: vi.fn(async (_pg: unknown, _e: Record<string, unknown>) => ({ ok: true, cheque: { id: CH, estado: 'depositado' } })),
    acreditarCheque: vi.fn(async (_pg: unknown, _e: Record<string, unknown>) => ({ ok: true, cheque: { id: CH, estado: 'acreditado' } })),
    rechazarCheque: vi.fn(async (_pg: unknown, _e: Record<string, unknown>) => ({ ok: true, cheque: { id: CH, estado: 'rechazado' }, cuenta: 1000 })),
  })
  const delCheque = { cheque: [{ empresa_id: 'areben' }] }
  it('depositar exige la cuenta y la manda; la fecha va al mediodía de Argentina', async () => {
    const x = m()
    expect((await accionDeCheque({ accion: 'cheque-depositar', marca: 'bdi', body: { chequeId: CH }, usuario: 'bruno' }, { conMotor: conMotor(delCheque), cheque: x })).status).toBe(400)
    const r = await accionDeCheque({ accion: 'cheque-depositar', marca: 'bdi', body: { chequeId: CH, cuentaReal: R, fecha: '2026-11-20' }, usuario: 'bruno' }, { conMotor: conMotor(delCheque), cheque: x })
    expect(r).toMatchObject({ ok: true })
    expect(x.depositarCheque.mock.calls[0][1]).toEqual({ empresa_id: 'areben', cheque_id: CH, cuenta_real_id: R, usuario: 'bruno', ocurrida_en: '2026-11-20T15:00:00.000Z' })
  })
  it('rechazar exige el motivo y devuelve la cuenta', async () => {
    const x = m()
    expect((await accionDeCheque({ accion: 'cheque-rechazar', marca: 'bdi', body: { chequeId: CH, motivo: ' ' }, usuario: 'b' }, { conMotor: conMotor(delCheque), cheque: x })).status).toBe(400)
    const r = await accionDeCheque({ accion: 'cheque-rechazar', marca: 'bdi', body: { chequeId: CH, motivo: 'sin fondos' }, usuario: 'b' }, { conMotor: conMotor(delCheque), cheque: x })
    expect(r).toMatchObject({ ok: true, cuenta: 1000 })
    expect(x.rechazarCheque.mock.calls[0][1]).toMatchObject({ motivo: 'sin fondos' })
  })
  it('un cheque de otra línea ⇒ 404; una base sin la 079 ⇒ 409 (⛔ 500)', async () => {
    expect((await accionDeCheque({ accion: 'cheque-acreditar', marca: 'bdi', body: { chequeId: CH }, usuario: 'b' }, { conMotor: conMotor({}), cheque: m() })).status).toBe(404)
    expect((await accionDeCheque({ accion: 'cheque-acreditar', marca: 'bdi', body: { chequeId: CH }, usuario: 'b' }, { conMotor: conMotor({ hay: false } as never), cheque: m() })).status).toBe(409)
    expect((await accionDeCheque({ accion: 'cheque-acreditar', marca: 'zattia', body: { chequeId: CH, linea: 'bdi' }, usuario: 'b' }, { conMotor: conMotor(delCheque), cheque: m() })).status).toBe(400)
  })
})
