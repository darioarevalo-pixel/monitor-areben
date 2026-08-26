/**
 * "Lo que entró", del lado del navegador (`/api/datos?recurso=recepciones`).
 *
 * ⛔ Sólo lee. Estas tablas las escribe **el webhook** del sistema de Ingresos y nada más: no hay
 * alta, ni edición, ni borrado. Si algo está mal, se arregla del otro lado y se vuelve a confirmar
 * la OC — el evento nuevo pisa la fila.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { LineaRecepcion, Recepcion } from './core'

const API = '/api/datos?recurso=recepciones'

/** Un renglón con las dos fotos del cruce: la de cuando llegó y la de hoy. */
export type LineaConCruce = LineaRecepcion & {
  /** `null` = no se pudo preguntar. ⛔ No es lo mismo que "no está". */
  en_gn_hoy: boolean | null
  producto_id_hoy: string | null
}

export type EventoRoto = {
  webhook_id: string
  tipo: string
  store: string | null
  oc_id: number | null
  error: string | null
  recibido_en: string
}

export type Eventos = {
  rotos: EventoRoto[]
  /**
   * Cuándo entró el último evento, del tipo que sea. 🔑 Es el dato que separa «no llegó nada
   * todavía» de «hace tres semanas que no llega nada», que son dos problemas distintos y ninguna
   * lista vacía los puede distinguir.
   */
  ultimo: string | null
}

export async function leerRecepciones(store: string, dias: number): Promise<{ recepciones: Recepcion[]; eventos: Eventos }> {
  const r = await apiFetch(`${API}&store=${encodeURIComponent(store)}&dias=${dias}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las recepciones.')
  return {
    recepciones: (d.recepciones || []) as Recepcion[],
    eventos: (d.eventos || { rotos: [], ultimo: null }) as Eventos,
  }
}

export async function leerRecepcion(
  store: string,
  oc: string,
): Promise<{ recepcion: Recepcion; lineas: LineaConCruce[]; espejoConsultado: boolean }> {
  const r = await apiFetch(`${API}&store=${encodeURIComponent(store)}&oc=${encodeURIComponent(oc)}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo abrir la orden.')
  return {
    recepcion: d.recepcion as Recepcion,
    lineas: (d.lineas || []) as LineaConCruce[],
    espejoConsultado: Boolean(d.espejo_consultado),
  }
}
