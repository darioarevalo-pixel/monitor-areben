/**
 * Adelantos de sueldo, del lado del navegador (`/api/datos?recurso=adelantos`).
 *
 * Trae lo que vive en el dashboard: a quién se le puede adelantar y cuánto de cada adelanto ya
 * entró en una nómina. Los compromisos mismos llegan por `leerCompromisos`, como todos.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Aplicado, EmpleadoAdelanto } from './core'

export type RespuestaAdelantos = {
  empleados: EmpleadoAdelanto[]
  /** `null` si el dashboard no contestó: no se sabe qué entró en un sueldo. */
  aplicados: Aplicado[] | null
  aviso: string | null
}

export async function leerAdelantos(): Promise<RespuestaAdelantos> {
  const r = await apiFetch(`/api/datos?recurso=adelantos&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error((d && d.error) || 'No se pudieron leer los adelantos.')
  const aviso = (d?.aviso ?? null) as string | null
  return {
    empleados: (d?.empleados || []) as EmpleadoAdelanto[],
    aplicados: aviso ? null : ((d?.aplicados || []) as Aplicado[]),
    aviso,
  }
}
