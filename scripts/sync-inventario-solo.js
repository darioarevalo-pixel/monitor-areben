// Sync RÁPIDO: inventario (stock + sku + barcode) + productos (precio, costo, categoría, etc.),
// para BDI o Zattia. Se elige con INPUT_STORE=bdi|zattia. NO toca ventas → es veloz.
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
    page++; await sleep(400);
  }
  return out;
}

// Zattia: el código de barras = el SKU sin guiones ni espacios (convención de la marca).
const _bcDeSku = (sku) => String(sku || '').replace(/[-\s]/g, '').toUpperCase();

// Desactiva en el espejo los productos que GN ya no devuelve (borrados/inactivos), salvo los muy nuevos.
async function desactivarBorrados(gnIds) {
  const { data: activos, error } = await supabase.from('productos').select('id, created_at').eq('active', true);
  if (error || !activos) { if (error) console.warn('[limpieza] no se pudo leer activos:', error.message); return; }
  const CORTE = Date.now() - 2 * 24 * 60 * 60 * 1000; // no tocar los creados hace < 2 días (pueden estar indexándose en GN)
  const aDesactivar = activos.filter(p => !gnIds.has(p.id) && (!p.created_at || new Date(p.created_at).getTime() < CORTE)).map(p => p.id);
  if (!aDesactivar.length) { console.log('[limpieza] sin productos borrados para desactivar.'); return; }
  const BATCH = 200;
  for (let i = 0; i < aDesactivar.length; i += BATCH) {
    const { error: e2 } = await supabase.from('productos').update({ active: false }).in('id', aDesactivar.slice(i, i + BATCH));
    if (e2) { console.warn('[limpieza] error:', e2.message); break; }
  }
  console.log(`[limpieza] ${aDesactivar.length} producto(s) borrados en GN → marcados inactivos.`);
}

async function syncProductos() {
  console.log('\n[productos] descargando...');
  const rows = await fetchAllPages('productos/obtener?include_variants=1&per_page=200');
  const gnIds = new Set(rows.map(p => p.id));
  const inactiveIds = new Set(); // SOLO los explícitamente inactivos (no saltear nuevos/desconocidos)
  const prodSku = {};            // pid -> sku (para completar el inventario cuando GN no lo manda)
  const varBarcode = {};         // `${pid}|${size_id}` -> barcode REAL por variante (GN lo expone en las variantes aunque el feed de inventario todavía no)
  const productos = rows.map(p => {
    if (p.active === 0 || p.active === false) inactiveIds.add(p.id);
    if (p.sku || p.code) prodSku[p.id] = p.sku || p.code;
    (p.variantes || p.variants || []).forEach(v => { if (v.barcode) varBarcode[`${p.id}|${v.size_id}`] = v.barcode; });
    const base = {
      id: p.id,
      name: p.name,
      sku: p.sku || p.code || null,
      category: p.category || null,
      retailer_price: p.retailer_price ?? null,
      wholesaler_price: p.wholesaler_price ?? null,
      unit_cost: p.unit_cost ?? null,
      active: p.active ?? null,
      created_at: p.created_at || null,
      updated_at: p.updated_at || null,
    };
    if (STORE === 'zattia') base.proveedor = p.provider || null;
    return base;
  });
  console.log(`[productos] ${productos.length} registros (${inactiveIds.size} inactivos). Guardando...`);
  const BATCH = 500;
  for (let i = 0; i < productos.length; i += BATCH) {
    const lote = productos.slice(i, i + BATCH);
    let { error } = await supabase.from('productos').upsert(lote, { onConflict: 'id' });
    if (error && /proveedor|provider|column/i.test(error.message)) {
      const reducido = lote.map(({ proveedor, ...rest }) => rest);
      ({ error } = await supabase.from('productos').upsert(reducido, { onConflict: 'id' }));
    }
    if (error) throw new Error('productos: ' + error.message);
    process.stdout.write(`  upsert ${i + lote.length}/${productos.length}\r`);
  }
  console.log(`\n[productos] OK — ${STORE}`);
  // prodSku robusto: sumar TODO el sku que ya está en el espejo (evita el parpadeo del fetch de GN con productos nuevos)
  try { const { data } = await supabase.from('productos').select('id, sku'); (data || []).forEach(p => { if (p.sku && !prodSku[p.id]) prodSku[p.id] = p.sku; }); } catch (e) {}
  await desactivarBorrados(gnIds);
  return { inactiveIds, prodSku, varBarcode };
}

