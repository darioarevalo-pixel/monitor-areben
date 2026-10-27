/**
 * ERP › Stock › Stock con el molde (diseño §3 y §7): una fila por prenda con lo que hay por depósito. Lo que no se ve si
 * falla: un disponible que ⛔ descuenta lo que apartan los pedidos sin pagar (se vendería dos veces), una prenda negativa
 * que resta del total de las otras, un SKU de TN en minúscula que ⛔ encuentra su prenda, o el libro sin conexión que
 * se lee como «no hay stock».
 */
import { describe, it, expect, vi } from 'vitest'
import {
  armarFilasStock, columnasDe, contarVistas, filtrar, normalizarPrefs, alternarColumna, ordenar, reservadoPorVariante, resumen,
} from '../lib/erp/stock-lista.core.js'
import { listaDeStock } from '../api/_erp-stock.js'

const inv = (product_id: number, size_id: number, store_name: string, available_quantity: number, o: Record<string, unknown> = {}) =>
  ({ product_id, size_id, store_name, available_quantity, product_name: 'TOP SAHARA', size_name: 'S - CHOCOLATE', sku: `TOP-${product_id}-${size_id}`, barcode: `77${product_id}${size_id}`, ...o })
const niv = (product_id: number, size_id: number, deposito: string, nivel: number, linea = 'zattia') => ({ product_id, size_id, deposito, nivel, linea })

const INVENTARIO = [
  inv(1, 1, 'Local', 2), inv(1, 1, 'Deposito ', 5),
  inv(2, 1, 'Local', 0, { product_name: 'BUZO ROMA', size_name: 'L - GRIS', sku: 'STU-0042-GR-L' }), inv(2, 1, 'Deposito ', 3, { product_name: 'BUZO ROMA', size_name: 'L - GRIS', sku: 'STU-0042-GR-L' }),
  inv(3, 1, 'Local', 0, { product_name: 'CINTO CALYPSO', size_name: 'U' }),
]
const NIVELES = [niv(1, 1, 'local', 2), niv(1, 1, 'deposito', 5), niv(2, 1, 'deposito', 3, 'stunned'), niv(3, 1, 'local', -1), niv(9, 9, 'local', 4)]

describe('armarFilasStock', () => {
  const filas = armarFilasStock({
    marca: 'zattia', niveles: NIVELES, inventario: INVENTARIO,
    ultimos: [{ product_id: 1, size_id: 1, tipo: 'venta', origen: 'caja', origen_ref: 'venta:296', ocurrido_en: '2026-10-19T13:25:00Z' }],
    reservado: new Map([['1/1', 3]]),
  })
  const de = (id: string) => filas.find((f) => f.id === id)!

  it('disponible = físico − lo que apartan los pedidos sin pagar', () => {
    expect(de('1/1')).toMatchObject({ estanteria: 7, enPedidos: 3, disponible: 4, deps: { local: 2, deposito: 5 }, gn: 7, linea: 'zattia' })
    expect(de('1/1').ultimo).toMatchObject({ tipo: 'venta', ref: 'venta:296' })
  })
  it('la línea sale del ERP (y si no, del código); un depósito sin fila es 0', () => {
    expect(de('2/1')).toMatchObject({ linea: 'stunned', deps: { local: 0, deposito: 3 } })
  })
  it('un producto que el ERP tiene y Gestión Nube ya no: se ve con su id, ⛔ se pierde', () => {
    expect(de('9/9')).toMatchObject({ nombre: 'Producto 9', talleNombre: 'Variante 9', estanteria: 4, gn: null })
  })
  it('negativo en un depósito ⇒ negativo; en el resumen ⛔ resta de las demás', () => {
    expect(de('3/1').negativo).toBe(true)
    expect(resumen(filas)).toMatchObject({ disponible: 4 + 3 + 4, estanteria: 7 + 3 + 4, enPedidos: 3, negativos: 1, prendas: 4 })
  })
  it('vistas con su número, y el buscador por nombre, código o código entero', () => {
    expect(contarVistas(filas)).toEqual({ constock: 3, local0: 1, neg: 1, ped: 1, todo: 4 })
    expect(filtrar(filas, { vista: 'local0' }).map((f) => f.id)).toEqual(['2/1'])
    expect(filtrar(filas, { q: 'sahara' }).map((f) => f.id)).toEqual(['1/1'])
    expect(filtrar(filas, { q: 'stu-0042' }).map((f) => f.id)).toEqual(['2/1'])
    expect(filtrar(filas, { q: '7711' }).map((f) => f.id)).toEqual(['1/1'])
    expect(filtrar(filas, { linea: 'stunned' }).map((f) => f.id)).toEqual(['2/1'])
  })
  it('ordena por nombre sin elegir; por disponible ↓ al tocar la columna', () => {
    expect(ordenar(filas, null).map((f) => f.nombre)).toEqual(['BUZO ROMA', 'CINTO CALYPSO', 'Producto 9', 'TOP SAHARA'])
    expect(ordenar(filas, { col: 'disp', dir: 'desc' }).map((f) => f.id)).toEqual(['9/9', '1/1', '2/1', '3/1']) // empate en 4: por nombre
    expect(ordenar(filas, { col: 'dep:deposito', dir: 'desc' })[0].id).toBe('1/1')
  })
})

