// TEMPORAL — Chequeo de solo lectura para descubrir IDs de GN (canales, tipos de venta, moneda,
// cliente "Sesión de fotos") y la estructura de una venta. Usa GN_TOKEN_VENTAS (server). Se borra
// cuando terminamos de armar la Fase 2. Protegido con ?key=
const GN_BASE = 'https://www.gestionnube.com/api/v1';
const TOKEN = process.env.GN_TOKEN_VENTAS;

async function gget(path) {
  try {
    const r = await fetch(`${GN_BASE}/${path}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 400); }
    return { status: r.status, ok: r.ok, body: j };
  } catch (e) { return { error: e.message }; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query.key !== 'sf-discovery-2026') return res.status(403).json({ error: 'forbidden' });
  if (!TOKEN) return res.status(500).json({ error: 'falta GN_TOKEN_VENTAS en el entorno' });

  const today = new Date().toISOString().slice(0, 10);
  const out = {};

  // 1) Ventas recientes (raw) — para ver client_id, channel_id, sale_type_id, currency_id, store, items
  const v = await gget(`ventas/obtener?from=2026-01-01&to=${today}&include_details=1&per_page=8`);
  out.ventas = { status: v.status };
  const arr = Array.isArray(v.body) ? v.body : (v.body && Array.isArray(v.body.data) ? v.body.data : null);
  if (arr && arr.length) {
    out.ventas.keys = Object.keys(arr[0]);
    out.ventas.stores = [...new Set(arr.map(s => s.store ?? s.store_name ?? s.store_id))];
    out.ventas.sample = arr.slice(0, 3); // 3 ventas completas para inspeccionar
  } else {
    out.ventas.body = v.body; // si no es array, mostrar lo crudo (puede ser error/auth)
  }

  // 2) Probar listados de configuración (no sé los nombres exactos → pruebo varios)
  for (const p of [
    'clientes/obtener?per_page=80', 'clients/obtener?per_page=80',
    'canales/obtener', 'channels/obtener',
    'tipos_venta/obtener', 'tipos-venta/obtener', 'sale_types/obtener', 'sale-types/obtener',
    'monedas/obtener', 'currencies/obtener',
    'sucursales/obtener', 'tiendas/obtener', 'depositos/obtener',
  ]) {
    const r = await gget(p);
    // resumen compacto: status + (cantidad o keys del primero)
    let resumen = { status: r.status };
    const b = r.body;
    const list = Array.isArray(b) ? b : (b && Array.isArray(b.data) ? b.data : null);
    if (list) { resumen.total = list.length; resumen.sample = list.slice(0, 12); }
    else if (r.status && r.status !== 200) resumen.body = (typeof b === 'string' ? b : JSON.stringify(b)).slice(0, 200);
    out[p] = resumen;
  }

  res.status(200).json(out);
}
