/**
 * Pasada única sobre TODO el histórico de ventas: relee cada mes desde Gestión Nube,
 * corrige lo que cambió y borra lo que ya no existe.
 *
 * POR QUÉ HACE FALTA APARTE DEL SYNC DIARIO
 * El sync diario relee los últimos 90 días (scripts/lib/purga-ventas.mjs). Eso arregla
 * de acá en adelante, pero lo anterior nunca se revisó: el espejo venía siendo
 * solo-upsert desde 2024, así que toda venta anulada antes de esa ventana sigue adentro
 * sumando plata. Este script pasa una vez por el resto.
 *
 * De regalo rellena lo que el espejo nunca tuvo. El caso conocido: 7.865 ventas sin
 * `total_cost` (todo 2024 al 100%), que es lo que tiene rotos los márgenes de ese año.
 * Si GN hoy devuelve el costo, el upsert lo completa.
 *
 * ARRANCA EN SIMULACIÓN. Sin `--aplicar` no escribe ni borra nada: baja los datos,
 * compara e informa mes por mes. El número se mira PRIMERO y se aplica después.
 *
 * Uso:
 *   node scripts/purga-historica.js --marca=bdi                      # simula (no toca nada)
 *   node scripts/purga-historica.js --marca=bdi --aplicar            # corrige y borra
 *   node scripts/purga-historica.js --marca=zattia --desde=2025-01-01
 *   node scripts/purga-historica.js --marca=bdi --aplicar --tope=0.3 # afloja el freno
 *
 * Es idempotente y se puede cortar: cada mes es independiente, así que si se cae se
 * vuelve a correr con `--desde` en el mes que quedó.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { purgarVentas, purgarDetalles } from './lib/purga-ventas.mjs';
import { guardarVentasBatch } from './lib/ventas-espejo.mjs';

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

// ── Argumentos ────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const MARCA   = String(args.marca || 'bdi').toLowerCase();
const APLICAR = args.aplicar === true || args.aplicar === 'true';
const TOPE    = Number(args.tope ?? 0.1);
const DESDE   = String(args.desde || '2024-01-01');
const HASTA   = String(args.hasta || new Date().toISOString().substring(0, 10));

// Zattia guarda 9 columnas porque su tabla todavía no tiene las otras (ver ventas-espejo.mjs).
const MARCAS = {
  bdi: {
    url:   process.env.SUPABASE_URL,
    key:   process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
    token: process.env.GN_TOKEN,
    completo: true,
  },
  zattia: {
    url:   process.env.ZATTIA_SUPABASE_URL,
    key:   process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
    token: process.env.GN_TOKEN_ZATTIA,
    completo: false,
  },
};

const cfg = MARCAS[MARCA];
if (!cfg) { console.error(`Marca desconocida: ${MARCA}. Usar bdi o zattia.`); process.exit(1); }
if (!cfg.url || !cfg.key || !cfg.token) {
  console.error(`Faltan credenciales para ${MARCA}. Necesita url, key y token de Gestión Nube.`);
  process.exit(1);
}

const supabase = createClient(cfg.url, cfg.key);
const GN_BASE = 'https://www.gestionnube.com/api/v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Gestión Nube ──────────────────────────────────────────────────────────────

async function gnFetch(path, retries = 5) {
  for (let intento = 1; intento <= retries; intento++) {
    let res, text;
    try {
      res = await fetch(`${GN_BASE}/${path}`, {
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
      });
      text = await res.text();
    } catch (e) {
      if (intento === retries) throw e;
      await sleep(2000 * intento);
      continue;
    }
    let data;
    try { data = JSON.parse(text); }
    catch {
      // GN contesta el HTML del login cuando el token venció: decirlo con todas las letras
      // en vez de dejar un "Unexpected token <" que no ayuda a nadie.
      if (/<!DOCTYPE|<html/i.test(text)) throw new Error(`Gestión Nube devolvió HTML: el token de ${MARCA} está vencido o es inválido.`);
      if (res.status >= 500 && intento < retries) { await sleep(2000 * intento); continue; }
      throw new Error(`Respuesta no-JSON de GN [${res.status}] en ${path}: ${text.substring(0, 150)}`);
    }
    if (!res.ok) {
      if (res.status >= 500 && intento < retries) { await sleep(2000 * intento); continue; }
      throw new Error(data.message || data.error || `Error ${res.status} en ${path}`);
    }
    return data;
  }
}

async function bajarMes(desde, hasta) {
  const filas = [];
  let page = 1;
  while (true) {
    const data = await gnFetch(`ventas/obtener?from=${desde}&to=${hasta}&include_details=1&per_page=50&page=${page}`);
    const items = data.data || [];
    filas.push(...items);
    process.stdout.write(`\r  bajando… página ${page} (${filas.length} ventas)   `);
    if (!data.meta?.has_more_pages || !items.length) break;
    page++;
    await sleep(600);
  }
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
  return filas;
}

// ── Meses del rango ───────────────────────────────────────────────────────────

function mesesEntre(desde, hasta) {
  const meses = [];
  let [a, m] = desde.split('-').map(Number);
  const [aF, mF] = hasta.split('-').map(Number);
  while (a < aF || (a === aF && m <= mF)) {
    const ini = `${a}-${String(m).padStart(2, '0')}-01`;
    const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
    meses.push([ini, `${a}-${String(m).padStart(2, '0')}-${ultimoDia}`]);
    m++; if (m > 12) { m = 1; a++; }
  }
  return meses;
}

/** Cuántas ventas del mes tienen el costo vacío en el espejo (el agujero de 2024). */
async function sinCostoEnEspejo(desde, hasta) {
  if (!cfg.completo) return null; // la tabla de Zattia no tiene la columna
  const { count, error } = await supabase
    .from('ventas').select('*', { count: 'exact', head: true })
    .gte('date_sale', desde).lte('date_sale', hasta).is('total_cost', null);
  return error ? null : count;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Purga histórica del espejo de ventas ===');
  console.log(`Marca:  ${MARCA}`);
  console.log(`Rango:  ${DESDE} → ${HASTA}`);
  console.log(`Modo:   ${APLICAR ? '⚠️  APLICAR (corrige y borra)' : 'SIMULACIÓN (no toca nada)'}`);
  console.log(`Tope:   ${Math.round(TOPE * 100)}% por mes\n`);

  const meses = mesesEntre(DESDE, HASTA);
  const total = { ventasGN: 0, enEspejo: 0, borradas: 0, renglones: 0, costoRellenado: 0 };

  for (const [ini, fin] of meses) {
    const mes = ini.substring(0, 7);
    let filas;
    try {
      filas = await bajarMes(ini, fin);
    } catch (e) {
      console.error(`${mes}  ✖ no se pudo bajar: ${e.message}`);
      if (/token/i.test(e.message)) process.exit(1); // sin token no tiene sentido seguir
      continue;
    }

    const sinCostoAntes = await sinCostoEnEspejo(ini, fin);
    const conCostoEnGN = filas.filter(v => v.total_cost != null).length;

    if (APLICAR && filas.length) await guardarVentasBatch(supabase, filas, { completo: cfg.completo });

    const idsGN = new Set(filas.map(v => v.id));
    const detallesPorVenta = new Map();
    for (const v of filas) {
      const set = detallesPorVenta.get(v.id) || new Set();
      for (const d of v.detalles || []) set.add(d.id);
      detallesPorVenta.set(v.id, set);
    }

    const opciones = { topePorc: TOPE, simular: !APLICAR };
    const borradas  = await purgarVentas(supabase, idsGN, ini, fin, opciones);
    const renglones = await purgarDetalles(supabase, detallesPorVenta, opciones);

    const rellenado = sinCostoAntes != null ? Math.min(sinCostoAntes, conCostoEnGN) : 0;
    total.ventasGN += filas.length;
    total.borradas += borradas;
    total.renglones += renglones;
    total.costoRellenado += rellenado;

    const etiqueta = APLICAR ? 'borradas' : 'a borrar';
    console.log(
      `${mes}  GN: ${String(filas.length).padStart(5)}  |  ${etiqueta}: ${String(borradas).padStart(4)} ventas, ` +
      `${String(renglones).padStart(4)} renglones` +
      (rellenado ? `  |  costo a completar: ${rellenado}` : '')
    );
    await sleep(300);
  }

  console.log('\n=== Resumen ===');
  console.log(`Ventas leídas de Gestión Nube: ${total.ventasGN}`);
  console.log(`Ventas ${APLICAR ? 'borradas' : 'a borrar'}:              ${total.borradas}`);
  console.log(`Renglones ${APLICAR ? 'borrados' : 'a borrar'}:           ${total.renglones}`);
  if (cfg.completo) console.log(`Costo ${APLICAR ? 'completado' : 'a completar'}:              ${total.costoRellenado} ventas`);
  if (!APLICAR) console.log('\nNada de esto se aplicó. Para hacerlo: agregar --aplicar al comando.');
}

main().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
