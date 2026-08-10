/**
 * Novedades, del lado del cliente (`/api/datos?recurso=sistema`).
 *
 * Sin `store` en ninguna llamada, a diferencia de todo el resto del monitor: una novedad es del
 * sistema y no de una marca. Ver el encabezado de `sql/migrate-novedades.sql`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { DatosSistema, EstadoNovedad, Lectura, Novedad } from './tipos'

const API = '/api/datos?recurso=sistema'

/** Id nuevo, generado en el cliente para pintar la fila sin esperar al servidor (igual que atención). */
export function nuevoId(): string {
  return `n${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function leerSistema(): Promise<DatosSistema> {
  const r = await apiFetch(`${API}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las novedades.')
  return { novedades: d.novedades || [], leidas: d.leidas || [], puede: d.puede || { publicar: false } }
}

/**
 * Quién leyó una novedad. Bajo demanda y sólo para quien publica.
 *
 * ⚠️ Contesta quién LEYÓ, nunca quién falta: el padrón de usuarios vive en el KV de bdi-catalogo y
 * no en esta base, así que "todavía no la leyeron: …" no se puede armar sin traer el padrón. Es una
 * lista de presentes, no de ausentes, y la pantalla lo tiene que decir así.
 */
export async function leerLecturas(id: string): Promise<Lectura[]> {
  const r = await apiFetch(`${API}&vista=lecturas&id=${encodeURIComponent(id)}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo ver quién la leyó.')
  return (d.lecturas || []).map((l: { usuario: string; version: number; leida_at: string }) => ({
    novedad_id: id,
    usuario: l.usuario,
    version: l.version,
    leida_at: l.leida_at,
  }))
}

/**
 * ⚠️ El `Content-Type: application/json` NO es opcional. Sin él, Vercel no parsea el cuerpo y el
 * handler contesta por el primer campo que le falta — o sea, señala a quien llama y no a la
 * cabecera que falta. Mismo arreglo que `postear` en lib/atencion/cliente.ts.
 */
async function postear(body: Record<string, unknown>, siFalla: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'sistema', ...body }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
}

/** Marcar leída. Es la única escritura que puede hacer cualquiera, y sólo sobre su propia fila. */
export function marcarLeida(id: string, version: number): Promise<void> {
  return postear({ action: 'leida', id, version }, 'No se pudo marcar como leída.')
}

export function guardarNovedad(novedad: Novedad, subirVersion = false): Promise<void> {
  return postear({ action: 'novedad-guardar', novedad, subirVersion }, 'No se pudo guardar.')
}

export function cambiarEstado(id: string, estado: EstadoNovedad): Promise<void> {
  return postear({ action: 'novedad-estado', id, estado }, 'No se pudo cambiar el estado.')
}

export function borrarNovedad(id: string): Promise<void> {
  return postear({ action: 'novedad-borrar', id }, 'No se pudo borrar.')
}
