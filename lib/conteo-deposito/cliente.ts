/**
 * Historial de conteos aplicados (Supabase). NO toca stock de GN — solo registra el conteo
 * (auditoría + fecha del último conteo por producto).
 * Port de conteoDepConfirmar/_cdepCargarUltimos (index.html:11971/11592).
 *
 * Entra por el router `/api/deposito?recurso=conteos` (antes era `/api/conteos-deposito`, un
 * archivo propio): Vercel cuenta una función por archivo de ruta y el proyecto estaba en el
 * tope de 12 del plan Hobby. Ver el comentario de `api/deposito.js`.
 */

import { apiFetch } from '../api-fetch'
import type { Marca } from '../nav.datos'
import type { ConteoHistorial, ResumenAjuste } from './tipos'

export async function leerHistorial(marca: Marca): Promise<ConteoHistorial[]> {
  const r = await apiFetch(`/api/deposito?recurso=conteos&store=${marca}&nc=${Date.now()}`)
  const d = await r.json()
  if (!d || !d.ok) throw new Error((d && d.error) || 'No se pudo leer el historial.')
  return (d.conteos || []) as ConteoHistorial[]
}

export type GuardarConteo = {
  store: string
  ubicacion: string
  usuario: string
  fecha_inicio: string | null
  resumen: ResumenAjuste
  detalle: Array<Record<string, unknown>>
}

/**
 * 🔴 Tira error si el servidor no lo guardó. Antes no miraba la respuesta: un 500 o un 403 se
 * daban por buenos y la pantalla decía «conteo guardado» (27-sep-2026, conteo de jeans).
 */
export async function guardarConteo(payload: GuardarConteo): Promise<void> {
  const r = await apiFetch('/api/deposito?recurso=conteos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  let d: { ok?: boolean; error?: string } | null = null
  try {
    d = await r.json()
  } catch {
    /* respuesta sin JSON */
  }
  if (!r.ok || !d || !d.ok) throw new Error((d && d.error) || `el servidor respondió ${r.status}`)
}
