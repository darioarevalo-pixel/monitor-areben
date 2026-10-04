// Respaldo de la cola de la Caja: reintenta las ventas que ⛔ llegaron a Gestión Nube.
//
// Lo PRIMARIO es la pantalla, que reintenta sola mientras está abierta. Esto cubre que la cierren
// con una venta colgada. Lo corre `.github/workflows/caja-reintentar.yml`.
// ⚠️ Los crons de GitHub de este repo llegan TARDE (a veces horas): es un respaldo, ⛔ un reloj.
//
// Manda con `lib/caja/enviar.core.js`, la MISMA función que el handler: el `payload` guardado y el
// id como `integration_id` ⇒ si la pantalla la está mandando a la vez, GN contesta 409 y es «ya está».
// ⛔ Toca las que GN RECHAZÓ (`reintentable = false`): mandarlas da lo mismo y gasta el cupo compartido.
//
// Sale con código 1 si queda alguna venta sin llegar a GN después de 1 hora: el workflow en rojo es
// el aviso («0 ventas en error más de 1 hora», verificación del v1).
//
// ⛔ Imprime tokens ni el cuerpo de las ventas: sólo conteos y el número de la Caja.
import { createClient } from '@supabase/supabase-js';
import { GN_BASE, GN_TOKENS, PAUSA_GN, dormir, gnFetch } from '../api/_gn.js';
import { COLUMNAS_VENTA, enviarVenta } from '../lib/caja/enviar.core.js';

const url = process.env.ZATTIA_SUPABASE_URL;
const key = process.env.ZATTIA_SUPABASE_SERVICE_KEY;
const token = process.env.GN_TOKEN_VENTAS || GN_TOKENS.zattia;
if (!url || !key || !token) { console.error('Faltan ZATTIA_SUPABASE_URL, ZATTIA_SUPABASE_SERVICE_KEY o el token de GN.'); process.exit(1); }
const sb = createClient(url, key);

// Las que se tocaron hace menos de 2 minutos pueden estar en vuelo desde la pantalla.
const corte = new Date(Date.now() - 2 * 60 * 1000).toISOString();
const { data, error } = await sb.from('caja_venta').select(`${COLUMNAS_VENTA}, payload, actualizada_en`)
  .eq('store', 'zattia').neq('estado', 'en_gn').lt('actualizada_en', corte)
  .order('creada_en', { ascending: true }).limit(50);
if (error) { console.error('No se pudo leer caja_venta:', error.message); process.exit(1); }

const pendientes = (data || []).filter(v => v.reintentable !== false);
const rechazadas = (data || []).length - pendientes.length;
let ok = 0;
for (const v of pendientes) {
  try {
    const { venta } = await enviarVenta(v, { sb, gnFetch, base: GN_BASE, token });
    if (venta.estado === 'en_gn') { ok++; console.log(`✓ ${v.id.slice(0, 8)} → GN #${venta.gn_number}`); }
    else console.log(`✗ ${v.id.slice(0, 8)}: ${venta.ultimo_error}`);
  } catch (e) {
    console.log(`✗ ${v.id.slice(0, 8)}: la base falló (${e.message})`);
  }
  await dormir(PAUSA_GN);
}

const { data: viejas, error: e2 } = await sb.from('caja_venta').select('id')
  .eq('store', 'zattia').neq('estado', 'en_gn').lt('creada_en', new Date(Date.now() - 60 * 60 * 1000).toISOString());
console.log(`Pendientes: ${pendientes.length} · llegaron: ${ok} · rechazadas por GN (⛔ se reintentan): ${rechazadas} · sin llegar hace +1 h: ${e2 ? '?' : viejas.length}`);
if (e2 || viejas.length) process.exit(1);
