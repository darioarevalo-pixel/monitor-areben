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
  } catch { /* usa variables del sistema */ }
}

loadEnv();

const SUPABASE_URL = process.env.ZATTIA_SUPABASE_URL;
const SUPABASE_KEY = process.env.ZATTIA_SUPABASE_KEY;
const GN_TOKEN     = process.env.GN_TOKEN_ZATTIA;
const GN_BASE      = 'https://www.gestionnube.com/api/v1';

if (!SUPABASE_URL || !SUPABASE_KEY || !GN_TOKEN) {
  console.error('Faltan variables de entorno: ZATTIA_SUPABASE_URL, ZATTIA_SUPABASE_KEY, GN_TOKEN_ZATTIA');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gnFetch(path, retries = 4) {
  const url = `${GN_BASE}/${path}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${GN_TOKEN}`, 'Accept': 'application/json' }
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {
      if (attempt < retries) {
        process.stdout.write(` [retry ${attempt}/${retries - 1}]`);
        await sleep(3000 * attempt);
        continue;
      }
      throw new Error(`Respuesta no-JSON [${res.status}] en ${path}: ${text.substring(0, 200)}`);
    }
    if (!res.ok) {
      if (res.status >= 500 && attempt < retries) {
        process.stdout.write(` [retry ${attempt}/${retries - 1} status ${res.status}]`);
        await sleep(3000 * attempt);
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

async function main() {
  console.log('=== Sync productos — Zattia ===');
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`GN token: ${GN_TOKEN.substring(0, 6)}...`);

  console.log('\n[productos] Descargando...');
  const rows = await fetchAllPages('productos/obtener?per_page=50');

  const productos = rows.map(p => ({
    id:               p.id,
    name:             p.name,
    sku:              p.sku || p.code || null,
    category:         p.category || null,
    retailer_price:   p.retailer_price ?? null,
    wholesaler_price: p.wholesaler_price ?? null,
    unit_cost:        p.unit_cost ?? null,
    active:           p.active ?? null,
    created_at:       p.created_at || null,
    updated_at:       p.updated_at || null,
  }));

  console.log(`[productos] ${productos.length} registros. Guardando en Supabase...`);

  if (!productos.length) {
    console.log('Nada que guardar.');
    process.exit(0);
  }

  const BATCH = 500;
  for (let i = 0; i < productos.length; i += BATCH) {
    const lote = productos.slice(i, i + BATCH);
    process.stdout.write(`  upsert ${i + lote.length}/${productos.length}...\r`);
    const { error } = await supabase.from('productos').upsert(lote, { onConflict: 'id' });
    if (error) throw new Error(`Error guardando lote (offset ${i}): ${error.message}`);
  }
  process.stdout.write('\n');

  console.log(`[productos] OK — ${productos.length} registros sincronizados.`);
}

main().catch(e => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
