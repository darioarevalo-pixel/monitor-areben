// Probe temporal: ver si el token de Zattia recibe el COSTO de los productos desde GN.
// (El token de BDI no devuelve costo; capaz el de Zattia tiene otro permiso.)
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
  // Probar varios endpoints/parámetros por si el costo aparece con alguno
  const intentos = [
    'productos/obtener?per_page=5',
    'productos/obtener?per_page=5&include_cost=1',
    'productos/obtener?per_page=5&include_costs=1',
    'inventario/obtener?per_page=5',
  ];
  for (const path of intentos) {
    console.log('\n=== ' + path + ' ===');
    const res = await gn(path);
    if (!res.json || !res.json.data) { console.log('status', res.status, res.text || JSON.stringify(res.json).slice(0, 150)); continue; }
    const arr = res.json.data;
    const p = arr[0] || {};
    console.log('keys:', Object.keys(p).join(', '));
    const low = JSON.stringify(res.json).toLowerCase();
    ['cost', 'costo', 'unit_cost', 'purchase', 'compra', 'precio_compra'].forEach(k => {
      if (low.includes(k)) console.log('  >>> CONTIENE "' + k + '"');
    });
    // Mostrar campos de precio/costo de los primeros productos
    arr.slice(0, 5).forEach(x => {
      console.log('   ', JSON.stringify({ name: x.name || x.product_name, retailer_price: x.retailer_price, wholesaler_price: x.wholesaler_price, unit_cost: x.unit_cost, cost: x.cost, costo: x.costo }));
    });
  }
})();
