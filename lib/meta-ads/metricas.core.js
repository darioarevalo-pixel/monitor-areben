/**
 * Cómo se leen los números de una fila de insights de Meta: LA implementación, una sola.
 *
 * # Por qué este archivo es `.js` y por qué vive en `lib/`
 *
 * Mismo motivo que `graph.core.js`, `permisos.core.js` y `lineas.core.js`: los handlers de
 * `api/*.js` corren en Node sin pasar por el compilador de Next y **no pueden importar
 * TypeScript**. Y va a `lib/` y no a `api/_metricas.js` porque **lo necesita un script de
 * `scripts/`**: la foto diaria (`scripts/snapshot-meta.mjs`) corre por GitHub Actions, no por una
 * función de Vercel, y tiene que leer las filas exactamente igual que las lee la pantalla.
 *
 * # Por qué esto salió de `api/meta-ads.js`
 *
 * Estaba definido ahí adentro, y el snapshot lo necesitaba desde afuera. La opción de copiarlo
 * está descartada por la misma regla que rige `permisos.core.js`: **una sola implementación,
 * nunca se copia**. Dos lecturas distintas de `omni_purchase` no fallan ruidosamente — devuelven
 * dos números de ventas parecidos y distintos, que es peor.
 */

/** Un número de Meta, que siempre viene como string. Cualquier cosa rara vale 0, no NaN. */
export function num(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Ventana de atribución fija, ya urlencodeada para meter en el query string.
 *
 * Va explícita y no por default porque **cambia mucho los números de ventas y de ROAS**: la misma
 * campaña con `7d_click` y con `1d_click` no reporta lo mismo, y una serie histórica armada con
 * ventanas mezcladas no se puede comparar consigo misma.
 */
export const ATTR = encodeURIComponent(JSON.stringify(['7d_click', '1d_view']))

/** Compras dedup cross-surface (pixel + CAPI + on-Meta): la fuente única de verdad de ventas. */
export const COMPRA = 'omni_purchase'

/**
 * Los pasos del embudo de compra, en orden, con su `action_type` de Meta.
 *
 * 🔑 **Vive acá y no en `api/meta-ads.js` porque tiene DOS consumidores**: el embudo de cuenta que
 * dibuja la pantalla y la proyección por aviso que arma el parte del día. Los dos tienen que estar
 * mirando el mismo `action_type` o el embudo de la cuenta y la suma de sus avisos dejan de dar lo
 * mismo, sin que nada falle. Dos listas de cadenas iguales escritas en dos archivos es la forma
 * exacta en que eso pasa: bajó acá el 21-ago-2026, cuando apareció el segundo lector.
 */
export const FUNNEL = [
  { key: 'link_click', label: 'Clic al enlace', type: 'link_click' },
  { key: 'landing_page_view', label: 'Visita a la web', type: 'landing_page_view' },
  { key: 'add_to_cart', label: 'Agregó al carrito', type: 'omni_add_to_cart' },
  { key: 'initiate_checkout', label: 'Inició compra', type: 'omni_initiated_checkout' },
  { key: 'purchase', label: 'Compró', type: COMPRA },
]

/** El `action_type` de cada paso, indexado por su key. */
export const TIPO_FUNNEL = Object.fromEntries(FUNNEL.map((p) => [p.key, p.type]))

/**
 * Visitas al perfil (Instagram/Facebook). El `action_type` exacto de Meta cambia entre versiones
 * y no está documentado de forma estable, así que NO se hardcodea un nombre: se busca por patrón
 * sobre las acciones que devuelve la fila. Si Meta lo llama distinto, el dato queda en 0 en vez
 * de romper — mismo criterio que el resto de los enriquecimientos.
 */
export const RE_PERFIL = /profile_visit|profile_view|profile_engagement/i

/**
 * Seguidores nuevos. Mismo criterio y mismo cuidado que RE_PERFIL: Meta los nombra distinto
 * según la superficie (`follow` de Instagram, `like`/`page_like` de una página de Facebook), así
 * que se matchea por patrón. `like` va anclado para no comerse `post_reaction` ni parecidos.
 */
export const RE_SEGUIDOR = /(^|\.)follow|page_like|(^|\.)like$/i

/** Lee el value de un action_type dentro de un array {action_type, value} (actions / action_values / purchase_roas). */
export function accion(arr, type) {
  if (!Array.isArray(arr)) return 0
  const hit = arr.find((a) => a && a.action_type === type)
  return hit ? num(hit.value) : 0
}

/** Suma los `value` de un array de acciones (métricas de video: [{action_type,value}]). */
export function sumaAcciones(arr) {
  if (!Array.isArray(arr)) return 0
  return arr.reduce((s, a) => s + num(a && a.value), 0)
}

/** Suma los `value` de todas las acciones cuyo action_type matchea un patrón (ver RE_PERFIL). */
export function accionRe(arr, re) {
  if (!Array.isArray(arr)) return 0
  return arr.reduce((s, a) => s + (a && re.test(String(a.action_type || '')) ? num(a.value) : 0), 0)
}

/** Las métricas de una fila de insights, con ventas y ROAS ya resueltas. */
export function metricasDe(row) {
  return {
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    frequency: num(row.frequency),
    clicks: num(row.clicks),
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    purchases: accion(row.actions, COMPRA),
    revenue: accion(row.action_values, COMPRA),
    // 🔑 El ROAS sale de `purchase_roas`, NO de `revenue / spend`. Meta lo calcula con la ventana
    // de atribución y los dos números difieren; recalcularlo a mano sería inventar un tercero.
    roas: accion(row.purchase_roas, COMPRA),
    // Los tres pasos de arriba de la compra. Salen de `TIPO_FUNNEL` y NO de tres cadenas
    // escritas acá: es la misma lista que dibuja el embudo de la pantalla, y dos listas iguales
    // en dos archivos es exactamente como se desincronizan (ver el comentario de FUNNEL).
    carritos: accion(row.actions, TIPO_FUNNEL.add_to_cart),
    checkouts: accion(row.actions, TIPO_FUNNEL.initiate_checkout),
    lpv: accion(row.actions, TIPO_FUNNEL.landing_page_view),
    perfil: accionRe(row.actions, RE_PERFIL),
    seguidores: accionRe(row.actions, RE_SEGUIDOR),
  }
}

/**
 * Los campos de insights que hay que pedirle a Meta para llenar `metricasDe()`.
 *
 * Vive al lado de la función que los consume a propósito: pedir un campo de menos deja la métrica
 * en 0 **en silencio** —`accion()` sobre un array que no vino devuelve 0, igual que una campaña
 * que de verdad no vendió—, y esa es la clase de bug que se descubre semanas después mirando un
 * gráfico que venía plano.
 */
export const CAMPOS_INSIGHTS = [
  'spend', 'impressions', 'reach', 'frequency', 'clicks', 'ctr', 'cpc', 'cpm',
  'actions', 'action_values', 'purchase_roas',
].join(',')
