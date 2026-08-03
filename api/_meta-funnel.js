// Ideas de creativos + override de etapa — tablas `meta_ads_ideas` y `meta_ads_etapa`
// (ver sql/migrate-meta-funnel.sql).
//
//   GET  ?recurso=meta-funnel&store=bdi|zattia[&que=ideas|overrides|todo]
//   POST { recurso:'meta-funnel', store, idea:{...} }                      → alta / edición
//   POST { recurso:'meta-funnel', store, id, action:'estado', a, nota }    → mover de estado
//   POST { recurso:'meta-funnel', store, id, action:'borrar' }
//   POST { recurso:'meta-funnel', store, action:'clasificar', campaignId, etapa, … }
//   POST { recurso:'meta-funnel', store, action:'desclasificar', campaignId }
//
// ⚠️ **Por qué esto NO vive en api/meta-ads.js**, que sería el lugar obvio: ese endpoint corta con
// 500 si falta o vence `META_ADS_TOKEN` (mira el token antes que nada). El tablero de ideas no se
// puede morir justo cuando marketing tiene que estar craneando las piezas, y el calendario tampoco:
// nada de esto necesita hablar con Meta. Sólo el diagnóstico lo necesita, y ese sí está allá.
//
// Archivo `_`: no es una ruta (entra por api/datos.js). El plan Hobby de Vercel admite 12
// funciones por deploy y cada archivo de ruta cuenta una.
//
// ⚠️ Los permisos se IMPORTAN de lib/permisos.core.js y las transiciones de lib/meta-ads/ideas.core.js.
// Copiar un chequeo acá adentro es exactamente lo que dejó pausar campañas a quien tenía el permiso
// excluido: el handler y la pantalla tienen que leer las mismas líneas.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, puedeSub, puedeVer } from '../lib/permisos.core.js';
import { ETAPAS } from '../lib/meta-ads/etapas.core.js';
import { conPaso, puedeEditarIdea, puedeTransicionar, SUB_PAUTAR } from '../lib/meta-ads/ideas.core.js';

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

/** Quién es esta persona, en una marca, para esta sección. Una sola lectura de permisos. */
function poderes(perfil, store) {
  return {
    ver: puedeVer(perfil, store, 'meta-ads'),
    pautar: puedeSub(perfil, store, 'meta-ads', SUB_PAUTAR),
    admin: esAdmin(perfil),
  };
}

