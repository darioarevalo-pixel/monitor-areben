// Depósito de fallas (post-venta) — tabla fallas_deposito (ver sql/migrate-fallas.sql).
// Ledger interno valorizado: NO toca stock oficial ni GN/TN.
//
//   GET  ?store=bdi|zattia[&limit=]                          → lista las fallas de la marca.
//   POST { store, producto, sku?, cantidad?, motivo?,        → crea una falla (estado en_deposito).
//          valuacion_costo?, valuacion_pvp_feria?, usuario? }
//   POST { store, action:'estado', id, estado, usuario?, nota? } → cambia el estado y apila historial.
//   POST { store, action:'editar', id, ...campos }           → edita campos de una falla.
//
// Mismo molde que api/conteos-deposito.js y api/sku-map.js: escribe con la service key (se saltea
// RLS) y exige usuario logueado del Monitor.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

function cfgFor(store) {
  if (store === 'zattia') {
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

const ESTADOS = ['en_deposito', 'vendida_feria', 'descartada'];
const COLS = 'id, store, sku, producto, cantidad, motivo, valuacion_costo, valuacion_pvp_feria, estado, usuario, historial, created_at, updated_at';

// Campos editables por el POST de creación / edición (nunca store ni id ni historial directo).
function camposDe(b) {
  const f = {};
  if (b.sku !== undefined) f.sku = b.sku ? String(b.sku) : null;
  if (b.producto !== undefined) f.producto = String(b.producto || '');
  if (b.cantidad !== undefined) f.cantidad = Math.max(1, parseInt(b.cantidad, 10) || 1);
  if (b.motivo !== undefined) f.motivo = b.motivo ? String(b.motivo) : null;
  if (b.valuacion_costo !== undefined) f.valuacion_costo = b.valuacion_costo === '' || b.valuacion_costo == null ? null : Number(b.valuacion_costo);
  if (b.valuacion_pvp_feria !== undefined) f.valuacion_pvp_feria = b.valuacion_pvp_feria === '' || b.valuacion_pvp_feria == null ? null : Number(b.valuacion_pvp_feria);
  return f;
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  if (!(await exigirUsuario(req, res))) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
      const { data, error } = await supabase
        .from('fallas_deposito')
        .select(COLS)
        .eq('store', store)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, fallas: data || [] });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const action = b.action || 'crear';

      if (action === 'crear') {
        if (!b.producto || !String(b.producto).trim()) return res.status(400).json({ error: 'falta el producto' });
        const usuario = b.usuario ? String(b.usuario) : null;
        const row = {
          store,
          estado: 'en_deposito',
          usuario,
          historial: [{ estado: 'en_deposito', at: new Date().toISOString(), usuario, nota: 'alta' }],
          ...camposDe(b),
        };
        const { data, error } = await supabase.from('fallas_deposito').insert(row).select('id').single();
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, id: data?.id });
      }

      const id = parseInt(b.id, 10);
      if (!id) return res.status(400).json({ error: 'falta id' });

      if (action === 'estado') {
        const estado = String(b.estado || '');
        if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'estado inválido' });
        // Leer historial actual para apilar el cambio (sin pisar lo anterior).
        const { data: prev, error: e0 } = await supabase.from('fallas_deposito').select('historial').eq('id', id).eq('store', store).single();
        if (e0) throw new Error(e0.message);
        const hist = Array.isArray(prev?.historial) ? prev.historial : [];
        hist.push({ estado, at: new Date().toISOString(), usuario: b.usuario ? String(b.usuario) : null, nota: b.nota ? String(b.nota) : null });
        const { error } = await supabase.from('fallas_deposito').update({ estado, historial: hist, updated_at: new Date().toISOString() }).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'editar') {
        const campos = camposDe(b);
        if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });
        campos.updated_at = new Date().toISOString();
        const { error } = await supabase.from('fallas_deposito').update(campos).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'action inválida' });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
