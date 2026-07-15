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

async function fetchAllPages(basePath, token) {
  const out = []; let page = 1;
  while (true) {
    const sep = basePath.includes('?') ? '&' : '?';
    const d = await gnFetch(`${basePath}${sep}page=${page}`, token);
    const items = d.data || [];
    out.push(...items);
    if (!d.meta?.has_more_pages || items.length === 0) break;
    page++; await sleep(120);
  }
  return out;
}

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
    // GN filtra por store_id → baja SOLO el depósito de la marca (mucho menos páginas). Igual filtramos por las dudas.
    const rows = await fetchAllPages(`inventario/obtener?per_page=200&store_id=${storeId}`, token);
    const dep = rows
      .filter(r => Number(r.store_id) === storeId)
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
      }));
    const store_name = dep.length ? dep[0].store_name : null;
    return res.status(200).json({ ok: true, store, loc, store_id: storeId, store_name, count: dep.length, rows: dep });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
