// Cajón único de solicitudes — tabla `solicitudes` (ver sql/migrate-solicitudes.sql).
//
// Reemplaza a las dos claves del KV de bdi-catalogo (`sesionfotos:<marca>` /
// `solicitudesinternas:<marca>`), donde el historial entero era un solo JSON que se
// reescribía completo en cada guardado. Acá cada solicitud es una fila y se escribe sola.
//
//   GET  ?store=bdi|zattia|stunned[&kind=sesionfotos|solicitudesinternas][&limit=]  → lista.
//   POST { store, solicitud }        → upsert de UNA solicitud (por store+id).
//   POST { store, action:'borrar', id } → la borra.
//
// `stunned` es una LÍNEA, no una marca (ver docs/lineas.md): sus filas viven en la MISMA tabla de
// la base de Zattia, separadas por la columna `store`, que ya es parte de la clave (`store,id`).
// Quién decide a qué base va es `baseDeLinea`, el helper del núcleo — acá no se escribe la regla.
//
// El documento completo va en `datos`; las columnas de al lado se derivan de él para poder
// filtrar. La fuente de verdad es SIEMPRE `datos`: si mañana el motor agrega un campo, viaja
// solo, sin migración de esquema.
//
// Mismo molde que api/fallas.js y api/sku-map.js: service key (se saltea RLS) y exige usuario
// logueado del Monitor.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { baseDeLinea } from '../lib/lineas.core.js';

function cfgFor(store) {
  // Stunned comparte la base de Zattia: la traducción la hace el núcleo, no un `||` acá.
  if (baseDeLinea(store) === 'zattia') {
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

const KINDS = ['sesionfotos', 'solicitudesinternas'];

/**
 * Fila a partir del documento. Las columnas son proyecciones para filtrar; el documento
 * manda. `destino` sale de `tipo` (así lo llama el motor) y por defecto es retornable:
 * las de sesión de fotos históricas no tienen el campo y todas volvían.
 */
function filaDe(store, kind, s) {
  return {
    id: String(s.id),
    store,
    kind,
    motivo: s.motivo ? String(s.motivo) : null,
    destino: s.tipo === 'consumo' ? 'consumo' : 'retornable',
    estado: String(s.estado || 'pendiente'),
    creado: Number(s.creado) || null,
    creado_por: s.creadoPor ? String(s.creadoPor) : null,
    fecha: s.fecha ? String(s.fecha) : null,
    datos: s,
    updated_at: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  // 🔴 La lista literal que había acá era la que dejaba a Stunned sin sesión de fotos. `baseDeLinea`
  // acepta las tres líneas y devuelve `null` ante cualquier otra cosa — nunca una marca por descarte.
  if (!baseDeLinea(store)) return res.status(400).json({ error: 'store inválido (usá bdi, zattia o stunned)' });

  // 🔴 Hasta el 13-ago-2026 el control terminaba en `exigirUsuario`: cualquier cuenta válida del
  // Monitor —los puestos compartidos incluidos— leía el historial de solicitudes de las dos marcas y podía borrarlas.
  if (!puedeVerAlguna(perfil, store, ['solicitudes'])) {
    return res.status(403).json({ error: 'No tenés acceso a Solicitudes en esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const kind = req.query.kind ? String(req.query.kind) : null;
      if (kind && !KINDS.includes(kind)) return res.status(400).json({ error: 'kind inválido' });
      // Alto a propósito: la pantalla trabaja con el historial completo de la marca (igual
      // que cuando venía del KV). Si algún día molesta, se pagina por `creado`.
      const limit = Math.min(parseInt(req.query.limit, 10) || 2000, 5000);
      let q = supabase.from('solicitudes').select('datos').eq('store', store);
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q.order('creado', { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, list: (data || []).map((r) => r.datos) });
    }

    if (req.method === 'POST') {
      const b = req.body || {};

      if (b.action === 'borrar') {
        const id = String(b.id || '');
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { error } = await supabase.from('solicitudes').delete().eq('store', store).eq('id', id);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      const kind = String(b.kind || '');
      if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind inválido' });

      // Acepta una o varias: el guardado normal manda una, la migración manda un lote.
      const entrada = Array.isArray(b.solicitudes) ? b.solicitudes : b.solicitud ? [b.solicitud] : [];
      const validas = entrada.filter((s) => s && s.id);
      if (!validas.length) return res.status(400).json({ error: 'falta la solicitud (o no tiene id)' });

      const { error } = await supabase
        .from('solicitudes')
        .upsert(validas.map((s) => filaDe(store, kind, s)), { onConflict: 'store,id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, guardadas: validas.length });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
