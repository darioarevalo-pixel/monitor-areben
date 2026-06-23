// Sync LIVIANO de ventas recientes (ventas + venta_detalles + clientes), para BDI o Zattia.
// Pensado para el botón "Actualizar ventas" del Monitor: baja solo lo de ayer→hoy (rápido),
// sin tocar inventario ni productos. Idempotente (upserts por id), no toca .last-sync.
// Marca: se elige con INPUT_STORE=bdi|zattia (default bdi).
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

loadEnv();

const STORE = ((process.env.INPUT_STORE || process.argv[2] || 'bdi').toLowerCase() === 'zattia') ? 'zattia' : 'bdi';
const CFG = STORE === 'zattia'
  ? {
      url:   process.env.ZATTIA_SUPABASE_URL,
      key:   process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
      token: process.env.GN_TOKEN_ZATTIA,
    }
  : {
      url:   process.env.SUPABASE_URL,
      key:   process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
      token: process.env.GN_TOKEN,
    };

const SUPABASE_URL = CFG.url;
const SUPABASE_KEY = CFG.key;
const GN_TOKEN     = CFG.token;
const GN_BASE      = 'https://www.gestionnube.com/api/v1';

// Fecha local Argentina (YYYY-MM-DD) con un offset de días opcional.
function fechaAR(offsetDias = 0) {
  const d = new Date(Date.now() + offsetDias * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}
const HASTA = fechaAR(0);                                  // hoy (AR)
const DESDE = process.env.SYNC_FROM_DATE || fechaAR(-1);   // ayer (AR), por las dudas de la medianoche

if (!SUPABASE_URL || !SUPABASE_KEY || !GN_TOKEN) {
  console.error(`Faltan credenciales para ${STORE} (Supabase URL/KEY o GN token).`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gnFetch(path, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    let res, text;
    try {
      res = await fetch(`${GN_BASE}/${path}`, {
        headers: { 'Authorization': `Bearer ${GN_TOKEN}`, 'Accept': 'application/json' }
      });
      text = await res.text();
    } catch (e) {
      if (attempt < retries) {
        const wait = 2000 * attempt;
        console.warn(`  ⚠️  red ${e.message} en ${path}, reintentando en ${wait}ms (${attempt}/${retries})...`);
        await sleep(wait);
        continue;
      }
      throw e;
    }
    let data;
    try { data = JSON.parse(text); }
    catch {
      if (res.status >= 500 && attempt < retries) { await sleep(2000 * attempt); continue; }
      throw new Error(`Respuesta no-JSON de GN [${res.status}] en ${path}: ${text.substring(0, 200)}`);
    }
    if (!res.ok) {
      if (res.status >= 500 && attempt < retries) { await sleep(2000 * attempt); continue; }
      throw new Error(data.message || data.error || `Error ${res.status} en ${path}`);
    }
    return data;
  }
}

async function fetchAllPages(basePath) {
  const out = [];
  let page = 1;
  while (true) {
    const sep = basePath.includes('?') ? '&' : '?';
    const data = await gnFetch(`${basePath}${sep}page=${page}`);
    const items = data.data || [];
    out.push(...items);
    process.stdout.write(`  página ${page}: ${items.length}\n`);
    if (!data.meta?.has_more_pages || items.length === 0) break;
    page++;
    await sleep(1100);
  }
  return out;
}

function mapVentaRow(v) {
  // Columnas base, presentes en ambas marcas.
  const base = {
    id:             v.id,
    number:         v.number || null,
    date_sale:      v.date_sale || null,
    total_price:    v.total_price ?? null,
    channel:        v.channel || null,
    sale_state:     v.sale_state || null,
    payment_method: v.payment_method || null,
    store:          v.store || null,
    client_name:    v.client_name || null,
  };
  // Zattia tiene un esquema simple (solo base). BDI suma columnas de CRM.
  if (STORE === 'zattia') return base;
  return {
    ...base,
    client_id:       v.client_id || null,
    client_email:    v.client_email || null,
    client_phone:    v.client_phone || null,
    client_city:     v.client_city || null,
    client_province: v.client_province || null,
    channel_id:      v.channel_id ?? null,
    sale_type_id:    v.sale_type_id ?? null,
    total_cost:      v.total_cost ?? null,
    profit:          v.profit ?? null,
    items_sold:      v.items_sold ?? null,
  };
}

function extraerClientes(rows) {
  const map = new Map();
  for (const v of rows) {
    if (!v.client_id) continue;
    const ts = v.created_at || v.updated_at || v.date_sale || '';
    const prev = map.get(v.client_id);
    if (!prev || (ts && ts > prev._ts)) {
      map.set(v.client_id, {
        id:           v.client_id,
        name:         v.client_name || null,
        email:        v.client_email || null,
        phone:        v.client_phone || null,
        city:         v.client_city || null,
        province:     v.client_province || null,
        postal_code:  v.client_postal_code || null,
        address:      v.client_address || null,
        updated_at:   new Date().toISOString(),
        _ts: ts,
      });
    }
  }
  return [...map.values()].map(({ _ts, ...rest }) => rest);
}

function dedupById(arr) {
  const map = new Map();
  for (const x of arr) {
    if (x && x.id != null) map.set(String(x.id), x);
  }
  return [...map.values()];
}

async function guardar(rawRows) {
  const rawDedup = dedupById(rawRows);
  const ventas = dedupById(rawDedup.map(mapVentaRow));
  // Zattia no usa la tabla clientes (igual que su sync diario). Solo BDI.
  const clientes = STORE === 'zattia' ? [] : dedupById(extraerClientes(rawDedup));
  const detalles = dedupById(
    rawDedup.flatMap(v =>
      (v.detalles || []).map(d => ({
        id:           d.id,
        sale_id:      v.id,
        product_id:   d.product_id || null,
        product_name: d.product_name || null,
        size_id:      d.size_id || null,
        size:         d.size || null,
        quantity:     d.quantity ?? null,
        unit_price:   d.unit_price ?? null,
        total:        d.total ?? null,
      }))
    )
  );

  if (ventas.length) {
    for (let i = 0; i < ventas.length; i += 1000) {
      const { error } = await supabase.from('ventas').upsert(ventas.slice(i, i + 1000), { onConflict: 'id' });
      if (error) throw new Error(`Error guardando ventas: ${error.message}`);
    }
  }
  if (clientes.length) {
    for (let i = 0; i < clientes.length; i += 500) {
      const { error } = await supabase.from('clientes').upsert(clientes.slice(i, i + 500), { onConflict: 'id' });
      if (error) throw new Error(`Error guardando clientes: ${error.message}`);
    }
  }
  if (detalles.length) {
    for (let i = 0; i < detalles.length; i += 2000) {
      const { error } = await supabase.from('venta_detalles').upsert(detalles.slice(i, i + 2000), { onConflict: 'id' });
      if (error) throw new Error(`Error guardando detalles: ${error.message}`);
    }
  }
  console.log(`  ✓ ventas: ${ventas.length}, clientes: ${clientes.length}, detalles: ${detalles.length}`);
}

(async () => {
  console.log(`=== Sync ventas recientes — ${STORE.toUpperCase()} ===`);
  console.log(`Rango: ${DESDE} → ${HASTA}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  const basePath = `ventas/obtener?from=${DESDE}&to=${HASTA}&include_details=1&per_page=50`;
  const rows = await fetchAllPages(basePath);
  console.log(`[ventas] ${rows.length} registros bajados. Guardando...`);
  if (rows.length) await guardar(rows);
  console.log('\n[listo] ventas recientes — ' + STORE);
})().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
