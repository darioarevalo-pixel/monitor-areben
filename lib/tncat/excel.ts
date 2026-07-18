/**
 * Extracción de nombres del Excel para "Asignar categoría" (card 4). Port de la
 * parte pura de tncatAsigArchivo (index.html:7991-7993): saltea el encabezado
 * (fila 1), toma la columna A, limpia y deduplica. El parseo del XLSX en sí (lib
 * `xlsx`, ya dependencia) vive en el componente.
 */

/** rows = array de filas (cada fila un array). Devuelve los nombres únicos de la columna A, sin el encabezado. */
export function nombresDeFilas(rows: unknown[][]): string[] {
  const names = rows
    .slice(1) // saltea encabezado (fila 1)
    .map((r) => String((r && r[0]) ?? '').trim())
    .filter(Boolean)
  return [...new Set(names)]
}
