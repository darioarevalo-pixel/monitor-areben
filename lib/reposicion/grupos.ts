/**
 * Agrupamiento de productos por modelo/subcategoría, compartido por Reposición y
 * Conteo. Port de `_repoModelo`/`_repoCatGenericas`/`_repoEsPromo`/`_repoEsModeloCat`/
 * `_repoEsFundaCat` (index.html:11226-11252). Puro.
 */

/**
 * Orden de modelos de iPhone (número, luego sufijo mini/plus/pro/pro max). Port de
 * `_repoModelSort` (index.html:11216). Compartido por conteo-deposito/-estandar y reposición.
 */
export function ordenarModelo(a: string, b: string): number {
  const parse = (s: string) => {
    const m = String(s).match(/iphone\s*(\d{1,2})\s*(.*)/i)
    return { n: m ? parseInt(m[1], 10) : 99, suf: (m ? m[2] : '').toLowerCase().trim() }
  }
  const rank: Record<string, number> = { '': 0, mini: 1, e: 1, plus: 2, air: 2, pro: 3, 'pro max': 4 }
  const pa = parse(a)
  const pb = parse(b)
  if (pa.n !== pb.n) return pa.n - pb.n
  return (rank[pa.suf] ?? 9) - (rank[pb.suf] ?? 9)
}

/** Modelo de iPhone de un talle, ignorando el color (ej. "iPhone 13 Negro" → "iPhone 13"). Port de _repoModelo. */
export function modeloDe(size: string): string | null {
  const s = String(size || '').toLowerCase()
  const m = s.match(/iphone\s*(\d{1,2})\s*(pro\s*max|pro|plus|air|mini|e)?/)
  if (!m) return null
  const suf = (m[2] || '').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase())
  return ('iPhone ' + m[1] + (suf ? ' ' + suf : '')).trim()
}

export const CATS_GENERICAS = new Set([
  'productos', 'accesorios', 'accesorio', 'fundas', 'varios', 'mayorista', 'sale', 'new in', 'oferta', 'ofertas', '(sin categoría)',
])
export function esPromo(n: string): boolean {
  return /off|oferta|sale|new in|outlet|%|liquidaci|ultimos lanzamientos/i.test(n)
}
export function esModeloCat(n: string): boolean {
  return /^iphone|modelo de iphone/i.test(n)
}
export function esFundaCat(n: string): boolean {
  return /funda|^cases$/i.test(String(n || ''))
}

/**
 * El grupo de conteo de una variante: `modelo || primera categoría útil || '(otros)'`.
 * Descarta categorías genéricas, promos, de modelo, de funda y las de `catsOff`. Port
 * del armado de `grupo` en conteoInit (index.html:11383-11388).
 */
export function grupoDe(sizeName: string, category: string, catsOff: string[]): string {
  const modelo = modeloDe(sizeName)
  const off = new Set((catsOff || []).map((s) => String(s).toLowerCase()))
  const cats: string[] = []
  String(category || '').split(',').forEach((c) => {
    const t = c.trim()
    if (!t) return
    const l = t.toLowerCase()
    if (CATS_GENERICAS.has(l) || esPromo(t) || esModeloCat(t) || esFundaCat(t) || off.has(l)) return
    if (!cats.some((x) => x.toLowerCase() === l)) cats.push(t)
  })
  return modelo || cats[0] || '(otros)'
}
