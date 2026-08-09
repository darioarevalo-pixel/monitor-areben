/**
 * Leer `meta_ads_snapshot_dia`. **Una sola implementación**, para los handlers y para los scripts.
 *
 * # ⚠️ Por qué esto es una función y no un `.select()` suelto en cada lugar
 *
 * **PostgREST corta en 1.000 filas por defecto y no avisa**: devuelve las primeras mil como si
 * fueran todas. La foto tiene cuatro niveles y decenas de miles de filas a nivel aviso, así que sin
 * paginar cada consumidor pierde el pasado más viejo **en silencio** — y «no está» es
 * indistinguible de «no existió». Ya pasó una vez con otro tope: la Biblioteca dibujaba «este aviso
 * ya no está en Meta» cuando lo que había pasado es que el aviso estaba en la página 2.
 *
 * Estaba escrito tres veces —`api/_meta-biblioteca.js`, `api/_meta-reglas.js` y
 * `scripts/evaluar-reglas-meta.mjs`— con el mismo comentario copiado. Tres copias de una defensa es
 * una defensa que se va a arreglar en dos lados cuando falle.
 *
 * Es `.js` plano porque lo importan handlers de `api/` y scripts de `scripts/`, que corren en Node
 * sin pasar por el compilador de Next.
 */

export const TABLA_SNAPSHOT = 'meta_ads_snapshot_dia'

/** Cuántas filas pide por vuelta. Es el tope de PostgREST: pedir más no trae más. */
const PAGINA = 1000

/**
 * Las filas de la foto que cumplan los filtros, todas.
 *
 * Devuelve `{ filas }` o `{ error }` — nunca tira. Quien la llama decide si eso es un 502 o un
 * renglón en `problemas[]`, que es la diferencia entre un handler y un script.
 *
 * @param sb      cliente de Supabase
 * @param cols    las columnas, explícitas y en una string. Nunca `*`: la tabla tiene 25 y las que
 *                no se usan igual viajan por la red.
 * @param desde   fecha ISO inclusive, o `null` para «desde el principio de la foto»
 * @param hasta   fecha ISO inclusive, o `null` para «hasta el final»
 * @param nivel   un nivel de `NIVELES_SNAPSHOT`, o `null` para todos
 * @param lineas  las líneas a traer, o `null` para todas. ⚠️ Con `[]` no filtra nada: quien quiera
 *                «ninguna» tiene que cortar antes, porque un array vacío que devuelve todo es la
 *                clase de default que se lleva puesto un corte de permisos.
 */
export async function leerSnapshot(sb, { cols, desde = null, hasta = null, nivel = null, lineas = null } = {}) {
  if (!cols) return { error: 'leerSnapshot necesita las columnas explícitas' }
  const filas = []
  for (let inicio = 0; ; inicio += PAGINA) {
    let q = sb.from(TABLA_SNAPSHOT).select(cols)
    if (desde) q = q.gte('fecha', desde)
    if (hasta) q = q.lte('fecha', hasta)
    if (nivel) q = q.eq('nivel', nivel)
    if (Array.isArray(lineas) && lineas.length) q = q.in('linea', lineas)
    const { data, error } = await q.order('fecha', { ascending: true }).range(inicio, inicio + PAGINA - 1)
    if (error) return { error: error.message, filas }
    filas.push(...(data || []))
    if (!data || data.length < PAGINA) break
  }
  return { filas }
}

/**
 * El primer día que hay en la foto (opcionalmente de un nivel).
 *
 * Es una fila sola y hace falta antes de elegir la ventana: **desde cuándo hay foto decide si una
 * comparación contra «el período anterior» es posible**. Sale del dato y no de una constante con la
 * fecha de mayo escrita a mano, que envejece sin que nadie se entere.
 */
export async function primeraFecha(sb, nivel = null) {
  let q = sb.from(TABLA_SNAPSHOT).select('fecha')
  if (nivel) q = q.eq('nivel', nivel)
  const { data, error } = await q.order('fecha', { ascending: true }).limit(1)
  if (error) return { error: error.message }
  return { fecha: data && data[0] ? data[0].fecha : null }
}

/** El último día que hay en la foto. Es lo que contesta «¿el cron corrió?». */
export async function ultimaFecha(sb, nivel = null) {
  let q = sb.from(TABLA_SNAPSHOT).select('fecha')
  if (nivel) q = q.eq('nivel', nivel)
  const { data, error } = await q.order('fecha', { ascending: false }).limit(1)
  if (error) return { error: error.message }
  return { fecha: data && data[0] ? data[0].fecha : null }
}

export const TABLA_UMBRAL = 'meta_ads_umbral'

/**
 * Las columnas de la foto que necesitan los que la interpretan: las automatizaciones y el
 * guardarraíl de los escalones.
 *
 * Explícitas y nunca `*`: a nivel aviso son decenas de miles de filas y las 9 columnas que no se
 * usan viajarían igual por la red.
 */
export const COLS_REGLA = [
  'fecha', 'nivel', 'objeto_id', 'cuenta_id', 'nombre', 'linea',
  'estado', 'estado_efectivo', 'estado_real', 'diario_crudo',
  'spend', 'impresiones', 'frecuencia', 'clicks', 'compras', 'revenue',
].join(',')

/**
 * Los umbrales por línea, en un `Map`.
 *
 * Vive acá por lo mismo que `leerSnapshot()`: lo piden **tres** lugares —`api/_meta-reglas.js`,
 * `scripts/evaluar-reglas-meta.mjs` y el guardarraíl de los escalones— y una tabla que se lee en
 * tres archivos es una tabla que se filtra distinto en dos de ellos el día que le agreguen algo.
 *
 * Devuelve un `Map` vacío ante un error, **y lo dice en `error`**: quien la llame decide si eso es un
 * 502 o un renglón en `problemas[]`. ⚠️ Un `Map` vacío significa «ningún umbral cargado», que para el
 * guardarraíl es «no se sube nada» — nunca «subí con los defaults».
 */
export async function leerUmbrales(sb) {
  const { data, error } = await sb.from(TABLA_UMBRAL).select('*')
  if (error) return { error: error.message, mapa: new Map() }
  return { mapa: new Map((data || []).map((u) => [u.linea, u])) }
}
