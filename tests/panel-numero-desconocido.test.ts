import { beforeEach, describe, expect, it, vi } from 'vitest'
import { entradaInvalida } from '@/lib/erp/entrada.core.js'
import { permisoErpDe } from '@/lib/permisos.core.js'

/**
 * Pedido mayorista de un número que el ERP ⛔ conoce (pedido de Darío §1, plan «BDI directo al ERP» paso 3): «¿Es de un
 * cliente que ya tenés?» busca fichas CON id; «Es nuevo» crea la ficha (nombre + CUIT/DNI, Bruno 31-oct) y le anota el
 * número, TODO O NADA. 🔴 Un documento que ya tiene ficha ⛔ la renombra, y crear va detrás de la llave de escribir.
 */
const mc = vi.hoisted(() => ({
  buscarClientes: vi.fn(), guardarCliente: vi.fn(), anotarWhatsapp: vi.fn(),
  docValido: (d: string) => { const x = String(d ?? '').replace(/\D/g, ''); return x.length === 8 || x.length === 11 ? x : '' },
  numeroWhatsapp: (w: string) => (String(w ?? '').replace(/\D/g, '').length >= 10 ? String(w).replace(/\D/g, '') : null),
}))
vi.mock('../motor/venta/cliente.mjs', () => mc)

import { clienteNuevoPanel, clientesDelPanel } from '../api/_erp-clientes.js'

const base = (rows: Record<string, unknown[]> = {}) => {
  const sqls: string[] = []
  return {
    sqls,
    query: async (sql: string) => {
      sqls.push(sql.trim().split(/\s+/)[0].toLowerCase() === 'select' ? sql.trim() : sql.trim().toLowerCase())
      const k = Object.keys(rows).find((x) => sql.includes(x))
      return { rows: k ? rows[k] : [] }
    },
  }
}
const conMotor = (db: unknown) => async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(db)
const MARCA = { "from marca where id = 'bdi'": [{ empresa_id: 'areben' }] }
const body = { nombre: 'Celulares Rosario', doc: '20-12345678-6', whatsapp: '5493411234567', persona: 'Rodrigo' }

describe('Pedido de un número desconocido en el panel', () => {
  beforeEach(() => { mc.buscarClientes.mockReset(); mc.guardarCliente.mockReset(); mc.anotarWhatsapp.mockReset() })

  it('la vista y la acción pasan la entrada y piden el permiso de la cuenta corriente', () => {
    expect(entradaInvalida({ method: 'GET', query: { recurso: 'erp', vista: 'clientes-panel', marca: 'bdi', q: 'celu' } } as never)).toBeNull()
    expect(permisoErpDe({ method: 'GET', vista: 'clientes-panel' })).toBe('cuentas')
    expect(permisoErpDe({ method: 'POST', accion: 'cliente-nuevo-panel' })).toBe('cuentas')
  })

  it('buscar: escondido, menos de 2 letras ⛔ abre la base, y devuelve el id', async () => {
    const abrir = vi.fn()
    expect(await clientesDelPanel({ q: 'celu' }, { conMotor: abrir, prendido: false })).toEqual({ prendido: false })
    expect(await clientesDelPanel({ q: 'c' }, { conMotor: abrir, prendido: true })).toEqual({ prendido: true, clientes: [] })
    expect(abrir).not.toHaveBeenCalled()
    mc.buscarClientes.mockResolvedValue({ ok: true, clientes: [{ id: 'u1', nombre: 'Celulares Rosario', doc: '20123456786', whatsapp: 'x' }] })
    expect(await clientesDelPanel({ q: 'celu' }, { conMotor: conMotor(base(MARCA)), prendido: true })).toEqual({ prendido: true, clientes: [{ id: 'u1', nombre: 'Celulares Rosario', doc: '20123456786' }] })
    expect(mc.buscarClientes.mock.calls[0][1]).toEqual({ empresa_id: 'areben', texto: 'celu', limite: 8 })
  })

  it('crear: con la llave de escribir apagada, 409 sin abrir la base', async () => {
    const abrir = vi.fn()
    expect(await clienteNuevoPanel({ body, usuario: 'bruno' }, { conMotor: abrir, prendido: true, escribir: false })).toMatchObject({ status: 409 })
    expect(await clienteNuevoPanel({ body, usuario: 'bruno' }, { conMotor: abrir, prendido: false, escribir: true })).toMatchObject({ status: 409 })
    expect(abrir).not.toHaveBeenCalled()
  })

  it('crear: documento inválido o sin nombre ⛔; un documento que YA tiene ficha ⛔ la renombra (409 con esa ficha)', async () => {
    const ok = { conMotor: conMotor(base(MARCA)), prendido: true, escribir: true }
    expect(await clienteNuevoPanel({ body: { ...body, doc: '123' }, usuario: 'bruno' }, ok)).toMatchObject({ status: 400 })
    expect(await clienteNuevoPanel({ body: { ...body, nombre: ' ' }, usuario: 'bruno' }, ok)).toMatchObject({ status: 400 })
    const db = base({ ...MARCA, 'from cliente where empresa_id': [{ id: 'u9', nombre: 'Otro nombre' }] })
    const r = await clienteNuevoPanel({ body, usuario: 'bruno' }, { conMotor: conMotor(db), prendido: true, escribir: true })
    expect(r).toMatchObject({ status: 409, existe: { id: 'u9', nombre: 'Otro nombre' } })
    expect(mc.guardarCliente).not.toHaveBeenCalled()
  })

  it('crear: la ficha y el número juntos; si el número ⛔ se puede anotar, se deshace la ficha', async () => {
    mc.guardarCliente.mockResolvedValue({ ok: true, cliente: { id: 'n1', nombre: 'Celulares Rosario' }, creado: true })
    mc.anotarWhatsapp.mockResolvedValue({ ok: true, persona: { id: 'w1' }, ya_estaba: false })
    let db = base(MARCA)
    let r = await clienteNuevoPanel({ body, usuario: 'bruno' }, { conMotor: conMotor(db), prendido: true, escribir: true })
    expect(r).toMatchObject({ ok: true, cliente: { id: 'n1', nombre: 'Celulares Rosario', doc: '20123456786' } })
    expect(db.sqls.filter((x) => ['begin', 'commit', 'rollback'].includes(x))).toEqual(['begin', 'commit'])
    expect(mc.guardarCliente.mock.calls[0][1]).toEqual({ empresa_id: 'areben', doc: '20123456786', nombre: 'Celulares Rosario' })
    expect(mc.anotarWhatsapp.mock.calls[0][1]).toEqual({ empresa_id: 'areben', cliente_id: 'n1', whatsapp: '5493411234567', nombre: 'Rodrigo', usuario: 'bruno' })
    mc.anotarWhatsapp.mockResolvedValue({ ok: false, error: { codigo: 'YA_ANOTADO', mensaje: 'Ese número ya es de Otra' } })
    db = base(MARCA)
    r = await clienteNuevoPanel({ body, usuario: 'bruno' }, { conMotor: conMotor(db), prendido: true, escribir: true })
    expect(r).toEqual({ status: 409, error: 'Ese número ya es de Otra' })
    expect(db.sqls.filter((x) => ['begin', 'commit', 'rollback'].includes(x))).toEqual(['begin', 'rollback'])
  })
})
