// Probe temporal: ver si el token nuevo de Zattia ya recibe el COSTO desde GN.
const GN_TOKEN = process.env.GN_TOKEN_ZATTIA;
const GN_BASE = 'https://www.gestionnube.com/api/v1';
if (!GN_TOKEN) { console.error('Falta GN_TOKEN_ZATTIA'); process.exit(1); }

async function gn(path) {
  const r = await fetch(`${GN_BASE}/${path}`, { headers: { Authorization: `Bearer ${GN_TOKEN}`, Accept: 'application/json' } });
  const t = await r.text();
  try { return { ok: r.ok, status: r.status, json: JSON.parse(t) }; }
  catch { return { ok: r.ok, status: r.status, text: t.slice(0, 200) }; }
}

(async () => {
  const res = await gn('productos/obtener?per_page=8&include_variants=1');
  if (!res.json || !res.json.data) { console.log('status', res.status, res.text || JSON.stringify(res.json).slice(0, 150)); return; }
  const arr = res.json.data;
  console.log('keys producto:', Object.keys(arr[0] || {}).join(', '));
  const low = JSON.stringify(res.json).toLowerCase();
  ['cost', 'costo', 'unit_cost', 'purchase', 'compra', 'precio_compra'].forEach(k => {
    console.log('  contiene "' + k + '":', low.includes(k));
  });
  arr.slice(0, 8).forEach(x => {
    console.log('   ', JSON.stringify({ name: x.name, retailer_price: x.retailer_price, unit_cost: x.unit_cost, cost: x.cost, costo: x.costo }));
  });
  // por si el costo viene a nivel variante
  const v = (arr.find(p => p.variantes && p.variantes.length) || {}).variantes?.[0];
  if (v) console.log('keys variante:', Object.keys(v).join(', '));
})();
