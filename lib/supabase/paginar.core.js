/**
 * Leer una tabla entera de Supabase desde un handler. **LA** implementación.
 *
 * # 🔴 PostgREST corta en 1.000 filas y NO avisa
 *
 * Devuelve las primeras mil como si fueran todas, con 200 y sin error, y `supabase-js` no lo
 * esquiva: medido, un `.limit(20000)` devuelve 1.000. El resultado es siempre un número **más
 * bajo** que el real, que es el modo de falla caro — «una semana floja» y «media semana perdida»
 * se ven igual. Una semana de detalles de BDI ronda las 2.400 filas y 30 días son ~4.800.
 *
 * Vivía copiada en `api/_memo.js` y `api/_liquidacion.js`, con los cuerpos idénticos al byte, y
 * el 18-ago-2026 iba a nacer una tercera en `api/_norte.js`. El repo ya sabe cómo termina eso:
 * `gnFetch` llegó a diez copias y cinco habían perdido el reintento de red.
 *
 * ⚠️ `api/_crm.js` tiene una `paginar()` de otra forma (recibe el filtro, no el armador) y **no** se
 * unificó acá: no es la misma función con otro nombre, y forzarlas a una sola las haría contestar
 * de más a las dos.
 *
 * `.js` plano: lo importan los handlers de `api/`, que corren en Node sin pasar por el compilador.
 */

const PAGINA = 1000

/**
 * @param sb     cliente de supabase-js
 * @param tabla  nombre de la tabla
 * @param armar  `(query) => query` — el `select` y los filtros. El `range` lo pone esta función.
 */
export async function leerTodo(sb, tabla, armar) {
  const out = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar(sb.from(tabla)).range(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if ((data || []).length < PAGINA) return out
  }
}

/**
 * **Lo mismo, pero las páginas van EN PARALELO** — para las consultas que se saben grandes.
 *
 * 🔴 **`leerTodo` ⛔ no se puede paralelizar como está**: se entera de que terminó porque una página
 * vuelve corta, o sea que ⛔ no sabe cuántas hay hasta pedirlas todas en fila. Acá el largo lo dice
 * PostgREST en el `Content-Range` de la PRIMERA página (`count: 'exact'`, que ⛔ no cuesta un viaje
 * aparte), y con ese número las que faltan salen todas juntas.
 *
 * 🔑 **Y el conteo ⛔ no es sólo para paralelizar: es el guard que a `leerTodo` le falta.** Si al
 * final no están las `count` filas, esto **tira**, en vez de devolver un número más bajo con cara
 * de dato — que es el modo de falla caro de las mil filas.
 *
 * 📌 **Medido el 3-sep-2026**, ventas de BDI de 30 días para la comparativa del PRM: **5.311 filas
 * = 6 páginas**, y desde Vercel cada viaje ronda los 270 ms ⇒ de a una son ~1,6 s; así son dos.
 * ⛔ Para una consulta que entra en una o dos páginas ⛔ no sirve: el `leerTodo` de siempre alcanza.
 *
 * @param sb     cliente de supabase-js
 * @param tabla  nombre de la tabla
 * @param armar  `(query, opciones) => query` — ⚠️ **firma distinta a la de `leerTodo`**: las
 *               `opciones` son las del `.select()` y hay que pasárselas, o no viene el conteo.
 */
export async function leerTodoEnParalelo(sb, tabla, armar) {
  const primera = await armar(sb.from(tabla), { count: 'exact' }).range(0, PAGINA - 1)
  if (primera.error) throw new Error(primera.error.message)
  const filas = primera.data || []
  const total = typeof primera.count === 'number' ? primera.count : filas.length
  if (total <= filas.length) return filas

  const restantes = []
  for (let desde = PAGINA; desde < total; desde += PAGINA) restantes.push(desde)
  const paginas = await Promise.all(
    restantes.map(async (desde) => {
      const { data, error } = await armar(sb.from(tabla), {}).range(desde, desde + PAGINA - 1)
      if (error) throw new Error(error.message)
      return data || []
    }),
  )
  const out = filas.concat(...paginas)
  // 🔴 El conteo es de ANTES de bajar las páginas: una fila que nace en el medio corre a las demás
  // y la última página vuelve corta. Que salte acá es exactamente el punto — ⛔ el silencio no.
  if (out.length !== total) throw new Error(`${tabla}: se esperaban ${total} filas y llegaron ${out.length}`)
  return out
}
