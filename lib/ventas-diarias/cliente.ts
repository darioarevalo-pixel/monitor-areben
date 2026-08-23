/**
 * La serie diaria, del lado del navegador (`/api/datos?recurso=ventas-diarias`).
 *
 * ⛔ **Un solo verbo, y de lectura.** La pantalla no escribe nada: es la misma serie que el
 * servidor arma sobre el espejo. El botón que sí escribe —«Traer las ventas de hoy»— vive en Ventas
 * de Marketing y tiene su propio antirrebote; ponerle un segundo botón acá sería un segundo reloj
 * para la misma llamada a Gestión Nube.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { SerieDiaria } from './index'

export type RespuestaSerie = SerieDiaria & {
  /** El primer día consultado, siete antes del primero visible: es el término de comparación. */
  desde: string
  hasta: string
  /** El primer día que se muestra. */
  visible: string
  /** Día argentino de la última lectura del espejo, o `null` si no se pudo saber. */
  medidoHasta: string | null
}

export async function leerSerieDiaria(store: string, dias: number): Promise<RespuestaSerie> {
  // `nc` corta el caché del navegador: la serie cambia cuando alguien aprieta «Traer las ventas de
  // hoy» en Ventas de Marketing, que es otra pantalla, y volver acá tiene que mostrar lo nuevo.
  const r = await apiFetch(`/api/datos?recurso=ventas-diarias&store=${encodeURIComponent(store)}&dias=${dias}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer la venta diaria.')
  return d as RespuestaSerie
}
