/**
 * Mandar al ERP la venta de STUNNED de la Caja (Bruno, 26-oct: Stunned va al ERP, ⛔ GN). El gemelo de
 * `enviarVenta` (GN): la venta ya está guardada en `caja_venta` con `destino = 'erp'`; acá se toma, se anota en
 * el motor (`registrar`, idempotente por `origen_ref = caja_venta.id`) y queda `en_erp` o `error` (se reintenta).
 *
 * 🔴 A diferencia de la copia de GN, ACÁ el motor es la venta: si falla, la cajera lo ve (`error`) y el POS
 * reintenta en la vuelta de pendientes. ⛔ nunca cae a GN.
 *
 * JS plano, sin red: `registrar` lo pone el que llama (`api/_caja-motor.js`).
 */
import { COLUMNAS_VENTA, EN_VUELO_MS } from './enviar.core.js';
import { mandarTicket } from './ticket-mail.core.js';

/**
 * @param {any} fila la fila de `caja_venta` (`destino = 'erp'`)
 * @param {{ sb: any, enCola?: ((p: Promise<any>) => void) | null, mailer?: { url?: string, key?: string, fetch: typeof fetch }, registrar: (fila: any) => Promise<{ ok: true, numero?: number | null } | { ok: false, error: string, reintentable?: boolean }> }} o
 * @returns {Promise<{ venta: any, reintentable: boolean }>}
 */
export async function enviarVentaErp(fila, { sb, registrar, mailer, enCola = null }) {
  if (fila.destino !== 'erp') throw new Error('Esta venta es de GN: no se manda a Areben Gestión.');
  if (fila.estado === 'esperando_pago' || fila.estado === 'cancelada') throw new Error(`La venta está ${fila.estado === 'cancelada' ? 'cancelada' : 'esperando la transferencia'}: no se manda.`);
  const ahoraMs = Date.now();
  const cambio = { estado: 'enviando', intentos: (fila.intentos || 0) + 1, actualizada_en: new Date(ahoraMs).toISOString() };
  let marca = await sb.from('caja_venta').update(cambio).eq('id', fila.id).in('estado', ['borrador', 'error']).select(COLUMNAS_VENTA).maybeSingle();
  if (marca.error) throw new Error(marca.error.message);
  if (!marca.data) {
    marca = await sb.from('caja_venta').update(cambio).eq('id', fila.id).eq('estado', 'enviando').lt('actualizada_en', new Date(ahoraMs - EN_VUELO_MS).toISOString()).select(COLUMNAS_VENTA).maybeSingle();
    if (marca.error) throw new Error(marca.error.message);
  }
  if (!marca.data) {
    const ya = await sb.from('caja_venta').select(COLUMNAS_VENTA).eq('id', fila.id).maybeSingle();
    if (ya.error) throw new Error(ya.error.message);
    return { venta: ya.data, reintentable: false };
  }
  let r;
  try {
    r = await registrar(fila);
  } catch (e) {
    r = { ok: false, error: String((e && e.message) || e).slice(0, 300), reintentable: true };
  }
  const ahora = new Date().toISOString();
  const cambios = r.ok
    ? { estado: 'en_erp', erp_numero: r.numero ?? null, ultimo_error: null, reintentable: null, en_gn_en: ahora, actualizada_en: ahora }
    : { estado: 'error', ultimo_error: r.error, reintentable: r.reintentable !== false, actualizada_en: ahora };
  let up = sb.from('caja_venta').update(cambios).eq('id', fila.id);
  if (!r.ok) up = up.neq('estado', 'en_erp');
  const { data, error } = await up.select(COLUMNAS_VENTA).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const otra = await sb.from('caja_venta').select(COLUMNAS_VENTA).eq('id', fila.id).single();
    if (otra.error) throw new Error(otra.error.message);
    return { venta: otra.data, reintentable: false };
  }
  // El ticket por mail, igual que el de GN (`enviarVenta`): ⛔ frena ni cambia lo que ya quedó en el ERP.
  // 🔑 Con `enCola` (Bruno 23-nov: «imprimir sin esperar el mail, que el envío quede en paralelo»): el mailer puede tardar
  // hasta 8 s (`ESPERA_MAILER_MS`) y el ticket impreso lo esperaba (Darío: «se demoraba entre que la venta había sido
  // identificada y poder imprimirlo»). Va por detrás (`waitUntil` de Vercel); si ⛔ sale, `ticket_mail` queda null o
  // `error…` y lo levanta `caja-reintentar` (cada 10 min, las de 48 h). Sin `enCola` (el reintento mismo), se espera.
  if (mailer && data.estado === 'en_erp' && data.email) {
    if (enCola) enCola(mandarTicket(data, { sb, ...mailer }).catch(() => null));
    else {
      const estado = await mandarTicket(data, { sb, ...mailer });
      if (estado) data.ticket_mail = estado;
    }
  }
  return { venta: data, reintentable: r.ok ? false : r.reintentable !== false };
}
