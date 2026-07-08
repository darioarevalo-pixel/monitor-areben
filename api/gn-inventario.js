// Diagnóstico (solo lectura): muestra qué SKU / código de barras expone HOY la API de GN
// para un producto, buscando por nombre. Sirve para saber si un producto nuevo ya está
// indexado en el feed de GN (de donde el sync arma el espejo) o si todavía no.
//
// Uso:  GET /api/gn-inventario?store=zattia&q=TOP%20THUMB
//   store: bdi | zattia   ·   q: parte del nombre del producto
//
// El token de GN queda en el servidor (no se expone). No escribe nada.
const GN_BASE = 'https://www.gestionnube.com/api/v1';
const TOKENS = { zattia: process.env.GN_TOKEN_ZATTIA, bdi: process.env.GN_TOKEN };
const ENV_NAME = { zattia: 'GN_TOKEN_ZATTIA', bdi: 'GN_TOKEN' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gnFetch(path, token, retries = 3) {
  for (let a = 1; a <= retries; a++) {
    const res = await fetch(`${GN_BASE}/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { if (a < retries) { await sleep(1500 * a); continue; } throw new Error('Respuesta no-JSON ' + res.status + ': ' + text.slice(0, 160)); }
    if (!res.ok) { if (res.status >= 500 && a < retries) { await sleep(1500 * a); continue; } throw new Error(data.message || data.error || ('Error ' + res.status)); }
    return data;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const store = String(req.query.store || 'bdi').toLowerCase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const token = TOKENS[store];
  if (!token) return res.status(500).json({ ok: false, error: `Falta ${ENV_NAME[store] || 'el token de GN'} en el entorno de Vercel del Monitor.` });
  if (!q) return res.status(400).json({ ok: false, error: 'Indicá ?q=<parte del nombre del producto>. Ej: ?store=zattia&q=TOP THUMB' });

  try {
    const out = [];
    let page = 1, scanned = 0;
    while (page <= 40) { // tope de seguridad
      const d = await gnFetch(`productos/obtener?include_variants=1&per_page=200&page=${page}`, token);
      const items = d.data || [];
      scanned += items.length;
      for (const p of items) {
        if (!String(p.name || '').toLowerCase().includes(q)) continue;
        const vars = (p.variantes || p.variants || []).map(v => ({
          variante: v.size_name || v.name || String(v.size_id ?? ''),
          sku: v.sku || v.code || null,
          barcode: v.barcode || null,
        }));
        out.push({ id: p.id, name: p.name, sku_producto: p.sku || p.code || null, active: p.active ?? null, variantes: vars });
      }
      if (!d.meta?.has_more_pages || items.length === 0) break;
      page++; await sleep(300);
    }
    return res.status(200).json({ ok: true, store, q, productos_encontrados: out.length, productos_escaneados: scanned, productos: out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
