/**
 * ERP › Productos y precios › Productos, con el molde del diseño (`~/Documents/erp-monitor/diseno.md` §3 y §7; tablero 5
 * del v8): UNA lista de TRABAJO con un producto por fila —sus variantes, el disponible, el costo, el precio de cada lista y
 * si está en Tienda Nube— y la ficha al costado (las listas, el costo, cada variante con su stock y el historial de precios).
 * Puro: el handler (`api/_erp-productos.js`) lee y esto arma.
 *
 * 🔑 Medido 19-oct: los productos ACTIVOS del motor (`producto.activo`) son exactamente los del espejo de GN (`inventario`):
 *    BDI 313, Zattia 890 (850 + 40 de Stunned). Las variantes y su stock salen de la lista de Stock (la misma cuenta:
 *    disponible = estantería − pedidos de TN sin pagar), agrupadas por producto.
 * 🔑 ⛔ alta acá: el producto nace en Ingresos (Bruno, 13-oct). Fotos ⛔ hay en la base (`tn_producto` ⛔ las guarda) ⇒ la
 *    vista «Sin foto» del tablero ⛔ va hasta que haya de dónde sacarla.
 */

import { alternarColumnaDe, moverColumna, normalizarPrefsDe } from './lista-columnas.core.js'
import { normal } from './stock-lista.core.js'

/** Las listas que se muestran como columna, en el orden del diseño. La de «Tienda Nube con oferta» va en la ficha. */
export const LISTAS = ['local', 'online', 'mayorista']

/**
 * @typedef {{ talle: string, talleNombre: string, sku: string | null, barcode: string | null, deps: Record<string, number>,
 *   estanteria: number, enPedidos: number, disponible: number }} VarianteProducto
 * @typedef {{ id: string, producto: string, nombre: string, linea: string, categoria: string | null, proveedor: string | null,
 *   variantes: VarianteProducto[], disponible: number, enPedidos: number, negativas: number,
 *   precios: Record<string, number | null>, costo: number | null, tn: 'publicado' | 'oculto' | 'no', sinBarra: boolean,
 *   ultimoCambio: { lista: string, precio: number | null, cuando: string, quien: string | null, copia: boolean } | null, cambiosMes: number,
 *   liquidacion: { nombre: string, hasta: string | null, precio: number | null } | null }} FilaProducto
 */

/**
 * Un producto por fila: los activos del motor y cualquiera que tenga variantes en la lista de Stock (⛔ se pierde uno con
 * stock porque GN lo dio de baja).
 * @param {{ productos: Array<{ id: string|number, nombre: string|null, marca: string, categoria: string|null, proveedor: string|null }>,
 *   stock: Array<{ producto: string, talle: string, nombre: string, talleNombre: string, sku: string|null, barcode: string|null, linea: string,
 *     deps: Record<string, number>, estanteria: number, enPedidos: number, disponible: number }>,
 *   precios: Array<{ product_id: string|number, marca: string, lista: string, precio: number|string|null }>,
 *   costos: Array<{ product_id: string|number, marca: string, costo: number|string|null }>,
 *   tn: Array<{ product_id: string|number, publicado: boolean }>,
 *   cambios?: Array<{ marca: string, product_id: string|number, lista: string, precio: number|string|null, vigente_desde: string|Date,
 *     usuario: string|null, fuente: string|null, cambios_mes: number|string }>,
 *   liquidaciones?: Array<{ product_id: string, store: string, nombre: string, hasta: string|null, precio: number|string|null }> }} x
 * @returns {FilaProducto[]}
 */
