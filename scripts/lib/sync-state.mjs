/**
 * Estado del sync incremental, en Supabase.
 *
 * Reemplaza los .last-sync en disco, que en GitHub Actions se perdían al terminar
 * cada corrida (cwd efímero), así que readLastSync() caía SIEMPRE al default y el
 * sync "incremental" nunca leía estado previo. Ver sql/migrate-sync-state.sql.
 *
 * DEGRADA CON GRACIA: si la tabla sync_state todavía no existe (404 de PostgREST),
 * leerEstado devuelve el default y guardarEstado no rompe. Con eso el sync se
 * comporta como antes —barre desde 2025-01-01— hasta que la tabla se aplique a
 * mano. Nunca peor que hoy, mejor apenas exista la tabla.
 *
 * Usa el mismo client de @supabase/supabase-js que los scripts de sync, para no
 * meter una segunda forma de hablar con la base.
 */

const DEFAULT = { ventasDate: null, productosDate: null }

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} clave  identifica el sync ('diario'); una fila por base y sync.
 */
export async function leerEstado(supabase, clave) {
  const { data, error } = await supabase
    .from('sync_state')
    .select('ventas_date, productos_date')
    .eq('clave', clave)
    .maybeSingle()

  if (error) {
    // 42P01 = tabla inexistente; PGRST205 = PostgREST no la conoce todavía.
    // Cualquiera de los dos: todavía no se aplicó el SQL. Se avisa y se sigue viejo.
    console.warn(`[sync-state] no se pudo leer (${error.code || error.message}). Se usa el default (barrer desde el inicio). ¿Falta aplicar sql/migrate-sync-state.sql?`)
    return { ...DEFAULT }
  }
  if (!data) return { ...DEFAULT }
  return {
    ventasDate: data.ventas_date || null,
    productosDate: data.productos_date || null,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} clave
 * @param {{ventasDate: string|null, productosDate: string|null}} estado
 */
export async function guardarEstado(supabase, clave, estado) {
  const { error } = await supabase
    .from('sync_state')
    .upsert(
      { clave, ventas_date: estado.ventasDate, productos_date: estado.productosDate, updated_at: new Date().toISOString() },
      { onConflict: 'clave' },
    )

  if (error) {
    // Que no se pueda guardar el estado no debe tirar abajo un sync que ya trajo
    // los datos: la próxima corrida simplemente barre de más, como hoy.
    console.warn(`[sync-state] no se pudo guardar (${error.code || error.message}). El próximo sync barrerá de más. ¿Falta aplicar sql/migrate-sync-state.sql?`)
  }
}
