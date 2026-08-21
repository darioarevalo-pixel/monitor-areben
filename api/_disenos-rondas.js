// Las rondas de votación del tablero de diseños, vistas por el EQUIPO — tabla `disenos_rondas`
// (ver sql/migrate-disenos-votacion.sql).
//
//   GET  ?recurso=disenos-rondas&store=bdi|zattia                  → { ok, rondas: [...] } sin token
//   GET  ?recurso=disenos-rondas&store=&id=&vista=token            → { ok, token }
//   GET  ?recurso=disenos-rondas&store=&id=&vista=resultados       → { ok, ronda, boletas }
//   POST { recurso:'disenos-rondas', store, action:'crear', titulo, disenos, ids }
//   POST { recurso:'disenos-rondas', store, action:'cerrar', id }
//
// ⚠️ **Este archivo es el lado CON SESIÓN. El lado abierto a internet es `_disenos-votacion.js`**,
// y están separados a propósito: mismo criterio que `reclamos`/`reclamo` y `canjes`/`canje` en
// `api/postventa.js`. Un verbo sin login conviviendo con verbos con login en el mismo archivo es
// como se cuela el que se olvidó de pedir la sesión.
//
// El `token` NUNCA sale en el listado: es la llave del link público. Se pide aparte, de a uno, con
// `vista=token` — mismo criterio que `api/_reclamos.js`.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12
// funciones por deploy y cada archivo de ruta cuenta una.
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna } from '../lib/permisos.core.js';
import { snapshotDeRonda } from '../lib/disenos/votacion.core.js';

/** Días que vive el link. Cerrar la ronda lo revoca antes. Reclamos usa 15 y canjes 45; una ronda
 *  de diseños se decide en una semana, y 30 deja aire sin que un link quede dando vueltas un año. */
const DIAS_TOKEN = 30;

/** Idéntica a la de `api/_disenos.js`: la ronda vive en la base de la marca de su tablero. */
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

/** 64 hex. Nunca sembrado en el SQL: un token escrito en un archivo del repo es un token quemado. */
const nuevoToken = () => randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

/** Las columnas del listado. El `token` no está, y por eso no puede filtrarse por error. */
const COLS_LISTADO = 'id, store, titulo, token_vence, cerrada_at, creada_por, disenos, created_at';

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // El mismo permiso que el tablero: quien ve Diseños de esta marca, abre y cierra sus rondas. No
  // se copia el chequeo — se llama al único que hay (`lib/permisos.core.js`).
  if (!puedeVerAlguna(perfil, store, ['disenos'])) {
    return res.status(403).json({ error: 'No tenés acceso a Diseños en esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '');
      const vista = String(req.query.vista || '');

      if (vista === 'token') {
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { data, error } = await supabase.from('disenos_rondas').select('token').eq('store', store).eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return res.status(404).json({ error: 'ronda no encontrada' });
        return res.status(200).json({ ok: true, token: data.token });
      }

      if (vista === 'resultados') {
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { data: ronda, error: e1 } = await supabase.from('disenos_rondas').select(COLS_LISTADO).eq('store', store).eq('id', id).maybeSingle();
        if (e1) throw new Error(e1.message);
        if (!ronda) return res.status(404).json({ error: 'ronda no encontrada' });
        const { data: votos, error: e2 } = await supabase
          .from('disenos_votos')
          .select('votante_id, nombre, puntajes, updated_at')
          .eq('ronda_id', id)
          .order('updated_at', { ascending: true });
        if (e2) throw new Error(e2.message);
        return res.status(200).json({ ok: true, ronda, boletas: votos || [] });
      }

      // El listado trae el snapshot completo (con las URLs de las fotos) porque la pantalla lo usa
      // para pintar las miniaturas del resultado sin volver a pedir el tablero.
      const { data, error } = await supabase
        .from('disenos_rondas')
        .select(COLS_LISTADO)
        .eq('store', store)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      const rondas = data || [];

      // Cuántos votaron cada una, en UNA consulta y no una por ronda.
      let porRonda = {};
      if (rondas.length) {
        const { data: votos, error: e2 } = await supabase
          .from('disenos_votos')
          .select('ronda_id')
          .in('ronda_id', rondas.map((r) => r.id));
        if (e2) throw new Error(e2.message);
        porRonda = (votos || []).reduce((acc, v) => ({ ...acc, [v.ronda_id]: (acc[v.ronda_id] || 0) + 1 }), {});
      }
      return res.status(200).json({ ok: true, rondas: rondas.map((r) => ({ ...r, votantes: porRonda[r.id] || 0 })) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = String(b.action || '');

    if (action === 'crear') {
      // El snapshot se recorta ACÁ, no en la pantalla: lo que no pasa por `snapshotDeRonda` no
      // llega a la base, así que la `nota` del tablero no queda guardada ni aunque el cliente la
      // mande. Ver el encabezado de `lib/disenos/votacion.core.js`.
      const disenos = snapshotDeRonda(b.disenos, b.ids);
      if (!disenos.length) return res.status(400).json({ error: 'Elegí al menos un diseño para la ronda.' });
      const vence = new Date(Date.now() + DIAS_TOKEN * 24 * 60 * 60 * 1000).toISOString();
      const fila = {
        id: 'r' + randomUUID().replace(/-/g, '').slice(0, 12),
        store,
        titulo: String(b.titulo || '').slice(0, 120),
        token: nuevoToken(),
        token_vence: vence,
        creada_por: String(perfil.name || perfil.cuenta || '').slice(0, 80),
        disenos,
      };
      const { error } = await supabase.from('disenos_rondas').insert(fila);
      if (error) throw new Error(error.message);
      // El token vuelve UNA vez, acá, porque el que la crea es el que tiene que copiar el link.
      // Después ya no sale del listado y hay que pedirlo con `vista=token`.
      return res.status(200).json({ ok: true, id: fila.id, token: fila.token, token_vence: vence });
    }

    if (action === 'cerrar') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      // Cerrar revoca el link; los votos quedan y el resultado se sigue viendo desde adentro.
      const { error } = await supabase
        .from('disenos_rondas')
        .update({ cerrada_at: new Date().toISOString() })
        .eq('store', store)
        .eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'borrar') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      // `on delete cascade` se lleva las boletas. Es el único verbo que pierde votos.
      const { error } = await supabase.from('disenos_rondas').delete().eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'acción desconocida' });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 200) });
  }
}
