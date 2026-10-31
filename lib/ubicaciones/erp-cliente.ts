/**
 * La ubicación del ERP para las líneas ya cortadas de una marca (`api/_ubicaciones-erp.js`) y la mezcla con las filas del espejo
 * (`erp.core.js`). La usan Ubicaciones y Reposición. 🔴 Si el ERP ⛔ contesta, TIRA: mostrar la de GN de una línea cortada es
 * mostrar una ubicación vieja sin avisar.
 */
import { apiFetch } from '@/lib/api-fetch'
import type { Marca } from '@/lib/nav'
import { conUbicacionErp } from './erp.core.js'

export type UbicacionesErp = { lineas: string[]; filas: Array<{ deposito: string; product_id: number; size_id: number; texto: string }> }

export async function leerUbicacionesErp(marca: Marca): Promise<UbicacionesErp> {
  const r = await apiFetch(`/api/deposito?recurso=ubicaciones-erp&marca=${marca}`)
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !Array.isArray(d?.lineas)) throw new Error(d?.error || `No se pudo leer la ubicación del ERP (HTTP ${r.status})`)
  return d as UbicacionesErp
}

/** Las filas del espejo con la `observation` del ERP en las líneas cortadas. */
export async function conUbicacionDelErp<F extends { product_id: number | string; size_id?: number | string; sku?: string | null; store_name?: string | null; observation?: unknown }>(
  marca: Marca,
  filas: F[],
): Promise<F[]> {
  return conUbicacionErp(filas, marca, await leerUbicacionesErp(marca))
}
