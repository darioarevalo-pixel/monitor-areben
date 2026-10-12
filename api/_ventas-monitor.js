// Registro de las ventas que el monitor crea en Gestión Nube (tabla `gn_venta_monitor`, ver
// sql/migrate-gn-venta-monitor.sql). Lo usa `api/crear-venta.js`, que es la única puerta del monitor
// que crea ventas en GN (la Caja guarda las suyas en `caja_venta`).
//
// No es una ruta: lleva `_`, así que Vercel no lo cuenta como función.
//
// 🔑 **Anotar NUNCA tumba la venta.** Cuando esto corre, la venta ya existe en GN: contestar error
// haría que el llamador reintente y GN ⛔ anula por API, así que el reintento sería una venta
// duplicada. Si anotar falla, la venta se informa igual y la respuesta dice `registrada: false` con el
// motivo — el libro de stock la ve como venta de GN sin dueño, que es lo que era antes de este registro.
import { clienteDe } from './_sync-ledger.js';

const TABLA = 'gn_venta_monitor';

/**
 * El propósito de un pedido a `crear-venta`, para saber de qué flujo salió la venta sin depender del
 * `integration_source` (la falla, por ejemplo, viaja como 'monitor-sesion-fotos').
 */
export function propositoDe(b) {
  if (b.accion === 'tn_import' || b.accion === 'cambio_real' || b.accion === 'reingreso') return b.accion;
  return ['falla', 'cambio', 'canje', 'reclamo'].includes(b.proposito) ? b.proposito : 'fotos';
}

/**
 * La fila del registro. Pura: la prueba `tests/ventas-monitor.test.ts`.
 * @param {{store:string, venta:{id?:number|string, number?:number|string}, payload:object, b:object, usuario?:string|null, en?:string}} p
 */
export function filaDeVenta({ store, venta, payload, b, usuario = null, en = new Date().toISOString() }) {
  const id = parseInt(venta && venta.id, 10);
  if (!id) return null;
  return {
    gn_venta_id: id,
    gn_number: venta.number != null ? String(venta.number) : null,
    marca: store,
    proposito: propositoDe(b),
    ref: String(payload.integration_id || ''),
    store_id: payload.store_id,
    lineas: (payload.items || []).map((it) => ({
      product_id: it.product_id, size_id: it.size_id, quantity: it.quantity, unit_price: it.unit_price,
    })),
    creada_en: en,
    creada_por: usuario,
  };
}

/** Anota una venta recién creada. Devuelve `{ registrada, error? }` y ⛔ tira nunca (ver arriba). */
export async function anotar(store, fila) {
  if (!fila) return { registrada: false, error: 'GN no devolvió el id de la venta' };
  try {
    const { error } = await clienteDe(store).from(TABLA).upsert(fila, { onConflict: 'gn_venta_id' });
    if (error) return { registrada: false, error: error.message };
    return { registrada: true };
  } catch (e) {
    return { registrada: false, error: e.message };
  }
}

/** Una venta del registro, o null si el monitor no la creó (o se creó antes del registro). */
export async function leer(store, gnVentaId) {
  const { data, error } = await clienteDe(store).from(TABLA).select('*').eq('gn_venta_id', gnVentaId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Marca una venta como anulada. Sólo la primera vez: una segunda no pisa quién ni cuándo. */
export async function marcarAnulada(store, gnVentaId, { usuario = null, nota = null, en = new Date().toISOString() } = {}) {
  const { data, error } = await clienteDe(store).from(TABLA)
    .update({ anulada_en: en, anulada_por: usuario, anulada_nota: nota })
    .eq('gn_venta_id', gnVentaId).is('anulada_en', null)
    .select('gn_venta_id');
  if (error) throw new Error(error.message);
  return (data || []).length > 0;
}
