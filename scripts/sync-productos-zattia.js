import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { crearClienteGN } from './lib/gn-fetch.mjs';
import { revisarCostos, sinCostoSiNoSeVe } from './lib/costos-espejo.mjs';

function loadEnv() {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* usa variables del sistema */ }
}

loadEnv();

const SUPABASE_URL = process.env.ZATTIA_SUPABASE_URL;
const SUPABASE_KEY = process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY;
const GN_TOKEN     = process.env.GN_TOKEN_ZATTIA;

if (!SUPABASE_URL || !SUPABASE_KEY || !GN_TOKEN) {
  console.error('Faltan variables de entorno: ZATTIA_SUPABASE_URL, ZATTIA_SUPABASE_KEY, GN_TOKEN_ZATTIA');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Cliente de GN compartido. Esta copia NO reintentaba errores de red: ahora sí.
const { fetchAllPages } = crearClienteGN({ token: GN_TOKEN, pausaPagina: 1100 });

async function main() {
  console.log('=== Sync productos — Zattia ===');
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`GN token: ${GN_TOKEN.substring(0, 6)}...`);

  console.log('\n[productos] Descargando...');
  const rows = await fetchAllPages('productos/obtener?per_page=50');

  const productos = rows.map(p => ({
    id:               p.id,
    name:             p.name,
    sku:              p.sku || p.code || null,
    category:         p.category || null,
    proveedor:        p.provider || null,
    retailer_price:   p.retailer_price ?? null,
    wholesaler_price: p.wholesaler_price ?? null,
    unit_cost:        p.unit_cost ?? null,
    active:           p.active ?? null,
    created_at:       p.created_at || null,
    updated_at:       p.updated_at || null,
  }));

  console.log(`[productos] ${productos.length} registros. Guardando en Supabase...`);
  // 🔴 Ver `scripts/lib/costos-espejo.mjs`: que NINGÚN producto traiga `unit_cost` no es un dato,
  // es un token sin `costs:read`, y escribirlo como NULL borra el costo del espejo en silencio.
  const costos = revisarCostos(rows);
  if (costos.problema) console.error(`[productos] ⚠️  ${costos.problema}`);
  else console.log(`[productos] costo legible en ${costos.conCosto}/${costos.total}.`);
  const paraGuardar = sinCostoSiNoSeVe(productos, costos.legible);


  if (!productos.length) {
    console.log('Nada que guardar.');
    process.exit(0);
  }

  const BATCH = 500;
  for (let i = 0; i < productos.length; i += BATCH) {
    const lote = paraGuardar.slice(i, i + BATCH);
    process.stdout.write(`  upsert ${i + lote.length}/${productos.length}...\r`);
    const { error } = await supabase.from('productos').upsert(lote, { onConflict: 'id' });
    if (error) throw new Error(`Error guardando lote (offset ${i}): ${error.message}`);
  }
  process.stdout.write('\n');

  console.log(`[productos] OK — ${productos.length} registros sincronizados.`);
}

main().catch(e => {
  console.error('\nERROR:', e.message);
  process.exit(1);
});
