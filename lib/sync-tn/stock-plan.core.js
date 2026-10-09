/**
 * Qué variantes de Stunned tienen el stock de Tienda Nube distinto al de Gestión Nube, y si es
 * seguro escribirlas sin que nadie mire.
 *
 * Lo usan los DOS caminos que sincronizan stock GN→TN, y por eso vive acá y no en ninguno:
 * - el botón de Integraciones → Stock (`components/integraciones/Integraciones.tsx`), con alguien
 *   mirando la lista antes de aplicar;
 * - el cron diario (`scripts/sync-stock-stunned.mjs`, paso de `sync-diario-zattia.yml`), sin nadie.
 *
 * 🔑 El criterio es el de siempre: GN = **suma de todas las ubicaciones** (Depósito + Local) y sólo
 * entran las variantes **validadas** en `sku_map`. Cambiarlo acá lo cambia en los dos lados.
 */

// Qué variantes de `inventario` (la copia de GN de Zattia) son de Stunned. Es un filtro por
// PREFIJO DE SKU porque `inventario` no trae la marca.
//
// 🔴 `CAM-` está por la CAMPERA WEAR, que rompió la convención: nació `CAM-0001` en vez de
// `STU-CAM-0001`, así que con el filtro viejo (`STU*`) quedaba invisible para el mapeo y sus 4
// talles nunca se emparejaban. El arreglo de fondo es el SKU, no esto; mientras tanto, acá.
//
// ⚠️ **El guion de `CAM-` NO es decorado.** Zattia tiene variantes cuyo SKU es un nombre suelto
// —"CAMPERA ROCK - VERDE INGLÉS"—, así que `CAM*` las arrastraría a un mapeo que es de `stunned`.
// `CAM-*` no las toca. Antes de sumar un prefijo acá, mirar contra qué más matchea.
export const FILTRO_OR_STUNNED = 'sku.ilike.STU*,sku.ilike.CAM-*'
/** Lo mismo, como parámetro de PostgREST crudo (`sbFetch`). */
export const FILTRO_SKU_STUNNED = `or=(${FILTRO_OR_STUNNED})`

/**
 * Stock de GN por SKU sumando las ubicaciones, y el nombre del producto para mostrar.
 * @param {{ sku: string|null, product_name?: string|null, available_quantity: number|null }[]} inv
 */
export function stockGnPorSku(inv) {
  const stock = new Map()
  const nombre = new Map()
  for (const r of inv || []) {
    if (!r.sku) continue
    stock.set(r.sku, (stock.get(r.sku) || 0) + (Number(r.available_quantity) || 0))
    if (r.product_name && !nombre.has(r.sku)) nombre.set(r.sku, r.product_name)
  }
  return { stock, nombre }
}

/**
 * Stock de TN por SKU, de `tiendanube-audit?variantes=1`. `null` = TN no gestiona stock ahí.
 * @param {{ variantes?: { sku?: string|null, stock?: number|null }[] }[]} productos
 */
export function stockTnPorSku(productos) {
  const out = new Map()
  for (const p of productos || []) for (const v of p.variantes || []) if (v.sku) out.set(v.sku, v.stock ?? null)
  return out
}

/**
 * Una fila por variante validada: qué tiene GN, qué tiene TN y la diferencia. Un SKU que no está
 * en el inventario de GN cuenta **0**: es el criterio del botón desde el 23-ago.
 * @returns {import('./stock.core').DryRow[]}
 */
export function armarFilasStock(validadas, gn, tnStock) {
  const filas = (validadas || []).map((m) => {
    const g = gn.stock.get(m.sku) ?? 0
    const tn = tnStock.has(m.sku) ? tnStock.get(m.sku) : null
    return {
      sku: m.sku,
      nombre: gn.nombre.get(m.sku) ?? null,
      tnProductId: m.tn_product_id ?? null,
      tnVariantId: m.tn_variant_id ?? null,
      gn: g,
      tn,
      delta: tn == null ? null : g - tn,
    }
  })
  return filas.sort((a, b) => a.sku.localeCompare(b.sku))
}

/**
 * Las filas que se escribirían: hay diferencia contra TN **y** se sabe a qué variante de TN
 * escribirle. Una fila sin `tn` (TN no gestiona stock ahí) tiene `delta` nulo y no entra.
 */
export const candidatasDeStock = (rows) =>
  rows.filter((r) => r.delta != null && r.delta !== 0 && r.tnProductId != null && r.tnVariantId != null)

/** Más de esta proporción de las variantes con stock en TN pasando a 0 de un saque = algo vino roto. */
export const TOPE_CEROS = 0.3
/** …salvo que sean pocas: con 3 o 4 variantes agotadas en un día no hay nada raro. */
export const CEROS_SIEMPRE_OK = 5

/**
 * 🔴 El freno del cron. Sin nadie mirando, un inventario que bajó vacío o a medias **pone en 0 la
 * tienda viva** —y una tienda en 0 no vende—, así que antes de escribir se pregunta si el dato
 * parece sano. Devuelve el motivo para NO escribir, o `null` si se puede.
 *
 * ⛔ No mira cuántas SUBEN: un stock que sube por error vende de más, pero lo frena el local al
 * preparar; uno que baja a 0 por error deja de vender callado.
 */
export function motivoParaFrenar(filas, { filasInventario }) {
  if (!filasInventario) return 'El inventario de Gestión Nube de Stunned vino VACÍO: no se escribe nada.'
  if (!filas.length) return 'No hay variantes validadas en el mapeo.'
  const conStockTn = filas.filter((r) => r.tn != null && r.tn > 0).length
  if (filas.every((r) => r.tn == null)) return 'Tienda Nube no devolvió el stock de ninguna variante validada.'
  const aCero = filas.filter((r) => r.tn != null && r.tn > 0 && r.gn === 0).length
  if (aCero > CEROS_SIEMPRE_OK && aCero > conStockTn * TOPE_CEROS) {
    return `Pondría en 0 ${aCero} de ${conStockTn} variantes con stock en Tienda Nube (más del ${Math.round(TOPE_CEROS * 100)}%). Parece un inventario incompleto: no se escribe nada.`
  }
  return null
}

/**
 * Todo lo que el cron necesita de una vez: las filas, cuáles se escribirían y si hay que frenar.
 * @param {{ sku: string, tn_product_id?: unknown, tn_variant_id?: unknown }[]} validadas  `sku_map` validado
 * @param {{ sku: string|null, product_name?: string|null, available_quantity: number|null }[]} inv  espejo de GN, sólo Stunned
 * @param {{ variantes?: { sku?: string|null, stock?: number|null }[] }[]} productosTn  `tiendanube-audit?variantes=1`
 */
export function planDeStock(validadas, inv, productosTn) {
  const filas = armarFilasStock(validadas, stockGnPorSku(inv), stockTnPorSku(productosTn))
  return { filas, candidatas: candidatasDeStock(filas), freno: motivoParaFrenar(filas, { filasInventario: (inv || []).length }) }
}
