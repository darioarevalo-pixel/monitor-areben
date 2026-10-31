import { beforeEach, describe, expect, it, vi } from 'vitest'
import { entradaInvalida } from '@/lib/erp/entrada.core.js'
import { permisoErpDe } from '@/lib/permisos.core.js'

const cuentaDe = vi.fn()
const porWhatsapp = vi.fn()
const whatsappsDe = vi.fn(async () => [] as unknown[])
const anotar = vi.fn()
const sacar = vi.fn()
vi.mock('../motor/cuenta/cuenta.mjs', () => ({ cuentaDe: (...a: unknown[]) => cuentaDe(...a) }))
vi.mock('../motor/venta/cliente.mjs', () => ({
  clientePorWhatsapp: (...a: unknown[]) => porWhatsapp(...a), whatsappsDe: (...a: unknown[]) => whatsappsDe(...(a as [])),
  anotarWhatsapp: (...a: unknown[]) => anotar(...a), sacarWhatsapp: (...a: unknown[]) => sacar(...a),
  numeroWhatsapp: (t: string) => (String(t).replace(/\D/g, '').length === 13 ? String(t).replace(/\D/g, '') : null),
}))

import { anotarWhatsappPanel, cuentaDelPanel, panelCuentaPrendido, sacarWhatsappPanel } from '../api/_erp-clientes.js'

/** Una base de mentira que contesta por pedazo de SQL y anota cada consulta. */
const base = (rows: Record<string, unknown[]>, sqls: string[] = []) => ({
  query: async (sql: string) => {
    sqls.push(sql)
    const k = Object.keys(rows).find((x) => sql.includes(x))
    return { rows: k ? rows[k] : [] }
  },
})
const conMotor = (db: unknown) => async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(db)

const CUENTA = {
  ok: true, hoy: '2026-10-30', cliente: { id: 'c1', nombre: 'Ejemplo', doc: null }, credito: null,
  estado: { saldo: 900, debe: 900, a_favor: 0, pendientes: [{ ref: 'venta:v1', fecha: '2026-09-22', monto: 1000, pendiente: 900, dias: 38 }] },
  mayor: { anterior: 0, final: 900, renglones: [
    { fecha: '2026-09-22', tipo: 'compra', ref: 'venta:v1', detalle: 'Venta 4812', debe: 1000, haber: 0, saldo: 1000 },
    { fecha: '2026-10-01', tipo: 'pago', ref: 'p1', detalle: 'Mercado Pago', debe: 0, haber: 50, saldo: 950 },
    { fecha: '2026-10-11', tipo: 'pago', ref: 'p2', detalle: 'Galicia', debe: 0, haber: 50, saldo: 900 },
  ] },
}

