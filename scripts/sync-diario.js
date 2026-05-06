import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
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
  } catch { /* usa variables del sistema */ }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GN_TOKEN    = process.env.GN_TOKEN;
const GN_BASE     = 'https://www.gestionnube.com/api/v1';
const LAST_SYNC_FILE = resolve(process.cwd(), '.last-sync');

if (!SUPABASE_URL || !SUPABASE_KEY || !GN_TOKEN) {
  console.error('Faltan variables de entorno: SUPABASE_URL, SUPABASE_KEY, GN_TOKEN');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

function readLastSync() {
  try {
    const raw = JSON.parse(readFileSync(LAST_SYNC_FILE, 'utf8'));
    return {
      ventasDate:    raw.ventasDate    || null,
      productosDate: raw.productosDate || null,
    };
  } catch {
    return { ventasDate: null, productosDate: null };
  }
}

function writeLastSync(data) {
  writeFileSync(LAST_SYNC_FILE, JSON.stringify(data, null, 2));
}

function daysBetween(isoA, isoB) {
  return Math.abs(new Date(isoA) - new Date(isoB)) / 86400000;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Reintentos: errores de red (fetch failed, ECONNRESET, timeouts) y HTTP 5xx
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
      if (res.status >= 500 && attempt < retries) {
        console.warn(`  ⚠️  ${res.status} en ${path}, reintentando (${attempt}/${retries})...`);
        await sleep(2000 * attempt);
        continue;
      }
      throw new Error(`Respuesta no-JSON de GN [${res.status}] en ${path}: ${text.substring(0, 200)}`);
    }
    if (!res.ok) {
      if (res.status >= 500 && attempt < retries) {
        console.warn(`  ⚠️  ${res.status} en ${path}, reintentando (${attempt}/${retries})...`);
        await sleep(2000 * attempt);
        continue;
      }
      throw new Error(data.message || data.error || `Error ${res.status} en ${path}`);
    }
    return data;
  }
}

async function fetchAllPages(basePath) {
  const results = [];
  let page = 1;
  while (true) {
    const sep = basePath.includes('?') ? '&' : '?';
    process.stdout.write(`  página ${page}...`);
    const data = await gnFetch(`${basePath}${sep}page=${page}`);
    const items = data.data || [];
    results.push(...items);
    process.stdout.write(` ${items.length} registros\n`);
    if (!data.meta?.has_more_pages || items.length === 0) break;
    page++;
    await sleep(1100);
  }
  return results;
}

// Igual que fetchAllPages, pero invoca onBatch(rows, page) cada FLUSH_EVERY páginas.
// Si el job se cae a mitad, lo que ya bajó queda persistido (re-correr es idempotente).
const FLUSH_EVERY = 50;
async function fetchAllPagesStreaming(basePath, onBatch) {
  let buffer = [];
  let page = 1;
  while (true) {
    const sep = basePath.includes('?') ? '&' : '?';
    process.stdout.write(`  página ${page}...`);
    const data = await gnFetch(`${basePath}${sep}page=${page}`);
    const items = data.data || [];
    buffer.push(...items);
    process.stdout.write(` ${items.length} registros\n`);
    const noMore = !data.meta?.has_more_pages || items.length === 0;
    if (buffer.length && (page % FLUSH_EVERY === 0 || noMore)) {
      console.log(`  → flush parcial (página ${page}, ${buffer.length} registros)...`);
      await onBatch(buffer, page);
      buffer = [];
    }
    if (noMore) break;
    page++;
    await sleep(1100);
  }
}

// ── Sync functions ────────────────────────────────────────────────────────────

async function syncProductos() {
  console.log('\n[productos] Descargando (sync semanal)...');
  const rows = await fetchAllPages('productos/obtener?per_page=50');
  const productos = rows.map(p => ({
    id:               p.id,
    name:             p.name,
    sku:              p.sku || null,
    category:         p.category || null,
    retailer_price:   p.retailer_price ?? null,
    wholesaler_price: p.wholesaler_price ?? null,
    unit_cost:        p.unit_cost ?? null,
    active:           p.active ?? null,
    created_at:       p.created_at || null,
    updated_at:       p.updated_at || null,
  }));
  console.log(`[productos] ${productos.length} registros. Guardando en Supabase...`);
  if (!productos.length) return 0;
  const { error } = await supabase.from('productos').upsert(productos, { onConflict: 'id' });
  if (error) throw new Error(`Error guardando productos: ${error.message}`);
  console.log(`[productos] OK`);
  return productos.length;
}

async function syncInventario() {
  console.log('\n[inventario] Descargando (siempre completo)...');
  const rows = await fetchAllPages('inventario/obtener?per_page=50');
  const seen = new Map();
  for (const r of rows) {
    const key = `${r.product_id}|${r.size_id}|${r.store_name || r.store || ''}`;
    seen.set(key, {
      product_id:         r.product_id,
      product_name:       r.product_name || null,
      size_id:            r.size_id,
      size_name:          r.size_name || null,
      store_name:         r.store_name || r.store || '',
      available_quantity: r.available_quantity ?? r.quantity ?? 0,
    });
  }
  const inventario = Array.from(seen.values());
  console.log(`[inventario] ${inventario.length} registros (${rows.length - inventario.length} duplicados ignorados). Guardando en Supabase...`);
  if (!inventario.length) return 0;
  const { error } = await supabase.from('inventario').upsert(inventario, { onConflict: 'product_id,size_id,store_name' });
  if (error) throw new Error(`Error guardando inventario: ${error.message}`);
  console.log(`[inventario] OK`);
  return inventario.length;
}

