/**
 * Refresco de las vistas materializadas. Una sola implementación para BDI y Zattia.
 *
 * POR QUÉ EXISTE
 *
 * Vivía como tres líneas sueltas adentro de `sync-diario.js` —una llamada a
 * `refresh_all_views()` cuyo error se escribía como WARN y se seguía de largo— y
 * en `sync-diario-zattia.js` directamente no existía. Dos consecuencias:
 *
 *   1. Desde el 23-jul-2026 la llamada moría todos los días por el
 *      `statement_timeout` de 8 segundos de la API de Supabase, y como era un
 *      WARN el job terminaba en verde. Las vistas quedaron una semana
 *      congeladas sin que nadie lo viera.
 *   2. Zattia nunca refrescó nada desde el sync.
 *
 * CÓMO REFRESCA
 *
 * Una llamada por vista, no las tres juntas: así cada refresco arranca su propio
 * presupuesto de tiempo. Las funciones por vista las crea
 * `sql/migrate-refresco-vistas.sql`, que además les sube el timeout a 120s.
 *
 * DEGRADA CON GRACIA: si ese SQL todavía no se aplicó en esa base, PostgREST
 * contesta "no existe la función" y caemos a `refresh_all_views()`, que es el
 * camino de siempre. Nunca peor que hoy; mejor apenas se aplique.
 *
 * NO DECIDE NADA: informa qué vistas quedaron bien y cuáles no. Que un fallo
 * tire abajo el sync (o no) lo decide quien llama.
 */

/** Las tres vistas, en el orden en que se refrescan. Espejo de sql/vistas-materializadas.sql. */
export const VISTAS = ['ventas_por_mes', 'ventas_por_categoria_mes', 'fundas_por_modelo_mes']

/**
 * "Esa función no existe": PGRST202 es PostgREST (no la conoce en su caché de
 * esquema) y 42883 es el `undefined_function` de Postgres. Cualquiera de los dos
 * significa lo mismo: falta aplicar el SQL en esta base.
 */
const FALTA_FUNCION = new Set(['PGRST202', '42883'])

/**
 * Refresca las tres vistas.
 *
 * @param supabase client de @supabase/supabase-js (con la service key)
 * @param {{log?: (m: string) => void, warn?: (m: string) => void}} io  para poder probarlo sin ensuciar la consola
 * @returns {Promise<{ok: string[], fallaron: {vista: string, error: string}[], legacy: boolean}>}
 *          `legacy: true` = se usó `refresh_all_views()` porque falta el SQL nuevo.
 */
export async function refrescarVistas(supabase, { log = console.log, warn = console.warn } = {}) {
  const ok = []
  const fallaron = []

  for (const vista of VISTAS) {
    const { error } = await supabase.rpc(`refresh_${vista}`)

    if (!error) {
      ok.push(vista)
      log(`[vistas] ${vista}: OK`)
      continue
    }

    // Las funciones por vista no están en esta base: no tiene sentido probar las
    // otras dos. Se vuelve al camino viejo de una sola llamada.
    if (FALTA_FUNCION.has(error.code)) {
      warn(`[vistas] no existe refresh_${vista}. ¿Falta aplicar sql/migrate-refresco-vistas.sql en esta base?`)
      warn('[vistas] probando con refresh_all_views() (el camino de antes)...')
      const { error: e2 } = await supabase.rpc('refresh_all_views')
      if (e2) {
        warn(`[vistas] refresh_all_views() también falló: ${e2.message}`)
        return { ok: [], fallaron: VISTAS.map((v) => ({ vista: v, error: e2.message })), legacy: true }
      }
      log('[vistas] refresh_all_views(): OK')
      return { ok: [...VISTAS], fallaron: [], legacy: true }
    }

    // Un fallo de una vista no frena a las otras dos: que dos queden al día es
    // mejor que ninguna, y el resumen dice cuál faltó.
    warn(`[vistas] ${vista} FALLÓ: ${error.message}`)
    fallaron.push({ vista, error: error.message })
  }

  return { ok, fallaron, legacy: false }
}
