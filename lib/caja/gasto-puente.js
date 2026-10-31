/**
 * La puerta de ESCRITURA del dashboard para los gastos revisados (Bruno 30-oct, tanda 2 de «Cargar un gasto»).
 *
 * Un Admin aprueba un gasto de la caja chica o de la oficina en el ERP ⇒ `api/_caja.js` (`revisar-gasto`) lo manda acá y
 * esto lo POSTea a `/api/puente/gastos` del dashboard (`lib/puente-gastos.ts` allá decide cómo entra: la caja chica PAGADA
 * en efectivo, la oficina PENDIENTE). El `operacion_id` es el id de la fila del ERP: el dashboard tiene un candado por ese
 * número (`puente_operaciones`) ⇒ reintentar carga UN gasto.
 *
 * `.js` plano y sin imports: lo llama un handler de `api/`. ⛔ Tira nunca: devuelve `{ ok, ... }` para que el handler conteste.
 */

const URL_PUENTE = process.env.DASHBOARD_PUENTE_GASTOS_URL || 'https://dashboard.arebensrl.com/api/puente/gastos'
/** El techo de la función son 30 s: se corta antes para contestar con un aviso entendible. */
const TIMEOUT_MS = 10000

/**
 * @param {Record<string, unknown>} cuerpo  lo que arma `cuerpoParaDashboard` (`lib/caja/gasto.core.js`)
 * @returns {Promise<{ ok: true, gastoId: string | null, repetida: boolean } | { ok: false, status: number, error: string }>}
 */
export async function mandarGastoAlDashboard(cuerpo, deps = { fetch: globalThis.fetch, env: process.env }) {
  const secreto = deps.env.DASHBOARD_PUENTE_SECRET
  if (!secreto) return { ok: false, status: 503, error: 'Falta conectar el dashboard (DASHBOARD_PUENTE_SECRET): el gasto sigue para revisar.' }
  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), TIMEOUT_MS)
  try {
    const r = await deps.fetch(deps.env.DASHBOARD_PUENTE_GASTOS_URL || URL_PUENTE, {
      method: 'POST',
      headers: { 'x-puente-auth': secreto, 'Content-Type': 'application/json' },
      signal: corte.signal,
      body: JSON.stringify(cuerpo),
    })
    const texto = await r.text().catch(() => '')
    let j = null
    try { j = JSON.parse(texto) } catch { /* un HTML de error de Vercel */ }
    if (!r.ok) {
      const motivo = (j && j.error) || `el dashboard contestó ${r.status}`
      // 409 = una regla del dashboard (mes cerrado, se está cargando): se dice tal cual. El resto, el dashboard falló.
      return { ok: false, status: r.status === 409 || r.status === 400 ? 409 : 502, error: `No entró al dashboard: ${motivo}. El gasto sigue para revisar.` }
    }
    return { ok: true, gastoId: (j && j.gasto_id) || null, repetida: !!(j && j.repetida) }
  } catch (e) {
    const corto = e && e.name === 'AbortError'
    return { ok: false, status: 502, error: corto ? 'El dashboard no contestó a tiempo. El gasto sigue para revisar: probá de nuevo (no se carga dos veces).' : `No se pudo hablar con el dashboard (${(e && e.message) || e}). El gasto sigue para revisar.` }
  } finally {
    clearTimeout(reloj)
  }
}
