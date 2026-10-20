/**
 * ⚠️ Incidencias del trabajo, del lado del cliente (Darío, 20-oct-2026). Viajan por la Agenda
 * (`action: 'incidencia-*'`); el servidor es `api/_incidencias.js`.
 */
import { apiFetch } from '@/lib/api-fetch'
export { TIPOS_INCIDENCIA, tipoIncidencia } from './incidencias.core.js'

export type TipoIncidencia = 'roto' | 'insumos' | 'otro'

export type Incidencia = {
  id: string
  autor: string
  tipo: TipoIncidencia
  texto: string
  urgente: boolean
  fotos: string[]
  estado: 'abierta' | 'resuelta'
  creado: string
  mensajes: { de: string; texto: string; at: string }[]
  resuelta?: { por: string; at: string } | null
}

async function pedir(body: Record<string, unknown>, siFalla: string): Promise<Record<string, unknown>> {
  const r = await apiFetch('/api/datos?recurso=agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'agenda', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
  return d
}

export async function leerIncidencias(): Promise<Incidencia[]> {
  const d = await pedir({ action: 'incidencias' }, 'No se pudieron leer las incidencias.')
  return (d.incidencias as Incidencia[]) || []
}

export async function crearIncidencia(i: { tipo: TipoIncidencia; texto: string; urgente: boolean; fotos: string[]; por?: string }): Promise<Incidencia> {
  const d = await pedir({ action: 'incidencia-crear', ...i }, 'No se pudo mandar la incidencia.')
  return d.incidencia as Incidencia
}

export async function responderIncidencia(id: string, texto: string, por?: string): Promise<Incidencia> {
  const d = await pedir({ action: 'incidencia-responder', id, texto, ...(por ? { por } : {}) }, 'No se pudo mandar la respuesta.')
  return d.incidencia as Incidencia
}

export async function estadoIncidencia(id: string, estado: 'abierta' | 'resuelta'): Promise<Incidencia> {
  const d = await pedir({ action: 'incidencia-estado', id, estado }, 'No se pudo cambiar el estado.')
  return d.incidencia as Incidencia
}
