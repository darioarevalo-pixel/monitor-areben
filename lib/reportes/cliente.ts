/**
 * Reportes («Ayuda / problemas», Bruno 12-oct), del lado del cliente (`/api/datos?recurso=reportes`). Sin
 * `store`: el monitor es uno solo. La validación es la del servidor (`lib/reportes/core.core.js`).
 */
import { apiFetch } from '@/lib/api-fetch'

const API = '/api/datos?recurso=reportes'

export type TipoReporte = 'falta' | 'problema'
export type Reporte = {
  id: string
  creado_en: string
  autor: string
  tipo: TipoReporte
  texto: string
  seccion: string | null
  url: string | null
  estado: 'abierto' | 'resuelto'
  resuelto_por: string | null
  resuelto_en: string | null
}

/** ⚠️ El `Content-Type: application/json` NO es opcional: sin él Vercel no parsea el cuerpo. */
async function pedirPost<T>(body: Record<string, unknown>, siFalla: string): Promise<T> {
  const r = await apiFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recurso: 'reportes', ...body }) })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
  return d as T
}

export const crearReporte = (r: { tipo: TipoReporte; texto: string; seccion: string | null; url: string | null }) =>
  pedirPost<{ id: string }>({ action: 'crear', ...r }, 'No se pudo guardar el reporte.')

export const marcarReporte = (id: string, estado: Reporte['estado']) =>
  pedirPost<{ reporte: Reporte }>({ action: 'estado', id, estado }, 'No se pudo cambiar el reporte.')

/** Sólo admin. */
export async function leerReportes(): Promise<Reporte[]> {
  const r = await apiFetch(`${API}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los reportes.')
  return d.reportes || []
}
