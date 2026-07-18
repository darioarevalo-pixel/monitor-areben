/**
 * Lecturas y guardado de Reposición. El inventario (Local+Depósito) y las ventas del
 * local 7d salen de Supabase (`fetchAll`); la config se guarda en REPO_API
 * (compartida). Port de repoCargarInventario/repoVentasLocal7d/repoCfgSave
 * (index.html:12515/12592/12314). Read-only sobre stock (nunca ajusta GN).
 */

import { CUENTAS } from '../cuentas'
import type { Marca } from '../nav.generated'
import { fetchAll } from '../supabase/rest'
import type { RepoCfg } from './tipos'
import type { FilaInvRepo } from './inventario'

const REPO_API = 'https://bdi-catalogo.vercel.app/api/reposicion'

/** Inventario Local + Depósito. `observation` (ubicación) solo existe en BDI. Port de repoCargarInventario @12514. */
export async function leerInventario(marca: Marca): Promise<FilaInvRepo[]> {
  const obsSel = marca === 'bdi' ? ',observation' : ''
  return fetchAll<FilaInvRepo>(CUENTAS[marca], 'inventario', `select=product_id,product_name,size_id,size_name,sku,available_quantity,store_name${obsSel}`)
}

/**
 * Ventas que descuentan del Local en los últimos 7 días, por variante (`pid_sid`).
 * BDI: solo canal "Mi Local". Zattia: "Mi Local" + "Tienda Nube" (online vende del
 * local). Port de repoVentasLocal7d @12592.
 */
export async function ventasLocal7d(marca: Marca): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  try {
    const desde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const filtroCanal = marca === 'zattia' ? 'or=(channel.ilike.*local*,channel.ilike.*tienda*)' : 'channel=ilike.*local*'
    const ventas = await fetchAll<{ id: number }>(CUENTAS[marca], 'ventas', `select=id&${filtroCanal}&date_sale=gte.${desde}&order=id`)
    if (!ventas.length) return out
    const ids = new Set(ventas.map((v) => String(v.id)))
    const minId = Math.min(...ventas.map((v) => v.id))
    const det = await fetchAll<{ sale_id: number; product_id: number | string; size_id: number | string; quantity?: number }>(
      CUENTAS[marca],
      'venta_detalles',
      `select=sale_id,product_id,size_id,quantity&sale_id=gte.${minId}&order=sale_id`,
    )
    det.forEach((d) => {
      if (ids.has(String(d.sale_id))) {
        const vid = String(d.product_id) + '_' + String(d.size_id)
        out[vid] = (out[vid] || 0) + (d.quantity || 1)
      }
    })
  } catch {
    /* si falla, queda en 0 */
  }
  return out
}

/** Guarda la config compartida (mins/topes/apagados/…). Port de repoCfgSave @11314. */
export async function guardarRepoConfig(marca: Marca, config: RepoCfg): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${REPO_API}?store=${marca}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: marca, config }),
    })
    const d = await r.json()
    return { ok: !!d.ok, error: d.error }
  } catch {
    return { ok: false, error: 'error de conexión' }
  }
}
