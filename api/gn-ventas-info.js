// TEMPORAL — busca el cliente "Sesión de fotos" en GN (Zattia). Usa GN_TOKEN_VENTAS. Protegido ?key=
const GN_BASE = 'https://www.gestionnube.com/api/v1';
const TOKEN = process.env.GN_TOKEN_VENTAS;
async function gget(path) {
  try {
    const r = await fetch(`${GN_BASE}/${path}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 200); }
    return { status: r.status, body: j };
  } catch (e) { return { error: e.message }; }
}
const asList = b => Array.isArray(b) ? b : (b && Array.isArray(b.data) ? b.data : null);
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query.key !== 'sf-discovery-2026') return res.status(403).json({ error: 'forbidden' });
  if (!TOKEN) return res.status(500).json({ error: 'falta GN_TOKEN_VENTAS' });
  const out = {};
  for (const p of ['clientes?search=Sesion', 'clientes?search=fotos', 'clientes?q=Sesion', 'clientes?name=Sesion', 'clientes?per_page=2000']) {
    const r = await gget(p);
    const list = asList(r.body);
    if (r.status === 200 && list) {
      const match = list.filter(c => /sesi|foto/.test(norm(JSON.stringify([c.name, c.business_name, c.first_name, c.last_name, c.full_name].filter(Boolean).join(' ')))));
      out[p] = { status: 200, total: list.length, keys: list[0] ? Object.keys(list[0]) : null, match: match.slice(0, 8).map(c => ({ id: c.id, name: c.name || c.business_name || c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') })) };
    } else out[p] = { status: r.status, body: typeof r.body === 'string' ? r.body : undefined };
  }
  res.status(200).json(out);
}
