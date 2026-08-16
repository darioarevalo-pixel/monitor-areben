/**
 * Auditoría del espejo de ventas contra Gestión Nube. SOLO LEE: no escribe ni borra.
 *
 * POR QUÉ EXISTE
 * La simulación de la purga histórica dijo que había 23.902 renglones de más en BDI (el
 * 19% del desglose). El número salió de una sola comparación —"el id está en el espejo y
 * GN no lo devolvió"— y esa comparación no distingue dos cosas muy distintas:
 *
 *   a) el espejo tiene basura acumulada  → borrar está bien
 *   b) GN devolvió el detalle incompleto → borrar destruye datos buenos
 *
 * Este script las separa con un árbitro que no depende de nuestra interpretación: las
 * unidades que GN DECLARA para la venta (`items_sold`) contra las que suman los renglones
 * que GN devuelve. Si no coinciden, el detalle vino incompleto y esa venta no se toca.
 *
 * OJO CON EL ÁRBITRO: tiene que ser el `items_sold` que GN devuelve AHORA, no el guardado
 * en el espejo. El del espejo es uno de los campos que el sync viejo nunca refrescaba, así
 * que puede ser de hace meses — juzgar con él da falsos positivos en las dos direcciones.
 * La primera versión de este script cometía ese error.
 *
 * Clasificación de qué pasaría al purgar:
 *
 *   OK               el espejo ya coincide con GN. No hay nada que borrar.
 *   ARREGLA          el espejo no coincide y lo que GN devuelve sí. Purgar la deja bien.
 *   DUPLICADO        el espejo tiene exactamente el doble. Caso claro de (a).
 *   RE-CREADA        GN cambió TODOS los ids y las cantidades son las mismas. No es
 *                    peligro: la purga corre después del upsert, así que los ids nuevos
 *                    ya entraron y borrar los viejos deja la venta igual de cuadrada.
 *   ⚠️ PELIGRO       el espejo ya cuadraba y la purga borraría PARTE de sus renglones.
 *   ⚠️ GN INCOMPLETO los renglones que GN devuelve suman menos de lo que la venta declara.
 *   sin dato         GN no declara items_sold: no se puede juzgar.
 *
 * También controla si GN deja de devolver un ESTADO entero (por ejemplo los pedidos
 * pendientes). Si pasara eso, las "fantasma" de ese estado no están borradas: es la
 * consulta que no las trae, y purgarlas sería un desastre.
 *
 * La decisión de borrar o no depende de si aparecen casos PELIGRO, GN INCOMPLETO o un
 * estado excluido. Mientras haya, no se purgan renglones.
 *
 * Uso:
 *   node scripts/auditar-ventas.js --marca=bdi --desde=2026-05-01 --hasta=2026-07-31
 *   node scripts/auditar-ventas.js --marca=bdi --fantasmas    # lista las ventas que GN ya no tiene
 *   node scripts/auditar-ventas.js --marca=bdi --verificar     # pregunta por cada una, de a una
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { crearClienteGN } from './lib/gn-fetch.mjs';
// `gnVenta` los usa a mano: necesita el status crudo para distinguir el 404 (ver su comentario).
import { esRateLimit, esperaRateLimit, MAX_RATE_LIMIT } from './lib/gn-rate-limit.mjs';

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  } catch { /* usa variables del sistema */ }
}
loadEnv();

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const MARCA = String(args.marca || 'bdi').toLowerCase();
const DESDE = String(args.desde || '2026-05-01');
const HASTA = String(args.hasta || new Date().toISOString().substring(0, 10));
const FANTASMAS = args.fantasmas === true || args.fantasmas === 'true';
const VERIFICAR = args.verificar === true || args.verificar === 'true';

const MARCAS = {
  bdi:    { url: process.env.SUPABASE_URL,        key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,               token: process.env.GN_TOKEN },
  zattia: { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY, token: process.env.GN_TOKEN_ZATTIA },
};
const cfg = MARCAS[MARCA];
if (!cfg?.url || !cfg?.key || !cfg?.token) { console.error(`Faltan credenciales para ${MARCA}.`); process.exit(1); }

