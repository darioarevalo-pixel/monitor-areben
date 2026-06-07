// Sync temporal: SOLO inventario de BDI (para llenar sku y barcode rápido, sin traer ventas).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const GN_TOKEN     = process.env.GN_TOKEN;
const GN_BASE      = 'https://www.gestionnube.com/api/v1';

if (!SUPABASE_URL || !SUPABASE_KEY || !GN_TOKEN) {
  console.error('Faltan variables: SUPABASE_URL, SUPABASE_KEY/SUPABASE_SERVICE_KEY, GN_TOKEN');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gnFetch(path, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    let res, text;
    try {
      res = await fetch(`${GN_BASE}/${path}`, { headers: { Authorization: `Bearer ${GN_TOKEN}`, Accept: 'application/json' } });
      text = await res.text();
    } catch (e) {
      if (attempt < retries) { await sleep(2000 * attempt); continue; }
      throw e;
    }
    let data;
    try { data = JSON.parse(text); }
    catch {
      if (res.status >= 500 && attempt < retries) { await sleep(2000 * attempt); continue; }
      throw new Error(`Respuesta no-JSON [${res.status}] en ${path}: ${text.substring(0, 200)}`);
    }
    if (!res.ok) {
      if (res.status >= 500 && attempt < retries) { await sleep(2000 * attempt); continue; }
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

(async () => {
  console.log('[inventario BDI] Descargando...');
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
      sku:                r.sku || null,
      barcode:            r.barcode || null,
    });
  }
  const inventario = Array.from(seen.values());
  console.log(`[inventario BDI] ${inventario.length} registros. Guardando...`);
  const BATCH = 500;
  for (let i = 0; i < inventario.length; i += BATCH) {
    const lote = inventario.slice(i, i + BATCH);
    const { error } = await supabase.from('inventario').upsert(lote, { onConflict: 'product_id,size_id,store_name' });
    if (error) throw new Error(`Error guardando inventario: ${error.message}`);
    process.stdout.write(`  upsert ${i + lote.length}/${inventario.length}\r`);
  }
  const conSku = inventario.filter(x => x.sku).length;
  const conBc  = inventario.filter(x => x.barcode).length;
  console.log(`\n[inventario BDI] OK · con SKU: ${conSku} (${Math.round(conSku / inventario.length * 100)}%) · con barcode: ${conBc} (${Math.round(conBc / inventario.length * 100)}%)`);
})();
