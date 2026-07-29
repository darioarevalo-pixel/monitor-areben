/**
 * Purga del espejo de ventas: lo que Gestión Nube ya no tiene, se borra.
 *
 * POR QUÉ EXISTE
 * El sync de ventas nacía solo-upsert y con ventana incremental (`from = último
 * sync`). Consecuencia: una venta entraba al espejo el día que se cargó y **nunca
 * se volvía a leer**. Si después se anulaba, se le cambiaba el estado, el importe
 * o se le sacaba un producto, el Monitor seguía mostrando la foto del primer día.
 * Es el mismo agujero que tenía inventario antes de su purga (ver sync-diario.js),
 * pero acá el que quedaba mal era el dinero: Ventas mensuales, Márgenes, Gerencial
 * y Comisiones leen esta tabla.
 *
 * CÓMO SE ARREGLA
 * El sync baja SIEMPRE los últimos DIAS_REPASO días completos (además del tramo
 * incremental, si el sync no corrió por más tiempo). El upsert ya corrige estado,
 * importe y costo. Lo que falta —y hace este módulo— es lo que el upsert no puede:
 * borrar lo que dejó de existir.
 *
 * ORDEN OBLIGATORIO: primero el upsert, después la purga. Si una venta cambió de
 * fecha en GN, al purgar antes la veríamos con la fecha vieja y la borraríamos por
 * "desaparecida". Con el upsert ya aplicado, el espejo tiene la fecha nueva y la
 * venta cae del lado correcto de la ventana.
 *
 * TOPES DE SEGURIDAD: si la purga fuera a borrar más del `topePorc` del universo
 * que mira, se aborta entera y se avisa. Una respuesta rara de GN (o un rango que
 * volvió a medias) no puede vaciar el espejo en silencio. La descarga ya corta con
 * error si GN falla, así que esto es la segunda red, no la primera.
 *
 * RESPALDO: quien llame puede pasar `respaldo`, y las filas completas se guardan antes
 * de borrarse. Lo que se borra ya no existe en GN, así que no hay de dónde volver a
 * bajarlo — el respaldo es la única vuelta atrás. La purga histórica lo usa siempre.
 *
 * El porcentaje solo no alcanza: sobre un universo chico, el 10% es menos de una
 * fila y la purga no borraría NUNCA (una anulación entre dos ventas es el 50%). Por
 * eso el tope real es `max(PISO_BORRADO, porcentaje)`: el porcentaje manda cuando el
 * volumen es grande —que es cuando un borrado masivo hace daño— y el piso deja pasar
 * las anulaciones sueltas de siempre.
 */

/** Días hacia atrás que se releen completos en cada corrida. */
export const DIAS_REPASO = 90

/** Filas que la purga puede borrar aunque superen el porcentaje. Ver comentario de arriba. */
const PISO_BORRADO = 20

/** Devuelve YYYY-MM-DD de hoy menos `dias`. */
export function fechaDesdeRepaso(dias = DIAS_REPASO, hoy = new Date()) {
  const d = new Date(hoy.getTime() - dias * 24 * 60 * 60 * 1000)
  return d.toISOString().substring(0, 10)
}

/**
 * Guarda las filas completas antes de borrarlas, si el llamador pasó un `respaldo`.
 * Lo que se borra son filas que Gestión Nube ya no tiene: si nos equivocamos, no hay
 * de dónde volver a bajarlas. Con el respaldo se reponen.
 */
async function respaldar(supabase, tabla, ids, respaldo) {
  if (!respaldo || !ids.length) return
  const filas = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from(tabla).select('*').in('id', ids.slice(i, i + 200))
    if (error) throw new Error(`no se pudo respaldar ${tabla}: ${error.message}`)
    filas.push(...(data || []))
  }
  await respaldo(tabla, filas)
}

/**
 * Lee una tabla entera salteando el tope de 1000 filas de PostgREST.
 *
 * EL ORDEN NO ES DECORATIVO. Sin un `order` estable, dos páginas consecutivas pueden
 * pisarse: la misma fila vuelve en la página siguiente y otra no aparece nunca. Eso
 * infla los totales (y con ellos el tope de seguridad, que se afloja solo) y puede
 * dejar filas sin revisar. Se detectó porque una auditoría contó 4.969 ventas en el
 * espejo contra 4.932 en GN y, al mismo tiempo, ninguna "solo en el espejo": las 37
 * de diferencia eran repetidas de la paginación, no datos.
 */
async function leerPaginado(query) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await query(desde, desde + 999)
    if (error) throw new Error(error.message)
    filas.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return filas
}

/**
 * Borra del espejo las ventas del rango que GN ya no devuelve (anuladas o borradas).
 * Los renglones se van solos: venta_detalles.sale_id tiene ON DELETE CASCADE.
 *
 * @param supabase  client de @supabase/supabase-js
 * @param {Set<number>} idsGN  ids que GN devolvió para el rango
 * @param {string} desde  YYYY-MM-DD inclusive
 * @param {string} hasta  YYYY-MM-DD inclusive
 * @param {{topePorc?: number, simular?: boolean, respaldo?: ((tabla: string, filas: object[]) => void | Promise<void>) | null}} opciones
 *        topePorc: fracción máxima del rango que se permite borrar.
 *        simular: informa qué borraría y no toca nada (la purga histórica arranca así).
 *        respaldo: recibe las filas completas antes del borrado. Si tira error, no se borra.
 * @returns {Promise<number>} ventas borradas (o que se borrarían, en simulación)
 */
