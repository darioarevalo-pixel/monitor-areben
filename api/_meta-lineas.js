// De qué marca es cada campaña de Meta: la lectura de `meta_ads_campania_linea`, una sola vez.
//
// ⚠️ **Una sola base, la de BDI, y la leen las dos marcas.** De quién es una campaña es un hecho
// único, no una decisión editorial de cada marca: guardarlo por store dejaría a la pantalla de BDI
// viendo «sin asignar» lo que Zattia ya asignó, sin que ninguna vea el choque. El razonamiento
// largo está arriba de `sql/migrate-meta-ads-linea.sql`.
//
// Vive acá y no adentro de `api/meta-ads.js` porque lo necesitan tres handlers —el censo de etapas,
// las acciones sobre la pauta y el tablero de ideas— y `_meta-acciones.js` no puede importarlo de
// `meta-ads.js` sin cerrar un círculo (es `meta-ads.js` el que lo despacha).
//
// Archivo `_`: no es una ruta y no cuenta contra las 12 funciones del plan Hobby.
import { createClient } from '@supabase/supabase-js';

/**
 * La base de BDI, que es donde viven las tablas **cross-marca** de Meta Ads: de qué marca es cada
 * campaña (`meta_ads_campania_linea`) y quién accionó sobre cuál (`meta_ads_accion`). Las dos
 * describen una sola cuenta publicitaria, así que no se parten por store.
 */
export function clienteBdi() {
  const url = process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Todas las asignaciones, indexadas por `campaign_id`.
 *
 * Devuelve `{ error }` en vez de tirar: quien llama decide si eso es un 502 (el censo, que sin esto
 * mostraría todas las campañas como «sin asignar» y alguien las volvería a cargar encima) o un
 * corte más duro (una acción, que sin la línea no sabe de quién es la plata que va a mover).
 */
export async function leerAsignaciones() {
  const supabase = clienteBdi();
  if (!supabase) return { error: 'Faltan credenciales de Supabase' };
  try {
    const { data, error } = await supabase.from('meta_ads_campania_linea').select('campaign_id, linea');
    if (error) return { error: error.message };
    return { mapa: new Map((data || []).map((r) => [String(r.campaign_id), r])) };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}
