/**
 * El tablero de diseños, compartido (`/api/datos?recurso=disenos`).
 *
 * Antes vivía en el `localStorage` de cada navegador, y eso lo dejaba a mitad de camino de
 * ser un tablero de equipo: lo que cargaba una persona no lo veía nadie más, limpiar el
 * navegador borraba todo, y como las fotos van embebidas el almacenamiento se llenaba y la
 * app tenía que avisar que ya no podía guardar.
 *
 * La mudanza es por marca y sin perder nada: al abrir, si la base está vacía y el navegador
 * tiene diseños viejos, se ofrece subirlos (`importarLocales`). El `localStorage` no se
 * borra — queda como respaldo hasta que se confirme que está todo arriba.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { Diseno } from './tipos'

const API = '/api/datos?recurso=disenos'

/** La clave vieja del navegador. Se sigue leyendo para poder importar, nunca para mandar. */
export const KEY_LOCAL = 'monitor_designboard_v1'

export async function leerDisenos(store: Marca): Promise<Diseno[]> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer el tablero de diseños.')
  return (d.disenos || []) as Diseno[]
}

/** Guarda uno o varios (upsert por id). Se llama con lo que cambió, no con el tablero entero. */
export async function guardarDisenos(store: Marca, disenos: Diseno[]): Promise<void> {
  if (!disenos.length) return
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, disenos }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar el diseño.')
}

export async function borrarDiseno(store: Marca, id: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, id, action: 'borrar' }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo borrar el diseño.')
}

/** Los diseños que quedaron en ESTE navegador (para ofrecer subirlos una sola vez). */
export function leerLocales(): Diseno[] {
  try {
    const raw = localStorage.getItem(KEY_LOCAL)
    const arr = raw ? (JSON.parse(raw) as Diseno[]) : []
    return Array.isArray(arr) ? arr.filter((d) => d && d.id) : []
  } catch {
    return []
  }
}

/**
 * Qué hay que subir del navegador: lo que no está ya arriba (por id).
 *
 * Se compara por id y no se pisa lo remoto: si alguien ya subió ese diseño y lo editó desde
 * otra compu, la copia local vieja no debe ganarle.
 */
export function localesParaImportar(locales: Diseno[], remotos: Diseno[]): Diseno[] {
  const arriba = new Set(remotos.map((d) => String(d.id)))
  return locales.filter((d) => !arriba.has(String(d.id)))
}
