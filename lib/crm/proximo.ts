/**
 * El próximo contacto de la ficha del panel: en qué estado está y qué plazos se ofrecen.
 *
 * Rediseño del panel (Darío, 19-oct-2026): la fecha es lo que más importa de la ficha, así que va
 * fija abajo, grande y con su estado. El mismo color en la ficha, en la lista «Hoy» y en «Pagos»:
 * rojo atrasado, amarillo hoy, verde agendado.
 */
import { PLAZOS_DIAS } from './core'

export type EstadoContacto = 'atrasado' | 'hoy' | 'agendado' | 'sin-fecha'

function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10))
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

/** `fecha` y `hoy` en ISO (`2026-10-19`). `dias` es cuánto falta (negativo = atrasado). */
export function estadoContacto(fecha: string | null | undefined, hoy: string): { estado: EstadoContacto; dias: number | null } {
  const f = String(fecha || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return { estado: 'sin-fecha', dias: null }
  const dias = diasEntre(hoy, f)
  if (dias < 0) return { estado: 'atrasado', dias }
  if (dias === 0) return { estado: 'hoy', dias }
  return { estado: 'agendado', dias }
}

/** «Atrasado 4 días» / «Hoy» / «Agendado» / «Sin fecha». */
export function textoEstado(e: { estado: EstadoContacto; dias: number | null }): string {
  if (e.estado === 'atrasado') return `Atrasado ${-(e.dias || 0)} ${e.dias === -1 ? 'día' : 'días'}`
  if (e.estado === 'hoy') return 'Hoy'
  if (e.estado === 'agendado') return 'Agendado'
  return 'Sin fecha'
}

/**
 * Los plazos de siempre (1 2 3 7 15 21 30) **de menor a mayor**, con el sugerido por el ritmo de
 * compra en su lugar. Si coincide con uno fijo, se marca ése y no se repite (Darío, 19-oct-2026:
 * «primero muestra 5, luego 3 y luego 1 semana» — el sugerido iba adelante y desordenaba la fila).
 */
export function plazosConSugerido(sugerido: number | null | undefined): { dias: number; sugerido: boolean }[] {
  const s = sugerido && sugerido > 0 ? Math.round(sugerido) : null
  const dias = new Set<number>(PLAZOS_DIAS)
  if (s) dias.add(s)
  return [...dias].sort((a, b) => a - b).map((d) => ({ dias: d, sugerido: d === s }))
}
