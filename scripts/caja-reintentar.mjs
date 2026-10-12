// Respaldo de la cola de la Caja: reintenta las ventas que ⛔ llegaron a Gestión Nube.
//
// Lo PRIMARIO es el POS, que reintenta solo cada 3 min mientras está abierto (`reintentar-pendientes`,
// auditoría E, 11-oct). Esto cubre que lo cierren con una venta colgada. Lo corre
// `.github/workflows/caja-reintentar.yml`.
// ⚠️ Los crons de GitHub de este repo llegan TARDE: el `*/10` corrió ~3 veces por día (7 al 11-oct).
// Es un respaldo, ⛔ un reloj.
//
// Manda con `lib/caja/enviar.core.js`, la MISMA función que el handler: el `payload` guardado y el
// id como `integration_id` ⇒ si la pantalla la está mandando a la vez, GN contesta 409 y es «ya está».
// ⛔ Toca las que GN RECHAZÓ (`reintentable = false`): mandarlas da lo mismo y gasta el cupo compartido.
//
// Sale con código 1 si queda alguna venta sin llegar a GN después de 1 hora: el workflow en rojo es
// el aviso («0 ventas en error más de 1 hora», verificación del v1).
//
// ⛔ Imprime tokens ni el cuerpo de las ventas: sólo conteos y el número de la Caja.
//
// 🔑 V4 (12-oct): recorre las marcas de la Caja (`MARCAS_CAJA`), cada una con su base (`cfgDeMarca`) y
// su token de GN (`tokenVentas`). Una marca sin sus credenciales en el workflow se SALTEA y lo dice; el
// rojo es sólo por ventas sin llegar.
import { createClient } from '@supabase/supabase-js';
import { GN_BASE, PAUSA_GN, dormir, gnFetch } from '../api/_gn.js';
import { cfgDeMarca } from '../api/_recepciones-base.js';
import { COLUMNAS_VENTA, SIN_LLEGAR, enviarVenta, pendientesParaReintentar } from '../lib/caja/enviar.core.js';
import { MARCAS_CAJA, tokenDe } from '../lib/caja/marcas.core.js';
import { mandarTicket } from '../lib/caja/ticket-mail.core.js';

// El ticket por mail (F4). Sin las dos variables, las ventas se reintentan igual y los tickets ⛔.
const mailer = { url: process.env.MAILER_URL, key: process.env.MAILER_TICKET_KEY, fetch };

let rojo = false;
for (const marca of Object.values(MARCAS_CAJA)) {
  const store = marca.store;
  const { url, key } = cfgDeMarca(store);
  const token = tokenDe(marca.tokenVentas, process.env);
  if (!url || !key || !token) { console.log(`— ${marca.nombre}: sin la base o el token de GN en el workflow, se saltea.`); continue; }
  const sb = createClient(url, key);
  const r = await reintentar(marca.nombre, store, sb, token);
  rojo = rojo || r;
}
if (rojo) process.exit(1);

/** Una marca. Devuelve true si quedó alguna venta sin llegar a GN después de 1 hora (o no se pudo leer). */
async function reintentar(nombre, store, sb, token) {
  // 🔴 Sólo las COBRADAS (`SIN_LLEGAR`): una que espera la transferencia (F5) sale a GN cuando `cruzar`
  // encuentra el pago, y una cancelada ⛔ sale nunca. `.neq('en_gn')` las mandaba sin cruce.
  // Las que se tocaron hace menos de 2 minutos pueden estar en vuelo desde la pantalla.
  const corte = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  let pendientes, rechazadas;
  try {
    ({ pendientes, rechazadas } = await pendientesParaReintentar(sb, store, { corteMs: 2 * 60 * 1000, limite: 50, ahora: Date.now() }));
  } catch (e) {
    // Sin las tablas de la Caja en esa base (la marca todavía ⛔ cobra): ⛔ es rojo.
    if (/caja_venta.*(does not exist|schema cache)|Could not find the table/i.test(e.message || '')) { console.log(`— ${nombre}: sin las tablas de la Caja.`); return false; }
    console.error(`${nombre}: no se pudo leer caja_venta:`, e.message);
    return true;
  }
  let ok = 0;
  for (const v of pendientes) {
    try {
      const { venta } = await enviarVenta(v, { sb, gnFetch, base: GN_BASE, token, mailer });
      if (venta.estado === 'en_gn') { ok++; console.log(`✓ ${nombre} ${v.id.slice(0, 8)} → GN #${venta.gn_number}`); }
      else console.log(`✗ ${nombre} ${v.id.slice(0, 8)}: ${venta.ultimo_error}`);
    } catch (e) {
      console.log(`✗ ${nombre} ${v.id.slice(0, 8)}: la base falló (${e.message})`);
    }
    await dormir(PAUSA_GN);
  }

  // Los tickets por mail que ⛔ salieron (el mailer caído o lento cuando la venta llegó a GN). Las de
  // las últimas 48 h: más tarde, un comprobante ya ⛔ le sirve a nadie. El mailer deduplica por venta.
  let tickets = 0, ticketsMal = 0;
  if (mailer.url && mailer.key) {
    const desde = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: sinTicket, error: e3 } = await sb.from('caja_venta').select(COLUMNAS_VENTA)
      .eq('store', store).eq('estado', 'en_gn').not('email', 'is', null).gt('creada_en', desde).lt('actualizada_en', corte)
      .or('ticket_mail.is.null,ticket_mail.like.error%').limit(50);
    if (e3) { console.error(`${nombre}: no se pudieron leer los tickets pendientes:`, e3.message); ticketsMal++; }
    for (const v of sinTicket || []) {
      const estado = await mandarTicket(v, { sb, ...mailer });
      if (estado && !estado.startsWith('error')) tickets++; else { ticketsMal++; console.log(`✗ ${nombre} ticket ${v.id.slice(0, 8)}: ${estado}`); }
    }
  }
  console.log(`${nombre} · tickets por mail: ${tickets} pedidos · ${ticketsMal} con error`);

  const { data: viejas, error: e2 } = await sb.from('caja_venta').select('id')
    .eq('store', store).in('estado', SIN_LLEGAR).lt('creada_en', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  console.log(`${nombre} · pendientes: ${pendientes.length} · llegaron: ${ok} · rechazadas por GN (⛔ se reintentan): ${rechazadas} · sin llegar hace +1 h: ${e2 ? '?' : viejas.length}`);
  return !!(e2 || viejas.length);
}
