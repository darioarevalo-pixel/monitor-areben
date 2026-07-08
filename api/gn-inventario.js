// Diagnóstico (solo lectura): muestra qué SKU / código de barras expone HOY la API de GN
// para un producto, buscando por nombre. Sirve para saber si un producto nuevo ya está
// indexado en el feed de GN (de donde el sync arma el espejo) o si todavía no.
//
// Uso:  GET /api/gn-inventario?store=zattia&q=TOP%20THUMB
//   store: bdi | zattia            · q: parte del nombre del producto
//   tokenEnv (opcional): nombre EXACTO de la variable de entorno del token a usar
//                        (para probar cuál es la de cada cuenta). Nunca se devuelve su valor.
//
// El token de GN queda en el servidor (no se expone). No escribe nada.
const GN_BASE = 'https://www.gestionnube.com/api/v1';

// Candidatas por cuenta (se usa la primera que exista si no se pasa ?tokenEnv=).
const CANDIDATOS = {
  zattia: ['GN_TOKEN_ZATTIA', 'gestion_nube_token_zattia', 'GESTION_NUBE_TOKEN_ZATTIA', 'gestion_nube_token', 'GESTION_NUBE_TOKEN'],
  bdi: ['GN_TOKEN', 'GN_TOKEN_BDI', 'gestion_nube_token', 'GESTION_NUBE_TOKEN'],
};
// Todas las que reportamos como presentes/ausentes (solo el nombre, nunca el valor).
const A_REPORTAR = ['GN_TOKEN', 'GN_TOKEN_ZATTIA', 'GN_TOKEN_VENTAS', 'GN_TOKEN_VENTAS_BDI', 'gestion_nube_token', 'gestion_nube_token_zattia', 'GESTION_NUBE_TOKEN', 'GESTION_NUBE_TOKEN_ZATTIA', 'GN_TOKEN_BDI'];

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

  // Qué variables de token existen (solo presencia, nunca el valor).
  const env_disponibles = {};
  A_REPORTAR.forEach(n => { if (process.env[n] != null && process.env[n] !== '') env_disponibles[n] = true; });

  // Elegir la variable de token: la que indique ?tokenEnv=, o la primera candidata disponible.
  const pedida = req.query.tokenEnv ? String(req.query.tokenEnv) : null;
  let tokenEnvUsado = null, token = null;
  if (pedida) {
    if (process.env[pedida]) { tokenEnvUsado = pedida; token = process.env[pedida]; }
  } else {
    for (const n of (CANDIDATOS[store] || [])) { if (process.env[n]) { tokenEnvUsado = n; token = process.env[n]; break; } }
  }

  if (!token) {
    return res.status(500).json({ ok: false, error: pedida ? `La variable ${pedida} no está seteada en Vercel.` : `No encontré ninguna variable de token para ${store}.`, env_disponibles, probar_con: 'Agregá &tokenEnv=NOMBRE con alguna de las de env_disponibles.' });
  }
  if (!q) return res.status(400).json({ ok: false, error: 'Indicá ?q=<parte del nombre del producto>. Ej: ?store=zattia&q=TOP THUMB', env_disponibles, token_env_usado: tokenEnvUsado });

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
    return res.status(200).json({ ok: true, store, q, token_env_usado: tokenEnvUsado, env_disponibles, productos_encontrados: out.length, productos_escaneados: scanned, productos: out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, token_env_usado: tokenEnvUsado, env_disponibles });
  }
}
