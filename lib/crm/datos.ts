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
import { apiFetch } from '../api-fetch'
import { esVentaTecnica } from '../etl/helpers'
import type { FilaCliente, FilaDetalle, FilaVenta, MapaSeguimiento } from './tipos'

/** Los select textuales del legacy (13200, 13814). Un campo de menos y el agregado computa otra cosa. */
const SEL_VENTAS = 'select=id,date_sale,total_price,client_id,channel_id,sale_state'
const SEL_DETALLES = 'select=sale_id,product_name,size,quantity,unit_price,total'
// 📌 El de `clientes` (13250) ya no vive acá: se mudó a `api/_crm.js` (COLUMNAS) cuando la tabla
// salió del navegador. Es el mismo, palabra por palabra.

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
 *
 * ⚠️ Las ventas técnicas se descartan siempre. Los clientes internos de Gestión Nube —"Sesión de
 * fotos", "Falla", "Cambio"— tienen `client_id` como cualquier persona, así que sin este filtro
 * entraban al padrón como clientes con decenas de compras de $0.
 */
export async function traerVentas(modo: ModoCanal, crmSeg: MapaSeguimiento): Promise<FilaVenta[]> {
  const cuenta = CUENTAS[MARCA]

  if (modo === 'all') {
    const todas = await fetchAll<FilaVenta>(cuenta, 'ventas', `${SEL_VENTAS}&client_id=not.is.null&order=date_sale.desc`)
    return todas.filter((v) => !esVentaTecnica(v))
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
  // `porMarcados` trae TODAS las ventas del cliente ★, sin filtro de canal, así que puede arrastrar
  // técnicas igual que el modo "todos". `porCanal` ya viene limpio por el eq.10.
  return [...porId.values()].filter((v) => !esVentaTecnica(v))
}

/**
 * Los clientes de esas ventas.
 *
 * 🔑 **Único consumidor de la tabla `clientes`, y por eso el único que había que mover.** Esto ya
 * no habla con Supabase: va contra `api/datos?recurso=crm`, que lee con la clave de servicio
 * detrás de `exigirUsuario` + el permiso de la sección. Es el escalón 2 de la Fase S — hasta el
 * 14-ago-2026 el navegador se bajaba nombre, mail, teléfono y ciudad de 12.523 personas con la
 * anon key, que cualquiera saca del bundle. Con esto puesto, a `anon` se le revoca el `select`
 * sobre la tabla (`sql/migrate-clientes-servidor.sql`).
 *
 * Los lotes de 200 del legacy (13249) se fueron con la mudanza: existían para no romper la URL de
 * PostgREST, y ahora los ids viajan en el body de un POST. Los arma el servidor, que además los
 * pide de a 6 en paralelo. Un viaje en vez de 63.
 */
export async function traerClientes(ventas: FilaVenta[]): Promise<Record<number, FilaCliente>> {
  const ids = [...new Set(ventas.map((v) => v.client_id).filter(Boolean))] as number[]
  const out: Record<number, FilaCliente> = {}
  if (!ids.length) return out

  const r = await apiFetch('/api/datos?recurso=crm', {
    method: 'POST',
    // ⚠️ Sin este header Vercel no parsea el body y el handler ve `ids` vacío, sin error.
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  const d = (await r.json().catch(() => ({}))) as { ok?: boolean; clientes?: FilaCliente[]; error?: string }
  if (!r.ok || !d.ok) throw new Error(d.error || `Error ${r.status} pidiendo el padrón de clientes.`)
  for (const c of d.clientes || []) out[c.id] = c
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
