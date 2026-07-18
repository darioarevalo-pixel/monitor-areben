/**
 * Datos y escritura de Ubicaciones. Port de los fetch de la sección
 * (index.html:14405, 14509). La lectura es Supabase (fetchAll); la escritura va al
 * endpoint propio del Monitor `/api/observaciones` (auth por header, vía apiFetch),
 * que escribe la observación en TODAS las variantes del producto en GN.
 */

import { CUENTAS, type Cuenta } from '@/lib/cuentas'
import { fetchAll } from '@/lib/supabase/rest'
import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav'
import { computarUbicaciones } from './core'
import type { FilaInvUbi, UbiProducto } from './tipos'

const DEPOSITO = 'Deposito Minorista'

/** Lee inventario del Depósito Minorista + productos activos y arma la lista por producto. */
export async function cargarUbicaciones(marca: Marca): Promise<UbiProducto[]> {
  const cuenta: Cuenta = CUENTAS[marca]
  const [rows, prods] = await Promise.all([
    fetchAll<FilaInvUbi>(cuenta, 'inventario', `select=product_id,product_name,sku,store_name,observation&store_name=eq.${encodeURIComponent(DEPOSITO)}&order=product_name`),
    fetchAll<{ id: number | string }>(cuenta, 'productos', 'select=id&active=eq.1&order=id'),
  ])
  const activos = new Set(prods.map((p) => p.id))
  return computarUbicaciones(rows, activos)
}

/** Respuesta del endpoint de observaciones (por producto). */
type ObsResp = { ok?: boolean; error?: string; pendientes?: number; errores?: { detalle?: string; status?: number | string }[] }

/**
 * Escribe la observación (ubicación) de un producto en GN. ESCRIBE (todas las
 * variantes del producto). Port del POST de ubicacionesGuardar/Reparar.
 */
export async function guardarObservacion(productId: number | string, observation: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await apiFetch('/api/observaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, observation }),
    })
    const d: ObsResp = await r.json()
    if (d && d.ok) return { ok: true }
    const error = d?.error || (d?.errores?.[0] && (d.errores[0].detalle || 'HTTP ' + d.errores[0].status)) || (d?.pendientes ? `${d.pendientes} variante(s) sin escribir` : '') || 'desconocido'
    return { ok: false, error }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
