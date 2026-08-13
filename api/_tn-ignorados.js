// Productos de la tienda marcados como "no revisar" — tabla tn_ignorados
// (ver sql/migrate-tn-ignorados.sql).
//
//   GET  ?recurso=ignorados&store=bdi|zattia          → { ok, ignorados: [{tn_id, nombre, motivo}] }
//   POST { recurso:'ignorados', store, tn_id, nombre?, motivo?, usuario? } → ignora (upsert)
//   POST { recurso:'ignorados', store, tn_id, action:'quitar' }            → lo vuelve a mostrar
//
// Es un archivo `_`: NO es una ruta. Entra por api/tienda.js (ver el comentario de ahí: el
// plan Hobby de Vercel admite 12 funciones por deploy y cada archivo de ruta cuenta una).
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';

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
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // 🔴 Hasta el 13-ago-2026 el control terminaba en `exigirUsuario`: cualquier cuenta válida del
  // Monitor —los puestos compartidos incluidos— cambiaba qué productos quedan apartados de la revisión de fotos de la tienda.
  if (!puedeVerAlguna(perfil, store, ['tncat'])) {
    return res.status(403).json({ error: 'No tenés acceso a Tienda Nube en esta marca.' });
  }

  // 🔑 La firma sale de `perfil.name`, NO del body. Hasta el 13-ago-2026 salía de `b.usuario`,
  // o sea que el historial de una falla o de un conteo se podía firmar con el nombre de otro
  // —basta con cambiar un campo del POST— y el rastro de auditoría no valía nada. Los handlers
  // que ya lo hacían bien (`api/_canjes.js:498`, `api/_reclamos.js`) son el molde.
  const yo = perfil.name || null;

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('tn_ignorados').select('tn_id, nombre, motivo').eq('store', store);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, ignorados: data || [] });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const tnId = b.tn_id != null ? String(b.tn_id) : '';
      if (!tnId) return res.status(400).json({ error: 'falta tn_id' });

      if (b.action === 'quitar') {
        const { error } = await supabase.from('tn_ignorados').delete().eq('store', store).eq('tn_id', tnId);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      const row = {
        store,
        tn_id: tnId,
        nombre: b.nombre ? String(b.nombre) : null,
        motivo: b.motivo ? String(b.motivo) : null,
        usuario: yo,
      };
      const { error } = await supabase.from('tn_ignorados').upsert(row, { onConflict: 'store,tn_id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
