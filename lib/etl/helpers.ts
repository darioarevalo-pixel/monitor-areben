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
 * Vida útil dividiendo por los días que el producto **estuvo realmente a la venta**, no por los de
 * la ventana. No es un port: corrige a `lifespanDaysGeneric`, que se deja intacta porque los tests
 * de paridad con el legacy la miden.
 *
 * El problema que arregla: una funda de 6 días con 243 vendidas y 634 de stock daba "3 meses"
 * porque las 243 se repartían entre los 30 días de la ventana en vez de entre los 6 que vivió. El
 * ritmo real es 40,5 por día, no 8,1, y el stock dura 16 días, no 78.
 *
 * Para un producto viejo no cambia nada: `min(30, 240)` sigue siendo 30.
 */
export function lifespanDaysEfectivo(
  stock: number,
  sales: number,
  periodDays: number,
  diasVivo: number | null,
): number | null {
  if (!sales || sales <= 0) return null
  // El piso de 1 evita dividir por cero el día que el producto se da de alta y vende.
  const dias = Math.max(1, Math.min(periodDays, diasVivo ?? periodDays))
  return Math.round((stock / sales) * dias)
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

/** Por debajo de esto un producto es "nuevo": no tiene 30 días previos contra los cuales medirse. */
export const DIAS_PRODUCTO_NUEVO = 30

/**
 * getPhase (index.html:2144). El orden importa: obsoleto y dormido ganan por
 * antigüedad antes de que se mire el ritmo de ventas.
 *
 * `nuevo` se agregó al port y va **primero de todo**, porque a un producto recién ingresado las
 * otras cuatro etiquetas le mienten en las dos direcciones: si vendió cae siempre en "crecimiento"
 * (el ratio compara contra los 30 días anteriores, que están vacíos, y se fija en 2), y si todavía
 * no vendió cae en "obsoleto" con `dsl` en 999. Ninguna de las dos dice nada.
 */
export function getPhase(salesPrev: number, salesCurr: number, dsl: number, diasVivo: number | null): Fase {
  // Gris a propósito: "nuevo" no es una buena ni una mala noticia, es que todavía no hay con qué
  // medir. Si fuera badge-info se vería igual que "madurez", que sí es un juicio.
  if (diasVivo !== null && diasVivo < DIAS_PRODUCTO_NUEVO) return { label: 'nuevo', cls: 'badge-gray' }
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