/** Quién firmó la acción. `perfil.name` es el campo que usa el resto de los handlers (`_canjes.js:399`). */
const quienEs = (perfil) => perfil?.name || null;

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  const puede = poderes(perfil, store);
  if (!puede.ver) return res.status(403).json({ error: 'No tenés acceso a Meta Ads en esta marca.' });

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  const leerIdea = async (id) => {
    const { data, error } = await supabase.from('meta_ads_ideas').select('datos, estado').eq('store', store).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { ...data.datos, estado: data.estado } : null;
  };

  try {
    if (req.method === 'GET') {
      const que = String(req.query.que || 'todo');
      const out = { ok: true, puede: { pautar: puede.pautar, admin: puede.admin } };

      if (que === 'ideas' || que === 'todo') {
        const { data, error } = await supabase
          .from('meta_ads_ideas').select('datos').eq('store', store).order('updated_at', { ascending: false });
        if (error) throw new Error(error.message);
        out.ideas = (data || []).map((r) => r.datos);
      }
      if (que === 'overrides' || que === 'todo') {
        const { data, error } = await supabase
          .from('meta_ads_etapa').select('campaign_id, etapa, objetivo, nombre, motivo, por, updated_at').eq('store', store);
        if (error) throw new Error(error.message);
        out.overrides = data || [];
      }
      return res.status(200).json(out);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const yo = quienEs(perfil);
    const ahora = new Date().toISOString();

    // ── El override de etapa. Es corregir el diagnóstico, así que lo hace quien pautea. ─────────
    if (b.action === 'clasificar' || b.action === 'desclasificar') {
      if (!puede.pautar) {
        return res.status(403).json({ error: 'Corregir la etapa de una campaña lo hace quien tenga el permiso «Puede aprobar ideas» (meta-ads.pautar).' });
      }
      const campaignId = String(b.campaignId || '');
      if (!campaignId) return res.status(400).json({ error: 'falta campaignId' });

      if (b.action === 'desclasificar') {
        const { error } = await supabase.from('meta_ads_etapa').delete().eq('store', store).eq('campaign_id', campaignId);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      const etapa = String(b.etapa || '');
      if (!ETAPAS.includes(etapa)) return res.status(400).json({ error: `etapa inválida (usá ${ETAPAS.join(', ')})` });

      // `objetivo` y `nombre` se guardan como estaban AL CORREGIR: si después se los cambian, la
      // pantalla puede avisar que el override quedó viejo en vez de mentir en silencio.
      const { error } = await supabase.from('meta_ads_etapa').upsert([{
        campaign_id: campaignId,
        store,
        cuenta_id: String(b.cuentaId || ''),
        etapa,
        objetivo: b.objetivo ? String(b.objetivo) : null,
        nombre: b.nombre ? String(b.nombre) : null,
        motivo: b.motivo ? String(b.motivo) : null,
        por: yo || 'desconocido',
        updated_at: ahora,
      }], { onConflict: 'store,campaign_id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Mover una idea de estado. La máquina la decide ideas.core.js, no este archivo. ──────────
    if (b.action === 'estado') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const idea = await leerIdea(id);
      if (!idea) return res.status(404).json({ error: 'esa idea no existe' });

      const a = String(b.a || '');
      const veredicto = puedeTransicionar(puede, idea.estado, a);
      if (!veredicto.ok) return res.status(403).json({ error: veredicto.motivo });

      const nota = b.nota ? String(b.nota).trim() : '';
      if (veredicto.transicion.exigeMotivo && !nota) {
        return res.status(400).json({ error: 'Descartar una idea pide el motivo: quien la anotó tiene que poder entender por qué no va.' });
      }

      const actualizada = conPaso({ ...idea, estado: a, campaignId: b.campaignId ? String(b.campaignId) : idea.campaignId || null }, {
        cuando: Date.now(), quien: yo, de: idea.estado, a, nota: nota || null,
      });
      const { error } = await supabase.from('meta_ads_ideas')
        .update({ estado: a, datos: actualizada, updated_at: ahora })
        .eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, idea: actualizada });
    }

    if (b.action === 'borrar') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const idea = await leerIdea(id);
      if (!idea) return res.status(200).json({ ok: true });
      if (!puedeEditarIdea(puede, idea, yo)) {
        return res.status(403).json({ error: 'Una idea la borra quien la anotó, y sólo mientras siga en propuesta.' });
      }
      const { error } = await supabase.from('meta_ads_ideas').delete().eq('store', store).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // ── Alta o edición de una idea. ────────────────────────────────────────────────────────────
    const entrada = b.idea;
    if (!entrada || !entrada.id) return res.status(400).json({ error: 'falta la idea (o no tiene id)' });
    if (!String(entrada.titulo || '').trim()) return res.status(400).json({ error: 'la idea necesita un título' });
    if (!ETAPAS.includes(String(entrada.etapa))) return res.status(400).json({ error: `etapa inválida (usá ${ETAPAS.join(', ')})` });

    const previa = await leerIdea(String(entrada.id));
    if (previa && !puedeEditarIdea(puede, previa, yo)) {
      return res.status(403).json({ error: 'Una idea la edita quien la anotó, y sólo mientras siga en propuesta.' });
    }

    // El estado NO viaja en el alta: una idea nace propuesta y de ahí en más se mueve por `estado`,
    // que es donde vive el control de quién puede qué. Aceptarlo acá sería la puerta de atrás.
    const idea = previa
      ? { ...previa, ...entrada, id: previa.id, estado: previa.estado, creado: previa.creado, creadoPor: previa.creadoPor }
      : conPaso({ ...entrada, estado: 'propuesta', creado: Date.now(), creadoPor: yo, historial: [] },
        { cuando: Date.now(), quien: yo, de: null, a: 'propuesta', nota: null });

    const { error } = await supabase.from('meta_ads_ideas').upsert([{
      id: String(idea.id),
      store,
      etapa: String(idea.etapa),
      estado: String(idea.estado),
      evento: idea.evento ? String(idea.evento) : null,
      titulo: String(idea.titulo),
      creado: idea.creado || Date.now(),
      creado_por: idea.creadoPor || null,
      datos: idea,
      updated_at: ahora,
    }], { onConflict: 'store,id' });
    if (error) throw new Error(error.message);
    return res.status(200).json({ ok: true, idea });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