describe('reservadoPorVariante', () => {
  it('cruza el código del pedido con Gestión Nube sin importar mayúsculas; lo que ⛔ cruza se cuenta aparte', () => {
    const r = reservadoPorVariante([
      { prendas: [{ sku: 'top-1-1', cantidad: 1 }, { sku: 'NO-EXISTE', cantidad: 2 }] },
      { prendas: [{ sku: 'TOP-1-1 ', cantidad: 2 }, { sku: null, cantidad: 1 }] },
    ], INVENTARIO)
    expect(r.reservado.get('1/1')).toBe(3)
    expect(r.sinVariante).toBe(3)
  })
})

describe('las columnas', () => {
  it('cada base con sus depósitos; las fijas no se ocultan', () => {
    expect(Object.keys(columnasDe('bdi')).filter((k) => k.startsWith('dep:'))).toEqual(['dep:local', 'dep:deposito_minorista', 'dep:deposito_mayorista'])
    const p = normalizarPrefs('zattia', null)
    expect(p.visibles).toEqual(['p', 't', 'disp', 'est', 'dep:local', 'dep:deposito', 'ped', 'ult'])
    expect(alternarColumna('zattia', p, 'disp')).toBe(p)
    expect(alternarColumna('zattia', p, 'gn').visibles).toContain('gn')
    // Lo guardado de otra base (otro depósito) se cae solo.
    expect(normalizarPrefs('zattia', { orden: ['dep:deposito_minorista', 'p'], visibles: ['dep:deposito_minorista', 'p'] }).visibles).toEqual(['p', 't', 'disp'])
  })
})

describe('listaDeStock (el servidor)', () => {
  const pg = {
    query: vi.fn(async (sql: string) => ({
      rows: /group by/.test(sql) ? NIVELES : /distinct on/.test(sql) ? [] : [{ hasta: new Date('2026-10-19T16:00:00Z') }],
    })),
  }
  const deps = {
    conMotor: vi.fn(async (_m: string, _q: string, fn: (db: typeof pg) => unknown) => fn(pg)),
    pedidosSinPagar: vi.fn(async () => ({ pedidos: [{ prendas: [{ sku: 'TOP-1-1', cantidad: 1 }] }], leidaEn: '2026-10-19T15:00:00Z' })),
    leerInventario: vi.fn(async () => INVENTARIO),
  }
  it('suma el ERP en la base y descuenta los pedidos', async () => {
    const r = await listaDeStock({ marca: 'zattia' }, deps) as { filas: Array<{ id: string; disponible: number }>; libroHasta: string; pedidos: number }
    expect(r.filas.find((f) => f.id === '1/1')!.disponible).toBe(6)
    expect(r).toMatchObject({ libroHasta: '2026-10-19T16:00:00.000Z', pedidos: 1 })
  })
  it('sin la conexión del motor contesta 409 (⛔ una lista vacía que parece «sin stock»)', async () => {
    const r = await listaDeStock({ marca: 'bdi' }, { ...deps, conMotor: async () => ({ status: 409, error: 'falta la conexión' }) })
    expect(r).toEqual({ status: 409, error: 'falta la conexión' })
  })
  it('marca inválida', async () => {
    expect(await listaDeStock({ marca: 'stunned' }, deps)).toMatchObject({ status: 400 })
  })
})