function mapVentaRow(v) {
  return {
    id:             v.id,
    number:         v.number || null,
    date_sale:      v.date_sale || null,
    total_price:    v.total_price ?? null,
    channel:        v.channel || null,
    sale_state:     v.sale_state || null,
    payment_method: v.payment_method || null,
    store:          v.store || null,
    client_name:    v.client_name || null,
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

function extraerClientesDeVentas(rows) {
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

async function flushVentasBatch(rawRows) {
  const ventas = rawRows.map(mapVentaRow);
  const clientes = extraerClientesDeVentas(rawRows);
  const detalles = rawRows.flatMap(v =>
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
  );

  if (ventas.length) {
    for (let i = 0; i < ventas.length; i += 1000) {
      const lote = ventas.slice(i, i + 1000);
      const { error } = await supabase.from('ventas').upsert(lote, { onConflict: 'id' });
      if (error) throw new Error(`Error guardando ventas: ${error.message}`);
    }
  }
  if (clientes.length) {
    for (let i = 0; i < clientes.length; i += 500) {
      const lote = clientes.slice(i, i + 500);
      const { error } = await supabase.from('clientes').upsert(lote, { onConflict: 'id' });
      if (error) throw new Error(`Error guardando clientes: ${error.message}`);
    }
  }
  if (detalles.length) {
    for (let i = 0; i < detalles.length; i += 2000) {
      const lote = detalles.slice(i, i + 2000);
      const { error } = await supabase.from('venta_detalles').upsert(lote, { onConflict: 'id' });
      if (error) throw new Error(`Error guardando detalles: ${error.message}`);
    }
  }

  console.log(`    ✓ ventas: ${ventas.length}, clientes: ${clientes.length}, detalles: ${detalles.length}`);
  return { ventas: ventas.length, detalles: detalles.length, clientes: clientes.length };
}

async function syncVentas(fromDate) {
  const today = new Date().toISOString().substring(0, 10);
  const basePath = `ventas/obtener?from=${fromDate}&to=${today}&include_details=1&per_page=50`;
  console.log(`\n[ventas] Descargando desde ${fromDate} hasta ${today}...`);

  const totales = { ventas: 0, detalles: 0, clientes: 0 };
  await fetchAllPagesStreaming(basePath, async (rows) => {
    const r = await flushVentasBatch(rows);
    totales.ventas   += r.ventas;
    totales.detalles += r.detalles;
    totales.clientes += r.clientes;
  });

  console.log(`[ventas] OK — total acumulado: ${totales.ventas} ventas, ${totales.detalles} detalles, ${totales.clientes} clientes`);
  return totales;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date().toISOString();
  const today = now.substring(0, 10);

  const lastSync = readLastSync();
  console.log('=== Sincronización diaria — Gestión Nube ===');
  console.log(`Fecha actual:        ${today}`);
  console.log(`Último sync ventas:  ${lastSync.ventasDate || 'nunca'}`);
  console.log(`Último sync prods:   ${lastSync.productosDate || 'nunca'}`);

  // Ventas: desde el último sync (o 2025-01-01 si nunca se corrió)
  const ventasFrom = lastSync.ventasDate || '2025-01-01';

  // Productos: solo si pasaron más de 7 días desde el último sync de productos
  const productosPendiente = !lastSync.productosDate ||
    daysBetween(lastSync.productosDate, today) >= 7;

  if (productosPendiente) {
    console.log('\nSync semanal de productos activado.');
  }

  try {
    const inventario = await syncInventario();
    const ventas     = await syncVentas(ventasFrom);
    let productos    = 'omitido';

    if (productosPendiente) {
      productos = await syncProductos();
    }

    const newSync = {
      ventasDate:    today,
      productosDate: productosPendiente ? today : lastSync.productosDate,
    };
    writeLastSync(newSync);

    // Refrescar vistas materializadas
    process.stdout.write('\n[vistas] Refrescando vistas materializadas...');
    const { error: viewsError } = await supabase.rpc('refresh_all_views');
    if (viewsError) console.log(` WARN: ${viewsError.message}`);
    else console.log(' OK');

    console.log('\n=== Resultado ===');
    console.log(`Inventario:     ${inventario}`);
    console.log(`Ventas:         ${ventas.ventas}`);
    console.log(`Venta detalles: ${ventas.detalles}`);
    console.log(`Productos:      ${productos}`);
    console.log(`\nSync guardado en .last-sync`);
    console.log('Sincronización diaria completada.');
  } catch (e) {
    console.error('\nERROR:', e.message);
    process.exit(1);
  }
}

main();
