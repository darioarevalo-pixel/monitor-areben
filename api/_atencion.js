// "Atención al cliente" — tabla `atencion` (ver sql/migrate-atencion.sql) + los links por modelo
// leídos del menú público de la tienda.
//
//   GET  ?recurso=atencion&store=bdi|zattia            → { ok, items, modelos, desdeSemilla }
//   POST { recurso:'atencion', store, items:[...] }    → upsert (uno o varios)
//   POST { recurso:'atencion', store, id, action:'borrar' }
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12
// funciones por deploy y cada archivo de ruta cuenta una.
//
// Los modelos se traen ACÁ y no en el navegador porque la tienda está en otro dominio y no manda
// CORS.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVer, puedeSub } from '../lib/permisos.core.js';
import { modelosDelMenu } from '../lib/atencion/modelos.core.js';
import { TIENDA_BASE } from '../lib/tienda.core.js';

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

/**
 * Los modelos del menú de la tienda. Si no contesta se devuelve `null` y el llamador cae a la
 * semilla: quien está atendiendo a alguien no se puede quedar con la pantalla vacía por un timeout.
 *
 * 6 segundos de tope. La función entera tiene 10 y la parte que importa —los items cargados— ya
 * está resuelta; no vale la pena arriesgar el request completo por el menú.
 */
async function traerModelos(store) {
  const base = TIENDA_BASE[store];
  if (!base) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(base, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'monitor-areben', Accept: 'text/html' },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const modelos = modelosDelMenu(await r.text(), base);
    return modelos.length ? modelos : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  if (!puedeVer(perfil, store, 'atencion')) {
    return res.status(403).json({ error: 'No tenés acceso a Atención al cliente en esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      // Los items y el menú en paralelo: son independientes y el menú es el lento de los dos.
      const [fila, modelos] = await Promise.all([
        supabase.from('atencion').select('datos').eq('store', store).order('updated_at', { ascending: false }),
        traerModelos(store),
      ]);
      if (fila.error) throw new Error(fila.error.message);
      return res.status(200).json({
        ok: true,
        items: (fila.data || []).map((r) => r.datos),
        modelos: modelos || [],
        // El front distingue "la tienda no contestó" de "esta marca no tiene modelos" para poder
        // decir cuál de las dos cosas pasó en vez de mostrar una lista muda.
        desdeSemilla: modelos === null,
        puede: { editar: puedeSub(perfil, store, 'atencion', 'editar') },
      });
    }

    if (req.method === 'POST') {
      // Copiar y pegar lo puede hacer cualquiera que vea la sección; tocar la lista, no.
      if (!puedeSub(perfil, store, 'atencion', 'editar')) {
        return res.status(403).json({ error: 'No tenés permiso para editar los links de esta marca.' });
      }
      const b = req.body || {};

      if (b.action === 'borrar') {
        const id = String(b.id || '');
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { error } = await supabase.from('atencion').delete().eq('store', store).eq('id', id);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      const entrada = Array.isArray(b.items) ? b.items : b.item ? [b.item] : [];
      const validos = entrada.filter((i) => i && i.id);
      if (!validos.length) return res.status(400).json({ error: 'falta el item (o no tiene id)' });

      const filas = validos.map((i) => ({
        id: String(i.id),
        store,
        tipo: i.tipo ? String(i.tipo) : null,
        datos: i,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('atencion').upsert(filas, { onConflict: 'store,id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, guardados: filas.length });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