const supabase = createClient(cfg.url, cfg.key);
const GN_BASE = 'https://www.gestionnube.com/api/v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Pregunta por UNA venta puntual: GET /ventas/<id>. Devuelve la venta, o null si GN
 * contesta 404.
 *
 * Es la prueba decisiva sobre las "fantasma". El listado por rango puede no traer una
 * venta por mil razones (un filtro, un estado, un borde de fecha); que el endpoint
 * puntual conteste 404 es lo único que prueba que la venta ya no existe. Sin esto,
 * borrar por ausencia en el listado es borrar por sospecha.
 */
async function gnVenta(id) {
  // No va por `gnFetch` porque acá el status ES el dato: hay que distinguir el 404 de cualquier
  // otro error. Por eso el corte por límite se aguanta a mano — confundirlo con un 404 sería
  // leer "la venta no existe" donde GN sólo dijo "esperá".
  for (let cortes = 0; ; ) {
    const res = await fetch(`${GN_BASE}/ventas/${id}`, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' } });
    if (res.status === 404) return null;
    const text = await res.text();
    if (esRateLimit(res, null) && cortes < MAX_RATE_LIMIT) {
      cortes++;
      const wait = esperaRateLimit(res, cortes);
      console.warn(`  ⏳ GN cortó por límite de solicitudes en ventas/${id}. Esperando ${Math.round(wait / 1000)}s (${cortes}/${MAX_RATE_LIMIT})...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`GN ${res.status} en ventas/${id}: ${text.substring(0, 120)}`);
    const d = JSON.parse(text);
    return d?.data || d;
  }
}

// Cliente de GN compartido: ver scripts/lib/gn-fetch.mjs.
const { gnFetch } = crearClienteGN({ token: cfg.token });

async function bajarGN(desde, hasta) {
  const filas = [];
  let page = 1;
  while (true) {
    const d = await gnFetch(`ventas/obtener?from=${desde}&to=${hasta}&include_details=1&per_page=50&page=${page}`);
    const items = d.data || [];
    filas.push(...items);
    process.stdout.write(`\r  GN: ${filas.length} ventas (página ${page})   `);
    if (!d.meta?.has_more_pages || !items.length) break;
    page++; await sleep(600);
  }
  process.stdout.write('\r' + ' '.repeat(45) + '\r');
  return filas;
}

// `order('id')` es obligatorio: sin un orden estable las páginas se pisan y el mismo
// registro vuelve en la siguiente, inflando los totales.
async function leerEspejo(tabla, select, filtro) {
  const filas = [];
  for (let d = 0; ; d += 1000) {
    let q = supabase.from(tabla).select(select).order('id').range(d, d + 999);
    q = filtro(q);
    const { data, error } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

const unidades = det => det.reduce((a, d) => a + (Number(d.quantity) || 0), 0);

async function main() {
  console.log('=== Auditoría del espejo de ventas (solo lectura) ===');
  console.log(`Marca: ${MARCA}   Rango: ${DESDE} → ${HASTA}\n`);

  const gnFilas = await bajarGN(DESDE, HASTA);
  const ventasEspejo = await leerEspejo('ventas', 'id,number,date_sale,total_price,items_sold,sale_state,channel',
    q => q.gte('date_sale', DESDE).lte('date_sale', HASTA));

  // ── Ventas que el espejo tiene y GN ya no ────────────────────────────────────
  const idsGN = new Set(gnFilas.map(v => v.id));
  const fantasmas = ventasEspejo.filter(v => !idsGN.has(v.id));
  console.log(`Ventas en GN: ${gnFilas.length}   |   en el espejo: ${ventasEspejo.length}   |   solo en el espejo: ${fantasmas.length}`);

  // ¿GN deja de devolver algún estado entero? Si de 200 ventas en "Pedido" fantasmean 200,
  // no son ventas borradas: es la consulta que no las trae, y borrarlas sería un desastre.
  const porEstado = new Map();
  for (const v of ventasEspejo) {
    const k = v.sale_state || 'sin estado';
    const g = porEstado.get(k) || { total: 0, fantasma: 0 };
    g.total++; if (!idsGN.has(v.id)) g.fantasma++;
    porEstado.set(k, g);
  }
  console.log('\n=== Las que faltan, por estado (¿GN excluye algún estado entero?) ===');
  for (const [estado, g] of [...porEstado].sort((a, b) => b[1].fantasma - a[1].fantasma)) {
    const porc = Math.round(g.fantasma / g.total * 100);
    const alarma = g.total >= 5 && porc >= 90 ? '  ⛔ GN NO DEVUELVE ESTE ESTADO' : '';
    console.log(`  ${estado.padEnd(18)} faltan ${String(g.fantasma).padStart(4)} de ${String(g.total).padStart(5)}  (${String(porc).padStart(3)}%)${alarma}`);
  }

  if (FANTASMAS) {
    console.log('\n=== Ventas que están en el Monitor y GN ya no devuelve ===');
    console.log('(si son duplicados que se borraron a mano, se reconocen por el número seguido)\n');
    for (const f of fantasmas.sort((a, b) => String(a.number).localeCompare(String(b.number)))) {
      console.log(`  N° ${String(f.number).padEnd(7)} ${f.date_sale}  $${String(Math.round(f.total_price || 0)).padStart(9)}  ${String(f.sale_state).padEnd(18)} ${f.channel || ''}`);
    }
  }

  // ── ¿Las fantasma existen de verdad? Se pregunta por cada una ────────────────
  if (VERIFICAR && fantasmas.length) {
    console.log(`\n=== Preguntando por las ${fantasmas.length} ventas, de a una ===`);
    const existen = [], borradas = [], fallaron = [];
    for (const f of fantasmas) {
      try {
        const v = await gnVenta(f.id);
        if (v) existen.push({ ...f, estadoGN: v.sale_state || v.state || '?' });
        else borradas.push(f);
      } catch (e) {
        fallaron.push({ ...f, error: e.message });
      }
      await sleep(250);
    }
    console.log(`\n  Existen en GN (el listado no las trae):  ${existen.length}  ⛔ NO se pueden borrar`);
    console.log(`  GN contesta 404 (borradas de verdad):   ${borradas.length}  ✅ se pueden borrar`);
    if (fallaron.length) console.log(`  No se pudo verificar:                   ${fallaron.length}`);

    if (existen.length) {
      console.log('\n  ⛔ Estas EXISTEN en Gestión Nube y el listado por rango no las devuelve:');
      for (const e of existen.slice(0, 40)) {
        console.log(`     N° ${String(e.number).padEnd(7)} ${e.date_sale}  $${String(Math.round(e.total_price || 0)).padStart(9)}  espejo: ${String(e.sale_state).padEnd(17)} GN ahora: ${e.estadoGN}`);
      }
    }
    if (borradas.length) {
      console.log('\n  ✅ Estas ya no existen (404). Son las que se borraron a mano:');
      for (const b of borradas.slice(0, 40)) {
        console.log(`     N° ${String(b.number).padEnd(7)} ${b.date_sale}  $${String(Math.round(b.total_price || 0)).padStart(9)}  ${b.sale_state}`);
      }
    }
    if (fallaron.length) {
      console.log('\n  Errores al verificar:');
      for (const f of fallaron.slice(0, 10)) console.log(`     N° ${f.number}: ${f.error}`);
    }
  }

  // ── Renglones: espejo vs GN vs lo que GN declara ─────────────────────────────
  const idsEspejo = ventasEspejo.map(v => v.id);
  const detEspejo = [];
  for (let i = 0; i < idsEspejo.length; i += 200) {
    const lote = idsEspejo.slice(i, i + 200);
    detEspejo.push(...await leerEspejo('venta_detalles', 'id,sale_id,quantity,total', q => q.in('sale_id', lote)));
  }

  const espejoPorVenta = new Map();
  for (const d of detEspejo) {
    const g = espejoPorVenta.get(d.sale_id) || [];
    g.push(d); espejoPorVenta.set(d.sale_id, g);
  }
  // GN puede repetir una venta en varias páginas: se unen sus renglones por id.
  const gnPorVenta = new Map();
  const gnDeclara = new Map();   // id -> items_sold que GN declara AHORA
  for (const v of gnFilas) {
    const m = gnPorVenta.get(v.id) || new Map();
    for (const d of v.detalles || []) m.set(d.id, d);
    gnPorVenta.set(v.id, m);
    if (v.items_sold != null) gnDeclara.set(v.id, Number(v.items_sold));
  }

  const clases = { OK: 0, ARREGLA: 0, DUPLICADO: 0, RECREADA: 0, PELIGRO: 0, GN_INCOMPLETO: 0, SIN_DATO: 0, SIN_DETALLE_GN: 0 };
  const peligro = [], incompleto = [];
  let renglonesABorrar = 0, renglonesABorrarSeguros = 0;

  // Mismo análisis, abierto por mes: un total de dos años no deja ver si un mes puntual
  // se comporta distinto, y es justo lo que hay que mirar antes de decidir una purga.
  const meses = new Map();
  const mesDe = f => String(f || '').substring(0, 7);
  const mes = k => {
    if (!meses.has(k)) meses.set(k, { ventas: 0, fantasma: 0, plataFantasma: 0, ok: 0, tocadas: 0, renglones: 0, renglonesABorrar: 0 });
    return meses.get(k);
  };
  for (const v of ventasEspejo) {
    const m = mes(mesDe(v.date_sale));
    m.ventas++;
    if (!idsGN.has(v.id)) { m.fantasma++; m.plataFantasma += Number(v.total_price) || 0; }
    m.renglones += (espejoPorVenta.get(v.id) || []).length;
  }
  const afectadas = [];   // detalle de cada venta que cambiaría

  for (const v of ventasEspejo) {
    if (!idsGN.has(v.id)) continue; // fantasma, se cuenta aparte
    const esp = espejoPorVenta.get(v.id) || [];
    const gn = gnPorVenta.get(v.id) || new Map();
    const sobran = esp.filter(d => !gn.has(d.id));
    renglonesABorrar += sobran.length;
    const m = mes(mesDe(v.date_sale));
    m.renglonesABorrar += sobran.length;
    if (sobran.length) m.tocadas++; else m.ok++;

    if (!gn.size) { clases.SIN_DETALLE_GN++; continue; } // la salvaguarda ya los saltea
    if (!gnDeclara.has(v.id)) { clases.SIN_DATO++; continue; }

    // El árbitro es lo que GN declara AHORA. El items_sold del espejo no sirve de juez:
    // es uno de los campos que el sync viejo nunca refrescaba, así que puede ser viejo.
    const declara = gnDeclara.get(v.id);
    const uEspejo = unidades(esp);
    const uGN = unidades([...gn.values()]);

    if (uGN !== declara) {
      clases.GN_INCOMPLETO++;
      if (incompleto.length < 15) incompleto.push({ n: v.number, uEspejo, uGN, declara, esp: esp.length, gn: gn.size });
      continue;
    }
    if (!sobran.length) { clases.OK++; continue; }

    // RE-CREADA: GN cambió TODOS los ids de los renglones y las cantidades son las mismas.
    // El espejo cuadra, pero con la versión vieja. Como la purga corre DESPUÉS del upsert,
    // los ids nuevos ya entraron y borrar los viejos deja la venta igual de cuadrada. No es
    // peligro: es exactamente el caso que la purga viene a resolver.
    if (sobran.length === esp.length && uEspejo === declara) {
      clases.RECREADA++;
      renglonesABorrarSeguros += sobran.length;
      afectadas.push({ n: v.number, f: v.date_sale, tipo: 'RE-CREADA', uEspejo, declara, esp: esp.length, queda: gn.size });
      continue;
    }
    if (uEspejo === declara) {
      // el espejo YA coincidía y la purga borraría PARTE de sus renglones: eso lo rompe
      clases.PELIGRO++;
      if (peligro.length < 15) peligro.push({ n: v.number, uEspejo, uGN, declara, esp: esp.length, gn: gn.size, sobran: sobran.length });
      continue;
    }
    if (uEspejo === declara * 2) clases.DUPLICADO++; else clases.ARREGLA++;
    renglonesABorrarSeguros += sobran.length;
    afectadas.push({ n: v.number, f: v.date_sale, tipo: uEspejo === declara * 2 ? 'DUPLICADO' : 'ARREGLA', uEspejo, declara, esp: esp.length, queda: gn.size });
  }

  console.log('\n=== Mes por mes ===');
  console.log('  mes       ventas  borradas   $borradas   con desglose mal   renglones   a borrar');
  for (const [k, m] of [...meses].sort()) {
    console.log(
      `  ${k}   ${String(m.ventas).padStart(5)}  ${String(m.fantasma).padStart(6)}  ${('$' + Math.round(m.plataFantasma).toLocaleString('es-AR')).padStart(12)}` +
      `  ${String(m.tocadas).padStart(14)}   ${String(m.renglones).padStart(9)}  ${String(m.renglonesABorrar).padStart(9)}`
    );
  }

  console.log('\n=== Ventas cuyo desglose cambiaría (las 25 más grandes) ===');
  console.log('  (unidades: lo que muestra el Monitor hoy → lo que dice GN · renglones: hoy → quedarían)');
  for (const a of afectadas.sort((x, y) => y.esp - x.esp).slice(0, 25)) {
    console.log(`   N° ${String(a.n).padEnd(7)} ${a.f}  ${String(a.tipo).padEnd(10)} unidades ${String(a.uEspejo).padStart(4)} → ${String(a.declara).padStart(4)}   renglones ${String(a.esp).padStart(4)} → ${String(a.queda).padStart(4)}`);
  }
  console.log(`\n  (total de ventas con el desglose mal: ${afectadas.length})`);

  console.log('\n=== Qué pasaría si purgáramos los renglones ===');
  console.log(`  OK (ya coincidía, nada que borrar):        ${clases.OK}`);
  console.log(`  DUPLICADO (el espejo tiene el doble):      ${clases.DUPLICADO}`);
  console.log(`  RE-CREADA (GN cambió todos los ids):       ${clases.RECREADA}`);
  console.log(`  ARREGLA (queda cuadrada con GN):           ${clases.ARREGLA}`);
  console.log(`  ⚠️  PELIGRO (ya cuadraba y borraría igual): ${clases.PELIGRO}`);
  console.log(`  ⚠️  GN INCOMPLETO (GN devuelve de menos):   ${clases.GN_INCOMPLETO}`);
  console.log(`  sin items_sold (no se puede juzgar):       ${clases.SIN_DATO}`);
  console.log(`  GN sin detalle (la purga los saltea):      ${clases.SIN_DETALLE_GN}`);
  console.log(`\n  Renglones que la purga borraría:          ${renglonesABorrar}`);
  console.log(`  De esos, en ventas que quedan cuadradas:   ${renglonesABorrarSeguros}`);
  console.log(`  En ventas dudosas (NO habría que tocar):   ${renglonesABorrar - renglonesABorrarSeguros}`);

  if (peligro.length) {
    console.log('\n⚠️  Ventas que ya cuadraban y la purga borraría (muestra):');
    for (const p of peligro) console.log(`   N° ${String(p.n).padEnd(7)} unidades: espejo=${p.uEspejo} GN=${p.uGN} declara=${p.declara} | renglones: espejo=${p.esp} GN=${p.gn} sobran=${p.sobran}`);
  }
  if (incompleto.length) {
    console.log('\n⚠️  Ventas donde GN devuelve menos unidades que las que declara (muestra):');
    for (const p of incompleto) console.log(`   N° ${String(p.n).padEnd(7)} unidades: espejo=${p.uEspejo} GN=${p.uGN} declara=${p.declara} | renglones: espejo=${p.esp} GN=${p.gn}`);
  }
}

main().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
