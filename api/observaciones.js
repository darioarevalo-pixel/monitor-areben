// Escribe la OBSERVACIÓN (ubicación física) del inventario en Gestión Nube,
// para TODAS las variantes de un producto en un depósito (default "Deposito Mayorista").
// POST { productId, observation, store? }
//   - observation: string (se recorta a 20 chars) o vacío/null para limpiar.
// Usa GN_TOKEN (token con inventory:read + inventory:write) desde el entorno del servidor.
// GN: GET /inventario/{product_id} (trae las filas con inventory_id) +
//     PATCH /inventario/{inventory_id}/observacion { observation }.
const GN_BASE = 'https://www.gestionnube.com/api/v1';
const TOKEN = process.env.GN_TOKEN; // token GN con inventory:read+write (env del Monitor)

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  if (!TOKEN) return res.status(500).json({ error: 'Falta GN_TOKEN en el entorno del servidor' });

  const body = req.body || {};
  const productId = body.productId;
  const store = (body.store || 'Deposito Mayorista').toLowerCase();
  const obs = (body.observation == null ? '' : String(body.observation)).trim().slice(0, 20) || null;
  if (!productId) return res.status(400).json({ error: 'Falta productId' });

  const headers = { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json', 'Content-Type': 'application/json' };

  try {
    // 1) Traer las filas de inventario del producto
    const rGet = await fetch(`${GN_BASE}/inventario/${productId}`, { headers });
    const dGet = await rGet.json();
    if (!rGet.ok) return res.status(rGet.status).json({ error: 'No se pudo leer el inventario del producto', detalle: JSON.stringify(dGet).slice(0, 200) });
    const filas = Array.isArray(dGet) ? dGet : (dGet.data || []);
    // 2) Filtrar al depósito pedido (por nombre, tolerante)
    const target = filas.filter(f => String(f.store_name || '').toLowerCase().includes(store));
    if (!target.length) return res.status(200).json({ ok: true, productId, updated: 0, total: 0, nota: `Sin variantes en "${body.store || 'Deposito Mayorista'}"` });

    // 3) PATCH de la observación en cada fila
    let updated = 0; const errores = [];
    for (const f of target) {
      try {
        const rP = await fetch(`${GN_BASE}/inventario/${f.inventory_id}/observacion`, {
          method: 'PATCH', headers, body: JSON.stringify({ observation: obs }),
        });
        if (rP.ok) updated++;
        else { const t = await rP.text(); errores.push({ inventory_id: f.inventory_id, status: rP.status, detalle: t.slice(0, 120) }); }
      } catch (e) { errores.push({ inventory_id: f.inventory_id, error: e.message }); }
      await sleep(150);
    }
    return res.status(200).json({ ok: errores.length === 0, productId, updated, total: target.length, errores });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
