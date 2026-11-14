/**
 * ERP › Stock › Diferencias › «Chequeo del libro»: las REGLAS DEL PROPIO LIBRO (`motor/invariantes.mjs`, las mismas que corre
 * cada noche el workflow «Reglas del libro» del motor), corridas EN VIVO para una base (Bruno 10-nov: «ver contenciones
 * nocturnas para chequeo correcto de los movimientos»). Antes sólo se veían en el log de Actions; los avisos ⛔ se guardaban.
 *
 * Puro: ordena y nombra lo que devuelve `revisarLibro` (`{ id, titulo, gravedad, total, ejemplos, omitida? }`).
 *   falla    gravedad «falla» con filas: un error nuestro (abre la alerta de la noche)
 *   aviso    gravedad «aviso» con filas: una pista (un negativo hoy es normal mientras GN viva)
 *   omitida  la base ⛔ tiene la tabla que la regla necesita: ⛔ se evaluó (⛔ es «bien»)
 *   ok       0 filas
 */

const ORDEN = { falla: 0, aviso: 1, omitida: 2, ok: 3 }

/** Los títulos del motor hablan su jerga («libro», «GN», «motor»): en pantalla, las palabras del negocio (VOCABULARIO.md §5). */
const PALABRAS = [[/\ben el libro\b/g, 'en los movimientos de stock'], [/\bal libro\b/g, 'al stock'], [/\bel libro\b/g, 'los movimientos de stock'], [/\bdel motor\b/g, 'de Areben Gestión'], [/\bGN\b/g, 'Gestión Nube'], [/\bTN\b/g, 'Tienda Nube'], [/\bML\b/g, 'Mercado Libre'], [/\bcuya prenda\b/g, 'cuyo producto'], [/\bprendas\b/g, 'productos'], [/\bprenda\b/g, 'producto']]
export const enPalabras = (t) => PALABRAS.reduce((x, [re, por]) => x.replace(re, por), String(t))

/** @param {{ gravedad: string, total: number, omitida?: string | false | null }} r */
export function estadoDeRegla(r) {
  if (r.omitida) return 'omitida'
  if (!(r.total > 0)) return 'ok'
  return r.gravedad === 'falla' ? 'falla' : 'aviso'
}

/**
 * @param {Array<{ id: string, titulo: string, gravedad: string, total: number, ejemplos?: Array<{ ref?: unknown, detalle?: unknown }>, omitida?: string | false | null }>} resultados
 * @returns {{ reglas: Array<{ id: string, titulo: string, estado: string, total: number, ejemplos: Array<{ ref: string, detalle: string }>, porque: string | null }>, cuenta: Record<string, number> }}
 */
export function chequeoDelLibro(resultados) {
  if (!Array.isArray(resultados)) throw new Error('chequeoDelLibro: faltan los resultados de las reglas.')
  const reglas = resultados.map((r) => ({
    id: String(r.id),
    titulo: enPalabras(r.titulo),
    estado: estadoDeRegla(r),
    total: Number(r.total) || 0,
    ejemplos: (r.ejemplos ?? []).map((e) => ({ ref: String(e?.ref ?? ''), detalle: String(e?.detalle ?? '') })),
    porque: r.omitida ? String(r.omitida) : null,
  }))
  reglas.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || b.total - a.total)
  const cuenta = { falla: 0, aviso: 0, omitida: 0, ok: 0 }
  for (const r of reglas) cuenta[r.estado]++
  return { reglas, cuenta }
}
