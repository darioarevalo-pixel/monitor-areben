// Script focalizado: solo sincroniza ventas + venta_detalles + clientes.
// Sirve para el rebuild histórico del CRM sin tocar productos/inventario.
// Idempotente: usa upserts, se puede correr varias veces.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { crearClienteGN } from './lib/gn-fetch.mjs';

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
  } catch {}
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const GN_TOKEN     = process.env.GN_TOKEN;
const FROM_DATE    = process.env.SYNC_FROM_DATE || '2025-01-01';

if (!SUPABASE_URL || !SUPABASE_KEY || !GN_TOKEN) {
  console.error('Faltan variables: SUPABASE_URL, SUPABASE_KEY, GN_TOKEN');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Cliente de GN compartido: ver scripts/lib/gn-fetch.mjs.
const { fetchAllPagesStreaming } = crearClienteGN({ token: GN_TOKEN });

// Itera páginas e invoca onBatch(rows, page) cada FLUSH_EVERY páginas
// (o al final si hay un resto). Permite guardado incremental.
const FLUSH_EVERY = 50;

function mapVentaRow(v) {
  return {
    id:             v.id,
    number:         v.number || null,
    date_sale:      v.date_sale || null,
    total_price:    v.total_price ?? null,
    channel:        v.channel || null,
    sale_state:     v.sale_state || null,
    payment_method: v.payment_method || null,
    store:          v.store || null,
    client_name:    v.client_name || null,
    client_id:       v.client_id || null,
    client_email:    v.client_email || null,
    client_phone:    v.client_phone || null,
    client_city:     v.client_city || null,
    client_province: v.client_province || null,
    channel_id:      v.channel_id ?? null,
    sale_type_id:    v.sale_type_id ?? null,
    total_cost:      v.total_cost ?? null,
    profit:          v.profit ?? null,
    items_sold:      v.items_sold ?? null,
  };
}

function extraerClientes(rows) {
  const map = new Map();
  for (const v of rows) {
    if (!v.client_id) continue;
    const ts = v.created_at || v.updated_at || v.date_sale || '';
    const prev = map.get(v.client_id);
    if (!prev || (ts && ts > prev._ts)) {
      map.set(v.client_id, {
        id:           v.client_id,
        name:         v.client_name || null,
        email:        v.client_email || null,
        phone:        v.client_phone || null,
        city:         v.client_city || null,
        province:     v.client_province || null,
        postal_code:  v.client_postal_code || null,
        address:      v.client_address || null,
        updated_at:   new Date().toISOString(),
        _ts: ts,
      });
    }
  }
  return [...map.values()].map(({ _ts, ...rest }) => rest);
}

function dedupById(arr) {
  const map = new Map();
  for (const x of arr) {
    if (x && x.id != null) map.set(String(x.id), x);
  }
  return [...map.values()];
}

async function flushBatch(rawRows) {
  // Dedup rawRows por id de venta antes de mapear
  const rawDedup = dedupById(rawRows);
  const ventas = dedupById(rawDedup.map(mapVentaRow));
  const clientes = dedupById(extraerClientes(rawDedup));
  const detalles = dedupById(
    rawDedup.flatMap(v =>
      (v.detalles || []).map(d => ({
        id:           d.id,
        sale_id:      v.id,
        product_id:   d.product_id || null,
        product_name: d.product_name || null,
        size_id:      d.size_id || null,
        size:         d.size || null,
        quantity:     d.quantity ?? null,
        unit_price:   d.unit_price ?? null,
        total:        d.total ?? null,
      }))
    )
  );

  if (ventas.length) {
    for (let i = 0; i < ventas.length; i += 1000) {
      const lote = ventas.slice(i, i + 1000);
      const { error } = await supabase.from('ventas').upsert(lote, { onConflict: 'id' });
      if (error) throw new Error(`Error guardando ventas: ${error.message}`);
    }
  }
  if (clientes.length) {
    for (let i = 0; i < clientes.length; i += 500) {
      const lote = clientes.slice(i, i + 500);
      const { error } = await supabase.from('clientes').upsert(lote, { onConflict: 'id' });
      if (error) throw new Error(`Error guardando clientes: ${error.message}`);
    }
  }
  if (detalles.length) {
    for (let i = 0; i < detalles.length; i += 2000) {
      const lote = detalles.slice(i, i + 2000);
      const { error } = await supabase.from('venta_detalles').upsert(lote, { onConflict: 'id' });
      if (error) throw new Error(`Error guardando detalles: ${error.message}`);
    }
  }

  console.log(`    ✓ ventas: ${ventas.length}, clientes: ${clientes.length}, detalles: ${detalles.length}`);
}

async function main() {
  const today = new Date().toISOString().substring(0, 10);
  console.log(`=== Sync CRM (ventas + clientes) ===`);
  console.log(`Rango: ${FROM_DATE} → ${today}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Flush cada ${FLUSH_EVERY} páginas\n`);

  const basePath = `ventas/obtener?from=${FROM_DATE}&to=${today}&include_details=1&per_page=50`;
  console.log(`[ventas] Descargando...`);

  await fetchAllPagesStreaming(basePath, flushBatch);

  console.log('\nSync completado ✓');
}

main().catch(e => { console.error('\nERROR:', e.message); process.exit(1); });
