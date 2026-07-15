// Lee el inventario EN VIVO del depósito desde Gestión Nube (sin pasar por el espejo de Supabase).
// Lo usa la sección "Depósito → Conteo" del Monitor: como base al contar y como stock del momento al aplicar.
// GET /api/inventario-vivo?store=bdi|zattia
// Devuelve SOLO el depósito de esa marca (por store_id, no por nombre) para que sirva igual en ambas cuentas.
const GN_BASE = 'https://www.gestionnube.com/api/v1';

// store_id del DEPÓSITO por marca (coincide con crear-venta.js → SF_CFG.store.deposito).
// BDI: 13307 = "Deposito Minorista". ZATTIA: 18210. (El "Deposito Mayorista" 19320 de BDI está eliminado/vacío → no aplica acá.)
const DEPOSITO_STORE_ID = { bdi: 13307, zattia: 18210 };
// store_id del LOCAL por marca (según SF_CFG.store.local de crear-venta.js). Para el "Conteo estándar" del Local.
const LOCAL_STORE_ID = { bdi: 18393, zattia: 11780 };
const TOKENS = { bdi: process.env.GN_TOKEN, zattia: process.env.GN_TOKEN_ZATTIA };
// Nombre de la ubicación en el ESPEJO (Supabase) por marca+ubicación (fallback si el vivo no responde).
const MIRROR_STORE_NAME = { bdi: { deposito: 'Deposito Minorista', local: 'Local' }, zattia: { deposito: 'Deposito ', local: 'Local' } };
function _sbCfg(store) {
  if (store === 'zattia') return { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY };
  return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY };
}
// Lee del espejo TODAS las variantes de una ubicación (paginado y ordenado → estable, completo).
async function fetchEspejo(store, storeName) {
  const { url, key } = _sbCfg(store);
  if (!url || !key || !storeName) return [];
  const out = []; let offset = 0; const PAGE = 1000;
  while (true) {
    const q = `${url.replace(/\/$/, '')}/rest/v1/inventario?select=product_id,product_name,size_id,size_name,sku,barcode,available_quantity,store_name&store_name=eq.${encodeURIComponent(storeName)}&order=product_id.asc,size_id.asc&limit=${PAGE}&offset=${offset}`;
    let d;
    try { const r = await fetch(q, { headers: { apikey: key, Authorization: 'Bearer ' + key } }); if (!r.ok) break; d = await r.json(); } catch (e) { break; }
    if (!Array.isArray(d) || !d.length) break;
    out.push(...d);
    if (d.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gnFetch(path, token, tries = 4) {
  let last;
  for (let a = 1; a <= tries; a++) {
    try {
      const res = await fetch(`${GN_BASE}/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { if (a < tries) { await sleep(800 * a); continue; } throw new Error('Respuesta no-JSON ' + res.status + ': ' + text.slice(0, 160)); }
      if (!res.ok) { if (res.status >= 500 || res.status === 429) { if (a < tries) { await sleep(800 * a); continue; } } throw new Error(data.message || data.error || ('Error ' + res.status)); }
      return data;
    } catch (e) { last = e; if (a < tries) { await sleep(800 * a); continue; } throw e; }
  }
  throw last;
}

// La paginación de GN NO es estable: entre página y página el orden se corre, así que una sola
// pasada duplica algunas variantes y SALTEA otras (distinto en cada llamada). Para que nunca falte
// una variante, hacemos varias pasadas completas y UNIMOS por (product_id+size_id), quedándonos con
// la línea real de cada variante (stock>0; en empate, el inventory_id más bajo). Cortamos cuando una
// pasada no agrega nada nuevo (convergió).
function _pickReal(a, b) {
  const as = Number(a.available_quantity) > 0, bs = Number(b.available_quantity) > 0;
  if (as !== bs) return as ? a : b;
  return Number(a.inventory_id) <= Number(b.inventory_id) ? a : b;
}
async function fetchInventarioCompleto(storeId, token) {
  const base = `inventario/obtener?per_page=200&store_id=${storeId}`; // 200 es lo que GN soporta bien
  const byKey = new Map();
  const MAX_PASSES = 2;      // el espejo garantiza la lista completa; el vivo aporta stock fresco + inventory_id
  const start = Date.now();
  const BUDGET_MS = 10000;   // tope de la lectura completa; deja margen para el relleno puntual y no timeoutear
  const vencido = () => (Date.now() - start) > BUDGET_MS;
  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const before = byKey.size;
    let page = 1, more = true;
    while (more && page <= 25) {
      if (vencido()) { more = false; break; }
      try {
        const d = await gnFetch(`${base}&page=${page}`, token);
        const items = (d.data || []).filter(r => Number(r.store_id) === storeId);
        for (const r of items) { const k = r.product_id + '_' + r.size_id; const ex = byKey.get(k); byKey.set(k, ex ? _pickReal(ex, r) : r); }
        more = !!(d.meta && d.meta.has_more_pages) && (d.data || []).length > 0;
      } catch (e) { /* una página falló: la salteo y sigo (otra pasada la recupera) */ }
      page++; await sleep(40);
    }
    if (byKey.size === 0) throw new Error('No se pudo leer el inventario de GN. Reintentá en unos segundos.');
    if (vencido()) break;                             // se acabó el presupuesto: devuelvo lo juntado
    if (pass >= 2 && byKey.size === before) break;    // una pasada entera no sumó nada nuevo → completo
  }
  return [...byKey.values()];
}

// Consulta puntual y CONFIABLE del stock en vivo de UN producto (GN responde bien a esto, a diferencia de
// pedir la lista completa). Devuelve las variantes de la tienda pedida con inventory_id y stock reales.
async function fetchProductoVivo(productId, storeId, token) {
  const d = await gnFetch(`inventario/${productId}`, token);
  const out = [];
  (d.variantes || []).forEach(v => {
    (v.stock_por_tienda || []).forEach(s => {
      if (Number(s.store_id) !== storeId) return;
      out.push({ inventory_id: s.inventory_id, product_id: d.product_id, product_name: d.product_name || null, product_code: d.product_code || null, size_id: v.size_id, size_name: v.size_name || null, store_name: s.store_name || null, sku: v.sku || null, barcode: v.barcode || null, available_quantity: s.available_quantity ?? 0, fuente: 'vivo' });
    });
  });
  return out;
}

// Varias pasadas de paginación pueden tardar → subimos el techo de tiempo de la función.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'método no permitido' });

  const store = String(req.query.store || '').toLowerCase();
  const loc = String(req.query.loc || 'deposito').toLowerCase(); // 'deposito' (default) | 'local'
  const storeId = loc === 'local' ? LOCAL_STORE_ID[store] : DEPOSITO_STORE_ID[store];
  const token = TOKENS[store];
  if (!storeId) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });
  if (!token) return res.status(500).json({ error: `Falta el token de GN para ${store} en el entorno.` });

  try {
    // Varias pasadas + unión por variante → nunca falta una (la paginación de GN es inestable). Ya viene deduplicado.
    const rows = await fetchInventarioCompleto(storeId, token);
    const dep = rows
      .map(r => ({
        inventory_id: r.inventory_id,   // == id_inventario del Excel de ajuste de GN
        product_id: r.product_id,
        product_name: r.product_name || null,
        product_code: r.product_code || null,
        size_id: r.size_id,
        size_name: r.size_name || null,
        store_name: r.store_name || null,  // nombre de la ubicación (para la columna 'ubicacion' del Excel de GN)
        sku: r.sku || null,                // para separar líneas (STUNNED = sku empieza con STU)
        barcode: r.barcode || null,
        available_quantity: r.available_quantity ?? 0,
        fuente: 'vivo',
      }));
    // Nombre de la ubicación para la respuesta/Excel (naming de GN): lo da el vivo.
    const storeName = (dep.length ? dep[0].store_name : null) || (MIRROR_STORE_NAME[store] && MIRROR_STORE_NAME[store][loc]) || null;
    // Nombre EXACTO con el que el espejo guarda esta ubicación (ej: ZATTIA usa "Deposito " con espacio).
    const espejoName = (MIRROR_STORE_NAME[store] && MIRROR_STORE_NAME[store][loc]) || storeName;
    const byKey = new Map(dep.map(r => [r.product_id + '_' + r.size_id, r]));
    // El ESPEJO da la lista COMPLETA esperada → sirve para saber QUÉ variantes faltaron del vivo.
    let espRows = [];
    try { espRows = await fetchEspejo(store, espejoName); } catch (e) { /* si el espejo falla, sigo con el vivo */ }
    const espByKey = new Map(espRows.map(m => [m.product_id + '_' + m.size_id, m]));
    const faltanPids = [...new Set([...espByKey.keys()].filter(k => !byKey.has(k)).map(k => espByKey.get(k).product_id))];
    // RELLENO EN VIVO: por cada producto con faltantes, consulta PUNTUAL a GN (confiable) para traer su stock
    // real e inventory_id. Acotado por tiempo/cantidad para no pasar el techo de la función.
    let fromDirecto = 0;
    const fillStart = Date.now();
    for (const pid of faltanPids) {
      if (Date.now() - fillStart > 9000 || fromDirecto > 400) break;
      try {
        const vrows = await fetchProductoVivo(pid, storeId, token);
        vrows.forEach(r => { const k = r.product_id + '_' + r.size_id; if (!byKey.has(k)) { byKey.set(k, r); fromDirecto++; } });
      } catch (e) { /* si un producto falla, sigue; queda para el espejo */ }
      await sleep(40);
    }
    // ÚLTIMO RECURSO: lo que ni el vivo ni la consulta puntual trajeron se completa con el espejo (sin inventory_id
    // → el candado de "Aplicar" NO lo ajusta; queda para revisar a mano). Así la lista se ve completa igual.
    let fromEspejo = 0;
    espByKey.forEach((m, k) => {
      if (!byKey.has(k)) {
        byKey.set(k, { inventory_id: null, product_id: m.product_id, product_name: m.product_name || null, product_code: null, size_id: m.size_id, size_name: m.size_name || null, store_name: m.store_name || storeName, sku: m.sku || null, barcode: m.barcode || null, available_quantity: m.available_quantity ?? 0, fuente: 'espejo' });
        fromEspejo++;
      }
    });
    const merged = [...byKey.values()];
    return res.status(200).json({ ok: true, store, loc, store_id: storeId, store_name: storeName, count: merged.length, from_vivo: dep.length, from_directo: fromDirecto, from_espejo: fromEspejo, rows: merged });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
