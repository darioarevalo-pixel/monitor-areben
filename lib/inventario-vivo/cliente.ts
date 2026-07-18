/**
 * Lectura de inventario-vivo desde el shell Next. Port de `_cdepFetchVivo`
 * (index.html:11633) y `_ceFetchVivo` (12061): GET a `/api/inventario-vivo` con
 * `x-monitor-auth` (vía `apiFetch`). El `loc=local` lo usa el conteo estándar (Local);
 * sin `loc`, trae el depósito. `nc` cache-buster (el legacy lo manda siempre).
 */

import { apiFetch } from '../api-fetch'
import type { Marca } from '../nav.generated'
import type { RespuestaVivo } from './tipos'

export async function leerInventarioVivo(marca: Marca, loc?: 'local'): Promise<RespuestaVivo> {
  const url = `/api/inventario-vivo?store=${marca}${loc ? `&loc=${loc}` : ''}&nc=${Date.now()}`
  const r = await apiFetch(url)
  const d = (await r.json()) as RespuestaVivo
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo leer el stock en vivo de GN.')
  return d
}
