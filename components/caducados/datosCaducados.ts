/**
 * Fetches propios de "Productos caducados". Port de cadInit (index.html:12409): el
 * stock por depósito (inventario completo, no el split del ETL) y la última venta de
 * cada producto en una ventana ~2 años (más amplia que la del login, que para
 * usuarios no-admin trae sólo ~35 días). Read-only: sólo lee de Supabase.
 */

import { CUENTAS } from '@/lib/cuentas'
import { fetchAll } from '@/lib/supabase/rest'
import { esVentaTecnica } from '@/lib/etl/helpers'
import type { Marca } from '@/lib/nav'
import type { StockPorDeposito, UltimaVenta } from '@/lib/caducados'

type FilaInv = { product_id: number | string; available_quantity: number | null; store_name: string | null }
type FilaVenta = { id: number; date_sale: string | null; channel: string | null; channel_id?: number | string | null }
type FilaDetalle = { sale_id: number; product_id: number | string }

export async function cargarDatosCaducados(marca: Marca): Promise<{ stock: StockPorDeposito; ultimaVenta: UltimaVenta }> {
  const cuenta = CUENTAS[marca]

  // Stock por depósito (todos los depósitos presentes).
  const stock: StockPorDeposito = {}
  let inv: FilaInv[] = []
  try {
    inv = await fetchAll<FilaInv>(cuenta, 'inventario', 'select=product_id,available_quantity,store_name')
  } catch {
    inv = []
  }
  inv.forEach((r) => {
    const p = String(r.product_id)
    const q = r.available_quantity || 0
    const sn = String(r.store_name || '').trim() || '?'
    if (!stock[p]) stock[p] = { total: 0, stores: {} }
    stock[p].total += q
    stock[p].stores[sn] = (stock[p].stores[sn] || 0) + q
  })

  // Última venta por producto — ventana amplia (~2 años) para la última venta real.
  //
  // **Las ventas técnicas se descartan acá o la sección hace lo contrario de lo que promete**: una
  // sesión de fotos o una falla sacada del depósito le renovaba la "última venta" al producto y lo
  // hacía desaparecer de la lista de caducados, que es justo donde tenía que estar. Por eso se pide
  // `channel`, que antes no se traía. `channel_id` sólo existe en BDI (Zattia no lo expone).
  const ultimaVenta: UltimaVenta = {}
  try {
    const desde = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10)
    const campos = marca === 'zattia' ? 'id,date_sale,channel' : 'id,date_sale,channel,channel_id'
    const ventas = await fetchAll<FilaVenta>(cuenta, 'ventas', `select=${campos}&date_sale=gte.${desde}&order=id`)
    if (ventas.length) {
      const fechaById: Record<string, string> = {}
      ventas.forEach((v) => {
        if (esVentaTecnica(v)) return
        fechaById[String(v.id)] = (v.date_sale || '').slice(0, 10)
      })
      const minId = Math.min(...ventas.map((v) => v.id))
      const det = await fetchAll<FilaDetalle>(cuenta, 'venta_detalles', `select=sale_id,product_id&sale_id=gte.${minId}&order=sale_id`)
      det.forEach((d) => {
        const p = String(d.product_id)
        const f = fechaById[String(d.sale_id)]
        if (!f) return
        if (!ultimaVenta[p] || f > ultimaVenta[p]) ultimaVenta[p] = f
      })
    }
  } catch {
    /* si falla, queda sin fechas */
  }

  return { stock, ultimaVenta }
}
