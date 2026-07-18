/**
 * Lógica pura del Catálogo de Marketing. Port de las funciones mkt* del legacy
 * (index.html:8822-9199), sin DOM: arma la lista enriquecida (GN ⨯ TN), evalúa el
 * estado de cada ficha, filtra/ordena, y calcula las ventas por canal de la fila
 * de detalle.
 *
 * El matcheo GN↔TN es el de `lib/tn.ts` (indexarTn/matchTn), el MISMO que ya usan
 * Productos/Márgenes: Marketing lo compartía en el legacy vía `_mktIndexTN`/
 * `_mktFindTN`, que son idénticos a `tnEntryForProducto`. Acá no se duplica.
 */

import type { Producto, FilaVenta, FilaDetalle } from '../etl/tipos'
import type { Marca } from '../nav.generated'
import { indexarTn, matchTn, type TnProducto } from '../tn'

/** El estado de la ficha en TN, en orden de prioridad (el primero que aplica gana). */
export type Calidad = 'not-in-tn' | 'no-publicado' | 'sin-foto' | 'sin-desc' | 'sin-tabla' | 'pocas-fotos' | 'ok'

/** Las opciones del filtro multi de estado (mktMatchCalidad). */
export type FiltroCalidad =
  | 'sin-foto'
  | 'pocas-fotos'
  | 'sin-desc'
  | 'sin-tabla'
  | 'sin-foto-desc'
  | 'no-publicado'
  | 'var-sin-foto'
  | 'top-low-stock'

/** Un producto GN enriquecido con su ficha TN. Port de la fila de _mktBuildLista. */
export type ItemMkt = {
  gn: Producto
  tn: TnProducto
  stock: number
  sales30: number
  categoriasTN: string[]
  categoriasTNStr: string
  calidad: Calidad
  topLowStock: boolean
  ingresoMes: string | null
}

/** Talles solo aplica a Zattia (ropa); BDI (fundas) no tiene tabla de talles. */
export function aplicaTalles(marca: Marca): boolean {
  return marca === 'zattia'
}

/** ¿La descripción de TN ya trae la tabla de talles? Port de _mktTieneTabla. */
export function tieneTabla(tn: TnProducto): boolean {
  const d = tn.raw_desc || ''
  return /AREBEN-TALLES-INI/.test(d) || /<table/i.test(d)
}

/**
 * Compone la lista enriquecida: para cada producto GN, le pega su ficha TN y evalúa
 * el estado. Solo devuelve los que están en TN (política de la empresa, igual que el
 * `.filter(x => x.tn)` del legacy). Port de _mktBuildLista.
 */
export function buildLista(productos: Producto[], tnProducts: TnProducto[], marca: Marca): ItemMkt[] {
  const idx = indexarTn(tnProducts) // todos (no soloConImagenes): idéntico a _mktIndexTN
  const verTalles = aplicaTalles(marca)
  return productos
    .map((gn): ItemMkt | null => {
      const tn = matchTn(gn, idx)
      if (!tn) return null // Marketing solo muestra productos que están en TN
      const stockReal = gn.stock || 0
      let calidad: Calidad = 'ok'
      if (!tn.published) calidad = 'no-publicado'
      else if (tn.image_count === 0) calidad = 'sin-foto'
      else if (!tn.has_desc) calidad = 'sin-desc'
      else if (verTalles && !tieneTabla(tn)) calidad = 'sin-tabla'
      else if ((tn.image_count ?? 0) <= 2) calidad = 'pocas-fotos'
      return {
        gn,
        tn,
        stock: stockReal,
        sales30: gn.sales30 || 0,
        categoriasTN: tn.categories || [],
        categoriasTNStr: (tn.categories || []).join(', '),
        calidad,
        topLowStock: (gn.sales30 || 0) >= 5 && stockReal <= 5,
        ingresoMes: gn.ingresoMes || (tn.created_at ? tn.created_at.substring(0, 7) : null),
      }
    })
    .filter((x): x is ItemMkt => x !== null)
}

/** ¿El ítem matchea una opción del filtro de estado? Port de mktMatchCalidad. */
export function matchCalidad(x: ItemMkt, c: FiltroCalidad, marca: Marca): boolean {
  const tn = x.tn
  const img = tn.image_count ?? 0
  if (c === 'sin-foto') return img === 0
  if (c === 'pocas-fotos') return img > 0 && img <= 2
  if (c === 'sin-desc') return !tn.has_desc
  if (c === 'sin-tabla') return aplicaTalles(marca) && !!tn.has_desc && !tieneTabla(tn)
  if (c === 'sin-foto-desc') return img === 0 && !tn.has_desc
  if (c === 'no-publicado') return !tn.published
  if (c === 'var-sin-foto') return img > 0 && (tn.variantes_total || 0) > 1 && (tn.variantes_sin_foto || []).length > 0
  if (c === 'top-low-stock') return x.topLowStock
  return true
}

export type Columna = 'name' | 'cat_tn' | 'stock' | 'sales30'
export type OrdenState = { col: Columna; dir: 1 | -1 }

export type Filtros = {
  q: string
  cohortes: Set<string>
  catTn: string
  /** '' | 'con' | 'sin' | 'rango'. */
  stock: string
  stockMin: string
  stockMax: string
  calidades: Set<FiltroCalidad>
}

export const FILTROS_VACIOS: Filtros = {
  q: '',
  cohortes: new Set(),
  catTn: '',
  stock: '',
  stockMin: '',
  stockMax: '',
  calidades: new Set(),
}

