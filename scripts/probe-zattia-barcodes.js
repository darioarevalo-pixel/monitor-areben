// Probe temporal: ver si los productos de Zattia tienen barcode cargado en GN
const GN_TOKEN = process.env.GN_TOKEN_ZATTIA;
const GN_BASE  = 'https://www.gestionnube.com/api/v1';

if (!GN_TOKEN) { console.error('Falta GN_TOKEN_ZATTIA'); process.exit(1); }

const r = await fetch(`${GN_BASE}/productos/obtener?per_page=10&include_stock=1&include_variants=1`, {
  headers: { 'Authorization': 'Bearer ' + GN_TOKEN, 'Accept': 'application/json' }
});
const data = await r.json();
const prods = data.data || [];

let totVariantes = 0, conBC = 0, sinBC = 0;
console.log('=== Muestra de variantes de Zattia GN ===');
for (const p of prods.slice(0, 5)) {
  console.log(`─── ${p.name} ───`);
  for (const v of (p.variantes || []).slice(0, 3)) {
    totVariantes++;
    const bc = v.barcode;
    if (bc) conBC++; else sinBC++;
    console.log(`  ${v.size}: barcode=${bc || '(vacío)'}`);
  }
}
console.log(`\nResumen: ${conBC}/${totVariantes} variantes con barcode (muestra de 5 productos)`);

// Contar TODOS los productos
console.log('\n=== Conteo total ===');
let totProds = 0, totalConBC = 0, totalSinBC = 0;
let page = 1;
while (page < 100) {
  const rr = await fetch(`${GN_BASE}/productos/obtener?per_page=50&page=${page}&include_variants=1`, {
    headers: { 'Authorization': 'Bearer ' + GN_TOKEN, 'Accept': 'application/json' }
  });
  const dd = await rr.json();
  const items = dd.data || [];
  if (!items.length) break;
  for (const p of items) {
    for (const v of (p.variantes || [])) {
      totProds++;
      if (v.barcode) totalConBC++; else totalSinBC++;
    }
  }
  if (!dd.meta?.has_more_pages) break;
  page++;
  await new Promise(r => setTimeout(r, 800));
}
console.log(`Total variantes Zattia: ${totProds}`);
console.log(`  Con barcode:    ${totalConBC} (${Math.round(totalConBC*100/totProds)}%)`);
console.log(`  Sin barcode:    ${totalSinBC} (${Math.round(totalSinBC*100/totProds)}%)`);
