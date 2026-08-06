/**
 * La plomería de la Graph API de Meta: LA implementación, una sola.
 *
 * # Por qué este archivo es `.js` y por qué vive en `lib/` y no en `api/_graph.js`
 *
 * Mismo motivo que `lib/permisos.core.js`: los handlers de `api/*.js` corren en Node sin pasar por
 * el compilador de Next y **no pueden importar TypeScript**.
 *
 * Y va a `lib/` en vez de a `api/_graph.js` porque **un script de `scripts/` va a necesitar esta
 * misma plomería** (las reglas automáticas corren por GitHub Actions, no por una función de
 * Vercel). Un `api/_*.js` es alcanzable desde un script, pero decirle a un script "importá de la
 * carpeta de los handlers HTTP" es mentirle sobre dónde vive la lógica.
 *
 * # El token se lee en cada llamada, no al importar
 *
 * `api/meta-ads.js` lo lee al cargar el módulo porque en Vercel el entorno ya está puesto cuando
 * el módulo se evalúa. En un script de Node que hace `dotenv` (o que lee el `.env` a mano) el
 * orden es al revés: si esto lo capturara al importar, el script quedaría con `undefined` para
 * siempre. Por eso es una función.
 */

const GRAPH = 'https://graph.facebook.com/v25.0'

/** Cuánto se espera a Meta antes de cortar. Ver el comentario largo en `graphPost`. */
export const TIMEOUT_MS = 8000

export function tokenMeta() {
  return process.env.META_ADS_TOKEN || ''
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function num(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Un GET a la Graph, con reintentos para los errores transitorios de Meta.
 *
 * ⚠️ El timeout no es decorativo. Sin él, un `fetch` colgado se come el tiempo de la función
 * entera y Vercel la corta sin que nadie sepa si Meta llegó a aplicar el cambio o no. Cortar
 * nosotros a los 8 s deja un error nuestro, legible, en vez de un 504 mudo.
 */
export async function graph(path, tries = 4) {
  const url = `${GRAPH}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(tokenMeta())}`
  let last
  for (let a = 1; a <= tries; a++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      const d = await r.json().catch(() => null)
      if (r.ok) return { ok: true, data: d, uso: usoDe(r) }
      last = { ok: false, status: r.status, error: d && d.error }
      const code = d && d.error && d.error.code
      if ((r.status === 429 || r.status >= 500 || code === 4 || code === 17 || code === 613) && a < tries) {
        await sleep(1000 * a)
        continue
      }
      return last
    } catch (e) {
      last = { ok: false, status: 0, error: { message: String((e && e.message) || e) } }
      if (a < tries) { await sleep(1000 * a); continue }
      return last
    }
  }
  return last
}

/**
 * Sigue la paginación por cursor `after` hasta agotar (tope de 20 páginas por las dudas).
 * Nació para insights y sirve para cualquier edge paginado de la Graph (lo usa también `/campaigns`).
 */
export async function insightsTodas(path) {
  let after = null, rows = [], guard = 0
  do {
    const p = after ? `${path}&after=${encodeURIComponent(after)}` : path
    const r = await graph(p)
    if (!r.ok) return { ok: false, error: mensajeError(r) }
    const d = r.data || {}
    if (Array.isArray(d.data)) rows = rows.concat(d.data)
    after = d.paging && d.paging.next && d.paging.cursors ? d.paging.cursors.after : null
    guard++
  } while (after && guard < 20)
  return { ok: true, rows }
}

/**
 * Un POST a la Graph: **esto escribe**.
 *
 * ⚠️ **Sin reintentos, a propósito.** El que decide si una acción se puede repetir es la tabla de
 * `lib/meta-ads/acciones.core.js` (`reintentable`), no esta función: poner `status` o
 * `daily_budget` a un valor absoluto se puede repetir sin consecuencia, pero duplicar una campaña
 * no, y un reintento automático acá haría dos campañas sin que nadie lo pida. Quien quiera
 * reintentar, que llame de nuevo.
 *
 * El timeout es la otra mitad del mismo cuidado: un `fetch` colgado que corta por límite de
 * función deja una escritura en estado desconocido —Meta pudo haberla aplicado igual—, y eso es lo
 * único que la auditoría no puede reconstruir después.
 */
export async function graphPost(path, params) {
  const body = new URLSearchParams({ ...params, access_token: tokenMeta() })
  try {
    const r = await fetch(`${GRAPH}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const d = await r.json().catch(() => null)
    if (r.ok) return { ok: true, data: d, uso: usoDe(r) }
    return { ok: false, status: r.status, error: d && d.error, uso: usoDe(r) }
  } catch (e) {
    return { ok: false, status: 0, error: { message: String((e && e.message) || e) } }
  }
}

/**
 * Cuánto queda del cupo de escritura de Meta, del header `X-Business-Use-Case-Usage`.
 *
 * Viene en cada respuesta y no cuesta una llamada más: se guarda en la auditoría para que el día
 * que Meta empiece a rechazar por límite se pueda ver que se venía llenando, en vez de descubrirlo
 * cuando ya no escribe. Se corta a 500 caracteres porque con varias cuentas el JSON crece.
 */
function usoDe(r) {
  try {
    const h = r.headers && r.headers.get('x-business-use-case-usage')
    return h ? String(h).slice(0, 500) : null
  } catch {
    return null
  }
}

/**
 * Los mínimos de presupuesto de una cuenta, para no mandarle a Meta un número que va a rechazar.
 *
 * Van en su propia llamada y no como campos de la cuenta porque **no son campos de la cuenta**:
 * `minimum_budgets` es un edge, y pedir `min_daily_budget_low_freq` en el `?fields=` de `act_<id>`
 * devuelve `(#100) Tried accessing nonexisting field` y anula la consulta ENTERA.
 *
 * ⚠️ Los valores vienen en la UNIDAD MENOR de la moneda: en ARS (2 decimales) `150000` es $1.500,
 * no $150.000. Se devuelven crudos a propósito, para que la conversión sea una decisión visible y
 * no un `/100` perdido en el medio. Ver `factorMoneda()` en `acciones.core.js`.
 */
export async function minimosDe(cuentaId, moneda) {
  const r = await graph(`act_${cuentaId}/minimum_budgets?fields=currency,min_daily_budget_low_freq,min_daily_budget_high_freq`)
  if (!r.ok) return { minimosMotivo: mensajeError(r) }
  const filas = (r.data && r.data.data) || []
  // El edge devuelve una fila por moneda; la que importa es la de la cuenta.
  const f = filas.find((x) => x.currency === moneda) || filas[0]
  if (!f) return { minimosMotivo: 'Meta no devolvió mínimos para esta cuenta' }
  return { minDiarioCrudo: num(f.min_daily_budget_low_freq), minDiarioAlto: num(f.min_daily_budget_high_freq) }
}

/**
 * El mensaje de un error de Graph, priorizando `error_user_msg` —que es el que Meta escribe para
 * mostrarle a una persona— sobre el técnico.
 */
export function mensajeError(r) {
  const e = r && r.error
  const msg = (e && (e.error_user_msg || e.message)) || `HTTP ${r && r.status}`
  return String(msg).slice(0, 200)
}

/** El código numérico de un error de Graph, o `null`. Es lo que distingue un candado del otro. */
export function codigoError(r) {
  const e = r && r.error
  return e && typeof e.code === 'number' ? e.code : null
}
