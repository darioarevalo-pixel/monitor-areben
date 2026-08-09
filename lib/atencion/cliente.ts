/**
 * "Atención al cliente", del lado del cliente (`/api/datos?recurso=atencion`).
 *
 * Los links por modelo NO se guardan ni se piden acá: vienen en la misma respuesta del GET, leídos
 * del menú de la tienda por el handler (ver `modelos.core.js`). Lo único que viaja de vuelta al
 * servidor es lo que carga una persona.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import { semillaDe } from './modelos'
import type { DatosAtencion, ItemAtencion } from './tipos'

const API = '/api/datos?recurso=atencion'

/** El dominio público de cada tienda. Espeja `linkTienda` de lib/marketing/core.ts. */
const TIENDA: Record<Marca, string> = {
  bdi: 'https://www.bdiaccesorios.com.ar',
  zattia: 'https://zattia.com.ar',
}

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
  const modelos = desdeSemilla && store === 'bdi' ? semillaDe(TIENDA.bdi) : d.modelos || []

  return {
    items: (d.items || []) as ItemAtencion[],
    modelos,
    desdeSemilla: desdeSemilla && modelos.length > 0,
    puede: d.puede || { editar: false },
  }
}

export async function guardarItems(store: Marca, items: ItemAtencion[]): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    body: JSON.stringify({ recurso: 'atencion', store, items }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo guardar.')
}

export async function borrarItem(store: Marca, id: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    body: JSON.stringify({ recurso: 'atencion', store, id, action: 'borrar' }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo borrar.')
}
