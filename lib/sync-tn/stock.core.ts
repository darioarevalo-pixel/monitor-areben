/**
 * El núcleo de **«Aplicar las N con diferencia»** (Integraciones → Stock, sync GN→TN de Stunned).
 *
 * Acá vive lo único que puede salir caro de ese botón, y por eso es puro y está testeado:
 *
 * 🔴 **Una tanda vuelve PARCIAL.** `api/tn-categorias.js` (acción `'stock'`) escribe variante por
 * variante contra Tienda Nube y contesta `{ aplicados, errores[] }`: puede haber escrito 17 de 20.
 * Un «listo» global sobre eso sería mentir sobre la tienda viva. La regla es que **cada fila se
 * resuelve sola**: la que escribió queda en `TN = GN`, la que falló **conserva su `delta`** y se
 * lleva el texto del error.
 *
 * 🔴 **Y una tanda puede volver SIN RESPUESTA** (timeout de la función, red). Ahí no se sabe si TN
 * se escribió o no, y afirmar cualquiera de las dos cosas es inventar: esas filas quedan marcadas
 * como **sin confirmar** —⛔ no como error y ⛔ no como hechas— y el único que contesta de verdad es
 * volver a correr el dry-run, que lee TN con `refresh=1`.
 *
 * La fila se reconoce por `product_id|variant_id` y no por SKU: es lo que se le mandó al handler y
 * lo único que el handler devuelve en `errores[]`.
 */

/** Una fila del dry-run de stock: qué tiene GN, qué tiene TN, y qué pasó si se intentó escribir. */
export type DryRow = {
  sku: string
  nombre: string | null
  tnProductId: string | null
  tnVariantId: string | null
  gn: number
  tn: number | null
  delta: number | null
  /** Qué contestó TN la última vez que se intentó escribir ESTA fila. La fila que falla conserva su `delta`. */
  err?: string | null
}

/** Lo que contesta `api/tn-categorias.js` con `accion:'stock'`. Los campos vienen como se mandaron. */
export type RespStock = {
  ok?: boolean
  aplicados?: number
  errores?: { product_id?: unknown; variant_id?: unknown; status?: number; msg?: string; error?: string }[]
  error?: string
}

/** Identidad de una fila para TN: es lo que viaja en el update y lo único que vuelve en `errores[]`. */
export const claveTn = (pid: unknown, vid: unknown) => `${String(pid)}|${String(vid)}`

/**
 * Las filas que el botón masivo escribiría: hay diferencia contra TN **y** se sabe a qué variante
 * de TN escribirle. Una fila sin `tn` (TN no gestiona stock ahí) tiene `delta` nulo y no entra.
 */
export const candidatasDeStock = (rows: DryRow[]): DryRow[] =>
  rows.filter((r) => r.delta != null && r.delta !== 0 && r.tnProductId != null && r.tnVariantId != null)

/** Parte una lista en tandas de `tam`. Con `tam` inválido devuelve una sola tanda: nunca un bucle infinito. */
export function enTandas<T>(xs: T[], tam: number): T[][] {
  if (!Number.isFinite(tam) || tam < 1) return xs.length ? [xs.slice()] : []
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += tam) out.push(xs.slice(i, i + tam))
  return out
}

/** El texto que se le muestra a la fila que falló: el de TN si vino, y si no algo que igual diga qué pasó. */
const textoError = (e: NonNullable<RespStock['errores']>[number]): string =>
  (e.msg && String(e.msg).trim()) || (e.error && String(e.error).trim()) || (e.status ? `TN contestó ${e.status}` : 'TN rechazó la escritura')

/**
 * Aplica sobre `rows` lo que contestó UNA tanda. Devuelve las filas nuevas y **cuántas se
 * escribieron de verdad**, que sale de contar las que no tienen error — no del `aplicados` del
 * handler: ese es un número suelto y no dice *cuál*.
 */
export function aplicarResultadoTanda(rows: DryRow[], enviadas: DryRow[], resp: RespStock): { rows: DryRow[]; ok: number; fallaron: number } {
  const errorPorClave = new Map<string, string>()
  for (const e of resp?.errores || []) errorPorClave.set(claveTn(e.product_id, e.variant_id), textoError(e))

  const mandadas = new Map<string, DryRow>()
  for (const r of enviadas) mandadas.set(claveTn(r.tnProductId, r.tnVariantId), r)

  let ok = 0
  let fallaron = 0
  const out = rows.map((r) => {
    const k = claveTn(r.tnProductId, r.tnVariantId)
    if (!mandadas.has(k)) return r
    const err = errorPorClave.get(k)
    if (err) {
      fallaron++
      return { ...r, err } // ⛔ conserva `tn` y `delta`: en TN no cambió nada.
    }
    ok++
    return { ...r, tn: r.gn, delta: 0, err: null }
  })
  return { rows: out, ok, fallaron }
}

/**
 * La tanda no contestó. Las filas quedan **sin confirmar**: se dice que no se sabe, porque TN pudo
 * haber quedado escrito igual. ⛔ Marcarlas como error diría que no se escribió, y eso no se sabe.
 */
export function marcarSinConfirmar(rows: DryRow[], enviadas: DryRow[], motivo: string): DryRow[] {
  const mandadas = new Set(enviadas.map((r) => claveTn(r.tnProductId, r.tnVariantId)))
  return rows.map((r) => (mandadas.has(claveTn(r.tnProductId, r.tnVariantId)) ? { ...r, err: `Sin confirmar: ${motivo}. Volvé a verificar para ver cómo quedó Tienda Nube.` } : r))
}
