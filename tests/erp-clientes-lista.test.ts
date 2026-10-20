import { describe, expect, it } from 'vitest'
import { aTupla, armarFilasClientes, contarVistas, deTupla, filtrar, ordenar, resumen } from '@/lib/erp/clientes-lista.core.js'
import { fichaDeCliente, listaDeClientes } from '../api/_erp-clientes.js'

/**
 * **ERP › Clientes: el núcleo y el servidor.** El oráculo son los números que la pantalla pone arriba y en las vistas, y
 * que un cliente SIN cuenta en el motor ⛔ diga «al día» (saldo null) — hoy el motor ⛔ tiene clientes (medido 19-oct).
 */
const GN = [
  { clave: '10', nombre: 'Barbara Spagnoli', compras: 26, total: 500000, primera: '2025-02-16', ultima: '2026-10-03', mayorista: 12, canales: ['Mayorista', 'Showroom', 'Ninguno'] },
  { clave: '11', nombre: 'Dana Pérez', compras: 2, total: 40000, primera: '2025-03-01', ultima: '2026-05-10', mayorista: 0, canales: ['Tienda Nube'] },
  { clave: 'n:josefina batter', nombre: 'Josefina Batter', compras: 1, total: 32000, primera: '2026-10-19', ultima: '2026-10-19', mayorista: 0, canales: ['Mi Local'] },
]
const HOY = '2026-10-19'

describe('armarFilasClientes', () => {
  it('sin motor: cada cliente de GN, sin cuenta (saldo null), este mes y +90 días', () => {
    const f = armarFilasClientes({ gn: GN, hoy: HOY })
    expect(f.map((x) => x.saldo)).toEqual([null, null, null])
    expect(f.find((x) => x.id === '10')).toMatchObject({ mayorista: true, esteMes: true, dormido: false, canales: ['Mayorista', 'Showroom'] })
    expect(f.find((x) => x.id === '11')).toMatchObject({ mayorista: false, esteMes: false, dormido: true })
    expect(contarVistas(f)).toEqual({ todos: 3, mes: 2, mayoristas: 1, saldo: 0, dormidos: 1 })
    expect(resumen(f)).toMatchObject({ clientes: 3, compraron: 2, mayoristas: 1, porCobrar: 0, total: 572000 })
  })

  it('con motor: la cuenta se pega por gn_client_id o por nombre; uno sin compras en GN igual aparece', () => {
    const f = armarFilasClientes({
      gn: GN, hoy: HOY,
      erp: [{ id: 'u1', nombre: 'Barbara', doc: '27111', gn_client_id: 10 }, { id: 'u2', nombre: 'JOSEFINA Batter', doc: null, gn_client_id: null }, { id: 'u3', nombre: 'Nueva', doc: '30', gn_client_id: null }],
      cuentas: [{ cliente_id: 'u1', saldo: 1500, a_favor: 0, vencido: 1500 }, { cliente_id: 'u2', saldo: -200, a_favor: 200, vencido: 0 }],
    })
    expect(f.find((x) => x.id === '10')).toMatchObject({ clienteId: 'u1', saldo: 1500, vencido: true, doc: '27111' })
    expect(f.find((x) => x.id === 'n:josefina batter')).toMatchObject({ clienteId: 'u2', saldo: -200 })
    expect(f.find((x) => x.id === 'erp:u3')).toMatchObject({ soloErp: true, saldo: 0, compras: 0 })
    expect(contarVistas(f).saldo).toBe(2)
    expect(resumen(f).porCobrar).toBe(1300)
  })

  it('la tupla de viaje vuelve igual', () => {
    expect(armarFilasClientes({ gn: GN.map(aTupla).map(deTupla), hoy: HOY })).toEqual(armarFilasClientes({ gn: GN, hoy: HOY }))
  })

  it('buscador por nombre sin tildes y orden por la última compra', () => {
    const f = armarFilasClientes({ gn: GN, hoy: HOY })
    expect(filtrar(f, { q: 'perez' }).map((x) => x.id)).toEqual(['11'])
    expect(ordenar(f, null).map((x) => x.id)).toEqual(['n:josefina batter', '10', '11'])
    expect(ordenar(f, { col: 'compras', dir: 'asc' }).map((x) => x.id)).toEqual(['n:josefina batter', '11', '10'])
  })
})

describe('el servidor', () => {
  const pg = (rows: Record<string, unknown[]>) => ({
    query: async (sql: string) => {
      const k = Object.keys(rows).find((x) => sql.includes(x))
      if (k === undefined) throw new Error(`sin respuesta para: ${sql.slice(0, 60)}`)
      return { rows: rows[k] }
    },
  })
  const conMotor = (db: unknown) => async (_m: string, _q: string, fn: (pg: unknown) => unknown) => fn(db)

  it('la lista: «Consumidor Final» afuera (en la consulta), motor sin clientes ⇒ sin cuenta', async () => {
    let consulta = ''
    const db = pg({ 'group by 1': GN, 'max(date_sale)': [{ hasta: '2026-10-19' }], 'from cliente': [] })
    const espia = { query: async (s: string) => { if (s.includes('group by 1')) consulta = s; return db.query(s) } }
    const r = await listaDeClientes({ marca: 'zattia' }, { conMotor: conMotor(espia) }) as { gn: unknown[][]; clientesErp: number; porNombre: boolean; gnHasta: string }
    expect(consulta).toContain("<> 'consumidor final'")
    expect(consulta).not.toContain('client_id')
    expect(r).toMatchObject({ clientesErp: 0, porNombre: true, gnHasta: '2026-10-19' })
    expect(r.gn).toHaveLength(3)
    expect(r.gn[0]).toEqual(['10', 'Barbara Spagnoli', 26, 500000, '2025-02-16', '2026-10-03', 12, ['Mayorista', 'Showroom']])
    expect(await listaDeClientes({ marca: 'x' }, { conMotor: conMotor(db) })).toMatchObject({ status: 400 })
  })

  it('la ficha de BDI va por el id de GN y trae el contacto del CRM', async () => {
    const db = pg({ 'from ventas': [{ id: '1', number: 9, fecha: '2026-10-03', channel: 'Mayorista', total: 1000, sale_state: 'Entregado' }], 'from cliente ': [] })
    const r = await fichaDeCliente({ marca: 'bdi', clave: '10' }, { conMotor: conMotor(db), leerContacto: async () => ({ name: 'Barbara', email: 'b@x' }) }) as { compras: unknown[]; contacto: { email: string }; cuenta: null }
    expect(r.compras).toHaveLength(1)
    expect(r.contacto.email).toBe('b@x')
    expect(r.cuenta).toBeNull()
    // 🔴 El contacto por pg daba «permission denied» en prod: si falla, la ficha sale igual, sin contacto.
    const sin = await fichaDeCliente({ marca: 'bdi', clave: '10' }, { conMotor: conMotor(db), leerContacto: async () => { throw new Error('permission denied') } }) as { compras: unknown[]; contacto: null }
    expect(sin.compras).toHaveLength(1)
    expect(sin.contacto).toBeNull()
    expect(await fichaDeCliente({ marca: 'bdi', clave: '' }, { conMotor: conMotor(db) })).toMatchObject({ status: 400 })
  })
})
