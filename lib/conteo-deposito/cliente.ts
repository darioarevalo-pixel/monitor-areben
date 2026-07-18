/**
 * Historial de conteos aplicados (`/api/conteos-deposito`, Supabase). NO toca stock
 * de GN — solo registra el conteo (auditoría + fecha del último conteo por producto).
 * Port de conteoDepConfirmar/_cdepCargarUltimos (index.html:11971/11592).
 */

import { apiFetch } from '../api-fetch'
import type { Marca } from '../nav.generated'
import type { ConteoHistorial, ResumenAjuste } from './tipos'

export async function leerHistorial(marca: Marca): Promise<ConteoHistorial[]> {
  const r = await apiFetch(`/api/conteos-deposito?store=${marca}&nc=${Date.now()}`)
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

export async function guardarConteo(payload: GuardarConteo): Promise<void> {
  await apiFetch('/api/conteos-deposito', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
