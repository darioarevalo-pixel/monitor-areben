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

import { apiFetch } from '../api-fetch'
import { esVentaTecnica } from '../etl/helpers'
import type { FilaCliente, FilaDetalle, FilaVenta, MapaSeguimiento } from './tipos'

// 📌 Los tres select textuales del legacy —`ventas` (13200), `clientes` (13250) y `venta_detalles`
// (13813)— ya no viven acá: se mudaron a `api/_crm.js` (COLUMNAS_VENTAS, COLUMNAS y
// COLUMNAS_DETALLE) cuando esas tablas salieron del navegador. Son los mismos, palabra por palabra.

// 📌 El CRM es **bdi-only por esquema, no por permisos**: `ventas.channel_id` no existe en la base
// de Zattia (por eso el ETL bifurca su select), y `clientes` tampoco. La marca ya no se elige acá:
// la fija el servidor (`MARCA` en `api/_crm.js`) y esta capa no tiene forma de pedir otra.

/** El canal "Mayorista", hardcodeado en el <option> (1714) y en el chequeo de 13416. */
export const CANAL_MAYORISTA = '10'

export type ModoCanal = typeof CANAL_MAYORISTA | 'all'

/**
 * Trae las ventas del CRM según el modo del select.
 *
 * 🔑 **Ya no sale de Supabase: lo sirve el servidor** (escalón 5 de la Fase S). `ventas` es lo
 * último que la anon key seguía leyendo, y de sus columnas las tres que importan —`total_price`,
 * `client_id` y `sale_state`— las lee **sólo este archivo**. Por eso no van por el pase de
 * `api/_espejo.js`, que no pide permiso: van por esta puerta, detrás del permiso de Clientes, como
 * ya habían ido el padrón (escalón 2) y las líneas con plata (escalón 3).
 *
 * En modo Mayorista siguen siendo DOS consultas unidas y deduplicadas por id —las del canal 10,
 * más **todas** las de los clientes marcados ★—, sólo que ahora las une el servidor.
 *
 * ⚠️ El orden importa y no es negociable: la marca `es_mayorista` sale de `crmSeg`,
 * o sea que el KV se lee ANTES que las ventas. Un `Promise.all` "de sentido común"
 * hace desaparecer a los clientes ★ en silencio.
 *
 * ⚠️ La paginación se fue con la mudanza: la hace el servidor, de a 1.000 y con `id` de desempate
 * en el `order`. PostgREST corta en 1000 filas sin avisar, y el legacy pedía este lote con
 * `sbFetch` (sin paginar): eran 445 ventas y $12,5M sin contar (f8977ca).
 *
 * ⚠️ Las ventas técnicas se descartan **acá y no en el servidor**. Los clientes internos de Gestión
 * Nube —"Sesión de fotos", "Falla", "Cambio"— tienen `client_id` como cualquier persona, así que
 * sin este filtro entraban al padrón como clientes con decenas de compras de $0. Y va sobre la
 * unión: `porMarcados` trae al cliente ★ sin filtro de canal, así que arrastra técnicas.
 */
export async function traerVentas(modo: ModoCanal, crmSeg: MapaSeguimiento): Promise<FilaVenta[]> {
  const flagged =
    modo === 'all' ? [] : Object.keys(crmSeg).filter((id) => crmSeg[id] && crmSeg[id].es_mayorista)

  const r = await apiFetch('/api/datos?recurso=crm', {
    method: 'POST',
    // ⚠️ Sin este header Vercel no parsea el body y el handler ve el modo vacío, sin error.
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ventas', modo, flagged }),
  })
  const d = (await r.json().catch(() => ({}))) as { ok?: boolean; ventas?: FilaVenta[]; error?: string }
  if (!r.ok || !d.ok) throw new Error(d.error || `Error ${r.status} pidiendo las ventas del CRM.`)
  return (d.ventas || []).filter((v) => !esVentaTecnica(v))
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
 *
 * 🔑 **Ya no sale de Supabase: lo sirve el servidor** (escalón 3 de la Fase S). `venta_detalles`
 * trae `unit_price` y `total`, y con la anon key —que viaja en el bundle— eso eran **122.952
 * líneas de facturación** de BDI a disposición de cualquiera. Los ids viajan en el body de un POST
 * y las tandas las arma el servidor, igual que el padrón de acá arriba.
 *
 * Los lotes de 150 sale_ids del legacy (13813) también se fueron con la mudanza: el servidor va de
 * a 500 y pagina, que es lo que el corte de 1.000 filas de PostgREST pide de verdad.
 */
export async function traerDetalles(ventaIds: number[]): Promise<FilaDetalle[]> {
  const ids = [...new Set(ventaIds.filter((v) => v != null))]
  if (!ids.length) return []

  const r = await apiFetch('/api/datos?recurso=crm', {
    method: 'POST',
    // ⚠️ Sin este header Vercel no parsea el body y el handler ve `ids` vacío, sin error.
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'detalles', ids }),
  })
  const d = (await r.json().catch(() => ({}))) as { ok?: boolean; detalles?: FilaDetalle[]; error?: string }
  if (!r.ok || !d.ok) throw new Error(d.error || `Error ${r.status} pidiendo el detalle de las compras.`)
  return d.detalles || []
}
