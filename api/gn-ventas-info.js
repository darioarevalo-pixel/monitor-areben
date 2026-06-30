// TEMPORAL — Chequeo de solo lectura para descubrir IDs de GN. Usa GN_TOKEN_VENTAS. Protegido ?key=
const GN_BASE = 'https://www.gestionnube.com/api/v1';
const TOKEN = process.env.GN_TOKEN_VENTAS;

async function gget(path) {
  try {
    const r = await fetch(`${GN_BASE}/${path}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 300); }
    return { status: r.status, body: j };
  } catch (e) { return { error: e.message }; }
}
const asList = b => Array.isArray(b) ? b : (b && Array.isArray(b.data) ? b.data : null);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query.key !== 'sf-discovery-2026') return res.status(403).json({ error: 'forbidden' });
  if (!TOKEN) return res.status(500).json({ error: 'falta GN_TOKEN_VENTAS' });
  const today = new Date().toISOString().slice(0, 10);
  const out = {};

  // 1) INVENTARIO → mapeo store_id ↔ store_name (Local + Depósito) y nombres de producto (qué empresa)
  const inv = await gget('inventario/obtener?per_page=80');
  const invList = asList(inv.body) || [];
  const stores = {};
  invList.forEach(r => { if (r.store_id != null) stores[r.store_id] = r.store_name || r.store || ''; });
  out.inventario = { status: inv.status, keys: invList[0] ? Object.keys(invList[0]) : null, stores, ejemploProductos: invList.slice(0, 5).map(r => r.product_name) };

  // 2) VENTAS → distintos channel_id / sale_type_id / currency_id / store_id y nombres
  const v = await gget(`ventas/obtener?from=2025-06-01&to=${today}&include_details=1&per_page=200`);
  const vList = asList(v.body) || [];
  const uniq = (key) => { const m = {}; vList.forEach(s => { const k = s[key]; if (k != null) m[k] = (m[k] || 0) + 1; }); return m; };
  // mapa channel_id -> nombre, store_id -> nombre, sale_type_id -> nombre (si vienen)
  const chName = {}, stName = {}, stpName = {};
  vList.forEach(s => { if (s.channel_id != null) chName[s.channel_id] = s.channel || chName[s.channel_id] || ''; if (s.store_id != null) stName[s.store_id] = s.store || stName[s.store_id] || ''; if (s.sale_type_id != null) stpName[s.sale_type_id] = s.sale_type || stpName[s.sale_type_id] || ''; });
  out.ventas = {
    status: v.status, total: vList.length,
    channel_id: chName, store_id: stName, sale_type_id: stpName,
    currency_id: uniq('currency_id'),
    clientes_distintos: new Set(vList.map(s => s.client_id)).size,
  };

  // 3) Buscar el cliente "Sesión de fotos" — probar varios endpoints/búsquedas
  for (const p of ['clientes/obtener?per_page=200', 'clientes/obtener?search=foto', 'clientes/obtener?q=foto', 'clientes/buscar?q=foto', 'clientes?search=foto', 'cliente/obtener?per_page=200']) {
    const r = await gget(p);
    const list = asList(r.body);
    if (r.status === 200 && list) {
      const foto = list.filter(c => /foto|sesi/i.test(JSON.stringify(c)));
      out['cli:' + p] = { status: 200, total: list.length, keys: list[0] ? Object.keys(list[0]) : null, match_foto: foto.slice(0, 5) };
    } else {
      out['cli:' + p] = { status: r.status };
    }
  }

  res.status(200).json(out);
}
