// Crea una venta en Gestión Nube para la "Sesión de fotos" (descuenta stock del depósito o del local).
// POST { store, origen:'deposito'|'local', items:[{product_id,size_id,quantity}], comments, solicitudId, user, pass }
// Seguridad: valida que (user, pass) sea un usuario válido del Monitor (login server-side).
// Usa GN_TOKEN_VENTAS (token con permiso de ventas). Por ahora solo Zattia.
const GN_BASE = 'https://www.gestionnube.com/api/v1';
const TOKEN = process.env.GN_TOKEN_VENTAS;
const USU_API = 'https://bdi-catalogo.vercel.app/api/usuarios';

// Config descubierta de GN (Zattia). store_id por ubicación.
const SF_CFG = {
  zattia: { client_id: 312923, channel_id: 12, sale_type_id: 1, currency_id: 1, store: { deposito: 18210, local: 11780 } },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gnFetch(url, opts, tries = 3) {
  let last;
  for (let a = 1; a <= tries; a++) {
    try { const r = await fetch(url, opts); if (r.ok) return r; last = r; if ((r.status === 429 || r.status >= 500) && a < tries) { await sleep(800 * a); continue; } return r; }
    catch (e) { last = e; if (a < tries) { await sleep(800 * a); continue; } throw e; }
  }
  return last;
}
async function usuarioValido(user, pass) {
  if (!user || !pass) return false;
  try { const r = await fetch(USU_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', user, pass }) }); const d = await r.json(); return !!(d && d.ok && d.perfil); }
  catch (e) { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  if (!TOKEN) return res.status(500).json({ error: 'falta GN_TOKEN_VENTAS en el entorno' });

  const b = req.body || {};
  const store = String(b.store || '').toLowerCase();
  const cfg = SF_CFG[store];
  if (!cfg) return res.status(400).json({ error: 'Por ahora solo se pueden crear ventas en Zattia.' });
  if (!['deposito', 'local'].includes(b.origen)) return res.status(400).json({ error: 'origen inválido' });
  const items = Array.isArray(b.items) ? b.items.filter(it => it && it.product_id && it.size_id && (+it.quantity > 0)) : [];
  if (!items.length) return res.status(400).json({ error: 'items vacíos' });
  if (!(await usuarioValido(b.user, b.pass))) return res.status(403).json({ error: 'Usuario o contraseña inválidos.' });

  const store_id = cfg.store[b.origen];
  const payload = {
    client_id: cfg.client_id, channel_id: cfg.channel_id, sale_type_id: cfg.sale_type_id, currency_id: cfg.currency_id,
    store_id, discount_inventory: true,
    comments: String(b.comments || '').slice(0, 500),
    integration_source: 'monitor-sesion-fotos',
    integration_id: `${b.solicitudId || 'sf'}-${b.origen}`,
    items: items.map(it => ({ product_id: parseInt(it.product_id, 10), size_id: parseInt(it.size_id, 10), quantity: parseInt(it.quantity, 10), unit_price: 0, store_id })),
  };

  try {
    const r = await gnFetch(`${GN_BASE}/ventas`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 500); }
    if (!r.ok) return res.status(r.status).json({ error: 'GN rechazó la venta', status: r.status, detalle: d });
    const v = (d && d.data) ? d.data : d;
    return res.status(200).json({ ok: true, store_id, venta: { id: v && v.id, number: v && v.number } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
