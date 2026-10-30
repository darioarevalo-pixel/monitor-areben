// Las clientas del ⌘K, de UNA línea (Bruno, 30-oct: «los clientes van en cada marca, sí o sí»); la factura A ⛔ se corta.
import { describe, it, expect } from 'vitest'
import { clientasDeLaCaja } from '../api/_erp.js'

const ANA = { id: '00000000-0000-0000-0000-00000000000a', doc: '27111', nombre: 'Ana', razon_social: null, domicilio: null, condicion_iva: null }
const BETI = { id: '00000000-0000-0000-0000-00000000000b', doc: '27222', nombre: 'Beti', razon_social: null, domicilio: null, condicion_iva: null }

function base(deLaLinea: string[]) {
  const pedidas: { sql: string; params?: unknown[] }[] = []
  const db = {
    query: async (sql: string, params?: unknown[]) => {
      pedidas.push({ sql, params })
      if (sql.includes('from marca')) return { rows: [{ empresa_id: 'areben' }] }
      if (sql.includes('from cliente where id = any')) return { rows: deLaLinea.map((id) => ({ id })) }
      throw new Error(`sin respuesta para: ${sql.slice(0, 60)}`)
    },
  }
  const motor = { buscarClientes: async () => ({ ok: true, clientes: [ANA, BETI] }) }
  return { deps: { db, motor }, pedidas }
}

describe('clientasDeLaCaja', () => {
  it('con línea: sólo las fichas con venta o cuenta de ella', async () => {
    const { deps, pedidas } = base([ANA.id])
    const r = await clientasDeLaCaja({ marca: 'zattia', q: 'a', linea: 'stunned' }, deps) as { clientas: { nombre: string }[] }
    expect(r.clientas.map((c) => c.nombre)).toEqual(['Ana'])
    const corte = pedidas.find((p) => p.sql.includes('from cliente where id = any'))!
    expect(corte.sql).toContain('v.marca = $2')
    expect(corte.sql).toContain('m.marca = $2')
    expect(corte.params).toEqual([[ANA.id, BETI.id], 'stunned'])
  })
  it('sin línea (factura A, Cargar venta: ELIGEN una ficha): las de la empresa, ⛔ se corta', async () => {
    const { deps, pedidas } = base([])
    const r = await clientasDeLaCaja({ marca: 'zattia', q: 'a' }, deps) as { clientas: unknown[] }
    expect(r.clientas).toHaveLength(2)
    expect(pedidas.some((p) => p.sql.includes('from cliente where id = any'))).toBe(false)
  })
  it('una línea que ⛔ existe ⇒ 400', async () => {
    const { deps } = base([])
    expect(await clientasDeLaCaja({ marca: 'zattia', q: 'a', linea: 'bdi' }, deps)).toMatchObject({ status: 400 })
  })
})
