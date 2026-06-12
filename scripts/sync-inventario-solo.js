// Sync RÁPIDO: solo inventario (stock + sku + barcode), para BDI o Zattia.
// Se elige con INPUT_STORE=bdi|zattia (o argumento). No toca ventas ni productos → es veloz.
import { createClient } from '@supabase/supabase-js';

const STORE = (process.env.INPUT_STORE || process.argv[2] || 'bdi').toLowerCase();
const GN_BASE = 'https://www.gestionnube.com/api/v1';

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

if (!CFG.url || !CFG.key || !CFG.token) {
  console.error(`Faltan credenciales para ${STORE} (Supabase URL/KEY o GN token).`);
  process.exit(1);
}

const supabase = createClient(CFG.url, CFG.key);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gnFetch(path, retries = 4) {
  for (let a = 1; a <= retries; a++) {
    const res = await fetch(`${GN_BASE}/${path}`, { headers: { Authorization: `Bearer ${CFG.token}`, Accept: 'application/json' } });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { if (a < retries) { await sleep(3000 * a); continue; } throw new Error('Respuesta no-JSON ' + res.status + ': ' + text.slice(0, 160)); }
    if (!res.ok) { if (res.status >= 500 && a < retries) { await sleep(3000 * a); continue; } throw new Error(data.message || data.error || ('Error ' + res.status)); }
    return data;
  }
}

async function fetchAllPages(base) {
  const out = []; let page = 1;
  while (true) {
    const sep = base.includes('?') ? '&' : '?';
    const d = await gnFetch(`${base}${sep}page=${page}`);
    const items = d.data || [];
    out.push(...items);
    process.stdout.write(`  pág ${page}: ${items.length}\n`);
    if (!d.meta?.has_more_pages || items.length === 0) break;
    page++; await sleep(1100);
  }
  return out;
}

(async () => {
  console.log(`=== Sync RÁPIDO de inventario — ${STORE.toUpperCase()} ===`);
  console.log('Supabase:', CFG.url, '| GN token:', CFG.token.slice(0, 6) + '...');
  const rows = await fetchAllPages('inventario/obtener?per_page=50');
  const seen = new Map();
  for (const r of rows) {
    const key = `${r.product_id}|${r.size_id}|${r.store_name || r.store || ''}`;
    seen.set(key, {
      product_id: r.product_id,
      product_name: r.product_name || null,
      size_id: r.size_id,
      size_name: r.size_name || null,
      store_name: r.store_name || r.store || '',
      available_quantity: r.available_quantity ?? r.quantity ?? 0,
      sku: r.sku || null,
      barcode: r.barcode || null,
    });
  }
  const inv = Array.from(seen.values());
  console.log(`[inventario] ${inv.length} registros únicos. Guardando...`);
  if (!inv.length) { console.log('Nada que guardar.'); return; }
  const BATCH = 500;
  for (let i = 0; i < inv.length; i += BATCH) {
    const lote = inv.slice(i, i + BATCH);
    let { error } = await supabase.from('inventario').upsert(lote, { onConflict: 'product_id,size_id,store_name' });
    if (error && /sku|barcode|column/i.test(error.message)) {
      const reducido = lote.map(({ sku, barcode, ...rest }) => rest);
      ({ error } = await supabase.from('inventario').upsert(reducido, { onConflict: 'product_id,size_id,store_name' }));
    }
    if (error) throw new Error(error.message);
    process.stdout.write(`  upsert ${i + lote.length}/${inv.length}\r`);
  }
  console.log(`\n[inventario] OK — ${STORE}`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
