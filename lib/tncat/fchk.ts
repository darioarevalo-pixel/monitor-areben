/**
 * Predicados de "Revisar fotos por variante" (card 3). Port de las funciones
 * `_fchk*` del legacy (index.html:8394-8441). Puros: deciden qué producto tiene un
 * problema de fotos y filtran/buscan la lista.
 */

import type { FiltroFchk, ProductoFchk } from './tipos'

/**
 * Colores (reales) de un producto cuyas variantes NO tienen foto vinculada. Ignora
 * variantes sin color (single): esas usan la principal y no son "un problema".
 * Port de _fchkColoresSinFoto.
 */
export function coloresSinFoto(p: ProductoFchk): string[] {
  const by: Record<string, boolean> = {}
  ;(p.variantes || []).forEach((v) => {
    const c = v.color
    if (!c) return
    if (!(c in by)) by[c] = false
    if (v.image_url) by[c] = true
  })
  return Object.keys(by).filter((c) => !by[c])
}

/** Tiene fotos pero algún color quedó sin vincular. Port de _fchkSinVincular. */
export function sinVincular(p: ProductoFchk): boolean {
  return (p.image_count ?? 0) > 0 && coloresSinFoto(p).length > 0
}
/** No tiene ninguna foto. Port de _fchkSinFoto. */
export function sinFoto(p: ProductoFchk): boolean {
  return !p.image_count
}
/** Tiene algún problema (sin vincular o sin foto). Port de _fchkProblema. */
export function problema(p: ProductoFchk): boolean {
  return sinVincular(p) || sinFoto(p)
}

/** El predicado del filtro activo. */
export function predicadoDe(f: FiltroFchk): (p: ProductoFchk) => boolean {
  return f === 'sinvincular' ? sinVincular : f === 'sinfoto' ? sinFoto : problema
}

/** Filtra por el filtro activo + búsqueda por nombre, ordena y devuelve la lista. Port de fchkListaHtml. */
export function filtrar(data: ProductoFchk[], filtro: FiltroFchk, busqueda: string): ProductoFchk[] {
  const q = busqueda.trim().toLowerCase()
  let lista = data.filter(predicadoDe(filtro))
  if (q) lista = lista.filter((p) => (p.name || '').toLowerCase().includes(q))
  return lista.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
}

/**
 * Los tres recortes que hacen usable la revisión: son ~220 productos y la mayoría no
 * necesitan atención hoy.
 *
 * - **sin stock**: una foto sirve para vender; si no hay unidades, arreglarla no es
 *   urgente. El stock sale de Gestión Nube (fuente de verdad), no de TiendaNube.
 * - **ignorados**: los que nunca van a tener foto porque no son de la tienda —mayoristas,
 *   pruebas—. Se marcan a mano una vez y dejan de aparecer.
 * - **categoría**: recorrer por categoría en vez de enfrentarse a la lista entera.
 */
export type RecortesFchk = {
  /** Solo los que tienen stock. `stockPorProducto` viene del ETL de GN, por id de TN. */
  soloConStock?: boolean
  stockPorTn?: Map<string, number>
  /** Ids de TN marcados como "no me interesa" (persistentes). */
  ignorados?: Set<string>
  /** Nombre exacto de la categoría de TN, o null para todas. */
  categoria?: string | null
}

export function aplicarRecortes(data: ProductoFchk[], r: RecortesFchk): ProductoFchk[] {
  return data.filter((p) => {
    const id = String(p.id)
    if (r.ignorados?.has(id)) return false
    if (r.categoria && !(p.categories || []).includes(r.categoria)) return false
    if (r.soloConStock) {
      // Sin dato de stock se MUESTRA: preferimos que sobre un producto a esconder uno que
      // sí hay que arreglar (el match GN⨯TN es difuso y puede no encontrarlo).
      const s = r.stockPorTn?.get(id)
      if (s !== undefined && s <= 0) return false
    }
    return true
  })
}

/** Las categorías presentes en la lista, ordenadas y sin repetir (para el desplegable). */
export function categoriasDe(data: ProductoFchk[]): string[] {
  const set = new Set<string>()
  for (const p of data) for (const c of p.categories || []) if (c) set.add(c)
  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}

/** Los colores de un producto con su foto vinculada (o null), para la fila del detalle. */
export function coloresConFoto(p: ProductoFchk): { color: string; foto: string | null }[] {
  const by: Record<string, { foto: string | null }> = {}
  ;(p.variantes || []).forEach((v) => {
    const c = v.color
    if (!c) return
    if (!by[c]) by[c] = { foto: null }
    if (v.image_url && !by[c].foto) by[c].foto = v.image_url
  })
  return Object.entries(by).map(([color, o]) => ({ color, foto: o.foto }))
}
