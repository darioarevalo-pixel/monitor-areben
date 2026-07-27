// Historial de conteos de depósito aplicados (sección "Depósito → Conteo" del Monitor).
// POST { store, ubicacion, usuario, fecha_inicio, resumen, detalle }  → guarda un conteo aplicado.
// GET  ?store=bdi|zattia[&limit=50]                                    → lista los últimos conteos.
// Usa la tabla conteos_deposito (ver sql/migrate-conteos-deposito.sql) en el Supabase de cada marca.
// Seguridad: exige un usuario válido del Monitor (login server-side contra el KV).
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

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;

  // El POST escribe con la service key de Supabase (se saltea RLS) y el GET lista
  // los conteos de la marca: los dos exigen usuario. Antes ninguno pedía nada.
  if (!(await exigirUsuario(req, res))) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const { data, error } = await supabase
        .from('conteos_deposito')
        .select('id, store, ubicacion, usuario, fecha_inicio, fecha_aplicado, resumen, detalle')
        .eq('store', store)
        .order('fecha_aplicado', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, conteos: data || [] });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const row = {
        store,
        ubicacion: b.ubicacion || null,
        usuario: b.usuario || null,
        fecha_inicio: b.fecha_inicio || null,
        resumen: b.resumen && typeof b.resumen === 'object' ? b.resumen : {},
        detalle: Array.isArray(b.detalle) ? b.detalle : [],
      };
      const { data, error } = await supabase.from('conteos_deposito').insert(row).select('id').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id: data?.id });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
