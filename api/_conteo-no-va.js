// «No va» del reporte «Para colgar» (Conteo del local): talles y colores que a propósito no se
// cuelgan en el salón, recordados de un conteo al otro. Tabla `conteo_no_va`
// (ver sql/migrate-conteo-no-va.sql).
//
//   GET  ?recurso=no-va&store=zattia                                      → { ok, claves: [...] }
//   POST { recurso:'no-va', store, clave, producto?, variante?, sku? }     → lo marca
//   POST { recurso:'no-va', store, clave, action:'quitar' }                → lo vuelve a pedir
//
// Si la tabla todavía no se creó, contesta `{ ok:false, falta_tabla:true }` y la pantalla sigue
// guardando en el teléfono: el reporte no se frena por esto.
//
// Es un archivo `_`: NO es una ruta. Entra por api/deposito.js (plan Hobby: 12 funciones).
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
import { puedeContar } from '../lib/permisos.core.js';

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

const faltaTabla = (msg) => /conteo_no_va/.test(String(msg)) && /(does not exist|schema cache|not find)/i.test(String(msg));

export default async function handler(req, res) {
  // Mismo molde que el historial de conteos (`_conteos-deposito.js`), que comparte esta puerta.
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });
  // Mismo permiso que el historial de conteos: quien cuenta en esta marca.
  if (!puedeContar(perfil, store)) return res.status(403).json({ error: 'No tenés acceso a los conteos de esta marca.' });

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('conteo_no_va').select('clave').eq('store', store);
      if (error) {
        if (faltaTabla(error.message)) return res.status(200).json({ ok: false, falta_tabla: true, claves: [] });
        throw new Error(error.message);
      }
      return res.status(200).json({ ok: true, claves: (data || []).map((r) => r.clave) });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const clave = b.clave != null ? String(b.clave).slice(0, 80) : '';
      if (!clave) return res.status(400).json({ error: 'falta clave' });
      const resp = b.action === 'quitar'
        ? await supabase.from('conteo_no_va').delete().eq('store', store).eq('clave', clave)
        : await supabase.from('conteo_no_va').upsert(
            {
              store,
              clave,
              producto: b.producto ? String(b.producto).slice(0, 200) : null,
              variante: b.variante ? String(b.variante).slice(0, 100) : null,
              sku: b.sku ? String(b.sku).slice(0, 60) : null,
              // La firma sale del perfil, nunca del body.
              usuario: perfil.name || null,
            },
            { onConflict: 'store,clave' },
          );
      if (resp.error) {
        if (faltaTabla(resp.error.message)) return res.status(200).json({ ok: false, falta_tabla: true });
        throw new Error(resp.error.message);
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
