// Crea una venta en Gestión Nube para la "Sesión de fotos" (descuenta stock del depósito o del local).
// POST { store, origen:'deposito'|'local', items:[{product_id,size_id,quantity}], comments, solicitudId, user, pass }
// Seguridad: valida que (user, pass) sea un usuario válido del Monitor (login server-side).
// Usa GN_TOKEN_VENTAS (Zattia) / GN_TOKEN_VENTAS_BDI (BDI): token con permiso de ventas.
const GN_BASE = 'https://www.gestionnube.com/api/v1';
const USU_API = 'https://bdi-catalogo.vercel.app/api/usuarios';

// Config descubierta de GN. store_id por ubicación (según cómo el Monitor cuenta deposito/local).
// BDI: deposito = Deposito Minorista (13307), local = Local (18393). channel 12 = "Ninguno".
const SF_CFG = {
  zattia: { client_id: 312923, channel_id: 12, sale_type_id: 1, currency_id: 1, store: { deposito: 18210, local: 11780 } },
  bdi:    { client_id: 338755, channel_id: 12, sale_type_id: 1, currency_id: 1, store: { deposito: 13307, local: 18393 } },
};
const TOKENS = { zattia: process.env.GN_TOKEN_VENTAS, bdi: process.env.GN_TOKEN_VENTAS_BDI };

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

  const b = req.body || {};
  const store = String(b.store || '').toLowerCase();
  const cfg = SF_CFG[store];
  if (!cfg) return res.status(400).json({ error: 'No hay configuración de ventas para esta cuenta.' });
  const TOKEN = TOKENS[store];
  if (!TOKEN) return res.status(500).json({ error: `Falta el token de ventas de GN para ${store} en el entorno.` });

  // ── Estado de una venta (solo lectura, sin login) — para saber si ya se anuló en GN ──
  if (b.accion === 'estado') {
    const ventaId = parseInt(b.ventaId, 10);
    if (!ventaId) return res.status(400).json({ error: 'ventaId inválido' });
    try {
      const r = await gnFetch(`${GN_BASE}/ventas/${ventaId}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
      if (r.status === 404) return res.status(200).json({ ok: true, existe: false });
      const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = null; }
      const v = (d && d.data) ? d.data : d;
      if (!r.ok || !v) return res.status(200).json({ ok: true, existe: true, desconocido: true });
      return res.status(200).json({ ok: true, existe: true, active: v.active, archived: v.archived, sale_state_id: v.sale_state_id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (!(await usuarioValido(b.user, b.pass))) return res.status(403).json({ error: 'Usuario o contraseña inválidos.' });

  // ── Crear venta ── (GN no soporta anular/borrar por API: eso se hace a mano en la web de GN)
  if (!['deposito', 'local'].includes(b.origen)) return res.status(400).json({ error: 'origen inválido' });
  const items = Array.isArray(b.items) ? b.items.filter(it => it && it.product_id && it.size_id && (+it.quantity > 0)) : [];
  if (!items.length) return res.status(400).json({ error: 'items vacíos' });

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
