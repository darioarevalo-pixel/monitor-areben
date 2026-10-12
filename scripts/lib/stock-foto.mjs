/**
 * Foto diaria del stock de GN (tabla `stock_foto`, `sql/migrate-stock-foto.sql`).
 *
 * POR QUÉ EXISTE
 * El libro de stock en sombra (ERP propio, Bruno 12-oct-2026) compara cada día cuánto cambió el stock
 * de GN contra los movimientos que conoce el monitor. Para eso hace falta UNA foto por día y tomada
 * siempre a la misma hora: la del sync de las 06:40, con el local cerrado. El espejo `inventario` la
 * pisa en cada corrida y `stock_cambios` compara contra la última corrida, que puede ser la de
 * mediodía (medido: el cron llega entre las 08:30 y las 12:10).
 *
 * 🔑 GANA LA PRIMERA DEL DÍA: el insert va con `ignoreDuplicates` sobre (fecha, variante, depósito),
 * así la corrida tarde ⛔ pisa la de la mañana. Si la de las 06:40 falló, queda la de más tarde, y
 * `tomada_en` lo dice: quien compare tiene que mirarlo.
 *
 * Se guardan sólo las filas con cantidad ≠ 0: la que falta vale 0.
 *
 * ⛔ NUNCA FRENA EL SYNC: si falla, devuelve el error y quien llama lo suma a `problemas[]`.
 */

/** El día de Argentina (UTC−3, sin horario de verano) de un instante. */
export function fechaAR(fecha) {
  return new Date(fecha.getTime() - 3 * 3600e3).toISOString().slice(0, 10)
}

/**
 * Las filas de la foto a partir del inventario recién bajado. Puro.
 * @param {Array<{product_id:number,size_id:number,store_name:string,available_quantity:number}>} filas
 * @param {Date} ahora
 */
export function filasDeFoto(filas, ahora) {
  const fecha = fechaAR(ahora)
  const tomada_en = ahora.toISOString()
  const out = []
  for (const f of filas) {
    const cantidad = Number(f.available_quantity ?? 0)
    if (!cantidad) continue
    out.push({ fecha, product_id: f.product_id, size_id: f.size_id, store_name: f.store_name, cantidad, tomada_en })
  }
  return out
}

/**
 * Guarda la foto del día si todavía no hay una. Llamar con el inventario de GN recién bajado.
 * @returns {Promise<{filas:number, error?:string}>}
 */
export async function guardarFotoDelDia(supabase, filas, ahora = new Date()) {
  try {
    const foto = filasDeFoto(filas, ahora)
    for (let i = 0; i < foto.length; i += 1000) {
      const { error } = await supabase
        .from('stock_foto')
        .upsert(foto.slice(i, i + 1000), { onConflict: 'fecha,product_id,size_id,store_name', ignoreDuplicates: true })
      if (error) throw new Error(`guardar stock_foto: ${error.message}`)
    }
    return { filas: foto.length }
  } catch (e) {
    return { filas: 0, error: e.message }
  }
}
