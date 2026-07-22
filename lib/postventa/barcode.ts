/**
 * Código de barras INTERNO de una falla. Decisión de Bruno: cada falla recibe uno nuevo propio del
 * Monitor (prefijo + marca + id de la fila, zero-padded), aunque el artículo de GN ya tenga barcode.
 * Es único por construcción (el id es único por base). El valor identifica la unidad; toda la info de
 * la falla vive en la fila (se recupera escaneando este código). Se dibuja con JsBarcode (CODE128),
 * reusando el render de lib/etiquetas/pdf.ts.
 */

export function generarBarcodeFalla(store: string, id: number): string {
  const marca = (store || '').slice(0, 1).toUpperCase() || 'X' // B (bdi) | Z (zattia)
  return `FAL${marca}${String(id).padStart(6, '0')}`
}
