// ERP › Precios: el proveedor del costo como FICHA (sql/013 del motor; Bruno, 15-oct ❓ i: tabla propia cruzada con PRM).
import { describe, it, expect } from 'vitest'
import { armarPrecioDeProducto, leerCarga } from '../lib/erp/precio.core.js'
import { altaDeProveedor, proveedoresDeMarca } from '../api/_erp.js'

describe('leerCarga: proveedorId', () => {
  it('el costo lleva la ficha; el precio ⛔', () => {
    expect(leerCarga({ que: 'costo', producto: '1', monto: 10, proveedorId: '1000000003' })).toMatchObject({ proveedorId: '1000000003', proveedor: null })
    expect(leerCarga({ que: 'precio', producto: '1', lista: 'local', monto: 10, proveedorId: '1000000003' })).toMatchObject({ proveedorId: null })
    expect(leerCarga({ que: 'costo', producto: '1', monto: 10 })).toMatchObject({ proveedorId: null })
    expect(leerCarga({ que: 'costo', producto: '1', monto: 10, proveedorId: '' })).toMatchObject({ proveedorId: null })
  })
  it('un id que ⛔ es número frena (⛔ se manda vacío callado)', () => {
    expect(leerCarga({ que: 'costo', producto: '1', monto: 10, proveedorId: 'abc' }).error).toMatch(/Proveedor/)
  })
})

describe('armarPrecioDeProducto: proveedor', () => {
  const base = { listas: [], vigentes: [], costo: { costo: '100', proveedor: 'TALLER ANA', fuente: 'gn', vigente_desde: '2026-10-15T00:00:00Z', usuario: 'gn-copia' } }
  it('con ficha: el nombre de la ficha y su id (manda sobre el texto de GN)', () => {
    expect(armarPrecioDeProducto({ ...base, proveedorFicha: { id: '1000000003', nombre: 'Taller Ana' } }).costo).toMatchObject({ proveedor: 'Taller Ana', proveedorId: '1000000003' })
  })
  it('sin ficha: el texto, como antes', () => {
    expect(armarPrecioDeProducto(base).costo).toMatchObject({ proveedor: 'TALLER ANA', proveedorId: null })
  })
})

describe('armarPrecioDeProducto: el proveedor DEL PRODUCTO (Bruno, 18-oct: nace en Ingresos, motor 021)', () => {
  const base = { listas: [], vigentes: [], costo: null }
  it('con OC: de Ingresos, con la OC', () => {
    expect(armarPrecioDeProducto({ ...base, proveedorProducto: { id: '7', nombre: 'KHAN', oc: { label: 'OC-3034', fecha: '2026-10-07' } } }).proveedor)
      .toEqual({ id: '7', nombre: 'KHAN', origen: 'ingresos', oc: { label: 'OC-3034', fecha: '2026-10-07' } })
  })
  it('sin OC: el de GN', () => {
    expect(armarPrecioDeProducto({ ...base, proveedorProducto: { id: '7', nombre: 'KHAN', oc: null } }).proveedor).toMatchObject({ origen: 'gn', oc: null })
  })
  it('sin proveedor: null (la pantalla dice que todavía ⛔ entró por ninguna OC)', () => {
    expect(armarPrecioDeProducto(base).proveedor).toBeNull()
  })
  it('es OTRO que el del costo: el costo de GN sigue con su texto', () => {
    const r = armarPrecioDeProducto({ ...base, costo: { costo: '100', proveedor: 'Boucle', fuente: 'gn', vigente_desde: '2026-10-15T00:00:00Z', usuario: 'gn-copia' },
      proveedorProducto: { id: '25', nombre: 'ZATTIA', oc: { label: 'OC-1', fecha: '2026-10-01' } } })
    expect([r.costo?.proveedor, r.proveedor?.nombre]).toEqual(['Boucle', 'ZATTIA'])
  })
})

