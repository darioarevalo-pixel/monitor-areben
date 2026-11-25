import { describe, expect, it } from 'vitest'
import { armarFilasProductos, contarVistas, filtrar, normalizarPrefs, ordenar, resumen } from '@/lib/erp/productos-lista.core.js'

/**
 * **ERP › Productos, el núcleo**: un producto por fila con sus variantes de la lista de Stock, el precio y el costo por
 * (LÍNEA, producto) —en la base de Zattia conviven zattia y stunned con ids que pueden repetirse en el precio—, si está en
 * Tienda Nube, y las vistas de lo que falta completar.
 */
const v = (producto: string, talle: string, disponible: number, extra: Record<string, unknown> = {}) => ({
  producto, talle, nombre: `P${producto}`, talleNombre: talle, sku: `SKU-${producto}-${talle}`, barcode: `77${producto}${talle}`, linea: 'zattia',
  deps: { local: disponible, deposito: 0 }, estanteria: disponible, enPedidos: 0, disponible, ...extra,
})
const filas = armarFilasProductos({
  productos: [
    { id: 1, nombre: 'TOP SAHARA', marca: 'zattia', categoria: 'TOPS', proveedor: 'AREBEN' },
    { id: 2, nombre: 'BIKINI SOL', marca: 'stunned', categoria: null, proveedor: null },
    { id: 3, nombre: 'CINTO CALYPSO', marca: 'zattia', categoria: 'ACCESORIOS', proveedor: 'Taller', codigo_proveedor: '26s-039' },
  ],
  stock: [v('1', 'M', 3), v('1', 'S', 2), v('2', 'U', -1, { barcode: null, linea: 'stunned' }), v('9', 'U', 4)],
  precios: [
    { product_id: 1, marca: 'zattia', lista: 'local', precio: '22990' }, { product_id: 1, marca: 'zattia', lista: 'mayorista', precio: 13800 },
    { product_id: 2, marca: 'stunned', lista: 'local', precio: 15000 }, { product_id: 2, marca: 'zattia', lista: 'local', precio: 99 },
  ],
  costos: [{ product_id: 1, marca: 'zattia', costo: '7900' }, { product_id: 2, marca: 'zattia', costo: 1 }],
  tn: [{ product_id: 1, publicado: true }, { product_id: 3, publicado: false }],
})
const de = (id: string) => filas.find((f) => f.producto === id)!

describe('armarFilasProductos', () => {
  it('un producto por fila, con sus variantes ordenadas y el disponible sin restar los negativos', () => {
    expect(filas.map((f) => f.producto).sort()).toEqual(['1', '2', '3', '9'])
    expect(de('1').variantes.map((x) => x.talle)).toEqual(['M', 'S'])
    expect(de('1').disponible).toBe(5)
    expect(de('2').disponible).toBe(0)
    expect(de('2').negativas).toBe(1)
    expect(de('3').variantes).toEqual([])
  })
  it('precio y costo por (LÍNEA, producto): el de stunned ⛔ toma el de zattia con el mismo id', () => {
    expect(de('1').precios).toEqual({ local: 22990, online: null, mayorista: 13800, oferta: null })
    expect(de('1').costo).toBe(7900)
    expect(de('2').precios.local).toBe(15000)
    expect(de('2').costo).toBeNull()
  })
  it('en Tienda Nube: publicado, oculto o ⛔ está; y el que tiene stock sin estar activo igual aparece', () => {
    expect([de('1').tn, de('3').tn, de('2').tn]).toEqual(['publicado', 'oculto', 'no'])
    expect(de('9').nombre).toBe('P9')
    expect(de('9').linea).toBe('zattia')
  })
})

describe('vistas, buscador, resumen y orden', () => {
  it('cada vista cuenta lo que falta completar', () => {
    expect(contarVistas(filas)).toMatchObject({ todos: 4, constock: 2, sinstock: 2, oculto: 1, notn: 2, sincosto: 3, sinmay: 3, sinprov: 2, sinbarra: 1 })
  })
  it('el buscador lee nombre, categoría, proveedor y SKU; el código de barras entero, exacto', () => {
    expect(filtrar(filas, { q: 'sahara' }).map((f) => f.producto)).toEqual(['1'])
    expect(filtrar(filas, { q: 'accesorios' }).map((f) => f.producto)).toEqual(['3'])
    expect(filtrar(filas, { q: 'SKU-1-S' }).map((f) => f.producto)).toEqual(['1'])
    expect(filtrar(filas, { q: '771M' }).map((f) => f.producto)).toEqual(['1'])
    expect(filtrar(filas, { linea: 'stunned' }).map((f) => f.producto)).toEqual(['2'])
  })
  it('el código del proveedor (Darío 23-nov, de Ingresos) viaja en la fila y se busca', () => {
    expect(de('3').codigoProveedor).toBe('26s-039')
    expect(de('1').codigoProveedor).toBeNull()
    expect(filtrar(filas, { q: '26S-039' }).map((f) => f.producto)).toEqual(['3'])
  })
  it('el resumen de lo filtrado', () => {
    expect(resumen(filas)).toEqual({ productos: 4, variantes: 4, disponible: 9, sinCosto: 3, fueraDeTn: 3 })
  })
  it('ordena por precio con el que falta al final de mayor a menor, y por nombre sin orden', () => {
    expect(ordenar(filas, null).map((f) => f.nombre)).toEqual(['BIKINI SOL', 'CINTO CALYPSO', 'P9', 'TOP SAHARA'])
    expect(ordenar(filas, { col: 'local', dir: 'desc' }).map((f) => f.producto).slice(0, 2)).toEqual(['1', '2'])
  })
  it('las columnas de siempre y una guardada vieja que ya ⛔ existe', () => {
    expect(normalizarPrefs(null).visibles).toEqual(['p', 'var', 'disp', 'costo', 'local', 'mayorista', 'tn'])
    expect(normalizarPrefs({ orden: ['p', 'vieja'], visibles: ['p', 'vieja'] }).visibles).not.toContain('vieja')
  })
})