/**
 * Aplica todos los filtros + orden a la lista ya compuesta. Port de _mktListaFiltrada
 * (la lista base se pasa hecha para no recomputar el matcheo en cada tecla).
 */
export function filtrarYOrdenar(base: ItemMkt[], f: Filtros, orden: OrdenState, marca: Marca): ItemMkt[] {
  let lista = base
  const q = f.q.toLowerCase().trim()
  if (q) lista = lista.filter((x) => x.gn.name.toLowerCase().includes(q) || (x.gn.sku || '').toLowerCase().includes(q))
  if (f.cohortes.size) lista = lista.filter((x) => x.ingresoMes !== null && f.cohortes.has(x.ingresoMes))
  if (f.catTn) lista = lista.filter((x) => x.categoriasTN.includes(f.catTn))
  if (f.stock === 'con') lista = lista.filter((x) => (x.stock || 0) > 0)
  else if (f.stock === 'sin') lista = lista.filter((x) => (x.stock || 0) <= 0)
  else if (f.stock === 'rango') {
    const mn = parseInt(f.stockMin)
    const mx = parseInt(f.stockMax)
    if (!isNaN(mn)) lista = lista.filter((x) => (x.stock || 0) >= mn)
    if (!isNaN(mx)) lista = lista.filter((x) => (x.stock || 0) <= mx)
  }
  if (f.calidades.size) lista = lista.filter((x) => [...f.calidades].some((c) => matchCalidad(x, c, marca)))
  const { col, dir } = orden
  return [...lista].sort((a, b) => {
    if (col === 'name') return dir * (a.gn.name || '').localeCompare(b.gn.name || '')
    if (col === 'cat_tn') return dir * (a.categoriasTNStr || '').localeCompare(b.categoriasTNStr || '')
    return dir * ((a[col] || 0) - (b[col] || 0))
  })
}

/** Los KPIs del encabezado. Port de los conteos de mktRenderStats. */
export type Stats = { sinFoto: number; sinDesc: number; sinTabla: number; sinAmbos: number; topLow: number }

export function calcularStats(base: ItemMkt[], marca: Marca): Stats {
  return {
    sinFoto: base.filter((x) => (x.tn.image_count ?? 0) === 0).length,
    sinDesc: base.filter((x) => !x.tn.has_desc).length,
    sinTabla: aplicaTalles(marca) ? base.filter((x) => x.tn.has_desc && !tieneTabla(x.tn)).length : 0,
    sinAmbos: base.filter((x) => (x.tn.image_count ?? 0) === 0 && !x.tn.has_desc).length,
    topLow: base.filter((x) => x.topLowStock).length,
  }
}

/** Los meses de ingreso presentes (para el multi de cohortes), más nuevo primero. */
export function cohortesDisponibles(productos: Producto[]): string[] {
  const meses = new Set<string>()
  productos.forEach((p) => {
    if (p.ingresoMes) meses.add(p.ingresoMes)
  })
  return [...meses].sort().reverse()
}

/** Las categorías de TN presentes (para el select), alfabético. Port de mktPopulateCategorias. */
export function categoriasDisponibles(tnProducts: TnProducto[]): string[] {
  const cats = new Set<string>()
  for (const p of tnProducts) (p.categories || []).forEach((c) => cats.add(c))
  return [...cats].sort()
}

/**
 * Unidades vendidas de un producto en los últimos `dias`, separadas Local vs Tienda
 * online. Port de _mktVentasPorCanal + _mktVentaCanal: el canal sale de la venta
 * (regex tienda nube|online), la cantidad del detalle. `today` congelado al montar.
 */
export function ventasPorCanal(
  pid: string,
  dias: number,
  ventas: FilaVenta[],
  detalles: FilaDetalle[],
  today: Date,
): { local: number; online: number } {
  const canal: Record<string, { f: string; online: boolean }> = {}
  ventas.forEach((v) => {
    canal[String(v.id)] = { f: (v.date_sale || '').substring(0, 10), online: /tienda *nube|online/i.test(v.channel || '') }
  })
  const cut = new Date(today)
  cut.setDate(cut.getDate() - dias)
  const cutStr = cut.toISOString().substring(0, 10)
  let local = 0
  let online = 0
  detalles.forEach((it) => {
    if (String(it.product_id) !== String(pid)) return
    const s = canal[String(it.sale_id)]
    if (!s) return
    if (dias && s.f && s.f < cutStr) return
    const q = it.quantity || 1
    if (s.online) online += q
    else local += q
  })
  return { local, online }
}

/** URLs públicas (tienda) y de admin de TN, por marca. Port de los base de mktRender. */
export function tiendaBaseUrl(marca: Marca): string {
  return marca === 'zattia' ? 'https://zattia.com.ar' : 'https://bdiaccesorios.com.ar'
}
export function adminBaseUrl(marca: Marca): string {
  return marca === 'zattia'
    ? 'https://zattiaco.mitiendanube.com/admin/products'
    : 'https://bdiaccesorios4.mitiendanube.com/admin/products'
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** "Jul 25" a partir de "2025-07". Port de _mesLabel. */
export function mesLabelCorto(yyyymm: string): string {
  const [y, mo] = yyyymm.split('-')
  return MESES[parseInt(mo) - 1] + ' ' + y.slice(2)
}
/** "Jul 2025" a partir de "2025-07" (para el multi de cohortes). */
export function mesLabelLargo(yyyymm: string): string {
  const [y, mo] = yyyymm.split('-')
  return MESES[parseInt(mo) - 1] + ' ' + y
}
