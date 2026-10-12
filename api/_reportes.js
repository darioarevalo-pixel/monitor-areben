// «Ayuda / problemas» — el botón de abajo a la derecha (Bruno, 12-oct-2026). Tabla `reportes`.
//
//   GET  ?recurso=reportes                          → { ok, reportes }   ⚠️ SOLO admin
//   POST { recurso:'reportes', action:'crear', tipo, texto, seccion?, url? }   → { ok, id }
//   POST { recurso:'reportes', action:'estado', id, estado }                   ⚠️ SOLO admin
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=reportes`. El plan Hobby de
// Vercel admite 12 funciones: un `api/reportes.js` frena todos los deploys sin error visible.
//
// 1. **No valida `store`**: el monitor es uno solo; base de BDI, como `_organizacion.js`.
// 2. **Crear lo puede cualquiera con sesión** —es la contracara de que exista—; leer y resolver, un admin.
// 3. 🔑 **`autor` sale de `perfil.name`, NUNCA del body.**
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin } from '../lib/permisos.core.js';
import { reporteValido } from '../lib/reportes/core.core.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPOS = 'id, creado_en, autor, tipo, texto, seccion, url, estado, resuelto_por, resuelto_en';

/** Siempre la base de BDI: acá no hay marca. */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

const sinTabla = (e) => /reportes/.test(String((e && e.message) || '')) && /does not exist|schema cache/.test(String((e && e.message) || ''));

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;
  const yo = perfil.name || null;
  if (!yo) return res.status(400).json({ error: 'La sesión no tiene nombre; volvé a entrar.' });

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const sb = createClient(cfg.url, cfg.key);
  const admin = esAdmin(perfil);

  try {
    if (req.method === 'GET') {
      if (!admin) return res.status(403).json({ error: 'Los reportes los ve un admin.' });
      const { data, error } = await sb.from('reportes').select(CAMPOS).order('creado_en', { ascending: false }).limit(200);
      if (error && sinTabla(error)) return res.status(409).json({ error: 'Falta correr sql/migrate-reportes.sql en la base de BDI.' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, reportes: data || [] });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.action === 'crear') {
        let r;
        try {
          r = reporteValido(b);
        } catch (e) {
          return res.status(400).json({ error: e.message });
        }
        const { data, error } = await sb.from('reportes').insert({ ...r, autor: yo }).select('id').single();
        if (error && sinTabla(error)) return res.status(409).json({ error: 'Falta correr sql/migrate-reportes.sql en la base de BDI.' });
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, id: data.id });
      }
      if (b.action === 'estado') {
        if (!admin) return res.status(403).json({ error: 'Sólo un admin marca un reporte.' });
        const id = String(b.id || '');
        if (!UUID.test(id)) return res.status(400).json({ error: 'id inválido.' });
        if (!['abierto', 'resuelto'].includes(b.estado)) return res.status(400).json({ error: 'Estado inválido.' });
        const resuelto = b.estado === 'resuelto';
        const { data, error } = await sb.from('reportes')
          .update({ estado: b.estado, resuelto_por: resuelto ? yo : null, resuelto_en: resuelto ? new Date().toISOString() : null })
          .eq('id', id).select(CAMPOS).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return res.status(404).json({ error: 'Ese reporte no existe.' });
        return res.status(200).json({ ok: true, reporte: data });
      }
      return res.status(400).json({ error: 'action inválida (crear, estado)' });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Error inesperado' });
  }
}
