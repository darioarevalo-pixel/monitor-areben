/**
 * Manuales, del lado del cliente. Comparten endpoint con las novedades (`?recurso=sistema`): es el
 * mismo GET el que trae el índice, así que el shell hace una sola request para el badge, el cartel,
 * la sección y el botón "Cómo se usa" de las 42 pantallas.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Manual, RutinaDeManual } from './tipos'

const API = '/api/datos?recurso=sistema'

export function nuevoId(): string {
  return `m${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function pedirManual(id: string, conRutinas: boolean): Promise<{ manual: Manual; rutinas: RutinaDeManual[] }> {
  const rut = conRutinas ? '&rutinas=1' : ''
  const r = await apiFetch(`${API}&vista=manual&id=${encodeURIComponent(id)}${rut}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer el manual.')
  return { manual: d.manual as Manual, rutinas: (d.rutinas || []) as RutinaDeManual[] }
}

/** El cuerpo de un manual. Se pide al abrirlo: el índice del GET general no lo trae. */
export async function leerManual(id: string): Promise<Manual> {
  return (await pedirManual(id, false)).manual
}

/**
 * El cuerpo **y las rutinas que lo explican**. Las pide la sección Manuales y nadie más: en los dos
 * modales donde también se lee un manual esa lista no aporta, y sería una query por apertura.
 */
export function leerManualConRutinas(id: string): Promise<{ manual: Manual; rutinas: RutinaDeManual[] }> {
  return pedirManual(id, true)
}

/** ⚠️ El `Content-Type: application/json` no es opcional. Ver `lib/novedades/cliente.ts`. */
async function postear(body: Record<string, unknown>, siFalla: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'sistema', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
}

export function guardarManual(manual: Manual): Promise<void> {
  return postear({ action: 'manual-guardar', manual }, 'No se pudo guardar el manual.')
}

export function borrarManual(id: string): Promise<void> {
  return postear({ action: 'manual-borrar', id }, 'No se pudo eliminar el manual.')
}
