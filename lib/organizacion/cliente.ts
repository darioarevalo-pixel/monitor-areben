/**
 * Organización, del lado del cliente (`/api/datos?recurso=organizacion`).
 *
 * Sin `store` en ninguna llamada, igual que Novedades, Manuales y la Agenda: quién responde de qué
 * es la misma persona en las dos marcas. Ver el encabezado de `sql/migrate-organizacion.sql`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { DatosOrganizacion, Nodo, Responsabilidad } from './tipos'

const API = '/api/datos?recurso=organizacion'

/** Id nuevo, generado en el cliente para pintar la fila sin esperar al servidor. */
export function nuevoIdResp(): string {
  return `or${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function nuevoIdNodo(): string {
  return `on${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function leerOrganizacion(): Promise<DatosOrganizacion> {
  const r = await apiFetch(`${API}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer la organización.')
  return { nodos: d.nodos || [], resp: d.resp || [], puede: d.puede || { editar: false } }
}

/** ⚠️ El `Content-Type: application/json` NO es opcional. Ver `lib/agenda/cliente.ts`. */
async function postear(body: Record<string, unknown>, siFalla: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'organizacion', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
}

export function guardarResp(resp: Responsabilidad): Promise<void> {
  return postear({ action: 'resp-guardar', resp }, 'No se pudo guardar.')
}

export function borrarResp(id: string): Promise<void> {
  return postear({ action: 'resp-borrar', id }, 'No se pudo eliminar.')
}

export function guardarNodo(nodo: Nodo): Promise<void> {
  return postear({ action: 'nodo-guardar', nodo }, 'No se pudo guardar el nodo.')
}

export function borrarNodo(id: string): Promise<void> {
  return postear({ action: 'nodo-borrar', id }, 'No se pudo eliminar el nodo.')
}