export function armarFilasProductos({ productos, stock, precios, costos, tn, cambios = [], liquidaciones = [] }) {
  const num = (v) => (v == null || v === '' ? null : Number(v))
  const filas = new Map()
  const fila = (id) => {
    let f = filas.get(id)
    if (!f) {
      f = { id, producto: id, nombre: null, linea: null, categoria: null, proveedor: null, variantes: [] }
      filas.set(id, f)
    }
    return f
  }
  for (const p of productos) {
    const f = fila(String(p.id))
    f.nombre = p.nombre ?? null
    f.linea = p.marca ?? null
    f.categoria = p.categoria ?? null
    f.proveedor = p.proveedor ?? null
  }
  for (const v of stock) {
    const f = fila(String(v.producto))
    f.nombre ??= v.nombre
    f.linea ??= v.linea
    f.variantes.push({ talle: v.talle, talleNombre: v.talleNombre, sku: v.sku, barcode: v.barcode, deps: v.deps, estanteria: v.estanteria, enPedidos: v.enPedidos, disponible: v.disponible })
  }
  // Precio y costo son por (LÍNEA, producto): en la base de Zattia conviven zattia y stunned.
  const precio = new Map(precios.map((r) => [`${r.marca}/${r.product_id}/${r.lista}`, num(r.precio)]))
  const costo = new Map(costos.map((r) => [`${r.marca}/${r.product_id}`, num(r.costo)]))
  const enTn = new Map(tn.map((r) => [String(r.product_id), r.publicado ? 'publicado' : 'oculto']))
  const cambio = new Map(cambios.map((r) => [`${r.marca}/${r.product_id}`, r]))
  // La liquidación es de la TIENDA (`store`); en la base de Zattia el pid es el mismo producto del motor (medido 235/235).
  const liq = new Map(liquidaciones.map((r) => [String(r.product_id), r]))
  return [...filas.values()].map((f) => {
    const variantes = f.variantes.slice().sort((a, b) => normal(a.talleNombre).localeCompare(normal(b.talleNombre), 'es', { numeric: true }))
    // Lo que una variante debe ⛔ resta de lo que hay de otra (como el resumen de Stock): se cuenta aparte.
    const disponible = variantes.reduce((a, v) => a + Math.max(0, v.disponible), 0)
    return {
      ...f,
      nombre: f.nombre ?? `Producto ${f.producto}`,
      linea: f.linea ?? '',
      variantes,
      disponible,
      enPedidos: variantes.reduce((a, v) => a + v.enPedidos, 0),
      negativas: variantes.filter((v) => v.disponible < 0 || Object.values(v.deps).some((n) => n < 0)).length,
      precios: Object.fromEntries([...LISTAS, 'oferta'].map((l) => [l, precio.get(`${f.linea}/${f.producto}/${l}`) ?? null])),
      costo: costo.get(`${f.linea}/${f.producto}`) ?? null,
      tn: enTn.get(f.producto) ?? 'no',
      sinBarra: variantes.some((v) => !v.barcode),
      ultimoCambio: ultimoCambioDe(cambio.get(`${f.linea}/${f.producto}`)),
      cambiosMes: Number(cambio.get(`${f.linea}/${f.producto}`)?.cambios_mes ?? 0),
      liquidacion: liq.has(f.producto) ? { nombre: liq.get(f.producto).nombre, hasta: liq.get(f.producto).hasta ?? null, precio: num(liq.get(f.producto).precio) } : null,
    }
  })
}

/** Quién cambió el precio, en palabras: las copias automáticas dicen de dónde vienen. */
const QUIEN = { 'gn-copia': 'Copia de Gestión Nube', 'tn-copia': 'Copia de Tienda Nube' }

/** @param {{ lista: string, precio: number|string|null, vigente_desde: string|Date, usuario: string|null, fuente: string|null } | undefined} r */
function ultimoCambioDe(r) {
  if (!r) return null
  return { lista: r.lista, precio: r.precio == null ? null : Number(r.precio), cuando: new Date(r.vigente_desde).toISOString(), quien: QUIEN[r.usuario ?? ''] ?? r.usuario ?? null, copia: r.usuario in QUIEN }
}

/**
 * Las vistas, en el orden del diseño: [clave, nombre, ¿entra la fila?]. Las que dicen lo que FALTA (costo, mayorista,
 * proveedor, código) son lo que hay que completar antes de dejar GN.
 * @type {Array<[string, string, (f: FilaProducto) => boolean]>}
 */
export const VISTAS = [
  ['todos', 'Todos', () => true],
  ['constock', 'Con stock', (f) => f.disponible > 0],
  ['sinstock', 'Sin stock', (f) => f.disponible <= 0],
  ['oculto', 'Ocultos en Tienda Nube', (f) => f.tn === 'oculto'],
  ['notn', 'No están en Tienda Nube', (f) => f.tn === 'no'],
  ['sincosto', 'Sin costo', (f) => f.costo == null],
  ['sinmay', 'Sin precio mayorista', (f) => f.precios.mayorista == null],
  ['sinprov', 'Sin proveedor', (f) => !f.proveedor],
  ['sinbarra', 'Sin código de barras', (f) => f.sinBarra],
]

/** Cuántos hay en cada vista (sobre lo que ya filtró el buscador y la línea). @param {FilaProducto[]} filas */
export function contarVistas(filas) {
  return Object.fromEntries(VISTAS.map(([k, , entra]) => [k, filas.filter(entra).length]))
}

