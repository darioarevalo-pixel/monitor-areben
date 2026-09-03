/**
 * Helpers de tabla compartidos por las secciones analíticas con tabla ordenable y
 * paginada (`productos`, `variantes`). Port de sortList/renderPagination
 * (index.html:2676, 2692) y de la constante PAGE_SIZE (1925).
 */

/** Filas por página, igual que el legacy (index.html:1925). */
export const PAGE_SIZE = 50

/**
 * Orden estable-ish por una columna. Port de sortList (index.html:2676): strings
 * por `localeCompare`, el resto numérico con `|| 0` (los null/undefined caen a 0).
 * `dir` es +1 asc / -1 desc. No muta el arreglo.
 */
export function sortList<T>(lista: T[], col: keyof T, dir: number): T[] {
  return [...lista].sort((a, b) => {
    const va = a[col]
    const vb = b[col]
    if (typeof va === 'string') return dir * va.localeCompare(vb as string, 'es')
    return dir * ((Number(va) || 0) - (Number(vb) || 0))
  })
}

/** El slice de la página `page` (1-based). */
export function paginar<T>(lista: T[], page: number): T[] {
  return lista.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
}

/** Cantidad de páginas para `total` registros. */
export function totalPaginas(total: number): number {
  return Math.ceil(total / PAGE_SIZE)
}

/**
 * ¿Alguno de estos campos contiene el texto buscado?
 *
 * 🔑 Vive acá y no en cada tabla porque **la pregunta es la misma en las dos** y ya se contestó
 * distinto una vez: «Por producto» miraba sólo el nombre aunque dibujara el SKU y el proveedor en
 * cada fila, así que buscar por un código que estaba **a la vista** no encontraba nada. Un `q`
 * vacío no filtra, y los campos ausentes se saltean (⛔ no cuentan como "no coincide").
 */
export function matcheaTexto(q: string, campos: (string | null | undefined)[]): boolean {
  if (!q) return true
  return campos.some((c) => !!c && c.toLowerCase().includes(q))
}
