import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cuentasDelDia, esDiaValido, limpiarPagos, origenDe, rangoDelDia, totalDe } from '@/lib/pagos-recibidos/core.core.js'

/**
 * Pagos recibidos. Los casos salen de la cuenta real de Zattia (2-oct-2026): transferencia desde
 * MP, desde otro banco, con tarjeta, y una transferencia que SALE (sin `collector_id`).
 */

const CUENTA = 136578181
const entra = (id: number, monto: number, extra: Record<string, unknown> = {}) => ({
  id,
  status: 'approved',
  collector_id: CUENTA,
  transaction_amount: monto,
  operation_type: 'money_transfer',
  payment_method_id: 'account_money',
  payment_type_id: 'account_money',
  date_created: '2026-10-02T15:00:00.000-04:00',
  date_approved: '2026-10-02T15:00:01.000-04:00',
  payer: { id: 999, email: 'alguien@mail.com', identification: { number: '27123456789' } },
  ...extra,
})

describe('lib/pagos-recibidos/core', () => {
  it('cada día se busca en la cuenta que estaba en uso', () => {
    // A desde el 2-oct (la primera cargada), B desde el 10-oct a las 15 hs, A otra vez desde el 20-oct.
    const usos = [
      { cuenta_id: 2, desde: '2026-10-10T15:00:00.000-03:00' },
      { cuenta_id: 1, desde: '2026-10-02T17:00:00.000-03:00' },
      { cuenta_id: 1, desde: '2026-10-20T09:00:00.000-03:00' },
    ]
    expect(cuentasDelDia(usos, '2026-09-25')).toEqual([1]) // 🔑 antes de cargarla: la primera
    expect(cuentasDelDia(usos, '2026-10-05')).toEqual([1])
    expect(cuentasDelDia(usos, '2026-10-10')).toEqual([1, 2]) // el día del cambio, las dos
    expect(cuentasDelDia(usos, '2026-10-15')).toEqual([2])
    expect(cuentasDelDia(usos, '2026-10-21')).toEqual([1])
    expect(cuentasDelDia([], '2026-10-21')).toEqual([])
  })

  it('🔴 lo que SALE de la cuenta no es un cobro', () => {
    const sale = { ...entra(1, 437016), collector_id: undefined, collector: { id: 673458631 } }
    const { pagos } = limpiarPagos([sale, entra(2, 24000)], CUENTA)
    expect(pagos.map((p) => p.id)).toEqual(['2'])
  })

  it('🔴 pendiente o rechazado no cuenta; devuelto va aparte', () => {
    const { pagos, devueltos } = limpiarPagos(
      [entra(1, 100, { status: 'pending' }), entra(2, 200, { status: 'rejected' }), entra(3, 300, { status: 'refunded' }), entra(4, 400)],
      CUENTA,
    )
    expect(pagos.map((p) => p.id)).toEqual(['4'])
    expect(devueltos.map((p) => p.id)).toEqual(['3'])
    expect(totalDe(pagos)).toBe(400)
  })

  it('⛔ no viaja ningún dato de quien pagó', () => {
    const { pagos } = limpiarPagos([entra(1, 100)], CUENTA)
    expect(Object.keys(pagos[0]).sort()).toEqual(['cuando', 'id', 'monto', 'origen'])
  })

  it('de dónde vino', () => {
    expect(origenDe(entra(1, 1))).toBe('mp')
    expect(origenDe(entra(1, 1, { operation_type: 'account_fund', payment_method_id: 'cvu', payment_type_id: 'bank_transfer' }))).toBe('banco')
    expect(origenDe(entra(1, 1, { payment_method_id: 'visa', payment_type_id: 'credit_card' }))).toBe('tarjeta')
  })

  it('el más nuevo primero, aunque MP mande otra zona horaria', () => {
    const { pagos } = limpiarPagos(
      [entra(1, 1, { date_approved: '2026-10-02T15:00:00.000-04:00' }), entra(2, 1, { date_approved: '2026-10-02T16:30:00.000-03:00' })],
      CUENTA,
    )
    // 15:00 en UTC-4 son las 16:00 acá: el de las 16:30 es el más nuevo.
    expect(pagos.map((p) => p.id)).toEqual(['2', '1'])
  })

  it('el día es argentino', () => {
    expect(rangoDelDia('2026-10-02')).toEqual({
      begin_date: '2026-10-02T00:00:00.000-03:00',
      end_date: '2026-10-02T23:59:59.999-03:00',
    })
    expect(esDiaValido('2026-10-02')).toBe(true)
    expect(esDiaValido('02/10/2026')).toBe(false)
  })
})

describe('api/_pagos-recibidos.js', () => {
  const raiz = join(__dirname, '..')
  const handler = readFileSync(join(raiz, 'api/_pagos-recibidos.js'), 'utf8')
  const datos = readFileSync(join(raiz, 'api/datos.js'), 'utf8')

  it('entra por el router con ?recurso=pagos-recibidos', () => {
    expect(datos).toContain("import pagosRecibidos from './_pagos-recibidos.js'")
    expect(datos).toContain("'pagos-recibidos': pagosRecibidos,")
  })

  it('🔴 el gate es puedeVerAlguna (la store la elige el request)', () => {
    expect(handler).toContain("puedeVerAlguna(perfil, store, ['pagos-recibidos'])")
  })

  it('🔴 el total y los otros días sólo para admin', () => {
    expect(handler).toMatch(/if \(dia !== hoy && !admin\) return res\.status\(403\)/)
    expect(handler).toMatch(/if \(admin\) Object\.assign\(r, \{ total:/)
  })

  it('🔴 cambiar la cuenta es sólo admin, antes de cualquier acción', () => {
    const gate = handler.indexOf("if (!admin) return res.status(403).json({ error: 'Sólo un admin puede cambiar")
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(handler.indexOf("b.action === 'verificar'"))
  })

  it('🔴 la llave ⛔ sale en ninguna respuesta', () => {
    expect(handler).not.toMatch(/select\(['"]\*/)
    // La única consulta que pide `token` es la que lo usa para hablar con MP.
    expect(handler.match(/select\('[^']*token/g)).toEqual(["select('cuenta_id, token"])
  })
})
