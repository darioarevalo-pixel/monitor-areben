/**
 * "Atención al cliente", del lado del cliente (`/api/datos?recurso=atencion`).
 *
 * Los links por modelo NO se guardan ni se piden acá: vienen en la misma respuesta del GET, leídos
 * del menú de la tienda por el handler (ver `modelos.core.js`). Lo único que viaja de vuelta al
 * servidor es lo que carga una persona.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import { TIENDA_BASE } from '@/lib/tienda'
import { semillaDe } from './modelos'
import type { DatosAtencion, ItemAtencion } from './tipos'

const API = '/api/datos?recurso=atencion'

/** Id nuevo, generado en el cliente para pintar la fila sin esperar al servidor (igual que `disenos`). */
export function nuevoId(): string {
  return `a${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function leerAtencion(store: Marca): Promise<DatosAtencion & { puede: { editar: boolean } }> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron leer los links.')

  // Si la tienda no contestó, la semilla — pero sólo en BDI, que es la que tiene esta estructura de
  // categorías. En Zattia una lista vacía es la respuesta correcta, no una falla que haya que tapar.
  const desdeSemilla = !!d.desdeSemilla
  const modelos = desdeSemilla && store === 'bdi' ? semillaDe(TIENDA_BASE.bdi) : d.modelos || []

  return {
    items: (d.items || []) as ItemAtencion[],
    modelos,
    desdeSemilla: desdeSemilla && modelos.length > 0,
    puede: d.puede || { editar: false },
  }
}

/**
 * ⚠️ El `Content-Type: application/json` NO es opcional. Sin él, Vercel no parsea el cuerpo, el
 * handler recibe un `req.body` vacío y contesta "store inválido" — que suena a un error del que
 * llama y en realidad es esto. Mismo arreglo que `postear` en lib/calendario/persistencia.ts.
 */
async function postear(body: Record<string, unknown>, siFalla: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || siFalla)
}

export function guardarItems(store: Marca, items: ItemAtencion[]): Promise<void> {
  return postear({ recurso: 'atencion', store, items }, 'No se pudo guardar.')
}

export function borrarItem(store: Marca, id: string): Promise<void> {
  return postear({ recurso: 'atencion', store, id, action: 'borrar' }, 'No se pudo borrar.')
}
