/**
 * 🔴 Bruno 30-oct: la persona del LOCAL veía el costo (Productos, el stock a costo). El costo es de Admin y Administración
 * (que lo carga); al resto el SERVIDOR ⛔ se lo manda: ni en Productos, ni en la ficha del producto (que se abre a todos).
 */
import { describe, expect, it } from 'vitest'
import { listaDeProductos } from '../api/_erp-productos.js'
import { armarFilasProductos, contarVistas, resumen } from '../lib/erp/productos-lista.core.js'
import { armarPrecioDeProducto, sinCostos } from '../lib/erp/precio.core.js'
import { permisoErpDe, puedeErp } from '../lib/permisos.core.js'

const persona = (funcion: string[]) => ({ admin: false, funcion, acceso: { bdi: { erp: true }, zattia: { erp: true } } })

describe('quién ve costos', () => {
  it('Admin y Administración sí; Local, Mayorista, Depósito y Consulta ⛔, en las dos marcas', () => {
    for (const m of ['bdi', 'zattia']) {
      expect(puedeErp({ admin: true }, m, 'costos')).toBe(true)
      expect(puedeErp(persona(['administracion']), m, 'costos')).toBe(true)
      for (const r of ['local', 'mayorista', 'deposito', 'consulta']) expect(puedeErp(persona([r]), m, 'costos')).toBe(false)
    }
  })
  it('cargar un gasto (caja chica, Bruno 30-oct): Local y Administración sí; Mayorista, Depósito y Consulta ⛔; la lista de Gastos sigue de Admin', () => {
    for (const m of ['bdi', 'zattia']) {
      for (const r of ['local', 'administracion']) expect(puedeErp(persona([r]), m, 'cargar-gasto')).toBe(true)
      for (const r of ['mayorista', 'deposito', 'consulta']) expect(puedeErp(persona([r]), m, 'cargar-gasto')).toBe(false)
    }
    expect(permisoErpDe({ method: 'GET', vista: 'gastos' })).toBe('configurar')
    expect(permisoErpDe({ method: 'POST', accion: 'registrar-gasto' })).toBe('configurar')
  })
  it('las lecturas con costo que el local abre piden `ver` y cortan adentro; el resultado del Inicio pide `costos`', () => {
    for (const v of ['productos-lista', 'precio', 'ventas-producto']) expect(permisoErpDe({ method: 'GET', vista: v })).toBe('ver')
    expect(permisoErpDe({ method: 'GET', vista: 'inicio-resultado' })).toBe('costos')
  })
})

const crudo = {
  productos: [{ id: 1, nombre: 'Remera', marca: 'stunned', categoria: null, proveedor: null }, { id: 2, nombre: 'Short', marca: 'stunned', categoria: null, proveedor: null }],
  stock: [], precios: [{ product_id: 1, marca: 'stunned', lista: 'local', precio: 20000 }], tn: [],
}

describe('Productos (lista): sin `costos` la fila ⛔ lleva el campo', () => {
  it('con costos: el costo y «Sin costo» cuentan', () => {
    const filas = armarFilasProductos({ ...crudo, costos: [{ product_id: 1, marca: 'stunned', costo: 9000 }] })
    expect(filas.find((f) => f.producto === '1')?.costo).toBe(9000)
    expect(contarVistas(filas).sincosto).toBe(1)
    expect(resumen(filas).sinCosto).toBe(1)
  })
  it('sin costos: ⛔ hay `costo` en ninguna fila y «Sin costo» ⛔ cuenta (⛔ un «sin costo» que mienta)', () => {
    const filas = armarFilasProductos({ ...crudo, costos: null })
    expect(filas.every((f) => !('costo' in f))).toBe(true)
    expect(JSON.stringify(filas)).not.toMatch(/costo/i)
    expect(contarVistas(filas).sincosto).toBe(0)
    expect(resumen(filas).sinCosto).toBe(0)
  })
})

describe('listaDeProductos (el servidor)', () => {
  const deps = (sqls: string[]) => ({
    conMotor: async (_m: string, _t: string, fn: (pg: unknown) => unknown) => fn({
      query: async (sql: string) => {
        sqls.push(sql)
        if (/from costo_vigente/.test(sql)) return { rows: [{ product_id: 1, marca: 'zattia', costo: 9000 }] }
        if (/from producto p/.test(sql)) return { rows: [{ id: 1, nombre: 'Remera', marca: 'zattia' }] }
        return { rows: [] }
      },
    }),
    pedidosSinPagar: async () => ({ pedidos: [] }),
    leerInventario: async () => [],
  })
  it('sin costos ⛔ lee `costo_vigente` y la respuesta ⛔ trae costo', async () => {
    const sqls: string[] = []
    const r = await listaDeProductos({ marca: 'zattia', costos: false }, deps(sqls))
    expect(sqls.some((s) => /costo_vigente/.test(s))).toBe(false)
    expect(r.costos).toBe(false)
    expect(JSON.stringify(r.filas)).not.toMatch(/"costo"/)
  })
  it('con costos, sí', async () => {
    const r = await listaDeProductos({ marca: 'zattia', costos: true }, deps([]))
    expect(r.costos).toBe(true)
    expect(r.filas.find((f: { producto: string }) => f.producto === '1')?.costo).toBe(9000)
  })
  it('sin decir si ve costos ⛔ hay lista (el parámetro es obligatorio)', async () => {
    await expect(listaDeProductos({ marca: 'zattia' } as never, deps([]))).rejects.toThrow(/costos/)
  })
})

describe('Ficha del producto: `sinCostos`', () => {
  const armado = armarPrecioDeProducto({
    listas: [{ id: 'local', nombre: 'Local' }], vigentes: [{ lista: 'local', precio: 25500, fuente: 'gn', vigente_desde: '2026-10-01T00:00:00Z', usuario: 'x' }],
    costo: { costo: '12000', proveedor: 'Taller', fuente: 'gn', vigente_desde: '2026-10-01T00:00:00Z', usuario: 'x' },
    historialPrecio: [{ lista: 'local', precio: 25500, fuente: 'gn', vigente_desde: '2026-10-01T00:00:00Z', usuario: 'x' }],
    historialCosto: [{ costo: 12000, proveedor: 'Taller', fuente: 'gn', vigente_desde: '2026-10-01T00:00:00Z', usuario: 'x' }],
    gn: { retailer_price: 25500, wholesaler_price: 15000, unit_cost: 11000 },
    tn: [{ tienda: 'stunned', precio: 25500, precio_promocional: null, costo: 13000 }],
  })
  it('con costos: viaja todo y lo dice', () => {
    expect(armado.costos).toBe(true)
    expect(armado.costo?.costo).toBe(12000)
  })
  it('sin costos: quedan los precios; ⛔ el costo del ERP, de GN, de TN, sus avisos ni su historial', () => {
    const s = sinCostos(armado)
    expect(s.costos).toBe(false)
    expect(s.costo).toBeNull()
    expect(s.listas[0].precio).toBe(25500)
    expect(s.gn).toEqual({ precio: 25500, mayorista: 15000 })
    expect(s.tn && 'costo' in s.tn).toBe(false)
    expect(s.historial.map((h) => h.que)).toEqual(['precio'])
    const json = JSON.stringify(s)
    for (const n of ['12000', '11000', '13000']) expect(json).not.toContain(n)
  })
})
