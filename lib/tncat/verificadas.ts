/**
 * Productos cuya vinculación foto→color ya se revisó a ojo
 * (`/api/datos?recurso=fotos-verificadas`).
 *
 * Es distinto de [`ignorados`](./ignorados.ts), que es "no revisar nunca" (mayoristas,
 * pruebas). Esto es **"ya lo miré y está bien"**, y es lo que hace que el repaso visual —la
 * parte que ninguna automatización puede hacer, porque nadie puede mirar una foto y decir de
 * qué color es— se haga una sola vez.
 *
 * Va con la **huella**: la firma del estado de fotos al momento de revisar. La pantalla la
 * recalcula al abrir y compara. Si alguien cargó o revinculó una foto, la huella no coincide y
 * el producto vuelve solo a la lista. Sin eso, marcar un producto lo sacaría para siempre y un
 * verificado viejo taparía un error nuevo: peor que no auditar, porque da confianza falsa.
 *
 * Se guarda en la base del monitor (por marca), no en el navegador: "esto ya lo miré" es una
 * decisión del equipo, no de la compu desde la que se miró.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'

const API = '/api/datos?recurso=fotos-verificadas'

export type Verificada = {
  tn_id: string
  huella: string
  nombre: string | null
  usuario: string | null
  updated_at: string | null
}

export async function leerVerificadas(store: Marca): Promise<Verificada[]> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer qué productos ya se revisaron.')
  return (d.verificadas || []) as Verificada[]
}

/** `tn_id → huella`, que es la forma en que lo consume `armarFilas`. */
export function mapaDe(filas: Verificada[]): Map<string, string> {
  return new Map(filas.map((f) => [String(f.tn_id), f.huella]))
}

export async function marcarVerificado(
  store: Marca,
  tnId: string | number,
  huella: string,
  nombre: string,
  usuario?: string,
): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, tn_id: String(tnId), huella, nombre, usuario }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar la revisión.')
}

export async function desmarcarVerificado(store: Marca, tnId: string | number): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, tn_id: String(tnId), action: 'quitar' }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo quitar la revisión.')
}
