import { beforeEach, describe, expect, it, vi } from 'vitest'

const corrientes = vi.fn()
const cuentaDe = vi.fn()
vi.mock('../motor/cuenta/cuenta.mjs', () => ({ cuentasCorrientes: (...a: unknown[]) => corrientes(...a), cuentaDe: (...a: unknown[]) => cuentaDe(...a) }))

import { cuentasDeLaMarca, fichaDeCliente } from '../api/_erp-clientes.js'

/** Una base de mentira que contesta por pedazo de SQL y anota los parámetros. */
const base = (rows: Record<string, unknown[]>, params: unknown[][] = []) => ({
  query: async (sql: string, p: unknown[] = []) => {
    params.push(p)
    const k = Object.keys(rows).find((x) => sql.includes(x))
    return { rows: k ? rows[k] : [] }
  },
})
const conMotor = (db: unknown) => async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(db)

describe('Clientes y cuenta corriente: cada línea ve lo suyo (Bruno, 30-oct)', () => {
  beforeEach(() => { corrientes.mockReset(); cuentaDe.mockReset() })

  it('la cuenta corriente de Stunned pide al motor SÓLO Stunned, y «el otro libro» también', async () => {
    corrientes.mockResolvedValue({ ok: true, hoy: '2026-10-30', cuentas: [{ cliente_id: 'c1', saldo: 100 }] })
    const params: unknown[][] = []
    const db = base({ 'distinct empresa_id': [{ empresa_id: 'areben' }], 'count(distinct cliente_id)': [{ n: 0 }], 'count(*)::int as n from cliente': [{ n: 1 }] }, params)
    const r = await cuentasDeLaMarca({ marca: 'zattia', linea: 'stunned' }, { conMotor: conMotor(db) }) as { cuentas: { linea: string }[] }
    expect(corrientes.mock.calls.map((c) => c[1].marca)).toEqual(['stunned'])
    expect(r.cuentas.map((c) => c.linea)).toEqual(['stunned'])
    expect(params.some((p) => JSON.stringify(p) === JSON.stringify([true, ['stunned']]))).toBe(true)
    expect(await cuentasDeLaMarca({ marca: 'zattia' }, { conMotor: conMotor(db) })).toMatchObject({ status: 400 })
  })

  it('la ficha de un cliente mirando Stunned trae la cuenta de STUNNED (antes, siempre la de Zattia)', async () => {
    cuentaDe.mockResolvedValue({ ok: true, cliente: { id: 'c1' }, credito: null, estado: { saldo: 0 }, mayor: [] })
    const db = base({ 'from cliente': [{ id: 'c1' }], 'from ventas': [] })
    await fichaDeCliente({ marca: 'zattia', linea: 'stunned', clave: 'n:ana' }, { conMotor: conMotor(db) })
    expect(cuentaDe.mock.calls[0][1]).toMatchObject({ cliente_id: 'c1', marca: 'stunned' })
    expect(await fichaDeCliente({ marca: 'zattia', clave: 'n:ana' }, { conMotor: conMotor(db) })).toMatchObject({ status: 400 })
  })
})
