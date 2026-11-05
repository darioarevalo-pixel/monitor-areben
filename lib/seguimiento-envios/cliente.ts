/** Seguimiento de envíos, del lado del navegador. Las solapas las decide el servidor (`core.core.js`). */

import { apiFetch } from '@/lib/api-fetch'
import { adminBaseUrl } from '@/lib/tienda'
import type { Marca } from '@/lib/nav.datos'

export type Tienda = 'bdi' | 'zattia' | 'stunned'

export type FilaSeguimiento = {
  tienda: Tienda
  id: number | string
  numero: number | string
  cliente: string | null
  envio: string
  codigo: string
  pedido: string | null
  planta: string
  ultimo: string
  dias: number
  /** Retornó en algún momento: si está en sucursal, lo buscamos nosotros, ⛔ el cliente. */
  volvio: boolean
  motivo: 'robado' | 'sin-movimiento' | null
}

type Referencia = { tienda: Tienda; id: number | string; numero: number | string }

export type Seguimiento = {
  retiro: FilaSeguimiento[]
  trabados: FilaSeguimiento[]
  /** El Correo los dio por entregados después de retornar: según él volvieron a nosotros. */
  volvieron: FilaSeguimiento[]
  resumen: {
    consultados: number
    enCamino: number
    entregados: number
    sinLeer: Referencia[]
  }
  sinCodigo: number
  correoCaido: boolean
  desde: string
  leidoEn: string
}

export async function leerSeguimiento(store: Marca): Promise<Seguimiento> {
  const r = await apiFetch(`/api/datos?recurso=seguimiento-envios&store=${store}&nc=${Date.now()}`)
  const d = await r.json().catch(() => null)
  if (!r.ok || !d?.ok) throw new Error((d && d.error) || 'No se pudo leer el seguimiento de envíos.')
  return d as Seguimiento
}

/** El pedido en el admin de su tienda. Stunned tiene el suyo aunque en el monitor sea línea de Zattia. */
export function linkDelPedido(tienda: Tienda, id: number | string): string | null {
  const base = adminBaseUrl(tienda)
  return base ? base.replace(/\/products$/, `/orders/${id}`) : null
}
