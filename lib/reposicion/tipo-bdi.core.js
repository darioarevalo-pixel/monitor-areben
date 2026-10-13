/**
 * Qué es un producto de BDI: funda, vidrio (templado) o accesorio. JS plano porque lo usan también
 * los scripts (el correo de los lunes); `porVentas.ts` lo reexporta tipado.
 *
 * Si el nombre dice templado/hidrogel/vidrio, es vidrio (le gana al SKU: «VIDRIO TEMPLADO PREMIUM
 * AUTOMATICO» se cargó AC-0057). Si no, el prefijo del SKU (`F-` funda, `ATE-` vidrio, `AC-`/`SW-`
 * accesorio: medido el 12-oct-2026, cubre 1.593 de las 1.834 variantes con stock); sin SKU, el nombre
 * («CASE»/«FUNDA» = funda). El resto, accesorio.
 *
 * @param {{ name?: string | null, sku?: string | null }} it
 * @returns {'funda' | 'templado' | 'accesorio'}
 */
export function tipoBdi(it) {
  const sku = String(it.sku || '').toUpperCase()
  const n = String(it.name || '')
  if (/templad|hidrogel|vidrio/i.test(n)) return 'templado'
  // «FUNDA PARA CARGADOR» es un accesorio aunque diga funda (no es de celular).
  if (/funda para (cargador|auricular|airpods)/i.test(n)) return 'accesorio'
  if (/^F-/.test(sku)) return 'funda'
  if (/^ATE-/.test(sku)) return 'templado'
  if (/^(AC|SW)-/.test(sku)) return 'accesorio'
  if (/\bcase\b|funda/i.test(n)) return 'funda'
  return 'accesorio'
}
