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
import { resumenLiviano, snapshotDeRonda } from '../lib/disenos/votacion.core.js';

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

/**
 * Las columnas del listado. El `token` no está, y por eso no puede filtrarse por error.
 *
 * 🔑 **`disenos` tampoco.** El snapshot congela la `url` de cada diseño y los viejos la tienen en
 * base64, así que el listado —hasta 50 rondas— mandaba megas de fotos para que la pantalla usara
 * `disenos.length`. Ahora sale `nDisenos`, que es un número. El snapshot completo se sigue
 * mandando en `vista=resultados`, la única pantalla que pinta miniaturas.
 */
const COLS_LISTADO = 'id, store, titulo, token_vence, cerrada_at, creada_por, created_at';

/** Lo mismo más el snapshot, para las dos vistas que sí lo necesitan. */
const COLS_CON_DISENOS = COLS_LISTADO + ', disenos';

/** Cuántos votaron cada ronda, en UNA consulta y no una por ronda. */
async function votantesDe(supabase, ids) {
  if (!ids.length) return {};
  const { data, error } = await supabase.from('disenos_votos').select('ronda_id').in('ronda_id', ids);
  if (error) throw new Error(error.message);
  const acc = {};
  for (const v of data || []) acc[v.ronda_id] = (acc[v.ronda_id] || 0) + 1;
  return acc;
}

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
        const { data: ronda, error: e1 } = await supabase.from('disenos_rondas').select(COLS_CON_DISENOS).eq('store', store).eq('id', id).maybeSingle();
        if (e1) throw new Error(e1.message);
        if (!ronda) return res.status(404).json({ error: 'ronda no encontrada' });
        ronda.nDisenos = Array.isArray(ronda.disenos) ? ronda.disenos.length : 0;
        const { data: votos, error: e2 } = await supabase
          .from('disenos_votos')
          .select('votante_id, nombre, puntajes, updated_at')
          .eq('ronda_id', id)
          .order('updated_at', { ascending: true });
        if (e2) throw new Error(e2.message);
        return res.status(200).json({ ok: true, ronda, boletas: votos || [] });
      }

      // El resumen: la cabecera de una ronda y `{n, promedio}` por diseño. **Sin una sola foto.**
      //
      // 🔑 Existe para que el ★ pueda estar en cada tarjeta del tablero, que es donde sirve. Por
      // `vista=resultados` eso costaría el snapshot entero —con las fotos en base64 de los diseños
      // viejos— en cada entrada a la sección, en cada cambio de pestaña y en cada cambio de marca.
      // Acá el snapshot se lee (hace falta para saber qué ids entran) pero **no se devuelve**: lo
      // consume `resumenLiviano`, que es la misma disciplina de whitelist que `paraElVotante` pero
      // por peso en vez de por privacidad. Payload ~1 KB, haya base64 o no.
      //
      // Sin `id` devuelve **la última ronda creada**. Es una regla explícita y no "la abierta": con
      // dos rondas, "la última" es predecible y no cambia sola el día que una vence.
      if (vista === 'resumen') {
        let q = supabase.from('disenos_rondas').select(COLS_CON_DISENOS).eq('store', store);
        if (id) q = q.eq('id', id);
        else q = q.order('created_at', { ascending: false }).limit(1);
        const { data: filas, error: e1 } = await q;
        if (e1) throw new Error(e1.message);
        const ronda = (filas || [])[0];
        // Sin ronda no es un error: es una marca que todavía no votó nada. La pantalla tiene que
        // poder decir "todavía no hay ninguna ronda" y no "no se pudo leer".
        if (!ronda) return res.status(200).json({ ok: true, ronda: null, votantes: 0, general: null, puntajes: {} });
        const { data: votos, error: e2 } = await supabase
          .from('disenos_votos')
          .select('nombre, puntajes')
          .eq('ronda_id', ronda.id);
        if (e2) throw new Error(e2.message);
        const boletas = votos || [];
        const todos = boletas.flatMap((b) => Object.values(b.puntajes || {})).filter((n) => Number.isFinite(n));
        return res.status(200).json({
          ok: true,
          ronda: {
            id: ronda.id,
            titulo: ronda.titulo,
            token_vence: ronda.token_vence,
            cerrada_at: ronda.cerrada_at,
            created_at: ronda.created_at,
            nDisenos: Array.isArray(ronda.disenos) ? ronda.disenos.length : 0,
          },
          votantes: boletas.length,
          // El promedio de la ronda entera. `null` y nunca 0: sin votos no es la peor nota.
          general: todos.length ? todos.reduce((a, b) => a + b, 0) / todos.length : null,
          puntajes: resumenLiviano(ronda, boletas),
        });
      }

      const { data, error } = await supabase
        .from('disenos_rondas')
        .select(COLS_CON_DISENOS)
        .eq('store', store)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      const rondas = data || [];

      const porRonda = await votantesDe(supabase, rondas.map((r) => r.id));
      // `disenos` se descarta acá: se pidió sólo para contar. Es lo que evita mandar hasta 50
      // snapshots con fotos para que la pantalla escriba "34 diseños".
      return res.status(200).json({
        ok: true,
        rondas: rondas.map(({ disenos, ...r }) => ({
          ...r,
          nDisenos: Array.isArray(disenos) ? disenos.length : 0,
          votantes: porRonda[r.id] || 0,
        })),
      });
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

    // ⚠️ El verbo acepta además el nombre viejo (`borrar`). **No es indecisión: es que una pestaña
    // abierta manda el verbo del bundle que bajó**, y el día del deploy los dos conviven.
    if (action === 'eliminar' || action === 'borrar') {
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