export async function purgarVentas(supabase, idsGN, desde, hasta, { topePorc = 0.1, simular = false, respaldo = null } = {}) {
  const espejo = await leerPaginado((a, b) =>
    supabase.from('ventas').select('id').gte('date_sale', desde).lte('date_sale', hasta).order('id').range(a, b)
  )
  const aBorrar = espejo.filter(v => !idsGN.has(v.id)).map(v => v.id)

  if (!aBorrar.length) {
    console.log(`[ventas] purga: nada para borrar (${espejo.length} en el rango).`)
    return 0
  }
  const pasaTope = aBorrar.length <= Math.max(PISO_BORRADO, espejo.length * topePorc)

  // La simulación informa SIEMPRE el número real, pase o no el tope: para eso está.
  // Si no pasa, avisa que con --aplicar esa corrida no borraría nada.
  if (simular) {
    console.log(`[ventas] SIMULACIÓN: ${aBorrar.length}/${espejo.length} venta(s) entre ${desde} y ${hasta} ya no están en GN. No se borró nada.`)
    if (!pasaTope) console.warn(`[ventas]   ⚠️  supera el tope del ${Math.round(topePorc * 100)}%: al aplicar, esta purga se frenaría sola.`)
    return aBorrar.length
  }

  if (!pasaTope) {
    console.warn(
      `[ventas] purga ABORTADA por seguridad: borraría ${aBorrar.length}/${espejo.length} ventas ` +
      `(>${Math.round(topePorc * 100)}%) entre ${desde} y ${hasta}. Revisar a mano.`
    )
    return 0
  }

  await respaldar(supabase, 'ventas', aBorrar, respaldo)

  let borradas = 0
  for (let i = 0; i < aBorrar.length; i += 200) {
    const lote = aBorrar.slice(i, i + 200)
    const { error } = await supabase.from('ventas').delete().in('id', lote)
    if (error) { console.warn(`  ⚠️  no se pudo borrar lote de ventas: ${error.message}`); break }
    borradas += lote.length
  }
  console.log(`[ventas] purga: ${borradas} venta(s) que GN ya no tiene → borradas (con sus renglones).`)
  return borradas
}

/**
 * Sincroniza los renglones de las ventas que siguen vivas: borra los que GN ya no
 * trae (producto sacado de la venta). Los que se agregaron o cambiaron ya entraron
 * por el upsert.
 *
 * SALVAGUARDA: una venta que GN devuelve SIN renglones no purga nada. Un array
 * vacío es indistinguible de un problema al traer el detalle, y en la duda no se
 * vacía una venta que en el espejo tiene productos.
 *
 * @param supabase  client de @supabase/supabase-js
 * @param {Map<number, Set<number>>} detallesPorVenta  saleId -> ids de renglón vivos en GN
 * @param {{topePorc?: number, simular?: boolean, respaldo?: ((tabla: string, filas: object[]) => void | Promise<void>) | null}} opciones
 * @returns {Promise<number>} renglones borrados (o que se borrarían, en simulación)
 */
export async function purgarDetalles(supabase, detallesPorVenta, { topePorc = 0.1, simular = false, respaldo = null } = {}) {
  const saleIds = [...detallesPorVenta.keys()].filter(id => detallesPorVenta.get(id).size > 0)
  if (!saleIds.length) return 0

  const espejo = []
  for (let i = 0; i < saleIds.length; i += 200) {
    const lote = saleIds.slice(i, i + 200)
    const filas = await leerPaginado((a, b) =>
      supabase.from('venta_detalles').select('id, sale_id').in('sale_id', lote).order('id').range(a, b)
    )
    espejo.push(...filas)
  }

  const aBorrar = espejo
    .filter(d => !detallesPorVenta.get(d.sale_id)?.has(d.id))
    .map(d => d.id)

  if (!aBorrar.length) {
    console.log(`[ventas] purga de renglones: nada para borrar (${espejo.length} revisados).`)
    return 0
  }
  const pasaTope = aBorrar.length <= Math.max(PISO_BORRADO, espejo.length * topePorc)

  if (simular) {
    console.log(`[ventas] SIMULACIÓN: ${aBorrar.length}/${espejo.length} renglón(es) ya no están en GN. No se borró nada.`)
    if (!pasaTope) console.warn(`[ventas]   ⚠️  supera el tope del ${Math.round(topePorc * 100)}%: al aplicar, esta purga se frenaría sola.`)
    return aBorrar.length
  }

  if (!pasaTope) {
    console.warn(
      `[ventas] purga de renglones ABORTADA por seguridad: borraría ${aBorrar.length}/${espejo.length} ` +
      `(>${Math.round(topePorc * 100)}%). Revisar a mano.`
    )
    return 0
  }

  await respaldar(supabase, 'venta_detalles', aBorrar, respaldo)

  let borrados = 0
  for (let i = 0; i < aBorrar.length; i += 200) {
    const lote = aBorrar.slice(i, i + 200)
    const { error } = await supabase.from('venta_detalles').delete().in('id', lote)
    if (error) { console.warn(`  ⚠️  no se pudo borrar lote de renglones: ${error.message}`); break }
    borrados += lote.length
  }
  console.log(`[ventas] purga de renglones: ${borrados} producto(s) sacados de ventas → borrados del espejo.`)
  return borrados
}
