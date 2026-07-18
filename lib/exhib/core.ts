/**
 * Lógica pura del chequeo de exhibición: limpiar categorías TN, armar los ítems,
 * buscar por código (barcode/SKU normalizado), filtrar por categoría y agrupar para
 * el reporte. Port de _exhibCleanCats/exhibCargarDatos(map)/exhibMarcarPorCodigo
 * (lookup)/_exhibFiltrados/exhibGenerarPDF(grupos) (index.html:7574-7909).
 */

import { CATS_GENERICAS, esFundaCat, esModeloCat, esPromo } from '../reposicion/grupos'
import { SIN_CATEGORIA, type ExhibErrores, type ExhibEstado, type ExhibEstados, type ExhibItem } from './tipos'

/** Id estable de una variante: barcode si hay, si no productId|talle. Port de _exhibId. */
export function exhibId(it: Pick<ExhibItem, 'barcode' | 'productId' | 'size'>): string {
  return it.barcode || it.productId + '|' + it.size
}

/** Categorías TN reales (sin genéricas/promos/modelo/funda), en orden. Port de _exhibCleanCats. */
export function limpiarCats(tnCats: string[] | undefined | null): string[] {
  return (tnCats || []).filter((c) => {
    const l = String(c).toLowerCase().trim()
    return !!l && !CATS_GENERICAS.has(l) && !esPromo(c) && !esModeloCat(c) && !esFundaCat(c)
  })
}

/** Fila de inventario del Local (Supabase). */
export type FilaInvExhib = { product_id: number | string; product_name?: string | null; size_name?: string | null; sku?: string | null; barcode?: number | string | null; available_quantity?: number | null }
/** Datos TN por productId GN: imagen, categorías crudas y tnId. */
export type ProdMap = Record<string, { img: string | null; tnCats: string[]; tnId: string | number | null }>

/**
 * Arma los ítems del recorrido cruzando inventario ↔ TN, aplicando los errores de
 * categoría ya marcados (reasignan la categoría). Port de exhibItems=inv.map(...) @7610.
 */
export function construirItems(inv: FilaInvExhib[], prodMap: ProdMap, errores: ExhibErrores): ExhibItem[] {
  return inv.map((r) => {
    const pid = String(r.product_id)
    const pm = prodMap[pid] || { img: null, tnCats: [], tnId: null }
    const cleanCats = limpiarCats(pm.tnCats)
    let cat = cleanCats[0] || SIN_CATEGORIA
    const err = errores[pid]
    if (err) {
      cat = err.catCorrecta
      if (!cleanCats.includes(cat)) cleanCats.push(cat)
    }
    return {
      barcode: r.barcode ? String(r.barcode) : '',
      sku: r.sku || '',
      productId: pid,
      name: r.product_name || '—',
      size: r.size_name || '',
      qty: r.available_quantity || 0,
      img: pm.img,
      cat,
      cleanCats,
      tnId: pm.tnId,
    }
  })
}

/** Categorías presentes, alfabético con "(Sin categoría)" siempre al final. Port de catsOrden @7624. */
export function ordenarCats(items: ExhibItem[]): string[] {
  const cats = new Set<string>()
  items.forEach((it) => cats.add(it.cat))
  return [...cats].sort((a, b) => Number(a === SIN_CATEGORIA) - Number(b === SIN_CATEGORIA) || a.localeCompare(b, 'es'))
}

/** Ítems de una categoría (o todos si vacío). Port de _exhibFiltrados. */
export function filtrarPorCat(items: ExhibItem[], cat: string): ExhibItem[] {
  return cat ? items.filter((it) => it.cat === cat) : items
}

/** Normaliza un código: saca espacios/guiones, ceros a la izquierda, a minúscula. Port de norm() @7747. */
export function normCode(s: string | number | null | undefined): string {
  return String(s || '')
    .replace(/[\s-]/g, '')
    .replace(/^0+/, '')
    .toLowerCase()
}

/** Busca la variante por código: barcode exacto → barcode normalizado → SKU normalizado. Port @7750. */
export function buscarItem(items: ExhibItem[], code: string): ExhibItem | null {
  const nc = normCode(code)
  return (
    items.find((x) => x.barcode === code) ||
    items.find((x) => !!x.barcode && normCode(x.barcode) === nc) ||
    items.find((x) => !!x.sku && normCode(x.sku) === nc) ||
    null
  )
}

/** ¿El ítem escaneado NO pertenece a la categoría recorrida (según TN)? Port de `cruce` @7759. */
export function esCruce(it: ExhibItem, catSel: string): boolean {
  return !!catSel && catSel !== SIN_CATEGORIA && !it.cleanCats.includes(catSel)
}

/** Faltantes de la categoría: los que no están 'exhibido'. Port @7821/7850. */
export function faltantes(items: ExhibItem[], estados: ExhibEstados): ExhibItem[] {
  return items.filter((it) => estados[exhibId(it)] !== 'exhibido')
}

/** Cuántos faltantes todavía no tienen estado de triage. Port de sinMarcar @7853. */
export function contarSinMarcar(items: ExhibItem[], estados: ExhibEstados): number {
  return items.filter((it) => !['solucionado', 'una-unidad', 'no-encuentra'].includes(estados[exhibId(it)])).length
}

export type GrupoPDF = ExhibEstado | 'sin-marcar'

/** Agrupa la lista por estado para el reporte. Port de `grupos` @7908-7909. */
export function agruparPDF(items: ExhibItem[], estados: ExhibEstados): Record<GrupoPDF, ExhibItem[]> {
  const grupos: Record<GrupoPDF, ExhibItem[]> = { 'no-encuentra': [], solucionado: [], 'una-unidad': [], exhibido: [], 'sin-marcar': [] }
  items.forEach((it) => {
    const e = (estados[exhibId(it)] || 'sin-marcar') as GrupoPDF
    ;(grupos[e] || (grupos[e] = [])).push(it)
  })
  return grupos
}

/** Link al producto en el admin de TN para corregir la categoría. Port de _tnAdminUrl. */
export function tnAdminUrl(tnId: string | number | null, marca: 'zattia' | 'bdi'): string | null {
  if (!tnId) return null
  const base = marca === 'zattia' ? 'https://zattiaco.mitiendanube.com/admin/products' : 'https://bdiaccesorios4.mitiendanube.com/admin/products'
  return base + '/' + tnId
}
