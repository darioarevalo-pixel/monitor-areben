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
