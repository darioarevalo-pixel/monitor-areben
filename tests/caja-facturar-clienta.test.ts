/**
 * Facturar desde la Caja (Bruno, 22-nov: «crear cliente, asociar la factura al cliente y emitirle la factura, todo desde el
 * POS»): con documento y nombre, la clienta queda GUARDADA y la venta A SU NOMBRE **antes** de pedir el CAE. Si la ficha ⛔
 * se guarda, la factura ⛔ sale (todavía no hay nada irreversible). Sin nombre, como antes: ⛔ se toca la ficha.
 * Acá ARCA no está (`arca: null`): todo lo que pasó antes del 409 «sin ARCA» pasó ANTES del CAE.
 */
import { describe, it, expect } from 'vitest'
import { facturarVentaPropia } from '../api/_erp.js'
import { leerFacturar } from '../lib/erp/factura.core.js'

const ID = '0b5e7a52-6d1c-4b8e-9a51-2f6c7d8e9f01'
const CLIENTA = '7c1d2e3f-4a5b-4c6d-8e7f-901234567890'
const venta = { id: ID, empresa_id: 'areben', cliente_id: null, estado: 'confirmada', tipo: 'venta', origen: 'caja', total: 36900, prueba: false, marca: 'zattia', facturas: [], lineas: [], ocurrida_en: '2026-11-22T20:00:00Z', detalle: {} }

/** Una base de mentira que contesta por la forma de la consulta y anota todo lo que se le pidió, en orden. */
function base({ empresa = true } = {}) {
  const sql: string[] = []
  const db = {
    query: async (s: string, p: unknown[] = []) => {
      sql.push(s.replace(/\s+/g, ' ').trim() + (p.length ? ` ⟨${p.join('|')}⟩` : ''))
      if (/from venta_ficha/.test(s)) return { rows: [venta] }
      if (/from empresa/.test(s)) return { rows: empresa ? [{ id: 'areben' }] : [] }
      if (/insert into cliente/.test(s)) return { rows: [{ id: CLIENTA, empresa_id: 'areben', doc: p[1], nombre: p[2], razon_social: p[3], domicilio: p[5], creado: true }] }
      if (/from venta where id = \$1 for update/.test(s)) return { rows: [{ ...venta, cliente_id: null, numero: 4127 }] }
      if (/select 1 from cliente where id/.test(s)) return { rows: [{ '?column?': 1 }] }
      if (/to_regclass\('cuenta_movimiento'\)/.test(s)) return { rows: [{ cc: true }] }
      if (/saldo_favor_movimiento/.test(s)) return { rows: [{ hay: false }] }
      if (/insert into venta_edicion/.test(s)) return { rows: [{ campo: 'cliente' }] }
      if (/select id, numero, cliente_id::text/.test(s)) return { rows: [{ id: ID, numero: 4127, cliente_id: CLIENTA }] }
      return { rows: [] }
    },
  }
  return { db, sql }
}
const deps = (db: unknown) => ({ db, b: {}, repo: {}, buscarFactura: async () => null, tienePartes: async () => false, arca: null })
const pedir = (body: Record<string, unknown>, db: unknown) => facturarVentaPropia({ marca: 'zattia', body: { ventaId: ID, ...body }, usuario: 'Lorena' }, deps(db))

describe('leerFacturar · B con nombre', () => {
  it('documento + nombre ⇒ lleva la clienta; sin nombre, como antes; nombre sin documento ⇒ lo pide', () => {
    expect(leerFacturar({ ventaId: ID, doc: '30123456', nombre: '  Daniela   Orellana ' }).cliente).toEqual({ nombre: 'Daniela Orellana' })
    expect(leerFacturar({ ventaId: ID, doc: '30123456' }).cliente).toBeUndefined()
    expect(leerFacturar({ ventaId: ID, nombre: 'Daniela' }).error).toMatch(/DNI o CUIT/)
  })
})

describe('facturarVentaPropia · la clienta ANTES del CAE', () => {
  it('B con DNI y nombre: guarda la ficha y pone la venta a su nombre, y recién después va a ARCA', async () => {
    const { db, sql } = base()
    const r = await pedir({ clase: 'B', doc: '30123456', nombre: 'Daniela Orellana' }, db)
    // Sin ARCA en el test: llegó hasta el pedido del CAE.
    expect(r).toMatchObject({ status: 409 })
    expect(r.error).not.toMatch(/clienta/)
    const ficha = sql.findIndex((s) => s.startsWith('insert into cliente'))
    const aSuNombre = sql.findIndex((s) => s.startsWith('update venta set cliente_id'))
    expect(ficha).toBeGreaterThan(-1)
    expect(sql[ficha]).toContain('30123456|Daniela Orellana')
    expect(aSuNombre).toBeGreaterThan(ficha)
    expect(sql[aSuNombre]).toContain(CLIENTA)
  })

  it('si la ficha ⛔ se guarda, la factura ⛔ sale y lo dice', async () => {
    const { db, sql } = base({ empresa: false })
    const r = await pedir({ clase: 'B', doc: '30123456', nombre: 'Daniela Orellana' }, db)
    expect(r).toMatchObject({ status: 409, error: expect.stringMatching(/No se pudo guardar la clienta.*La factura no salió/) })
    expect(sql.some((s) => s.startsWith('update venta set cliente_id'))).toBe(false)
  })

  it('B sin nombre (o sin documento): ⛔ se toca la ficha ni la venta', async () => {
    for (const body of [{ clase: 'B', doc: '30123456' }, { clase: 'B' }]) {
      const { db, sql } = base()
      await pedir(body, db)
      expect(sql.some((s) => s.startsWith('insert into cliente') || s.startsWith('update venta'))).toBe(false)
    }
  })

  it('A: la ficha con razón social, condición y domicilio, también antes del CAE', async () => {
    const { db, sql } = base()
    await pedir({ clase: 'A', doc: '30718508181', condicion: 'ri', razonSocial: 'AREBEN SRL', domicilio: 'Bv. Oroño 1250' }, db)
    const ficha = sql.find((s) => s.startsWith('insert into cliente'))
    expect(ficha).toContain('30718508181|AREBEN SRL|AREBEN SRL|1|Bv. Oroño 1250')
    expect(sql.some((s) => s.startsWith('update venta set cliente_id'))).toBe(true)
  })
})
