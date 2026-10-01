/**
 * Mapa del local, del lado del cliente (`/api/datos?recurso=mapa-local`).
 */

import { apiFetch } from '@/lib/api-fetch'
import type { MapaLocal } from './tipos'

const API = '/api/datos?recurso=mapa-local&store=zattia'

export type MapaGuardado = {
  /** `null` = nadie lo guardó todavía: la pantalla usa el mapa inicial del código. */
  mapa: MapaLocal | null
  actualizadoEn: string | null
  actualizadoPor: string | null
  puede: { editar: boolean }
  /** La tabla todavía ⛔ no existe (falta la migración): se mira, ⛔ no se guarda. */
  sinTabla: boolean
}

export async function leerMapa(): Promise<MapaGuardado> {
  const r = await apiFetch(`${API}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer el mapa del local.')
  return { mapa: d.mapa || null, actualizadoEn: d.actualizadoEn || null, actualizadoPor: d.actualizadoPor || null, puede: d.puede || { editar: false }, sinTabla: !!d.sinTabla }
}

/**
 * Guarda el mapa entero. `base` es el `actualizadoEn` que se leyó: si otro guardó en el medio, el
 * servidor contesta 409 y ⛔ no pisa.
 * ⚠️ El `Content-Type: application/json` NO es opcional. Ver `lib/agenda/cliente.ts`.
 */
export async function guardarMapa(mapa: MapaLocal, base: string | null): Promise<{ actualizadoEn: string; actualizadoPor: string | null }> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'mapa-local', store: 'zattia', action: 'guardar', mapa, base }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar el mapa.')
  return { actualizadoEn: d.actualizadoEn, actualizadoPor: d.actualizadoPor || null }
}