describe('La cuenta corriente en el panel de WhatsApp (plan «BDI directo al ERP», 30-oct)', () => {
  beforeEach(() => { cuentaDe.mockReset(); porWhatsapp.mockReset(); anotar.mockReset(); sacar.mockReset(); whatsappsDe.mockReset(); whatsappsDe.mockResolvedValue([]) })

  it('APAGADA: contesta sin abrir la base (el panel queda igual a hoy); el interruptor es PANEL_CUENTA_CORRIENTE=1', async () => {
    const abrir = vi.fn()
    expect(await cuentaDelPanel({ gnId: '7' }, { conMotor: abrir, prendido: false })).toEqual({ prendido: false })
    expect(abrir).not.toHaveBeenCalled()
    expect(panelCuentaPrendido({ PANEL_CUENTA_CORRIENTE: '1' })).toBe(true)
    for (const v of [undefined, '0', 'si', 'true']) expect(panelCuentaPrendido({ PANEL_CUENTA_CORRIENTE: v }, 'bruno')).toBe(false)
    // Una lista de usuarios: sólo para ellos (probar sin que lo vea el resto).
    expect(panelCuentaPrendido({ PANEL_CUENTA_CORRIENTE: 'Bruno, otro' }, 'bruno')).toBe(true)
    expect(panelCuentaPrendido({ PANEL_CUENTA_CORRIENTE: 'bruno' }, 'dario')).toBe(false)
    expect(panelCuentaPrendido({ PANEL_CUENTA_CORRIENTE: 'bruno' }, null)).toBe(false)
  })

  it('por id de GN: lee el libro que pide `prueba`, sólo BDI; nombra cada compra y trae los últimos pagos, el más nuevo primero', async () => {
    cuentaDe.mockResolvedValue(CUENTA)
    const db = base({ 'gn_client_id = $1': [{ id: 'c1' }], 'from cuenta_cobro': [{ id: 3, nombre: 'Galicia', medio: 'transferencia' }] })
    const r = await cuentaDelPanel({ gnId: '7', tel: '5493874401234', prueba: true }, { conMotor: conMotor(db), prendido: true }) as { estado: { pendientes: unknown[] }; pagos: unknown[]; cuentas: unknown[] }
    expect(cuentaDe.mock.calls[0][1]).toEqual({ cliente_id: 'c1', marca: 'bdi', prueba: true })
    expect(porWhatsapp).not.toHaveBeenCalled()
    expect(r.estado.pendientes[0]).toMatchObject({ nombre: 'Venta 4812', pendiente: 900 })
    expect(r.pagos).toEqual([{ fecha: '2026-10-11', monto: 50, detalle: 'Galicia' }, { fecha: '2026-10-01', monto: 50, detalle: 'Mercado Pago' }])
    expect(r.cuentas).toHaveLength(1)
    await cuentaDelPanel({ gnId: '7' }, { conMotor: conMotor(db), prendido: true })
    expect(cuentaDe.mock.calls[1][1].prueba).toBe(false)
  })

  it('sin ficha de GN: va por el WhatsApp del chat; con DOS fichas para ese número ⛔ elige', async () => {
    cuentaDe.mockResolvedValue(CUENTA)
    const db = base({ 'distinct empresa_id': [{ empresa_id: 'areben' }] })
    porWhatsapp.mockResolvedValue({ ok: true, clientes: [{ id: 'c9' }] })
    await cuentaDelPanel({ gnId: '7', tel: '5493874401234' }, { conMotor: conMotor(db), prendido: true })
    expect(porWhatsapp.mock.calls[0][1]).toEqual({ empresa_id: 'areben', whatsapp: '5493874401234' })
    expect(cuentaDe.mock.calls[0][1].cliente_id).toBe('c9')
    porWhatsapp.mockResolvedValue({ ok: true, clientes: [{ id: 'c9' }, { id: 'c10' }] })
    expect(await cuentaDelPanel({ tel: '5493874401234' }, { conMotor: conMotor(db), prendido: true })).toMatchObject({ cliente: null, ambiguo: 2 })
    porWhatsapp.mockResolvedValue({ ok: true, clientes: [] })
    expect(await cuentaDelPanel({ tel: '5493874401234' }, { conMotor: conMotor(db), prendido: true })).toMatchObject({ prendido: true, cliente: null })
    expect(cuentaDe).toHaveBeenCalledTimes(1)
    // Sin cliente (Pagos sin chat): sólo dice que está prendido, ⛔ lee la cuenta de nadie.
    expect(await cuentaDelPanel({}, { conMotor: conMotor(db), prendido: true })).toEqual({ prendido: true, prueba: false, cliente: null })
  })

  it('la empresa con varias personas: trae la lista y cuál es la del chat', async () => {
    cuentaDe.mockResolvedValue(CUENTA)
    whatsappsDe.mockResolvedValue([{ id: 'w1', whatsapp: '5493874401234', nombre: 'Rodrigo', usuario: 'bruno' }, { id: 'w2', whatsapp: '5493415550000', nombre: 'Juan', usuario: 'bruno' }])
    const db = base({ 'gn_client_id = $1': [{ id: 'c1' }] })
    const r = await cuentaDelPanel({ gnId: '7', tel: '5493415550000' }, { conMotor: conMotor(db), prendido: true }) as { personas: unknown[]; delChat: unknown }
    expect(r.personas).toEqual([{ id: 'w1', whatsapp: '5493874401234', nombre: 'Rodrigo' }, { id: 'w2', whatsapp: '5493415550000', nombre: 'Juan' }])
    expect(r.delChat).toEqual({ id: 'w2', nombre: 'Juan' })
    whatsappsDe.mockRejectedValue(new Error('relation "cliente_whatsapp" does not exist'))
    expect(await cuentaDelPanel({ gnId: '7', tel: '5493415550000' }, { conMotor: conMotor(db), prendido: true })).toMatchObject({ personas: null, delChat: null })
  })

  it('anotar y sacar un número: apagado ⛔ escribe; el de OTRA ficha da 409; quién lo hizo viaja al motor', async () => {
    const CL = '00000000-0000-4000-8000-0000000000c1'
    const abrir = vi.fn()
    expect(await anotarWhatsappPanel({ body: { clienteId: CL, whatsapp: '5493874401234' }, usuario: 'bruno' }, { conMotor: abrir, prendido: false })).toMatchObject({ status: 409 })
    expect(abrir).not.toHaveBeenCalled()
    const db = base({ 'from cliente where id': [{ empresa_id: 'areben' }], 'from cliente_whatsapp': [{ empresa_id: 'areben' }] })
    anotar.mockResolvedValue({ ok: true, persona: { id: 'w1' }, ya_estaba: false })
    expect(await anotarWhatsappPanel({ body: { clienteId: CL, whatsapp: '5493874401234', nombre: 'Rodrigo' }, usuario: 'bruno' }, { conMotor: conMotor(db), prendido: true })).toEqual({ ok: true, persona: { id: 'w1' }, yaEstaba: false })
    expect(anotar.mock.calls[0][1]).toEqual({ empresa_id: 'areben', cliente_id: CL, whatsapp: '5493874401234', nombre: 'Rodrigo', usuario: 'bruno' })
    anotar.mockResolvedValue({ ok: false, error: { codigo: 'YA_ANOTADO', mensaje: 'Ese número ya es de Otro' } })
    expect(await anotarWhatsappPanel({ body: { clienteId: CL, whatsapp: '5493874401234' }, usuario: 'bruno' }, { conMotor: conMotor(db), prendido: true })).toEqual({ status: 409, error: 'Ese número ya es de Otro' })
    expect(await anotarWhatsappPanel({ body: { clienteId: 'x' }, usuario: 'bruno' }, { conMotor: conMotor(db), prendido: true })).toMatchObject({ status: 400 })
    sacar.mockResolvedValue({ ok: true, sacado: true })
    expect(await sacarWhatsappPanel({ body: { id: CL }, usuario: 'bruno' }, { conMotor: conMotor(db), prendido: true })).toEqual({ ok: true, sacado: true })
    expect(sacar.mock.calls[0][1]).toEqual({ empresa_id: 'areben', id: CL, usuario: 'bruno' })
    expect(await sacarWhatsappPanel({ body: { id: CL }, usuario: null }, { conMotor: conMotor(db), prendido: true })).toMatchObject({ status: 400 })
  })

  it('la puerta: la vista está nombrada con su forma y pide el permiso de la cuenta corriente', () => {
    const get = (query: Record<string, unknown>) => entradaInvalida({ method: 'GET', query: { recurso: 'erp', nc: '1', ...query } })
    expect(get({ vista: 'cuenta-panel', marca: 'bdi', gnId: '1234', tel: '5493874401234', prueba: '1' })).toBeNull()
    expect(get({ vista: 'cuenta-panel', marca: 'bdi', gnId: '', tel: '5493874401234', prueba: '0' })).toBeNull()
    expect(get({ vista: 'cuenta-panel', marca: 'bdi', gnId: "1' or 1=1" })).not.toBeNull()
    expect(permisoErpDe({ method: 'GET', vista: 'cuenta-panel' })).toBe('cuentas')
    const post = (body: unknown) => entradaInvalida({ method: 'POST', query: { recurso: 'erp' }, body })
    expect(post({ accion: 'anotar-whatsapp', marca: 'bdi', clienteId: 'c', whatsapp: '5493874401234', nombre: 'Rodrigo' })).toBeNull()
    expect(post({ accion: 'sacar-whatsapp', marca: 'bdi', id: 'w' })).toBeNull()
    for (const accion of ['anotar-whatsapp', 'sacar-whatsapp']) expect(permisoErpDe({ method: 'POST', accion })).toBe('cuentas')
  })
})
