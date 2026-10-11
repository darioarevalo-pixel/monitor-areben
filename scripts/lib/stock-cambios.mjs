/**
 * Historia de stock: antes de que un sync pise el espejo `inventario`, se anota qué variantes
 * cambiaron de cantidad (tabla `stock_cambios`, `sql/migrate-stock-cambios.sql`).
 *
 * POR QUÉ EXISTE
 * Para separar un ingreso del local entre «para exhibir» y «al depósito del local» hay que saber si
 * la variante quedó en cero en el Local desde el último chequeo de exhibición. El espejo sólo tiene
 * la foto de ahora: un 3 → 0 → 2 se ve como «2», como si nunca se hubiera cortado, y la colgada que
 * se vendió no se repone. Ver el doc de Darío del 11-oct y el comentario de la migración.
 *
 * ORDEN OBLIGATORIO: esto corre ANTES del upsert. Después, el espejo ya tiene la foto nueva y no
 * hay contra qué comparar.
 *
 * ⛔ NUNCA FRENA EL SYNC: si falla, devuelve el error y quien llama lo suma a sus problemas. Un
 * stock sin historia es malo; un stock sin actualizar es peor (lo lee todo el monitor).
 *
 * LÍMITE CONOCIDO: un sync ve fotos, ⛔ movimientos. Un 0 a la mañana repuesto a la tarde, entre dos
 * syncs, no queda acá: eso se cubre cruzando con las ventas, del lado de quien consulta.
 */

const clave = (r) => `${r.product_id}|${r.size_id}|${r.store_name}`

/**
 * Cambios entre el espejo y la foto nueva. Puro.
 * - variante nueva (no estaba en el espejo) ⇒ `antes: null`
 * - misma cantidad ⇒ nada
 * - variante que estaba y ya no viene ⇒ nada: la borra la limpieza del espejo y ⛔ no es un movimiento
 *   de stock (es una variante dada de baja en GN).
 * @param {Map<string, number>} antes clave → cantidad, leído del espejo
 * @param {Array<{product_id:number,size_id:number,store_name:string,available_quantity:number}>} filas
 */
export function cambiosDeStock(antes, filas) {
  const cambios = []
  for (const f of filas) {
    const k = clave(f)
    const despues = Number(f.available_quantity ?? 0)
    const previo = antes.has(k) ? antes.get(k) : null
    if (previo === despues) continue
    cambios.push({
      product_id: f.product_id,
      size_id: f.size_id,
      store_name: f.store_name,
      antes: previo,
      despues,
    })
  }
  return cambios
}

/** El espejo entero, paginado: la tabla pasa las 1.000 filas y PostgREST corta ahí callado. */
async function leerEspejo(supabase) {
  const antes = new Map()
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from('inventario')
      .select('product_id,size_id,store_name,available_quantity')
      .order('product_id').order('size_id').order('store_name')
      .range(desde, desde + 999)
    if (error) throw new Error(`leer espejo: ${error.message}`)
    for (const r of data || []) antes.set(clave(r), Number(r.available_quantity ?? 0))
    if (!data || data.length < 1000) break
  }
  return antes
}

/**
 * Lee el espejo, calcula los cambios contra `filas` y los guarda. Llamar ANTES del upsert.
 * @returns {Promise<{cambios:number, error?:string}>}
 */
export async function registrarCambiosDeStock(supabase, filas, origen) {
  try {
    const antes = await leerEspejo(supabase)
    // Espejo vacío = base nueva o algo raro: anotar 2.000 «altas» no es historia, es ruido.
    if (antes.size === 0) return { cambios: 0, error: 'espejo vacío: no hay contra qué comparar' }
    const cambios = cambiosDeStock(antes, filas)
    const visto_en = new Date().toISOString() // un solo sello por corrida: los cambios de un sync son una foto
    for (let i = 0; i < cambios.length; i += 500) {
      const lote = cambios.slice(i, i + 500).map((c) => ({ ...c, visto_en, origen }))
      const { error } = await supabase.from('stock_cambios').insert(lote)
      if (error) throw new Error(`guardar stock_cambios: ${error.message}`)
    }
    return { cambios: cambios.length }
  } catch (e) {
    return { cambios: 0, error: e.message }
  }
}
