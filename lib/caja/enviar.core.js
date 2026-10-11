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

/** Los estados de una venta COBRADA que todavía ⛔ está en GN: los únicos que se mandan. */
export const SIN_LLEGAR = ['borrador', 'enviando', 'error'];

export const COLUMNAS_VENTA = 'id, estado, renglones, pagos, subtotal, total, paga_con, email, gn_sale_id, gn_number, usuario, intentos, ultimo_error, reintentable, creada_en, en_gn_en, ticket_mail, espera_monto, mp_pago_id, mp_pago_en, mp_cruce, a_mano, resolucion, confirmacion';

/** Cuánto vive el `enviando` de OTRO envío: mientras tanto, un segundo envío ⛔ manda (puede estar en vuelo). */
export const EN_VUELO_MS = 60 * 1000;
/** Las páginas de ventas del día que se leen buscando la que GN dice que ya tiene (409). */
const PAGINAS_BUSQUEDA = 5;

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
  // 🔴 Dos envíos a la vez (el POS reintenta solo, el respaldo de la cola, el botón): sólo se marca una
  // que SIGUE sin llegar. Si ya está en GN (la mandó el otro), se devuelve como está y ⛔ se manda.
  // Robustez (11-oct): un `enviando` FRESCO es otro envío en vuelo ⇒ ⛔ se manda: si GN le contestaba
  // 429 a éste, la venta pasaba un rato a `error` aunque el otro la estuviera dejando en GN.
  const ahoraMs = Date.now();
  const cambio = { estado: 'enviando', intentos, actualizada_en: new Date(ahoraMs).toISOString() };
  let marca = await sb.from('caja_venta').update(cambio)
    .eq('id', fila.id).in('estado', ['borrador', 'error']).select(COLUMNAS_VENTA).maybeSingle();
  if (marca.error) throw new Error(marca.error.message);
  if (!marca.data) {
    // Un `enviando` que quedó colgado (la función murió a mitad): pasado `EN_VUELO_MS`, se retoma.
    marca = await sb.from('caja_venta').update(cambio)
      .eq('id', fila.id).eq('estado', 'enviando').lt('actualizada_en', new Date(ahoraMs - EN_VUELO_MS).toISOString())
      .select(COLUMNAS_VENTA).maybeSingle();
    if (marca.error) throw new Error(marca.error.message);
  }
  if (!marca.data) {
    const ya = await sb.from('caja_venta').select(COLUMNAS_VENTA).eq('id', fila.id).maybeSingle();
    if (ya.error) throw new Error(ya.error.message);
    return { venta: ya.data, reintentable: false };
  }

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
      // Robustez (11-oct): leía UNA página de 200; un sábado con más ventas ⛔ la encontraba nunca.
      const f = fila.payload.date_sale;
      let hallada = null;
      for (let pag = 1; pag <= PAGINAS_BUSQUEDA && !hallada; pag++) {
        const resp = await gnFetch(`${base}/ventas/obtener?from=${f}&to=${f}&per_page=200&page=${pag}`, { headers: cab }, 1);
        if (!resp.ok) break;
        const cuerpo = await leer(resp);
        hallada = buscarPorIntegracion(cuerpo, fila.id);
        if (!(cuerpo && cuerpo.meta && cuerpo.meta.has_more_pages)) break;
      }
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
  // Un error ⛔ pisa a un `en_gn` que dejó el otro envío mientras éste esperaba a GN.
  let up = sb.from('caja_venta').update(cambios).eq('id', fila.id);
  if (cambios.estado === 'error') up = up.neq('estado', 'en_gn');
  let { data, error } = await up.select(COLUMNAS_VENTA).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    ({ data, error } = await sb.from('caja_venta').select(COLUMNAS_VENTA).eq('id', fila.id).single());
    if (error) throw new Error(error.message);
    return { venta: data, reintentable: false };
  }
  if (mailer && data.estado === 'en_gn' && data.email) {
    const estado = await mandarTicket(data, { sb, ...mailer });
    if (estado) data.ticket_mail = estado;
  }
  return { venta: data, reintentable: r.estado === 'error' ? r.reintentable : false };
}

/**
 * Las ventas cobradas que hay que volver a mandar a GN: sin llegar, que GN ⛔ rechazó
 * (`reintentable = false` se revisa a mano) y que nadie tocó en los últimos `corteMs` (pueden estar en
 * vuelo). La usan el POS (`reintentar-pendientes`, cada 3 min mientras está abierto) y el respaldo de la
 * cola (`scripts/caja-reintentar.mjs`). ⛔ Las que esperan la transferencia: ésas las saca `cruzar`.
 * @param {any} sb @param {string} store @param {{ corteMs: number, limite: number, ahora: number }} op
 */
export async function pendientesParaReintentar(sb, store, { corteMs, limite, ahora }) {
  const corte = new Date(ahora - corteMs).toISOString();
  const { data, error } = await sb.from('caja_venta').select(`${COLUMNAS_VENTA}, payload, actualizada_en`)
    .eq('store', store).in('estado', SIN_LLEGAR).lt('actualizada_en', corte)
    .order('creada_en', { ascending: true }).limit(limite);
  if (error) throw new Error(error.message);
  const todas = data || [];
  const pendientes = todas.filter((v) => v.reintentable !== false);
  return { pendientes, rechazadas: todas.length - pendientes.length };
}
