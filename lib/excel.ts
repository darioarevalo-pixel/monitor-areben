/**
 * Excel — la única puerta a `.xlsx` del monitor.
 *
 * Las cinco pantallas que exportan y las dos que importan pasan por acá. No es sólo evitar
 * repetir seis líneas: hasta ago-2026 cada una llamaba a `xlsx` (SheetJS) por su cuenta, y
 * cuando SheetJS quedó con dos CVEs `high` sin arreglo en npm —abandonó el registry en la
 * 0.18.5 y publica sólo en su propio CDN— había **ocho** lugares que tocar en vez de uno.
 *
 * Ahora son dos librerías chicas, vivas y MIT: `write-excel-file` para escribir y
 * `read-excel-file` para leer. Las dos entran por **import dinámico** (el código no viaja en
 * el bundle de quien no exporta: eran 404 KB) y por el sub-path **`/browser`**, que es el
 * único que existe —no hay export raíz— y evita que se cuele la variante de Node.
 *
 * 🔑 **Sólo se lee `.xlsx`.** El `accept=".xlsx,.xls,.csv"` venía copiado del legacy, pero lo
 * que se sube son exportaciones de Gestión Nube y son OOXML (Excel 2007+): en un año de uso
 * no hubo un solo `.xls` binario. Si algún día aparece uno, el error se ve en pantalla —
 * antes lo abría en silencio con la librería vulnerable.
 */

/** Una celda de export: texto o número. Vacío se escribe como `''`. */
export type Celda = string | number

/** Filas de un export, la primera es el encabezado. */
export type Filas = Celda[][]

/**
 * Arma un `.xlsx` de una hoja y lo baja. `anchos` va en caracteres, uno por columna
 * (era `!cols: [{wch}]` en SheetJS).
 */
export async function descargarXlsx(
  filas: Filas,
  opciones: { archivo: string; hoja: string; anchos?: number[] },
): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile(filas, {
    sheet: opciones.hoja,
    columns: opciones.anchos?.map((width) => ({ width })),
  }).toFile(opciones.archivo)
}

/**
 * Lee la PRIMERA hoja de un `.xlsx` como array de filas, que es lo que esperan
 * `parsearTelefonos` y `nombresDeFilas`.
 *
 * 🔑 `readSheet` y no el export por defecto: el default devuelve **todas** las hojas
 * (`[{ sheet, data }]`) y quien lo confunda con las filas recibe un array de UNO.
 *
 * Las celdas vacías vienen `null` (SheetJS dejaba el agujero). Los dos consumidores ya
 * pasan todo por `?? ''`, así que da igual — pero un consumidor nuevo tiene que saberlo.
 */
export async function leerXlsx(archivo: File): Promise<unknown[][]> {
  const { readSheet } = await import('read-excel-file/browser')
  return (await readSheet(archivo)) as unknown[][]
}
