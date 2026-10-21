/**
 * El vigía de la PUERTA DEL ERP (`erp.arebensrl.com`, proyecto Vercel `areben-erp`), mirado DESDE AFUERA (sesión B,
 * Bases, 21-oct-2026). Por ahí leen el dashboard y producción (`/api/v1`) y entra Ingresos (`/api/ingreso`): si se cae,
 * los tres se cortan callados. El vigía del motor (`api/vigia.js`) vive ADENTRO de ese mismo proyecto ⇒ ⛔ puede avisar
 * que se cayó él. Por eso mira el monitor, que es otro proyecto: el cron de Vercel cada 15 min (`vercel.json`).
 *
 * Acá vive lo que DECIDE (puro); `api/_vigia-erp.js` pregunta, guarda el estado y manda el mail.
 * - VIVA = el lector contesta **401 sin llave**: la función corrió y frenó por la llave. Cualquier otra cosa es falla:
 *   5xx, 404 (el despliegue se perdió), una demora de más de 10 s, y también un **200 sin llave** (la puerta abierta).
 * - Un mail al CAER (2 fallas seguidas: un parpadeo ⛔ despierta a nadie) y uno al VOLVER. Mientras sigue caída, ⛔ más mails.
 */

export const PUERTA_ERP = 'https://erp.arebensrl.com/api/v1/productos/obtener'
export const ESPERA_MS = 10_000
export const FALLAS_PARA_AVISAR = 2

/** Lo que contestó la puerta (`status` HTTP, o `null` si ⛔ contestó) ⇒ `{ sana, detalle }`. */
export function leerSonda(status, error) {
  if (status === 401) return { sana: true, detalle: 'contesta 401 sin llave' }
  if (status == null) return { sana: false, detalle: `no contestó (${String(error || 'sin respuesta').slice(0, 120)})` }
  if (status === 200) return { sana: false, detalle: 'contestó 200 SIN LLAVE: la puerta quedó abierta' }
  if (status === 404) return { sana: false, detalle: 'contestó 404: el despliegue de areben-erp no está o el dominio apunta mal' }
  return { sana: false, detalle: `contestó ${status}` }
}

/**
 * El estado guardado (`{ fallas_seguidas, caida_desde, avisado }`) + la sonda de ahora ⇒ el estado nuevo y qué mail
 * toca (`null` | 'cayo' | 'volvio').
 */
export function decidir(estado, sonda, ahora) {
  const antes = { fallas_seguidas: 0, caida_desde: null, avisado: false, ...(estado || {}) }
  if (sonda.sana) {
    return { estado: { fallas_seguidas: 0, caida_desde: null, avisado: false }, mail: antes.avisado ? 'volvio' : null, caidaDesde: antes.caida_desde }
  }
  const fallas = antes.fallas_seguidas + 1
  const nuevo = { fallas_seguidas: fallas, caida_desde: antes.caida_desde || ahora.toISOString(), avisado: antes.avisado }
  if (!antes.avisado && fallas >= FALLAS_PARA_AVISAR) return { estado: { ...nuevo, avisado: true }, mail: 'cayo', caidaDesde: nuevo.caida_desde }
  return { estado: nuevo, mail: null, caidaDesde: nuevo.caida_desde }
}

const horaAR = (iso) => new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' })

/** El mail (asunto, texto, html) de una caída o de la vuelta. */
export function armarMail(tipo, { caidaDesde, detalle }) {
  const asunto = tipo === 'cayo' ? '🔴 La puerta del ERP (erp.arebensrl.com) no responde' : '✅ La puerta del ERP volvió'
  const lineas = tipo === 'cayo'
    ? [
      `Desde ${horaAR(caidaDesde)}: ${detalle}.`,
      'Mientras siga así, el dashboard y producción no leen datos nuevos y lo que manda Ingresos no entra.',
      'Mirar el proyecto «areben-erp» en Vercel (último despliegue y dominio). Cuando vuelva, llega otro mail.',
    ]
    : [`Responde de nuevo. Estuvo caída desde ${horaAR(caidaDesde)}.`]
  const texto = lineas.join('\n')
  const html = lineas.map((l) => `<p>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('')
  return { asunto, texto, html }
}

/**
 * Lo que se GUARDA después de intentar el mail. 🔴 Si el mail ⛔ salió, ⛔ se da por avisado: el cron siguiente lo
 * reintenta (si no, la caída quedaría «avisada» sin que nadie se entere, y la vuelta ⛔ mandaría nada).
 */
export function estadoAGuardar(decision, mailSalio) {
  if (!decision.mail || mailSalio) return decision.estado
  if (decision.mail === 'cayo') return { ...decision.estado, avisado: false }
  return { fallas_seguidas: 0, caida_desde: decision.caidaDesde, avisado: true }
}
