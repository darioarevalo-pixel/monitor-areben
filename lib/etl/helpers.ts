/**
 * Helpers puros del ETL. Port literal de index.html:2114-2151 y 2721.
 *
 * Los del legacy leían el global TODAY; acá la fecha viaja como parámetro. Es el
 * único cambio: ninguna fórmula se tocó.
 */

import type { Fase } from './tipos'

/** daysSince (index.html:2114). 999 es el centinela de "nunca se vendió". */
export function daysSince(dateStr: string | null | undefined, today: Date): number {
  if (!dateStr) return 999
  return Math.round((today.getTime() - new Date(dateStr).getTime()) / 86400000)
}

/** lifespanDays (index.html:2119): a cuántos días de stock equivale el ritmo de los últimos 30. */
export function lifespanDays(stock: number, sales30: number): number | null {
  if (!sales30 || sales30 <= 0) return null
  return Math.round((stock / sales30) * 30)
}

/** lifespanDaysGeneric (index.html:2130): igual que lifespanDays pero con período arbitrario. */
export function lifespanDaysGeneric(stock: number, sales: number, periodDays: number): number | null {
  if (!sales || sales <= 0) return null
  return Math.round((stock / sales) * periodDays)
}

/**
 * Texto de vida útil estimada. Port de formatLifespan (index.html:2143): sin dato
 * → "Sin movimiento" si hay stock, "—" si no; y buckets de +1 año / meses / días.
 */
export function formatLifespan(d: number | null, stock: number): string {
  if (d === null) return stock > 0 ? 'Sin movimiento' : '—'
  if (d > 365) return '+1 año'
  if (d > 60) return Math.round(d / 30) + ' meses'
  return d + ' días'
}

/** lifespanDaysFromFirst (index.html:2721): igual pero contra el promedio desde la primera venta. */
export function lifespanDaysFromFirst(
  stock: number,
  total: number,
  firstSale: string | null,
  today: Date,
): number | null {
  if (!firstSale || !total || total <= 0) return null
  const days = daysSince(firstSale, today)
  if (days <= 0) return null
  return Math.round((stock / total) * days)
}

/**
 * getPhase (index.html:2144). El orden importa: obsoleto y dormido ganan por
 * antigüedad antes de que se mire el ritmo de ventas.
 */
export function getPhase(salesPrev: number, salesCurr: number, dsl: number): Fase {
  if (dsl > 60) return { label: 'obsoleto', cls: 'badge-danger' }
  if (dsl > 30) return { label: 'dormido', cls: 'badge-warning' }
  const ratio = salesPrev > 0 ? salesCurr / salesPrev : salesCurr > 0 ? 2 : 0
  if (ratio > 1.3) return { label: 'crecimiento', cls: 'badge-success' }
  if (ratio >= 0.7) return { label: 'madurez', cls: 'badge-info' }
  return { label: 'declive', cls: 'badge-warning' }
}

/** Talles que extractColor descarta cuando aparecen donde iría un color. */
const TALLE_VALS = new Set([
  's', 'm', 'l', 'xl', 'xxl', 'xs', 'xxxl', 'xss',
  '32', '34', '36', '38', '40', '42', '44', '46', '48', '50',
])

function toTitleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** Marca de "el producto no tiene variantes de color": el color sale de colorManualMap. */
export const COLOR_UNICA = '__UNICA__'

/** extractColor (index.html:2477), que estaba anidada dentro de computarDatos. */
export function extractColor(size: string | null | undefined): string | null {
  if (!size) return null
  const raw = size.trim()
  const lower = raw.toLowerCase()
  if (lower === 'variante única' || lower === 'variante unica') return COLOR_UNICA
  // Formato "Parte1 - Parte2": separar y descartar talles
  if (raw.includes(' - ')) {
    const parts = raw.split(' - ').map((p) => p.trim()).filter(Boolean)
    const colorParts = parts.filter((p) => !TALLE_VALS.has(p.toLowerCase()))
    if (colorParts.length === 0) return null // todo son talles
    return toTitleCase(colorParts[0])
  }
  // Valor único: descartar si es talle
  if (TALLE_VALS.has(lower)) return null
  return toTitleCase(raw)
}

/** PostgREST devuelve `numeric` como string; el legacy hace parseFloat en cada uso. */
export function num(v: number | string | null | undefined): number {
  return parseFloat(String(v)) || 0
}