describe('proveedores sin la tabla (base sin sql/013)', () => {
  const sinTabla = { query: async () => ({ rows: [{ hay: false }] }) }
  it('lista y alta contestan 409 con el aviso (la pantalla deja el texto)', async () => {
    expect(await proveedoresDeMarca({ marca: 'zattia', linea: 'zattia' }, { db: sinTabla })).toMatchObject({ status: 409, error: expect.stringMatching(/a mano/) })
    expect(await altaDeProveedor({ marca: 'zattia', body: { nombre: 'X' } }, { db: sinTabla })).toMatchObject({ status: 409 })
  })
  it('marca inválida ⇒ 400 sin tocar la base', async () => {
    expect(await proveedoresDeMarca({ marca: 'otra' }, { db: null as never })).toMatchObject({ status: 400 })
  })
})

describe('proveedores de UNA línea (Bruno, 30-oct: «los proveedores van en cada marca, sí o sí»)', () => {
  const P = (id: number, nombre: string, productos: number) => ({ id, nombre, cuit: null, nombre_gn: null, productos, activo: true })
  // KHAN le hace a Zattia, TALLER STU a Stunned, MIXTO a las dos y NUEVO todavía a nadie.
  const PRODUCTOS: Record<string, Record<string, number>> = { 1: { zattia: 5 }, 2: { stunned: 3 }, 3: { zattia: 1, stunned: 2 } }
  function db() {
    const pedidas: { sql: string; params?: unknown[] }[] = []
    return {
      pedidas,
      query: async (sql: string, params?: unknown[]) => {
        pedidas.push({ sql, params })
        if (sql.includes('to_regclass') || sql.includes('has_table_privilege') || /\bhay\b/.test(sql)) return { rows: [{ hay: true }] }
        if (sql.includes('from marca')) return { rows: [{ empresa_id: 'areben' }] }
        if (sql.includes('from proveedor p')) return { rows: [P(1, 'KHAN', 5), P(2, 'TALLER STU', 3), P(3, 'MIXTO', 3), P(4, 'NUEVO', 0)] }
        if (sql.includes('from producto where proveedor_id')) {
          const l = String(params?.[0])
          return { rows: Object.entries(PRODUCTOS).map(([id, por]) => ({ id, n: por[l] ?? 0 })) }
        }
        throw new Error(`sin respuesta para: ${sql.slice(0, 80)}`)
      },
    }
  }
  it('Stunned: los suyos, y los productos sólo los de Stunned; el que ⛔ tiene productos, ⛔ (es de ninguna)', async () => {
    const r = await proveedoresDeMarca({ marca: 'zattia', linea: 'stunned' }, { db: db() }) as { proveedores: { nombre: string; productos: number }[] }
    expect(r.proveedores.map((p) => [p.nombre, p.productos])).toEqual([['TALLER STU', 3], ['MIXTO', 2]])
  })
  it('Zattia: al revés', async () => {
    const r = await proveedoresDeMarca({ marca: 'zattia', linea: 'zattia' }, { db: db() }) as { proveedores: { nombre: string; productos: number }[] }
    expect(r.proveedores.map((p) => [p.nombre, p.productos])).toEqual([['KHAN', 5], ['MIXTO', 1]])
  })
  it('para ELEGIR («Cargar costo»): también el que todavía ⛔ tiene productos, o ⛔ se le cargaría su primer costo', async () => {
    const r = await proveedoresDeMarca({ marca: 'zattia', linea: 'stunned', elegir: true }, { db: db() }) as { proveedores: { nombre: string }[] }
    expect(r.proveedores.map((p) => p.nombre)).toEqual(['TALLER STU', 'MIXTO', 'NUEVO'])
  })
  it('Zattia sin línea ⇒ 400; BDI ⛔ tiene líneas y ⛔ se corta', async () => {
    expect(await proveedoresDeMarca({ marca: 'zattia' }, { db: db() })).toMatchObject({ status: 400 })
    const b = db()
    const r = await proveedoresDeMarca({ marca: 'bdi', linea: 'bdi' }, { db: b }) as { proveedores: unknown[] }
    expect(r.proveedores).toHaveLength(4)
    expect(b.pedidas.some((p) => p.sql.includes('from producto where proveedor_id'))).toBe(false)
  })
})
