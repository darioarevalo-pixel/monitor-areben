// Calendario editorial — tablas `calendario_hitos` y `calendario_fechas_fijadas`
// (ver sql/migrate-calendario.sql).
//
//   GET  ?recurso=calendario&store=bdi|zattia
//   POST { recurso:'calendario', store, hito:{...} }                       → alta / edición
//   POST { recurso:'calendario', store, id, action:'borrar' }
//   POST { recurso:'calendario', store, action:'fijar', clave, anio, fecha }
//   POST { recurso:'calendario', store, action:'desfijar', clave, anio }
//
// Las fechas comerciales NO se guardan: se calculan en `lib/calendario/fechas.core.js`. Acá vive
// sólo lo que una persona decide y la máquina no puede saber sola — los hitos propios, y la fecha
// real de una comercial anunciada (Hot Sale, CyberMonday, Día del Niño), que la define una cámara.
//
// ⚠️ **Por qué no cuelga de api/meta-ads.js**: ese endpoint corta con 500 si falta o vence
// `META_ADS_TOKEN`, y el calendario no tiene nada que ver con Meta. Que se caiga junto con el token
// sería atarlo a una dependencia que no tiene.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12
// funciones por deploy y cada archivo de ruta cuenta una.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, puedeVer } from '../lib/permisos.core.js';
import { CLAVES_COMERCIALES, CLAVES_TIPO_HITO } from '../lib/calendario/fechas.core.js';

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

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // Sin sub-permiso propio, y es deliberado: los subs NO se heredan de la función, así que ponerle
  // uno a "cargar un hito" garantizaría que nadie lo pueda usar hasta que alguien tildee a mano,
  // marca por marca, a todo el equipo. Es información interna de bajo riesgo — una fecha de
  // lanzamiento —, así que la carga cualquiera que ya vea la sección. Lo único reservado es borrar
  // un hito ajeno.
  if (!puedeVer(perfil, store, 'calendario')) {
    return res.status(403).json({ error: 'No tenés acceso al calendario en esta marca.' });
  }

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  const yo = perfil.name || null;
  const ahora = new Date().toISOString();

  try {
    if (req.method === 'GET') {
      const [h, f] = await Promise.all([
        supabase.from('calendario_hitos').select('datos').eq('store', store).order('fecha', { ascending: true }),
        supabase.from('calendario_fechas_fijadas').select('clave, anio, fecha, por').eq('store', store),
      ]);
      if (h.error) throw new Error(h.error.message);
      if (f.error) throw new Error(f.error.message);
      return res.status(200).json({
        ok: true,
        hitos: (h.data || []).map((r) => r.datos),
        fijadas: f.data || [],
        puede: { admin: esAdmin(perfil) },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
    const b = req.body || {};

    // ── Confirmar (o soltar) la fecha real de una comercial anunciada. ─────────────────────────
    if (b.action === 'fijar' || b.action === 'desfijar') {
      const clave = String(b.clave || '');
      const anio = Number(b.anio);
      // Se valida contra el catálogo a propósito: una clave inventada guardaría una fila que
      // después no se muestra en ningún lado y nadie entendería por qué la confirmación no tomó.
      if (!CLAVES_COMERCIALES.includes(clave)) return res.status(400).json({ error: `"${clave}" no es una fecha comercial conocida.` });
      if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return res.status(400).json({ error: 'año inválido' });

      if (b.action === 'desfijar') {
        const { error } = await supabase.from('calendario_fechas_fijadas')
          .delete().eq('store', store).eq('clave', clave).eq('anio', anio);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      const fecha = String(b.fecha || '');
      if (!ES_FECHA.test(fecha)) return res.status(400).json({ error: 'la fecha va como YYYY-MM-DD' });
      if (Number(fecha.slice(0, 4)) !== anio) return res.status(400).json({ error: 'la fecha no cae en el año que se está confirmando' });

      const { error } = await supabase.from('calendario_fechas_fijadas')
        .upsert([{ store, clave, anio, fecha, por: yo, updated_at: ahora }], { onConflict: 'store,clave,anio' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Hitos propios. ─────────────────────────────────────────────────────────────────────────
    if (b.action === 'borrar') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const { data, error: e0 } = await supabase.from('calendario_hitos')
        .select('creado_por').eq('store', store).eq('id', id).maybeSingle();
      if (e0) throw new Error(e0.message);
      if (!data) return res.status(200).json({ ok: true });
      if (!esAdmin(perfil) && String(data.creado_por || '') !== String(yo || '')) {
        return res.status(403).json({ error: 'Ese hito lo cargó otra persona: pedile a un admin que lo borre.' });
      }
      const { error } = await supabase.from('calendario_hitos').delete().eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    const entrada = b.hito;
    if (!entrada || !entrada.id) return res.status(400).json({ error: 'falta el hito (o no tiene id)' });
    const titulo = String(entrada.titulo || '').trim();
    if (!titulo) return res.status(400).json({ error: 'el hito necesita un título' });
    if (!ES_FECHA.test(String(entrada.fecha || ''))) return res.status(400).json({ error: 'la fecha va como YYYY-MM-DD' });
    const tipo = String(entrada.tipo || 'otro');
    if (!CLAVES_TIPO_HITO.includes(tipo)) return res.status(400).json({ error: `tipo inválido (usá ${CLAVES_TIPO_HITO.join(', ')})` });

    const { data: previo, error: e1 } = await supabase.from('calendario_hitos')
      .select('datos, creado_por').eq('store', store).eq('id', String(entrada.id)).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (previo && !esAdmin(perfil) && String(previo.creado_por || '') !== String(yo || '')) {
      return res.status(403).json({ error: 'Ese hito lo cargó otra persona: pedile a ella (o a un admin) que lo cambie.' });
    }

    const hito = {
      ...(previo?.datos || {}),
      ...entrada,
      id: String(entrada.id),
      titulo,
      tipo,
      // `firme: false` es una fecha proyectada, que se puede mover sin borrar nada. Es el default de
      // la nada porque una fecha que alguien tipeó sin marcarla firme casi nunca lo es.
      firme: entrada.firme === true,
      nota: entrada.nota ? String(entrada.nota) : null,
      creado: previo?.datos?.creado || Date.now(),
      creadoPor: previo?.creado_por || yo,
    };

    const { error } = await supabase.from('calendario_hitos').upsert([{
      id: hito.id,
      store,
      fecha: hito.fecha,
      firme: hito.firme,
      titulo: hito.titulo,
      tipo: hito.tipo,
      nota: hito.nota,
      creado_por: hito.creadoPor,
      datos: hito,
      updated_at: ahora,
    }], { onConflict: 'store,id' });
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true, hito });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
