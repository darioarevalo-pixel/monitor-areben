/**
 * Mandar a GN una venta ya guardada en `caja_venta` y dejar la fila en su estado. Lo usan el handler
 * (`api/_caja.js`, al confirmar y al reintentar desde la pantalla) y el respaldo de la cola
 * (`scripts/caja-reintentar.mjs`, un workflow): los dos con ESTA función, ⛔ una copia cada uno.
 *
 * ⛔ Lanza por un error de GN: lo guarda en la fila. Sólo lanza si la BASE falla.
 * Manda `fila.payload` tal cual (⛔ lo rearma) con `fila.id` como `integration_id` ⇒ es seguro
 * llamarla dos veces a la vez: GN contesta 409 al segundo y eso se lee como «ya está».
 */
import { buscarPorIntegracion, leerRespuestaVenta, sinSecretos } from './gn.core.js';
import { mandarTicket } from './ticket-mail.core.js';

export const COLUMNAS_VENTA = 'id, estado, renglones, pagos, subtotal, total, paga_con, email, gn_sale_id, gn_number, usuario, intentos, ultimo_error, reintentable, creada_en, en_gn_en, ticket_mail, espera_monto, mp_pago_id, mp_pago_en, mp_cruce';

/**
 * @param {any} fila la fila de `caja_venta`, CON `payload`
 * `mailer` (opcional): con la venta ya en GN y con mail, pide el ticket por mail (`ticket-mail.core.js`).
 * ⛔ Lanza por el mailer: lo anota en `ticket_mail`.
 *
 * @param {{ sb: any, gnFetch: (url: string, opts: any, tries?: number) => Promise<any>, base: string, token: string, mailer?: { url?: string, key?: string, fetch: typeof fetch } }} dep
 * @returns {Promise<{ venta: any, reintentable: boolean }>}
 */
export async function enviarVenta(fila, { sb, gnFetch, base, token, mailer }) {
  const cab = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  const leer = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
  // 🔴 Una venta que espera la transferencia (F5) o cancelada ⛔ sale: sólo `cruzar` la pasa a `borrador`.
  if (fila.estado === 'esperando_pago' || fila.estado === 'cancelada') throw new Error(`La venta está ${fila.estado === 'cancelada' ? 'cancelada' : 'esperando la transferencia'}: no se manda a GN.`);
  const intentos = (fila.intentos || 0) + 1;
  const marca = await sb.from('caja_venta').update({ estado: 'enviando', intentos, actualizada_en: new Date().toISOString() }).eq('id', fila.id);
  if (marca && marca.error) throw new Error(marca.error.message);

  // ⚠️ UN intento: ante un 429 `gnFetch` espera el `retry-after` (hasta 30 s), y el techo de la
  // función es 30 s. Mejor contestar «se reintenta» ya.
  let r;
  try {
    const resp = await gnFetch(`${base}/ventas`, { method: 'POST', headers: cab, body: JSON.stringify(fila.payload) }, 1);
    r = leerRespuestaVenta(resp.status, await leer(resp));
  } catch (e) {
    // Red caída o timeout: ⛔ se sabe si GN la creó. Reintentar es seguro (409 ⇒ «ya está»).
    r = { estado: 'error', reintentable: true, error: sinSecretos(`No se pudo hablar con Gestión Nube (${e && e.message}). Se reintenta; no se duplica.`) };
  }
  if (r.estado === 'buscar') {
    try {
      const f = fila.payload.date_sale;
      const resp = await gnFetch(`${base}/ventas/obtener?from=${f}&to=${f}&per_page=200`, { headers: cab }, 1);
      const hallada = resp.ok ? buscarPorIntegracion(await leer(resp), fila.id) : null;
      r = hallada
        ? { estado: 'en_gn', ...hallada }
        : { estado: 'error', reintentable: true, error: 'Gestión Nube dice que la venta ya existe, pero no apareció entre las del día. Se vuelve a buscar.' };
    } catch (e) {
      r = { estado: 'error', reintentable: true, error: sinSecretos(`La venta ya está en Gestión Nube; falta leer su número (${e && e.message}).`) };
    }
  }
  const ahora = new Date().toISOString();
  const cambios = r.estado === 'en_gn'
    ? { estado: 'en_gn', gn_sale_id: r.gn_sale_id, gn_number: r.gn_number, ultimo_error: null, reintentable: null, en_gn_en: ahora, actualizada_en: ahora }
    : { estado: 'error', ultimo_error: r.error, reintentable: r.reintentable, actualizada_en: ahora };
  const { data, error } = await sb.from('caja_venta').update(cambios).eq('id', fila.id).select(COLUMNAS_VENTA).single();
  if (error) throw new Error(error.message);
  if (mailer && data.estado === 'en_gn' && data.email) {
    const estado = await mandarTicket(data, { sb, ...mailer });
    if (estado) data.ticket_mail = estado;
  }
  return { venta: data, reintentable: r.estado === 'error' ? r.reintentable : false };
}
