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

  // 🔑 **El `r.json()` iba pelado, y eso convertía cada caída en un mensaje ilegible.** Este
  // endpoint es el más lento del Monitor (dos pasadas por Gestión Nube, hasta 25 páginas cada
  // una), así que cuando se pasa del techo el que contesta es Vercel con una página de ERROR HTML,
  // no el handler con JSON. `JSON.parse` sobre eso tira `SyntaxError: Unexpected token '<'`, y eso
  // era lo que veía la persona del depósito con el conteo a medio hacer. Ahora se mira el
  // `content-type` antes de creerle al cuerpo.
  const tipo = r.headers.get('content-type') || ''
  if (!tipo.includes('application/json')) {
    throw new Error(
      r.status === 504 || r.status === 502
        ? 'Gestión Nube tardó demasiado y la consulta se cortó. Probá de nuevo en un minuto; si sigue, avisá.'
        : `El servidor contestó ${r.status} sin datos. Probá de nuevo; si sigue, avisá.`,
    )
  }

  const d = (await r.json()) as RespuestaVivo
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo leer el stock en vivo de GN.')
  return d
}