describe('lo importado de Ingresos sin stock (prueba de Bruno, 3-nov)', () => {
  const base = { precios: [], costos: [], tn: [], cambios: [], liquidaciones: [] }
  const productos = [{ id: '1000000043', nombre: 'ADAPTADOR', marca: 'bdi', categoria: null, proveedor: null }]
  const sinEspejo = [{ product_id: '1000000043', size_id: '1000000044', talle: 'Variante Única', sku: 'AC-0012', barcode: 'AC0012' }]

  it('aparece con su variante y su código, con stock 0', () => {
    const [f] = armarFilasProductos({ ...base, productos, stock: [], sinEspejo })
    expect(f.variantes).toHaveLength(1)
    expect(f.variantes[0]).toMatchObject({ sku: 'AC-0012', barcode: 'AC0012', talleNombre: 'Variante Única', disponible: 0 })
    expect(f.disponible).toBe(0)
  })

  it('con stock ya sale del espejo: ⛔ se duplica', () => {
    const stock = [{ producto: '1000000043', talle: '1000000044', talleNombre: 'Variante Única', nombre: 'ADAPTADOR', linea: 'bdi', sku: 'AC-0012', barcode: 'AC0012', deps: { local: 0, deposito: 5 }, estanteria: 5, enPedidos: 0, disponible: 5 }]
    const [f] = armarFilasProductos({ ...base, productos, stock, sinEspejo })
    expect(f.variantes).toHaveLength(1)
    expect(f.disponible).toBe(5)
  })

  it('el producto inactivo ⛔ vuelve por su variante', () => {
    expect(armarFilasProductos({ ...base, productos: [], stock: [], sinEspejo })).toHaveLength(0)
  })
})

describe('inactivos (Darío 19-nov: las fundas agotadas dejan de aparecer)', () => {
  const base = { precios: [], costos: [], tn: [], cambios: [], liquidaciones: [], sinEspejo: [] }
  const s = (producto: string, n: number) => ({ producto, talle: 'U', nombre: `P${producto}`, talleNombre: 'U', sku: null, barcode: null, linea: 'bdi', deps: { local: n }, estanteria: n, enPedidos: 0, disponible: n })
  const lista = armarFilasProductos({
    ...base,
    productos: [
      { id: 1, nombre: 'ACTIVA', marca: 'bdi', categoria: null, proveedor: null, activo: true },
      { id: 2, nombre: 'AGOTADA', marca: 'bdi', categoria: null, proveedor: null, activo: false },
      { id: 3, nombre: 'INACTIVA CON STOCK', marca: 'bdi', categoria: null, proveedor: null, activo: false },
      { id: 4, nombre: 'SIN MOVIMIENTOS', marca: 'bdi', categoria: null, proveedor: null, activo: false },
    ],
    stock: [s('1', 0), s('2', 0), s('3', 2)],
  })
  const ids = (fs: { producto: string }[]) => fs.map((f) => f.producto).sort()

  it('el inactivo en 0 ⛔ aparece en las vistas de trabajo; con stock sigue a la vista', () => {
    expect(ids(filtrar(lista, { vista: 'todos' }))).toEqual(['1', '3'])
    expect(ids(filtrar(lista, { vista: 'sinstock' }))).toEqual(['1'])
  })

  it('«Inactivos» los trae a todos, para volver a activarlos', () => {
    expect(ids(filtrar(lista, { vista: 'inactivos' }))).toEqual(['2', '3', '4'])
    expect(contarVistas(filtrar(lista, {}))).toMatchObject({ todos: 2, inactivos: 3 })
  })

  it('el buscador sin vista ve todo (la base de los conteos)', () => {
    expect(ids(filtrar(lista, { q: 'agotada' }))).toEqual(['2'])
  })
})
