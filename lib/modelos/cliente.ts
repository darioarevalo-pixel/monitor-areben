/**
 * Modelos, del lado del navegador (`/api/datos?recurso=modelos`).
 *
 * ⛔ **Ninguna regla vive acá.** Esto trae y manda; qué se puede guardar lo decide
 * `lib/modelos/core.core.js`, que es el mismo que valida el handler antes de escribir.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Modelo, ModeloEditable } from './tipos'

const API = '/api/datos?recurso=modelos'

export async function leerModelos(store: string): Promise<Modelo[]> {
  const r = await apiFetch(`${API}&store=${encodeURIComponent(store)}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer las modelos.')
  return (d.modelos || []) as Modelo[]
}

async function escribir(store: string, cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recurso: 'modelos', store, ...cuerpo }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar.')
  return d as Record<string, unknown>
}

export const guardarModelo = (store: string, modelo: ModeloEditable) =>
  escribir(store, { action: 'guardar', modelo })

/**
 * 🔑 **Archivar ⛔ no es eliminar**: la ficha sigue existiendo y lo que fotografió sigue en las
 * sesiones. Es un `guardar` con el estado cambiado y ⛔ no un verbo aparte, para que no haya dos
 * caminos que escriban la misma columna.
 */
export const archivarModelo = (store: string, id: string, nombre: string, archivada: boolean) =>
  guardarModelo(store, { id, nombre, estado: archivada ? 'archivada' : 'activa' })

/**
 * ⚠️ **Elimina la ficha de verdad.** Existe sólo para deshacer una carga equivocada —una ficha
 * duplicada, un nombre mal tipeado el minuto anterior—; para sacar de la lista a alguien que ya
 * trabajó está `archivarModelo`, y la pantalla ofrece ese antes que éste.
 */
export const eliminarModelo = (store: string, id: string) => escribir(store, { action: 'eliminar', id })
