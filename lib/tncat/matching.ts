/**
 * Matcheo de productos y colores para la Carga de imágenes (card 2). Port de las
 * funciones `_norm`/`_lev`/`_tnImg*` del legacy (index.html:8157-8229). Todo puro:
 * decide a qué producto y color va cada foto por el nombre del archivo.
 */

import type { ProductoImg } from './tipos'

/** Minúsculas, sin acentos, espacios colapsados. Port de _norm. */
export function norm(s: string | null | undefined): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Distancia de edición (Levenshtein) para tolerar typos chicos. Port de _lev. */
export function lev(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}

/** Limpia el nombre de archivo (saca extensión, numeración, sufijos). Port de _tnImgLimpiarNombre. */
export function limpiarNombre(name: string): string {
  return String(name || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[\s_\-]*\(?\d+\)?$/, '')
    .replace(/[\s_\-]*(copia|copy|final|editad[ao]s?|foto)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Producto que mejor matchea un texto normalizado: exacto → empieza con → typo único. Port de _tnImgBuscarProd. */
export function buscarProd(productos: ProductoImg[], low: string): ProductoImg | null {
  if (!low) return null
  const exacto = productos.find((x) => norm(x.name) === low)
  if (exacto) return exacto
  const pref = productos.filter((x) => {
    const xn = norm(x.name)
    return low.startsWith(xn) || xn.startsWith(low)
  })
  if (pref.length === 1) return pref[0]
  // Typos: solo si hay un único producto "cerca" y el nombre es razonablemente largo.
  if (low.length >= 5) {
    const cerca = productos
      .map((x) => ({ x, d: lev(norm(x.name), low) }))
      .filter((o) => o.d <= 2)
      .sort((a, b) => a.d - b.d)
    if (cerca.length === 1 || (cerca.length > 1 && cerca[0].d < cerca[1].d)) return cerca[0].x
  }
  return null
}

/** Producto por nombre de archivo (limpia y busca). Port de _tnImgMatchByFilename. */
export function matchByFilename(productos: ProductoImg[], filename: string): ProductoImg | null {
  return buscarProd(productos, norm(limpiarNombre(filename)))
}

/** Producto desde el texto del buscador ("Nombre (SKU)" exacto, o búsqueda general). Port de _tnImgFindProd. */
export function findProd(productos: ProductoImg[], txt: string): ProductoImg | null {
  const t = norm(txt)
  if (!t) return null
  const base = t.replace(/\s*\(.*\)\s*$/, '').trim()
  const porNombreSku = productos.find((p) => norm(p.name + (p.sku ? ' (' + p.sku + ')' : '')) === t)
  return porNombreSku || buscarProd(productos, base)
}

/** Color auto-detectado por el nombre de archivo, entre los colores del producto. */
export function colorPorNombre(prod: ProductoImg | null, filename: string): string {
  if (!prod || !prod.colores || !prod.colores.length) return ''
  const fl = norm(filename)
  return prod.colores.find((c) => fl.includes(norm(c))) || ''
}
