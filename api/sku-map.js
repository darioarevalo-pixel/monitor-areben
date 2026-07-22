// Mapeo estable de SKU entre Gestión Nube (GN) y Tienda Nube (TN) — tabla sku_map.
// Fundacional para el sync bidireccional TN↔GN (ver sql/migrate-sku-map.sql).
//
//   GET  ?store=bdi|zattia|stunned[&validado=true|false][&limit=]  → lista el mapeo.
//   POST { store, rows: [...] }                                    → upsert (on conflict store,sku).
//   POST { store, action:'validar', skus:[...], validado:bool }    → marca filas como validadas.
//
// Mismo molde que api/conteos-deposito.js: escribe con la service key (se saltea RLS) y exige
// usuario logueado del Monitor. Stunned todavía no tiene base propia: se rutea a la de Zattia.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

function cfgFor(store) {
  // Stunned es la línea SKU 'STU' dentro del GN de Zattia: comparte su base hasta provisionar la propia.
  if (store === 'zattia' || store === 'stunned') {
    return {
      url: process.env.ZATTIA_SUPABASE_URL,
      key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY,
    };
  }
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

const CAMPOS = [
  'store', 'sku',
  'gn_product_id', 'gn_variant_id', 'gn_inventory_id',
  'tn_store', 'tn_product_id', 'tn_variant_id',
  'match_metodo', 'validado', 'nota',
];

function limpiarFila(store, raw) {
  const f = { store };
  for (const c of CAMPOS) {
    if (c === 'store') continue;
    if (raw[c] === undefined || raw[c] === null) continue;
    f[c] = c === 'validado' ? Boolean(raw[c]) : String(raw[c]);
  }
  return f;
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  if (!(await exigirUsuario(req, res))) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia', 'stunned'].includes(store)) {
    return res.status(400).json({ error: 'store inválido (usá bdi, zattia o stunned)' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const limit = Math.min(parseInt(req.query.limit, 10) || 2000, 5000);
      let q = supabase.from('sku_map').select('*').eq('store', store);
      if (req.query.validado === 'true') q = q.eq('validado', true);
      if (req.query.validado === 'false') q = q.eq('validado', false);
      const { data, error } = await q.order('sku', { ascending: true }).limit(limit);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, rows: data || [] });
    }

    if (req.method === 'POST') {
      const b = req.body || {};

      // Marcar filas como validadas (o des-validar) por SKU.
      if (b.action === 'validar') {
        const skus = Array.isArray(b.skus) ? b.skus.map(String) : [];
        if (!skus.length) return res.status(400).json({ error: 'faltan skus' });
        const { error } = await supabase
          .from('sku_map')
          .update({ validado: b.validado !== false, updated_at: new Date().toISOString() })
          .eq('store', store)
          .in('sku', skus);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, actualizados: skus.length });
      }

      // Upsert de propuestas/ediciones del mapeo (on conflict store,sku).
      const rows = Array.isArray(b.rows) ? b.rows : [];
      if (!rows.length) return res.status(400).json({ error: 'faltan rows' });
      const now = new Date().toISOString();
      const limpias = rows
        .filter((r) => r && r.sku)
        .map((r) => ({ ...limpiarFila(store, r), updated_at: now }));
      if (!limpias.length) return res.status(400).json({ error: 'ninguna fila tiene sku' });

      // Postgres no deja que un UPSERT toque la misma fila 2 veces: si GN trae SKUs duplicados
      // (dos productos con el mismo código), el batch tendría (store,sku) repetidos y falla.
      // Deduplicamos por SKU (último gana) — es una propuesta que igual revisa un humano.
      const porSku = new Map();
      for (const f of limpias) porSku.set(f.sku, f);
      const dedup = [...porSku.values()];

      const { data, error } = await supabase
        .from('sku_map')
        .upsert(dedup, { onConflict: 'store,sku' })
        .select('id');
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, upsert: (data || []).length, duplicados: limpias.length - dedup.length });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
