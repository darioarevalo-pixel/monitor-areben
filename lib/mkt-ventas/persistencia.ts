import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav.datos'

/**
 * Traer las ventas de hoy al espejo, desde Ventas de Marketing.
 *
 * `salteado` no es un error: el handler lo contesta con 200 cuando alguien apretó hace menos de un
 * minuto. Apretar dos veces no es una equivocación de nadie y no tiene por qué pintarse de rojo.
 */
export type Traida = {
  salteado?: boolean
  traidoEn: string | null
  truncado?: boolean
  ventas: number
  detalles: number
}

export async function traerVentasDeHoy(store: Marca): Promise<Traida> {
  const r = await apiFetch('/api/datos?recurso=mkt-ventas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, action: 'traer-ventas-hoy' }),
  })
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudieron traer las ventas de hoy.')
  return d as Traida
}
