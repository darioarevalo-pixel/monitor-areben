// Sondeo temporal: dumpea campos que devuelve la API de Gestión Nube
const GN_TOKEN = process.env.GN_TOKEN_ZATTIA;
const GN_BASE  = 'https://www.gestionnube.com/api/v1';

if (!GN_TOKEN) { console.error('Falta GN_TOKEN_ZATTIA'); process.exit(1); }

async function gn(path) {
  const res = await fetch(`${GN_BASE}/${path}`, {
    headers: { 'Authorization': `Bearer ${GN_TOKEN}`, 'Accept': 'application/json' }
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { console.error(`No-JSON [${res.status}] en ${path}:`, text.substring(0, 300)); return null; }
}

console.log('\n========================================');
console.log('1. LISTADO: productos/obtener?per_page=1');
console.log('========================================');
const list = await gn('productos/obtener?per_page=1');
if (list?.data?.[0]) {
  const p = list.data[0];
  console.log('\nCampos disponibles en LISTADO:');
  Object.keys(p).forEach(k => console.log(`  ${k.padEnd(25)} = ${JSON.stringify(p[k])?.substring(0, 80)}`));
  console.log('\nID del producto sample:', p.id);

  console.log('\n========================================');
  console.log('2. DETALLE: productos/obtener/' + p.id);
  console.log('========================================');
  const det = await gn(`productos/obtener/${p.id}`);
  const d = det?.data || det;
  if (d && typeof d === 'object') {
    console.log('\nCampos disponibles en DETALLE:');
    Object.keys(d).forEach(k => {
      const val = JSON.stringify(d[k]);
      console.log(`  ${k.padEnd(25)} = ${val?.substring(0, 100)}${val?.length > 100 ? '...' : ''}`);
    });
  } else {
    console.log('Sin detalle disponible o estructura inesperada');
    console.log(JSON.stringify(det, null, 2).substring(0, 500));
  }
} else {
  console.log('Respuesta inesperada del listado:');
  console.log(JSON.stringify(list, null, 2).substring(0, 500));
}

console.log('\n========================================');
console.log('3. Probar endpoint VENTA (1 venta reciente)');
console.log('========================================');
const ventas = await gn('ventas/obtener?per_page=1&include_details=1');
if (ventas?.data?.[0]) {
  const v = ventas.data[0];
  console.log('\nCampos disponibles en VENTA:');
  Object.keys(v).forEach(k => {
    const val = JSON.stringify(v[k]);
    console.log(`  ${k.padEnd(25)} = ${val?.substring(0, 80)}${val?.length > 80 ? '...' : ''}`);
  });
}
