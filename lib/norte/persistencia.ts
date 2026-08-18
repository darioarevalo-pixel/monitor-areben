/**
 * Norte, del lado del cliente (`/api/datos?recurso=norte`).
 *
 * Sólo viaja **lo que una persona decide y la máquina no puede saber sola**: el costo, la moneda y
 * los plazos de cada importación, y los objetivos de mediano plazo.
 *
 * ⛔ **No viaja nada medido GUARDADO.** El ritmo de salida, el stock proyectado y el avance de cada
 * meta se calculan al abrir la pantalla contra las ventas reales (`lib/norte/core.ts`). Guardarlos
 * sería garantizar que algún día muestren un número viejo con cara de actual.
 *
 * La **contribución por canal** sí baja calculada, y no es una excepción a lo de arriba: se computa
 * en el servidor en el mismo request, contra la venta de esos 30 días. No se guarda en ningún lado.
 * Va del lado del servidor porque necesita dos cosas que el navegador no tiene — los precios y el
 * CMV (el ETL trae unidades y no plata) y las reglas de IVA y comisiones, que viven en el
 * dashboard.
 *
 * Las unidades y la fecha de llegada tampoco viven acá: son de `ingresos` (el KV de bdi-catalogo) y
 * se cruzan por `ingresoId`.
 */

import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'
import type { Condiciones, Contribucion, Meta } from './tipos'

const API = '/api/datos?recurso=norte'

export type MetaGuardada = Meta & { orden: number; activa: boolean }

export type DatosNorte = {
  condiciones: Condiciones[]
  metas: MetaGuardada[]
  /** La plata que deja cada canal, calculada en el servidor contra la venta real. */
  contribucion: Contribucion
  puede: { admin: boolean }
}

/**
 * Lee las condiciones y las metas de una marca.
 *
 * `nc` rompe el caché del navegador: sin eso, guardar y recargar mostraba lo viejo, que se lee como
 * «no se guardó» y hace que alguien vuelva a guardar encima.
 */
export async function leerNorte(store: Marca): Promise<DatosNorte> {
  const r = await apiFetch(`${API}&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer Norte.')
  return {
    condiciones: (d.condiciones || []) as Condiciones[],
    metas: (d.metas || []) as MetaGuardada[],
    contribucion: (d.contribucion || { disponible: false, motivo: null, ventana: null }) as Contribucion,
    puede: d.puede || { admin: false },
  }
}

async function postear(body: Record<string, unknown>, sale: string): Promise<void> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || sale)
}

/** Alta o edición de la economía de una importación. Es de admin: del otro lado devuelve 403. */
export function guardarCondiciones(store: Marca, condiciones: Condiciones): Promise<void> {
  return postear({ store, condiciones }, 'No se pudo guardar la economía de la compra.')
}

export function borrarCondiciones(store: Marca, ingresoId: string): Promise<void> {
  return postear({ store, action: 'borrar-condiciones', ingresoId }, 'No se pudo borrar.')
}

export function guardarMeta(store: Marca, meta: MetaGuardada): Promise<void> {
  return postear({ store, meta }, 'No se pudo guardar la meta.')
}

export function borrarMeta(store: Marca, key: string): Promise<void> {
  return postear({ store, action: 'borrar-meta', key }, 'No se pudo borrar la meta.')
}
