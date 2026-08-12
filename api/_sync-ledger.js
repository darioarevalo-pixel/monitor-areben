// Ledger de idempotencia del sync TN↔GN (tabla `sync_procesados`, ver sql/migrate-sync-procesados.sql).
//
// No es una ruta: lleva `_`, así que Vercel no lo cuenta como función (el repo está justo contra el
// límite de 12 del plan Hobby). Lo usan la lectura (`_sync-tn.js`, vía `api/datos.js?recurso=sync-tn`)
// y la escritura (`api/crear-venta.js`, acción `tn_import`).
//
// 🔑 **Se reserva ANTES de postear la venta a GN, no después.** GN no permite anular una venta por
// API: una venta que falta se carga a mano en 30 segundos, una duplicada no se borra. El
// `unique (store, fuente, tipo, ref_id)` es el candado real contra el doble clic, las dos pestañas
// abiertas y el retry del navegador — y hace de candado incluso si dos requests llegan a la vez,
// porque el que decide es Postgres y no una lectura previa.
import { createClient } from '@supabase/supabase-js';

const TABLA = 'sync_procesados';

export function cfgFor(store) {
  // Mismo criterio que api/sku-map.js: Stunned es la línea STU dentro del GN de Zattia y todavía
  // no tiene base propia.
  if (store === 'zattia' || store === 'stunned') {
    return {
      url: process.env.ZATTIA_SUPABASE_URL,
      key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
    };
  }
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

export function clienteDe(store) {
  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) throw new Error(`Faltan credenciales de Supabase para ${store}.`);
  return createClient(cfg.url, cfg.key);
}

/** Lo ya procesado, para que el motor sepa qué NO volver a proponer. */
export async function listar(store, tipo = 'venta', desde) {
  const sb = clienteDe(store);
  let q = sb.from(TABLA).select('*').eq('store', store).eq('fuente', 'tn').eq('tipo', tipo);
  if (desde) q = q.gte('procesado_at', desde);
  const { data, error } = await q.order('procesado_at', { ascending: false }).limit(5000);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Toma la orden ANTES de mandarla a GN. Si otra corrida ya la tiene, devuelve `{ocupado:true}` con
 * la fila que la ocupa — no se postea nada.
 */
export async function reservar(store, ref_id, detalle) {
  const sb = clienteDe(store);
  const fila = {
    store, fuente: 'tn', tipo: 'venta', ref_id: String(ref_id),
    detalle: { estado: 'enviando', ...(detalle || {}) },
  };
  const { data, error } = await sb.from(TABLA).insert(fila).select('*').single();
  if (error) {
    // 23505 = unique_violation. Es el caso ESPERADO, no un fallo: alguien ya la tomó.
    if (error.code === '23505') {
      const { data: previa } = await sb
        .from(TABLA).select('*')
        .eq('store', store).eq('fuente', 'tn').eq('tipo', 'venta').eq('ref_id', String(ref_id))
        .maybeSingle();
      return { ocupado: true, fila: previa || null };
    }
    throw new Error(error.message);
  }
  return { ocupado: false, fila: data };
}

/** Cierra la reserva con el desenlace ('ok' o 'dudoso'), sin perder lo que ya tenía el detalle. */
export async function confirmar(store, ref_id, patch) {
  const sb = clienteDe(store);
  const { data: previa } = await sb
    .from(TABLA).select('detalle')
    .eq('store', store).eq('fuente', 'tn').eq('tipo', 'venta').eq('ref_id', String(ref_id))
    .maybeSingle();
  const { error } = await sb
    .from(TABLA)
    .update({ detalle: { ...((previa && previa.detalle) || {}), ...(patch || {}) }, procesado_at: new Date().toISOString() })
    .eq('store', store).eq('fuente', 'tn').eq('tipo', 'venta').eq('ref_id', String(ref_id));
  if (error) throw new Error(error.message);
}

/**
 * Suelta la reserva. Sólo para cuando se SABE que la venta no se creó: un rechazo determinístico
 * de GN (4xx), o un humano que fue a mirar a GN y confirmó que no está. Nunca sobre una fila `ok`
 * — eso permitiría reimportar una venta que existe.
 */
export async function liberar(store, ref_id, { forzar = false } = {}) {
  const sb = clienteDe(store);
  const { data: previa } = await sb
    .from(TABLA).select('detalle')
    .eq('store', store).eq('fuente', 'tn').eq('tipo', 'venta').eq('ref_id', String(ref_id))
    .maybeSingle();
  const estado = previa && previa.detalle && previa.detalle.estado;
  if (estado === 'ok' && !forzar) throw new Error('Esa orden ya se importó con éxito: no se libera.');
  const { error } = await sb
    .from(TABLA).delete()
    .eq('store', store).eq('fuente', 'tn').eq('tipo', 'venta').eq('ref_id', String(ref_id));
  if (error) throw new Error(error.message);
}
