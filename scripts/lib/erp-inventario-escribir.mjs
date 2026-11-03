// Escribe en `inventario` (el espejo de GN) filas que salen del libro. Es un alimentador del espejo, ⛔ una puerta que lo lee: lo usan `scripts/erp-inventario-espejo.mjs` y `api/_erp-stock-corte.js`.
const DE_A = 500

/** @param {any} sb @param {Array<Record<string, unknown>>} filas */
export async function escribirInventario(sb, filas) {
  for (let i = 0; i < filas.length; i += DE_A) {
    const { error } = await sb.from('inventario').upsert(filas.slice(i, i + DE_A), { onConflict: 'product_id,size_id,store_name' })
    if (error) throw new Error(`escribiendo inventario: ${error.message}`)
  }
}
