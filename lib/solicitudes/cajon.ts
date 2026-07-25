/**
 * El "cajón" de solicitudes: de dónde se leen y adónde se escriben.
 *
 * Antes eran dos claves del KV de bdi-catalogo (`sesionfotos:<marca>` y
 * `solicitudesinternas:<marca>`), cada una con el historial completo en un JSON que se
 * reescribía entero en cada guardado. Ahora la fuente de verdad es la tabla `solicitudes`
 * del propio monitor (API), una fila por solicitud.
 *
 * ── Convivencia (a propósito, y temporal) ──────────────────────────────────────────
 * Durante la migración se LEEN los dos lugares y se fusionan por id **ganando la tabla**,
 * pero se ESCRIBE solo en la tabla. Es la red de la mudanza: si algo no migró, sigue
 * apareciendo en pantalla —el equipo no pierde una solicitud— y se nota enseguida en vez
 * de descubrirse tres días después. Cuando `MIGRACION_LISTA` pase a true, se deja de leer
 * el KV; las claves viejas quedan intactas como respaldo (no se borran).
 */

import { apiFetch } from '@/lib/api-fetch'
import { leerLista, type KindLista } from '@/lib/kv/cliente'
import type { Marca } from '@/lib/nav.datos'

/** Ver api/postventa.js: los tres recursos comparten una función por el límite del plan. */
const API = '/api/postventa?recurso=solicitudes'

/**
 * ¿Ya se puede dejar de leer el KV viejo? Se prende cuando la migración esté verificada
 * en las dos marcas (ver scripts/migrar-solicitudes.mjs y el conteo por estado).
 */
export const MIGRACION_LISTA = false

/** Lo mínimo que el cajón necesita de una solicitud para poder fusionar por id. */
type ConId = { id: string }

export type LecturaCajon<T> = { ok: true; dato: T[] } | { ok: false; motivo: string }

async function leerTabla<T>(kind: KindLista, store: Marca): Promise<LecturaCajon<T>> {
  try {
    const r = await apiFetch(`${API}&store=${store}&kind=${kind}&nc=${Date.now()}`)
    const d = await r.json().catch(() => null)
    if (!r.ok || !d?.ok) return { ok: false, motivo: (d && d.error) || `HTTP ${r.status}` }
    return { ok: true, dato: (d.list || []) as T[] }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Lee el historial de una marca. Mientras dure la convivencia devuelve la unión de la
 * tabla y el KV (gana la tabla).
 *
 * Falla cerrada, igual que antes: si la fuente de verdad no se pudo leer, devuelve `ok:false`
 * en vez de una lista vacía. Es lo que sostiene la disciplina de `cargado` río arriba —
 * guardar sobre una lista vacía borraría el historial.
 */
export async function leerCajon<T extends ConId>(kind: KindLista, store: Marca): Promise<LecturaCajon<T>> {
  const tabla = await leerTabla<T>(kind, store)
  if (!tabla.ok) return tabla
  if (MIGRACION_LISTA) return tabla

  const kv = await leerLista<T>(kind, store)
  // El KV es la red, no la fuente: si no se pudo leer, seguimos con la tabla.
  if (!kv.ok) return tabla

  const porId = new Map<string, T>()
  for (const s of kv.dato) porId.set(String(s.id), s)
  for (const s of tabla.dato) porId.set(String(s.id), s) // la tabla pisa al KV
  return { ok: true, dato: [...porId.values()] }
}

/** Guarda (upsert) una sola solicitud. */
export async function guardarSolicitud<T extends ConId>(kind: KindLista, store: Marca, solicitud: T): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const r = await apiFetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store, kind, solicitud }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d?.ok) return { ok: false, motivo: (d && d.error) || `HTTP ${r.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

async function borrarSolicitud(store: Marca, id: string): Promise<{ ok: boolean; motivo?: string }> {
  try {
    const r = await apiFetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store, action: 'borrar', id }),
    })
    const d = await r.json().catch(() => null)
    if (!r.ok || !d?.ok) return { ok: false, motivo: (d && d.error) || `HTTP ${r.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Qué cambió entre dos versiones de la lista: las solicitudes a guardar y las a borrar.
 *
 * El motor sigue trabajando sobre el array entero (mutaciones puras `(lista) => lista`),
 * que es lo que hacía cuando el KV guardaba todo junto. En vez de reescribir el historial
 * completo, se compara y se toca **solo lo que cambió**. Puro y testeable.
 */
export function diffSolicitudes<T extends ConId>(previa: T[], nueva: T[]): { guardar: T[]; borrar: string[] } {
  const antes = new Map(previa.map((s) => [String(s.id), s]))
  const guardar = nueva.filter((s) => {
    const p = antes.get(String(s.id))
    return !p || JSON.stringify(p) !== JSON.stringify(s)
  })
  const ahora = new Set(nueva.map((s) => String(s.id)))
  const borrar = [...antes.keys()].filter((id) => !ahora.has(id))
  return { guardar, borrar }
}

/** Aplica un diff contra la tabla. Devuelve el primer error, si hubo. */
export async function aplicarDiff<T extends ConId>(kind: KindLista, store: Marca, diff: { guardar: T[]; borrar: string[] }): Promise<{ ok: boolean; motivo?: string }> {
  for (const s of diff.guardar) {
    const r = await guardarSolicitud(kind, store, s)
    if (!r.ok) return r
  }
  for (const id of diff.borrar) {
    const r = await borrarSolicitud(store, id)
    if (!r.ok) return r
  }
  return { ok: true }
}
