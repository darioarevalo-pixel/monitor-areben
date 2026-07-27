/**
 * Lectura de inventario-vivo desde el shell Next. Port de `_cdepFetchVivo`
 * (index.html:11633) y `_ceFetchVivo` (12061), con `x-monitor-auth` (vía `apiFetch`).
 * El `loc=local` lo usa el conteo estándar (Local); sin `loc`, trae el depósito.
 * `nc` cache-buster (el legacy lo manda siempre).
 *
 * Entra por el router `/api/deposito?recurso=inventario` (antes era `/api/inventario-vivo`, un
 * archivo propio): Vercel cuenta una función por archivo de ruta y el proyecto estaba en el
 * tope de 12 del plan Hobby. Ver el comentario de `api/deposito.js`.
 */

import { apiFetch } from '../api-fetch'
import type { Marca } from '../nav.datos'
import type { RespuestaVivo } from './tipos'

export async function leerInventarioVivo(marca: Marca, loc?: 'local'): Promise<RespuestaVivo> {
  const url = `/api/deposito?recurso=inventario&store=${marca}${loc ? `&loc=${loc}` : ''}&nc=${Date.now()}`
  const r = await apiFetch(url)
  const d = (await r.json()) as RespuestaVivo
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo leer el stock en vivo de GN.')
  return d
}
