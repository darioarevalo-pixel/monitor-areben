/**
 * Productos de la tienda marcados como "no revisar" (`/api/tienda?recurso=ignorados`).
 *
 * Son los que no van a tener foto nunca porque no son de la tienda —mayoristas, pruebas—.
 * Sin poder sacarlos, la revisión de fotos nunca llega a cero y deja de servir como
 * tablero. Se guardan en la base del monitor (por marca), no en el navegador: la decisión
 * de "este no va" es del equipo, no de la compu desde la que se miró.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'

const API = '/api/datos?recurso=ignorados'

export type Ignorado = { tn_id: string; nombre: string | null; motivo: string | null }

export async function leerIgnorados(store: Marca): Promise<Ignorado[]> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los productos ignorados.')
  return (d.ignorados || []) as Ignorado[]
}

export async function ignorarProducto(store: Marca, tnId: string | number, nombre: string, motivo: string, usuario?: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, tn_id: String(tnId), nombre, motivo, usuario }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo ignorar el producto.')
}

export async function dejarDeIgnorar(store: Marca, tnId: string | number): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, tn_id: String(tnId), action: 'quitar' }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo quitar el producto de la lista de ignorados.')
}

/** Motivos ofrecidos al ignorar. Libres, pero acotados para que el listado sea legible. */
export const MOTIVOS_IGNORAR = ['Mayorista', 'Producto de prueba', 'Discontinuado', 'Otro'] as const
