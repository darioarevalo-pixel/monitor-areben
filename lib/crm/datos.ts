/**
 * Traer los datos del CRM. Port de cargarCRM (index.html:13188-13260), sin DOM.
 *
 * Cambios de forma respecto del legacy:
 *  - La marca viaja explícita en vez del global `currentCuenta`.
 *  - `crmSeg` y `crmTelOverride` entran por parámetro: quién los lee del KV es
 *    decisión del llamador (lib/kv/cliente.ts), no de esta capa.
 *  - No toca `#status`: dentro del iframe ese cartel vive en el panel lateral
 *    oculto y no lo ve nadie.
 */

import { CUENTAS } from '../cuentas'
import { fetchAll } from '../supabase/rest'
import type { FilaCliente, FilaDetalle, FilaVenta, MapaSeguimiento } from './tipos'

/** Los select textuales del legacy (13200, 13250, 13814). Un campo de menos y el agregado computa otra cosa. */
const SEL_VENTAS = 'select=id,date_sale,total_price,client_id,channel_id,sale_state'
const SEL_CLIENTES = 'select=id,name,email,phone,city,province'
const SEL_DETALLES = 'select=sale_id,product_name,size,quantity,unit_price,total'

/**
 * El CRM es **bdi-only por esquema, no por permisos**: `ventas.channel_id` no
 * existe en la base de Zattia (por eso el ETL bifurca su select). Habilitar la key
 * para zattia da 400 de PostgREST, no una pantalla vacía.
 */
const MARCA = 'bdi' as const

/** El canal "Mayorista", hardcodeado en el <option> (1714) y en el chequeo de 13416. */
export const CANAL_MAYORISTA = '10'

export type ModoCanal = typeof CANAL_MAYORISTA | 'all'

/**
 * Trae las ventas del CRM según el modo del select.
 *
 * En modo Mayorista son DOS consultas unidas y deduplicadas por id: las del canal
 * 10, más **todas** las de los clientes marcados ★ (compren por donde compren).
 *
 * ⚠️ El orden importa y no es negociable: la marca `es_mayorista` sale de `crmSeg`,
 * o sea que el KV se lee ANTES que las ventas. Un `Promise.all` "de sentido común"
 * hace desaparecer a los clientes ★ en silencio.
 *
 * ⚠️ Todo con `fetchAll`, que pagina. PostgREST corta en 1000 filas sin avisar, y
 * el legacy pedía este lote con `sbFetch` (sin paginar): eran 445 ventas y $12,5M
 * sin contar. Arreglado en el legacy en f8977ca; acá nace bien de entrada.
 */
export async function traerVentas(modo: ModoCanal, crmSeg: MapaSeguimiento): Promise<FilaVenta[]> {
  const cuenta = CUENTAS[MARCA]

  if (modo === 'all') {
    return fetchAll<FilaVenta>(cuenta, 'ventas', `${SEL_VENTAS}&client_id=not.is.null&order=date_sale.desc`)
  }

  const flagged = Object.keys(crmSeg).filter((id) => crmSeg[id] && crmSeg[id].es_mayorista)
  const porCanal = await fetchAll<FilaVenta>(
    cuenta,
    'ventas',
    `${SEL_VENTAS}&channel_id=eq.${modo}&client_id=not.is.null&order=date_sale.desc`,
  )

  let porMarcados: FilaVenta[] = []
  for (let i = 0; i < flagged.length; i += 150) {
    const lote = flagged.slice(i, i + 150)
    porMarcados = porMarcados.concat(
      await fetchAll<FilaVenta>(cuenta, 'ventas', `${SEL_VENTAS}&client_id=in.(${lote.join(',')})&client_id=not.is.null`),
    )
  }

  const porId = new Map<number, FilaVenta>()
  for (const v of porCanal.concat(porMarcados)) porId.set(v.id, v)
  return [...porId.values()]
}

/** Los clientes de esas ventas, en lotes de 200 para no romper la URL (13249). */
export async function traerClientes(ventas: FilaVenta[]): Promise<Record<number, FilaCliente>> {
  const cuenta = CUENTAS[MARCA]
  const ids = [...new Set(ventas.map((v) => v.client_id).filter(Boolean))] as number[]
  const out: Record<number, FilaCliente> = {}
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200)
    for (const c of await fetchAll<FilaCliente>(cuenta, 'clientes', `${SEL_CLIENTES}&id=in.(${lote.join(',')})`)) {
      out[c.id] = c
    }
  }
  return out
}

/**
 * Los detalles de las ventas de un cliente, para el resumen de compras del modal.
 * Lotes de 150 sale_ids (13813). Medido: ~170 líneas por lote, 6x de margen contra
 * el corte de 1000 — pero igual pagina, porque el margen de hoy no es un contrato.
 */
export async function traerDetalles(ventaIds: number[]): Promise<FilaDetalle[]> {
  const cuenta = CUENTAS[MARCA]
  let out: FilaDetalle[] = []
  for (let i = 0; i < ventaIds.length; i += 150) {
    const lote = ventaIds.slice(i, i + 150)
    out = out.concat(await fetchAll<FilaDetalle>(cuenta, 'venta_detalles', `${SEL_DETALLES}&sale_id=in.(${lote.join(',')})`))
  }
  return out
}
