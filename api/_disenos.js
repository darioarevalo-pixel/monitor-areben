// Tablero de diseños compartido — tabla `disenos` (ver sql/migrate-disenos.sql).
//
//   GET  ?recurso=disenos&store=bdi|zattia            → { ok, disenos: [...] }
//   POST { recurso:'disenos', store, disenos:[...] }  → upsert (uno o varios)
//   POST { recurso:'disenos', store, id, action:'borrar' }
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12
// funciones por deploy y cada archivo de ruta cuenta una.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';

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
  if (!(await exigirUsuario(req, res))) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('disenos').select('datos').eq('store', store).order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, disenos: (data || []).map((r) => r.datos) });
    }

    if (req.method === 'POST') {
      const b = req.body || {};

      if (b.action === 'borrar') {
        const id = String(b.id || '');
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { error } = await supabase.from('disenos').delete().eq('store', store).eq('id', id);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      const entrada = Array.isArray(b.disenos) ? b.disenos : b.diseno ? [b.diseno] : [];
      const validos = entrada.filter((d) => d && d.id);
      if (!validos.length) return res.status(400).json({ error: 'falta el diseño (o no tiene id)' });

      const filas = validos.map((d) => ({
        id: String(d.id),
        store,
        estado: d.estado ? String(d.estado) : null,
        datos: d,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('disenos').upsert(filas, { onConflict: 'store,id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, guardados: filas.length });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
