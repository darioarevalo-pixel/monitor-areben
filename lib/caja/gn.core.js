/**
 * Caja ↔ Gestión Nube: cómo se lee lo que contesta GN al mandar una venta. JS plano y sin red, para
 * que `api/_caja.js` decida el estado de la venta con una función que tiene tests.
 *
 * 🔑 El `integration_id` es el id de la venta en la Caja, y GN rechaza con **409** un segundo POST con
 * el mismo («Ya existe una venta con esa referencia de integracion», medido el 3-oct). ⇒ reintentar
 * SIEMPRE es seguro, y un 409 ⛔ es un error: es «ya está en GN» y hay que ir a buscarle el número.
 * `GET /ventas` ⛔ filtra por `integration_id` (lo ignora y devuelve 50 cualquiera, medido); la venta
 * se busca entre las del DÍA con `ventas/obtener?from=F&to=F&per_page=200` (85 ventas en una página).
 */

/**
 * Lo que se guarda como `ultimo_error`, que se muestra en pantalla: sin tokens. Un error de GN o de
 * red ⛔ debería traerlos, pero en MAKETA un error de Meta traía el token adentro y quedó en la base.
 * @param {unknown} msg
 */
export function sinSecretos(msg) {
  return String(msg == null ? '' : msg)
    .replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer ***')
    .replace(/([?&](?:token|secret|key|access_token)=)[^&\s"']+/gi, '$1***')
    .replace(/[A-Za-z0-9_\-.]{40,}/g, '***')
    .slice(0, 300);
}

/** El mensaje que trae un cuerpo de error de GN, o null. @param {any} body */
function mensajeDeGN(body) {
  if (!body) return null;
  if (typeof body === 'string') return body;
  const m = body.message || body.error;
  const errores = body.errors && typeof body.errors === 'object'
    ? Object.entries(body.errors).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')
    : '';
  return [m, errores].filter(Boolean).join(' — ') || null;
}

/**
 * Qué hacer con la respuesta de `POST /ventas`.
 * - 2xx ⇒ `en_gn` con su id y número (si GN ⛔ los devolvió, `buscar`).
 * - 409 ⇒ `buscar`: ya está en GN.
 * - 429 o 5xx ⇒ `error` reintentable (GN cortó o se cayó; ⛔ se sabe si la creó, y reintentar ⛔ duplica).
 * - otro 4xx ⇒ `error` NO reintentable: GN la rechazó y mandarla igual va a dar lo mismo.
 * @param {number} status @param {any} body
 * @returns {{ estado: 'en_gn', gn_sale_id: number, gn_number: number } | { estado: 'buscar' } | { estado: 'error', reintentable: boolean, error: string }}
 */
export function leerRespuestaVenta(status, body) {
  if (status >= 200 && status < 300) {
    const v = body && body.data ? body.data : body;
    const id = Number(v && v.id), number = Number(v && v.number);
    if (id > 0 && number > 0) return { estado: 'en_gn', gn_sale_id: id, gn_number: number };
    return { estado: 'buscar' };
  }
  if (status === 409) return { estado: 'buscar' };
  const msg = mensajeDeGN(body);
  if (status === 429 || status >= 500) {
    return { estado: 'error', reintentable: true, error: sinSecretos(`Gestión Nube contestó ${status}${msg ? `: ${msg}` : ''}. Se reintenta; ⛔ se duplica.`) };
  }
  return { estado: 'error', reintentable: false, error: sinSecretos(`Gestión Nube rechazó la venta (${status})${msg ? `: ${msg}` : ''}`) };
}

/**
 * La venta de la Caja entre las del día que devolvió `ventas/obtener`, por `integration_id`.
 * @param {any} body @param {string} integrationId
 * @returns {{ gn_sale_id: number, gn_number: number } | null}
 */
export function buscarPorIntegracion(body, integrationId) {
  const filas = Array.isArray(body) ? body : (body && Array.isArray(body.data) ? body.data : []);
  const v = filas.find(x => x && x.integration_id === integrationId);
  return v && Number(v.id) > 0 ? { gn_sale_id: Number(v.id), gn_number: Number(v.number) } : null;
}

/** `AAAA-MM-DD` en la hora de Argentina (la venta de las 22 h del local ⛔ es de mañana en UTC). @param {Date} d */
export function fechaLocal(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** El código del lector, normalizado como lo compara el chequeo de exhibición (`normCode` de lib/exhib/core.ts). @param {unknown} s */
export function normCode(s) {
  return String(s || '').replace(/[\s-]/g, '').replace(/^0+/, '').toLowerCase();
}
