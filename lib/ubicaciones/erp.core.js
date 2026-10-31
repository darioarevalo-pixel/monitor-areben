/**
 * **La ubicación de una LÍNEA QUE YA ESTÁ EN EL ERP sale del ERP** (motor sql/066; erp-stunned §8.5, diseño aprobado por Bruno el
 * 31-oct). Los dos lectores del monitor —Ubicaciones y Reposición «llevar» (orden del armado y la columna «Ubic.» del PDF)— leen
 * `inventario.observation` del espejo de GN; desde el corte de la línea, GN ⛔ se escribe (`api/_observaciones.js`) ⇒ lo de GN
 * queda viejo. Esto pisa la `observation` de las filas de las líneas cortadas con la del ERP, y deja las demás como vinieron.
 *
 * 🔑 La línea de la fila sale del SKU de la VARIANTE (la misma regla del libro: `lineaDe` del motor), el depósito del `store_name`.
 * 🔑 Una variante de línea cortada SIN fila en el ERP ⇒ `observation: null` (⛔ la vieja de GN: el ERP es la verdad, y la copia
 *    del día antes del corte ya le pasó todo).
 * Puro: la lectura vive en `api/_ubicaciones-erp.js`; la usa el cliente (`lib/ubicaciones/cliente.ts`, `lib/reposicion/cliente.ts`).
 */
import { depositoDe, lineaDe } from '../../motor/depositos.mjs'

/**
 * @template {{ product_id: number | string, size_id?: number | string, sku?: string | null, store_name?: string | null, observation?: unknown }} F
 * @param {F[]} filas las del espejo `inventario`
 * @param {'bdi' | 'zattia'} base
 * @param {{ lineas: string[], filas: Array<{ deposito: string, product_id: number, size_id: number, texto: string }> }} erp
 * @returns {F[]}
 */
export function conUbicacionErp(filas, base, erp) {
  if (!erp || !Array.isArray(erp.lineas)) throw new Error('conUbicacionErp: falta lo del ERP (lineas)')
  if (!erp.lineas.length || !Array.isArray(filas)) return filas
  const cortadas = new Set(erp.lineas)
  const texto = new Map((erp.filas || []).map((u) => [`${u.deposito}:${Number(u.product_id)}:${Number(u.size_id)}`, u.texto]))
  return filas.map((f) => {
    if (!f || !cortadas.has(lineaDe(base, f.sku))) return f
    const dep = depositoDe(base, f.store_name)
    const t = dep ? texto.get(`${dep}:${Number(f.product_id)}:${Number(f.size_id)}`) : undefined
    return { ...f, observation: t ?? null }
  })
}
