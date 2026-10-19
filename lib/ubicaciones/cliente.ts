/**
 * Datos y escritura de Ubicaciones. Port de los fetch de la sección
 * (index.html:14405, 14509). La lectura es Supabase (fetchAll); la escritura va al
 * endpoint propio del Monitor (auth por header, vía apiFetch), que escribe la observación
 * en TODAS las variantes del producto en GN.
 *
 * Entra por el router `/api/deposito?recurso=observaciones` (antes era `/api/observaciones`, un
 * archivo propio): Vercel cuenta una función por archivo de ruta y el proyecto estaba en el
 * tope de 12 del plan Hobby. Ver el comentario de `api/deposito.js`.
 */

import { CUENTAS, type Cuenta } from '@/lib/cuentas'
import { fetchAll } from '@/lib/supabase/rest'
import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav'
import { computarUbicaciones } from './core'
import type { FilaInvUbi, UbiProducto } from './tipos'

/**
 * El depósito de cada marca, con el nombre EXACTO que tiene en GN (y en el espejo). ⚠️ El de Zattia
 * lleva un espacio al final: `'Deposito '`. Es el depósito de Lorena, ⛔ el de atrás del local (ese
 * es otra sección: `ubicaciones-local`, de Bruno). Zattia se sumó el 13-oct-2026 (Darío) para que la
 * lista de reposición salga en el orden en que se camina el depósito.
 */
export const DEPOSITO: Record<Marca, string> = { bdi: 'Deposito Minorista', zattia: 'Deposito ' }

/** Lee inventario del depósito de la marca + productos activos y arma la lista por producto. */
export async function cargarUbicaciones(marca: Marca): Promise<UbiProducto[]> {
  const cuenta: Cuenta = CUENTAS[marca]
  const [rows, prods] = await Promise.all([
    // El orden tiene que DESEMPATAR, no solo quedar lindo: `fetchAll` pagina de a 1.000 con
    // consultas separadas, y son ~2.700 renglones. Ordenando por `product_name` los 108
    // renglones de VIBE CASE quedan empatados, la base los puede devolver en distinto orden
    // en cada tanda, y en el corte se repite un renglón y se pierde otro. El perdido es el
    // caro: si era la variante con la ubicación distinta, el producto figura parejo y nunca
    // aparece en "A reparar". `product_id,size_id` es único dentro de un depósito (verificado
    // contra la base: 2.703 renglones, 2.703 combinaciones). El orden por nombre que se ve en
    // pantalla lo pone `computarUbicaciones` al final, así que no se pierde nada.
    fetchAll<FilaInvUbi>(cuenta, 'inventario', `select=product_id,product_name,sku,store_name,observation&store_name=eq.${encodeURIComponent(DEPOSITO[marca])}&order=product_id,size_id`),
    fetchAll<{ id: number | string }>(cuenta, 'productos', 'select=id&active=eq.1&order=id'),
  ])
  const activos = new Set(prods.map((p) => p.id))
  return computarUbicaciones(rows, activos)
}

/** Respuesta del endpoint de observaciones (por producto). */
type ObsResp = { ok?: boolean; error?: string; total?: number; reintentable?: boolean; pendientes?: number; errores?: { detalle?: string; status?: number | string }[] }

/**
 * Escribe la observación (ubicación) de un producto en GN. ESCRIBE (todas las
 * variantes del producto). Port del POST de ubicacionesGuardar/Reparar.
 *
 * `reintentable` le dice a la pantalla si vale la pena volver a intentar. Un producto de
 * muchas variantes puede cortarse por tiempo a mitad de camino (GN acepta 60 llamadas por
 * minuto y el handler escribe una por variante): eso SÍ se reintenta, y como el handler
 * saltea las que ya quedaron escritas, cada intento avanza. En cambio "no tiene variantes
 * en el depósito" no mejora por insistir, así que se corta ahí.
 */
export async function guardarObservacion(marca: Marca, productId: number | string, observation: string): Promise<{ ok: boolean; error?: string; reintentable?: boolean }> {
  try {
    const r = await apiFetch('/api/deposito?recurso=observaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marca, productId, observation }),
    })
    const d: ObsResp = await r.json().catch(() => ({}))
    // Un ok sobre 0 variantes no es un guardado. El endpoint ya lo contesta como error, pero
    // el chequeo queda acá también: dar por guardado algo que no se escribió es el modo de
    // falla más caro de esta pantalla (limpia el pendiente y el trabajo se pierde sin aviso).
    if (d && d.ok && (d.total ?? 0) > 0) return { ok: true }
    const error = d?.error || (d?.errores?.[0] && (d.errores[0].detalle || 'HTTP ' + d.errores[0].status)) || (d?.pendientes ? `${d.pendientes} variante(s) sin escribir` : '') || 'desconocido'
    // También se reintenta cuando GN frenó por ráfaga (429/5xx), aunque no haya llegado a leer
    // las variantes: es lo que dejaba "6 no se pudieron guardar" al cargar muchas de una.
    const frenoGN = !!d?.reintentable || r.status === 429 || r.status >= 500
    return { ok: false, error, reintentable: frenoGN || (d?.total ?? 0) > 0 }
  } catch (e) {
    // Corte de red o función que se pasó de tiempo: es justo el caso que sí conviene reintentar.
    return { ok: false, error: e instanceof Error ? e.message : String(e), reintentable: true }
  }
}
