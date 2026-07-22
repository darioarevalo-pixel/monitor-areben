/**
 * Cliente del depósito de fallas (`/api/fallas`, Supabase). Mismo patrón que
 * lib/sku-map/cliente.ts (apiFetch manda el header de auth). No toca stock ni GN/TN.
 */

import { apiFetch } from '../../api-fetch'
import type { Marca } from '@/lib/nav.generated'
import type { FallaEstado, FallaInput, FallaRow } from './tipos'

export async function leerFallas(store: Marca): Promise<FallaRow[]> {
  const r = await apiFetch(`/api/fallas?store=${store}&nc=${Date.now()}`)
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudieron leer las fallas.')
  return (d.fallas || []) as FallaRow[]
}

export async function crearFalla(store: Marca, falla: FallaInput, usuario?: string): Promise<number | undefined> {
  const r = await apiFetch('/api/fallas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'crear', usuario, ...falla }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo crear la falla.')
  return d.id as number | undefined
}

export async function cambiarEstadoFalla(store: Marca, id: number, estado: FallaEstado, usuario?: string, nota?: string): Promise<void> {
  const r = await apiFetch('/api/fallas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'estado', id, estado, usuario, nota }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo cambiar el estado.')
}

export async function editarFalla(store: Marca, id: number, campos: Partial<FallaInput>): Promise<void> {
  const r = await apiFetch('/api/fallas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'editar', id, ...campos }),
  })
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo editar la falla.')
}