// Deriva el código de barras del SKU para las filas de inventario de Zattia que quedaron SIN código
// (productos nuevos que GN todavía no devuelve en su feed de inventario). Opera directo sobre el espejo.
async function derivarCodigosZattia() {
  if (STORE !== 'zattia') return;
  const { data: inv, error: e0 } = await supabase.from('inventario').select('product_id').is('barcode', null);
  if (e0 || !inv || !inv.length) { console.log('[códigos] nada para derivar.'); return; }
  const pids = [...new Set(inv.map(r => r.product_id))];
  const { data: prods } = await supabase.from('productos').select('id, sku').in('id', pids);
  const skuById = {}; (prods || []).forEach(p => { if (p.sku) skuById[p.id] = p.sku; });
  let n = 0;
  for (const pid of pids) {
    const sku = skuById[pid]; if (!sku) continue;
    const bc = _bcDeSku(sku); if (!bc) continue;
    const { error } = await supabase.from('inventario').update({ barcode: bc, sku }).eq('product_id', pid).is('barcode', null);
    if (!error) n++;
  }
  console.log(`[códigos] ${n} producto(s) con código derivado del SKU (Zattia).`);
}

(async () => {
  console.log(`=== Sync RÁPIDO (productos + inventario) — ${STORE.toUpperCase()} ===`);
  console.log('Supabase:', CFG.url, '| GN token:', CFG.token.slice(0, 6) + '...');
  // Productos primero: deja los mapas (activos, barcode por variante, sku por producto).
  const { inactiveIds, prodSku, varBarcode } = await syncProductos();
  const _DBG = new Set([1026315, 1026314]); // TEMP diagnóstico TOP THUMB / TOP YOKO
  console.log('[DBG] varBarcode de objetivos:', Object.keys(varBarcode).filter(k => _DBG.has(+k.split('|')[0])).map(k => `${k}=${varBarcode[k]}`).join(' , ') || '(ninguna)');
  const rows = await fetchAllPages('inventario/obtener?per_page=200');
  const seen = new Map();
  let saltInactivos = 0, skuCompletados = 0, bcCompletados = 0;
  for (const r of rows) {
    if (inactiveIds.has(r.product_id)) { saltInactivos++; continue; } // saltear SOLO inactivos explícitos
    const key = `${r.product_id}|${r.size_id}|${r.store_name || r.store || ''}`;
    const sku = r.sku || prodSku[r.product_id] || null;   // completa el sku desde productos cuando GN no lo manda
    if (!r.sku && sku) skuCompletados++;
    const barcode = r.barcode || varBarcode[`${r.product_id}|${r.size_id}`] || (STORE === 'zattia' && sku ? _bcDeSku(sku) : null); // código real de la variante; si no, derivar del SKU (Zattia)
    if (!r.barcode && barcode) bcCompletados++;
    if (_DBG.has(r.product_id)) console.log(`[DBG] inv pid=${r.product_id} size_id=${r.size_id} size_name=${r.size_name} r.barcode=${r.barcode} sku=${sku} varBc=${varBarcode[`${r.product_id}|${r.size_id}`]} => barcode=${barcode}`);
    seen.set(key, {
      product_id: r.product_id,
      product_name: r.product_name || null,
      size_id: r.size_id,
      size_name: r.size_name || null,
      store_name: r.store_name || r.store || '',
      available_quantity: r.available_quantity ?? r.quantity ?? 0,
      sku,
      barcode,
      observation: r.observation ?? null,
    });
  }
  console.log(`[inventario] ${skuCompletados} sku + ${bcCompletados} códigos completados desde el SKU.`);
  const inv = Array.from(seen.values());
  console.log(`[inventario] ${inv.length} registros de activos (${saltInactivos} filas de inactivos salteadas). Guardando...`);
  if (!inv.length) { console.log('Nada que guardar.'); console.log(`\n[listo] — ${STORE}`); return; }
  const BATCH = 500;
  for (let i = 0; i < inv.length; i += BATCH) {
    const lote = inv.slice(i, i + BATCH);
    let { error } = await supabase.from('inventario').upsert(lote, { onConflict: 'product_id,size_id,store_name' });
    if (error && /sku|barcode|observation|column/i.test(error.message)) {
      const reducido = lote.map(({ sku, barcode, observation, ...rest }) => rest);
      ({ error } = await supabase.from('inventario').upsert(reducido, { onConflict: 'product_id,size_id,store_name' }));
    }
    if (error) throw new Error(error.message);
    process.stdout.write(`  upsert ${i + lote.length}/${inv.length}\r`);
  }
  console.log(`\n[inventario] OK — ${STORE}`);
  await derivarCodigosZattia();
  console.log(`\n[listo] productos + inventario — ${STORE}`);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