/**
 * La vista y el buscador. El buscador lee nombre, categoría, proveedor y los SKU; un código de barras entero, exacto.
 * @param {FilaProducto[]} filas @param {{ vista?: string, q?: string, linea?: string }} o
 */
export function filtrar(filas, { vista = 'todos', q = '', linea = '' } = {}) {
  const entra = VISTAS.find(([k]) => k === vista)?.[2] ?? (() => true)
  const t = normal(q)
  const barra = q.trim()
  return filas.filter((f) => entra(f) && (!linea || f.linea === linea)
    && (!t || f.variantes.some((v) => v.barcode === barra)
      || normal(`${f.nombre} ${f.categoria ?? ''} ${f.proveedor ?? ''} ${f.variantes.map((v) => v.sku ?? '').join(' ')}`).includes(t)))
}

/** El resumen de lo filtrado, ARRIBA de la lista. @param {FilaProducto[]} filas */
export function resumen(filas) {
  let variantes = 0, disponible = 0, sinCosto = 0, fueraDeTn = 0
  for (const f of filas) {
    variantes += f.variantes.length
    disponible += f.disponible
    if (f.costo == null) sinCosto++
    if (f.tn !== 'publicado') fueraDeTn++
  }
  return { productos: filas.length, variantes, disponible, sinCosto, fueraDeTn }
}

const ORDEN_TN = { publicado: 0, oculto: 1, no: 2 }

/**
 * Por columna (↓ ↑); sin orden elegido, por nombre (como se buscan). Un precio que falta va al final en los dos sentidos
 * ⛔: va abajo al ordenar de mayor a menor (−∞), que es como se busca «el más caro».
 * @param {FilaProducto[]} filas @param {{ col: string, dir: 'asc' | 'desc' } | null} orden
 */
export function ordenar(filas, orden) {
  const k = orden?.col
  const dir = orden?.dir === 'asc' ? 1 : -1
  const val = (f) => (k === 'disp' ? f.disponible : k === 'var' ? f.variantes.length : k === 'costo' ? (f.costo ?? -Infinity)
    : k === 'tn' ? -ORDEN_TN[f.tn] : LISTAS.includes(k) ? (f.precios[k] ?? -Infinity)
      : k === 'cat' ? normal(f.categoria ?? '') : k === 'prov' ? normal(f.proveedor ?? '') : normal(f.nombre))
  const porNombre = (a, b) => normal(a.nombre).localeCompare(normal(b.nombre))
  return filas.slice().sort((a, b) => {
    if (!k) return porNombre(a, b)
    const x = val(a), y = val(b)
    return (x > y ? 1 : x < y ? -1 : 0) * dir || porNombre(a, b)
  })
}

/**
 * Las columnas: clave → [título, ancho, ordena, fija]. 🔴 Cada ancho lleva su MÍNIMO en px (`ListaTrabajo` › `anchoMinimo`):
 * las de siempre suman ~1.000 px con el tilde y los íconos, para entrar a 1333 px al lado del menú del ERP, como Ventas.
 * @returns {Record<string, [string, string, boolean, boolean]>}
 */
export function columnasDe() {
  return {
    p: ['Producto', 'minmax(220px, 2fr)', true, true],
    var: ['Variantes', '84px', true, false],
    disp: ['Disponible', '92px', true, true],
    costo: ['Costo', '96px', true, false],
    local: ['Local', '96px', true, false],
    online: ['Online', '96px', true, false],
    mayorista: ['Mayorista', '96px', true, false],
    tn: ['En Tienda Nube', '128px', true, false],
    cat: ['Categoría', 'minmax(120px, 1fr)', true, false],
    prov: ['Proveedor', 'minmax(120px, 1fr)', true, false],
    linea: ['Línea', '76px', false, false],
  }
}

/** Las de siempre: el orden y cuáles se ven al entrar (o con «Volver a las de siempre»). */
export function columnasDeSiempre() {
  return { orden: ['p', 'var', 'disp', 'costo', 'local', 'online', 'mayorista', 'tn', 'cat', 'prov', 'linea'], visibles: ['p', 'var', 'disp', 'costo', 'local', 'mayorista', 'tn'] }
}

/** @param {unknown} raw */
export const normalizarPrefs = (raw) => normalizarPrefsDe(columnasDe(), columnasDeSiempre(), raw)
export const alternarColumna = (prefs, col) => alternarColumnaDe(columnasDe(), prefs, col)
export { moverColumna }
