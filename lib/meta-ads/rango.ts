/**
 * El rango de tiempo de Meta Ads, en un solo lugar.
 *
 * Salió de `MetaAds.tsx` cuando el rango pasó a vivir en la URL junto con la cuenta y la línea: lo
 * necesitan el provider (que lo guarda), el selector (que lo dibuja) y la pantalla de números (que
 * lo traduce a lo que entiende el endpoint).
 */

import type { OpcionesMetaAds } from './cliente'
import type { PresetMetaAds } from './tipos'

/**
 * Es un superconjunto de los `date_preset` de Meta porque **«Hoy y ayer» no existe como preset**:
 * Meta tiene `today` y `yesterday` sueltos, y sus rangos relativos (`last_7d` y compañía) no
 * incluyen el día en curso. Se resuelve como rango con fechas.
 */
export type RangoUI = PresetMetaAds | 'hoy_ayer'

export const RANGOS: { k: RangoUI; label: string }[] = [
  { k: 'today', label: 'Hoy' },
  { k: 'hoy_ayer', label: 'Hoy y ayer' },
  { k: 'yesterday', label: 'Ayer' },
  { k: 'last_7d', label: 'Últimos 7 días' },
  { k: 'last_14d', label: 'Últimos 14 días' },
  { k: 'last_30d', label: 'Últimos 30 días' },
  { k: 'last_90d', label: 'Últimos 90 días' },
  { k: 'this_month', label: 'Este mes' },
  { k: 'last_month', label: 'Mes pasado' },
  { k: 'maximum', label: 'Todo el historial' },
]

export const RANGO_DEFAULT: RangoUI = 'last_30d'

/** Los rangos en los que la zona horaria de la cuenta cambia qué día se está mirando. */
export const RANGOS_CORTOS = new Set<RangoUI>(['today', 'yesterday', 'hoy_ayer'])

/** ¿Es un rango que existe? Lo que viene de la URL no se cree sin preguntar. */
export function esRango(x: string | null | undefined): x is RangoUI {
  return RANGOS.some((r) => r.k === x)
}

/**
 * Fecha ISO tomando el día LOCAL. `toISOString()` no sirve: es UTC, así que en Argentina después de
 * las 21 h devolvería el día siguiente y «hoy» saldría corrido.
 */
export const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Traduce el rango de la pantalla a lo que entiende el endpoint. */
export function opcionesDe(r: RangoUI): OpcionesMetaAds {
  if (r !== 'hoy_ayer') return { preset: r }
  const hoy = new Date()
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  return { since: isoLocal(ayer), until: isoLocal(hoy) }
}
