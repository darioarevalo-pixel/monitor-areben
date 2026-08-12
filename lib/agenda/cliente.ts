/**
 * Agenda operativa, del lado del cliente (`/api/datos?recurso=agenda`).
 *
 * Sin `store` en ninguna llamada, igual que Novedades y a diferencia de casi todo el resto del
 * monitor: una promoción bancaria la define el banco y no es de una marca. Que valga sólo para una
 * se dice con el campo `marcas` de la promo. Ver el encabezado de `sql/migrate-agenda.sql`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { DatosAgenda, Promo } from './tipos'

const API = '/api/datos?recurso=agenda'

/** Id nuevo, generado en el cliente para pintar la fila sin esperar al servidor. */
export function nuevoIdPromo(): string {
  return `pr${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function leerAgenda(): Promise<DatosAgenda> {
  const r = await apiFetch(`${API}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer la agenda.')
  return { promos: d.promos || [], puede: d.puede || { cargar: false } }
}

/**
 * ⚠️ El `Content-Type: application/json` NO es opcional. Sin él, Vercel no parsea el cuerpo y el
 * handler contesta por el primer campo que le falta — o sea, señala a quien llama y no a la
 * cabecera que falta. Mismo arreglo que en `lib/novedades/cliente.ts`.
 */
async function postear(body: Record<string, unknown>, siFalla: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'agenda', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
}

export function guardarPromo(promo: Promo): Promise<void> {
  return postear({ action: 'guardar-promo', promo }, 'No se pudo guardar la promoción.')
}

export function borrarPromo(id: string): Promise<void> {
  return postear({ action: 'borrar-promo', id }, 'No se pudo borrar la promoción.')
}
