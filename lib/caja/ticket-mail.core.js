/**
 * El ticket por mail: cuando una venta de la Caja queda en GN y la clienta dejó su mail, se le pide
 * al mailer (`areben-mailer`, `POST /api/externo/ticket`) que la dé de alta en la base de Zattia
 * (`source: "pos"`) y le mande el comprobante (automation `TICKET`). F4 del plan del 3-oct-2026.
 *
 * Lo usa `enviarVenta` (`lib/caja/enviar.core.js`) apenas la venta queda `en_gn` —desde la pantalla
 * o desde el respaldo de la cola— y el respaldo reintenta los que fallaron.
 *
 * 🔑 ⛔ CALCULA: el ticket sale de lo que GUARDÓ la venta (`renglones`, `pagos`, `subtotal`,
 * `total`), los mismos números que viajaron a GN y que imprimió la térmica.
 *
 * 🔑 El mailer deduplica por `ventaId` ⇒ mandarlo dos veces es seguro (un solo comprobante).
 *
 * `caja_venta.ticket_mail` dice cómo quedó: `null` = todavía ⛔ se pidió · `encolado` · `ya estaba`
 * · `sin automation` (el mailer dio de alta el mail pero el mail del ticket está apagado) ·
 * `error: …` (se reintenta). ⛔ Lanza nunca: un mail que no sale ⛔ puede frenar una venta.
 *
 * 🔴 La llave va en el header `x-ticket-key`, ⛔ en la URL, y ⛔ se guarda en ningún texto de error.
 */
import { sinSecretos } from './gn.core.js';
import { VARIANTE_UNICA } from '../precios/core.core.js';

/**
 * El talle como va en un ticket. «Variante Única» (lo que GN le pone a un producto sin talles, p.ej.
 * los accesorios) ⛔ es un talle: escrito al lado del nombre se lee como un dato más. Lo usan el
 * ticket por mail y el impreso (`lib/caja/ticket.ts`).
 * @param {string | null | undefined} talle
 */
export function talleVisible(talle) {
  const t = typeof talle === 'string' ? talle.trim() : '';
  return t && t.toLowerCase() !== VARIANTE_UNICA.toLowerCase() ? t : null;
}

/** Cuánto se espera al mailer: la función de Vercel tiene 30 s y GN ya gastó parte. */
export const ESPERA_MAILER_MS = 8000;

/**
 * El cuerpo para el mailer, a partir de la fila de `caja_venta`. Las filas viejas (antes de F4) ⛔
 * guardaban el nombre de la prenda ni el de la cuenta: salen como «Producto» y «Cuenta N».
 *
 * @param {any} venta la fila de `caja_venta`, ya `en_gn` y con `email`
 * @param {{ reglas: any, politica: string | null }} cfg la `caja_config` de la marca
 */
export function ticketParaMail(venta, { reglas, politica }) {
  const cuentas = (reglas && reglas.cuentas) || {};
  const pagos = (venta.pagos || []).map((p) => ({
    cuenta: p.nombre || (cuentas[p.cuenta] && cuentas[p.cuenta].nombre) || `Cuenta ${p.cuenta}`,
    porcentaje: p.porcentaje,
    descuento: p.descuento,
    redondeo: p.redondeo,
    monto: p.monto,
  }));
  const enEfectivo = (venta.pagos || []).filter((p) => cuentas[p.cuenta] && cuentas[p.cuenta].efectivo).reduce((s, p) => s + p.monto, 0);
  const vuelto = venta.paga_con != null && enEfectivo > 0 ? Math.max(0, Math.round((venta.paga_con - enEfectivo) * 100) / 100) : null;
  return {
    marca: 'zattia',
    email: venta.email,
    ticket: {
      ventaId: venta.id,
      numero: venta.gn_number,
      fecha: venta.en_gn_en || venta.creada_en,
      renglones: (venta.renglones || []).map((r) => ({
        nombre: r.nombre || 'Producto',
        talle: talleVisible(r.talle),
        cantidad: r.cantidad,
        precio: r.precio,
        importe: r.importe,
        foto: r.foto || null,
      })),
      subtotal: venta.subtotal,
      pagos,
      total: venta.total,
      pagaCon: vuelto == null ? null : venta.paga_con,
      vuelto,
      politica: politica || null,
    },
  };
}

/** Lo que queda escrito en `ticket_mail` según lo que contestó el mailer. */
export function estadoDeRespuesta(status, body) {
  if (status === 200 && body && typeof body === 'object') {
    if (body.encolado) return 'encolado';
    if (body.motivo === 'ya estaba encolado') return 'ya estaba';
    return 'sin automation';
  }
  const detalle = body && typeof body === 'object' && body.error ? `: ${body.error}` : '';
  return sinSecretos(`error: el mailer contestó ${status}${detalle}`);
}

/**
 * Pide el ticket y anota el resultado en la fila. ⛔ Lanza. Sin `url` o sin `key` ⛔ hace nada y deja
 * `ticket_mail` en null (el respaldo lo pide cuando estén cargadas).
 *
 * @param {any} venta la fila de `caja_venta` recién `en_gn`
 * @param {{ sb: any, fetch: typeof fetch, url?: string, key?: string }} dep
 * @returns {Promise<string | null>} lo que quedó en `ticket_mail`
 */
export async function mandarTicket(venta, { sb, fetch, url, key }) {
  if (!venta || !venta.email || venta.estado !== 'en_gn' || !url || !key) return null;
  let estado;
  try {
    const cfg = await sb.from('caja_config').select('reglas, politica_cambio').eq('store', 'zattia').maybeSingle();
    const cuerpo = ticketParaMail(venta, { reglas: cfg && cfg.data ? cfg.data.reglas : null, politica: cfg && cfg.data ? cfg.data.politica_cambio : null });
    const r = await fetch(`${url.replace(/\/+$/, '')}/api/externo/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ticket-key': key },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(ESPERA_MAILER_MS),
    });
    const t = await r.text();
    let body = null;
    try { body = JSON.parse(t); } catch { /* 401 = texto plano */ }
    estado = estadoDeRespuesta(r.status, body);
  } catch (e) {
    estado = sinSecretos(`error: ⛔ se pudo hablar con el mailer (${e && e.message})`);
  }
  try {
    await sb.from('caja_venta').update({ ticket_mail: estado }).eq('id', venta.id);
  } catch { /* la venta ya está en GN: esto ⛔ la frena */ }
  return estado;
}
