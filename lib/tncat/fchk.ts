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
