// "Sistema" — Novedades (y más adelante los Manuales). Tabla `novedades` + `novedades_leidas`.
//
//   GET  ?recurso=sistema                              → { ok, novedades, leidas, puede }
//   POST { recurso:'sistema', action:'leida', id, version }
//   POST { recurso:'sistema', action:'novedad-guardar', novedad, subirVersion? }
//   POST { recurso:'sistema', action:'novedad-estado', id, estado }
//   POST { recurso:'sistema', action:'novedad-borrar', id }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=sistema`. El plan Hobby de
// Vercel admite 12 funciones y hay 9 usadas. Si alguien crea `api/novedades.js` "por prolijidad",
// **frena todos los deploys sin error visible**: Vercel sigue sirviendo la versión anterior y no
// avisa. Ya pasó una vez.
//
// # Tres diferencias con el molde de `_atencion.js`, que van escritas porque su ausencia se leería
// # como un olvido
//
// 1. **No valida `store`.** Una novedad es del sistema, no de una marca (ver el encabezado del
//    `.sql`). Pero el `Content-Type: application/json` del POST **sigue siendo obligatorio**: sin
//    él Vercel no parsea el cuerpo, y acá el síntoma sería "falta id" en vez de "store inválido".
// 2. **No usa `puedeVer` en el GET.** Las novedades las ve todo el equipo — es la contracara de que
//    existan. Alcanza con `exigirUsuario`. `novedades` está en `KEYS_SIN_PERMISO`.
// 3. **`autor` y `usuario` salen de `perfil.name`, NUNCA del body.** Si el nombre viajara del
//    cliente, cualquiera podría firmar como otro y marcar leído por otro. `action:'leida'` es la
//    única escritura abierta a todos, y sólo puede escribir SU propia fila.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { marcasConAcceso } from '../lib/permisos.core.js';
import { esEstado } from '../lib/novedades/estados.core.js';

/**
 * Siempre la base de BDI, tenga la sesión la marca que tenga. No es un descuido: acá no hay marca.
 * Además Zattia no tiene service key, y un registro de quién leyó qué no puede depender de la anon.
 */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

/** Publicar es cross-marca: tildado en cualquiera de las dos alcanza, porque esto no tiene marca. */
function puedePublicar(perfil) {
  return marcasConAcceso(perfil, 'novedades.publicar', ['bdi', 'zattia']).length > 0;
}

const CAMPOS = 'id, estado, importante, titulo, cuerpo, version, autor, publicada_at, created_at, updated_at';

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const yo = perfil.name || null;
  if (!yo) return res.status(400).json({ error: 'La sesión no tiene nombre; volvé a entrar.' });

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const supabase = createClient(cfg.url, cfg.key);
  const publicar = puedePublicar(perfil);

  try {
    if (req.method === 'GET' && String(req.query.vista || '') === 'lecturas') {
      // Quién leyó una novedad. Va aparte del GET general y bajo demanda: no tiene sentido que todo
      // el equipo se baje quién leyó qué cada vez que abre el monitor.
      if (!publicar) return res.status(403).json({ error: 'No tenés permiso para ver esto.' });
      const id = String(req.query.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const { data, error } = await supabase
        .from('novedades_leidas')
        .select('usuario, version, leida_at')
        .eq('novedad_id', id)
        .order('leida_at', { ascending: true });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, lecturas: data || [] });
    }

    if (req.method === 'GET') {
      // Quien no publica no ve los borradores: un borrador es un texto a medio escribir, y verlo
      // en la lista se leería como una novedad más.
      let q = supabase.from('novedades').select(CAMPOS).order('publicada_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
      if (!publicar) q = q.eq('estado', 'publicada');

      const [nov, lec] = await Promise.all([
        q,
        supabase.from('novedades_leidas').select('novedad_id, version, leida_at').eq('usuario', yo),
      ]);
      if (nov.error) throw new Error(nov.error.message);
      if (lec.error) throw new Error(lec.error.message);

      return res.status(200).json({
        ok: true,
        novedades: nov.data || [],
        leidas: lec.data || [],
        puede: { publicar },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = String(b.action || '');

    // Marcar leído lo puede hacer cualquiera que esté logueado, y sólo sobre sí mismo: el `usuario`
    // no se lee del cuerpo.
    if (action === 'leida') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const version = Number(b.version) || 1;
      const { error } = await supabase
        .from('novedades_leidas')
        .upsert([{ novedad_id: id, usuario: yo, version }], { onConflict: 'novedad_id,usuario,version' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (!publicar) return res.status(403).json({ error: 'No tenés permiso para publicar novedades.' });

    if (action === 'novedad-guardar') {
      const n = b.novedad || {};
      const id = String(n.id || '');
      const titulo = String(n.titulo || '').trim();
      const cuerpo = String(n.cuerpo || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!titulo) return res.status(400).json({ error: 'falta el título' });

      const { data: ya, error: errLeer } = await supabase.from('novedades').select('id, version, estado').eq('id', id).maybeSingle();
      if (errLeer) throw new Error(errLeer.message);

      // ⚠️ El `estado` del cuerpo se IGNORA a propósito, en las dos ramas. Una novedad nace en
      // borrador y se publica con `novedad-estado`, que es un acto aparte y explícito. Si el estado
      // pudiera venir del body, el script que las carga podría publicarlas solo — que es justo el
      // agujero que este diseño viene a cerrar.
      const campos = { titulo, cuerpo, importante: !!n.importante, updated_at: new Date().toISOString() };

      if (!ya) {
        const { error } = await supabase.from('novedades').insert([{ id, estado: 'borrador', version: 1, ...campos }]);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, id, estado: 'borrador' });
      }

      // Subir la versión es lo que hace que quien ya la leyó la vuelva a ver, sin borrarle la
      // lectura vieja. Se pide a mano: no toda corrección merece interrumpir a todo el mundo.
      const version = b.subirVersion ? Number(ya.version || 1) + 1 : ya.version;
      const { error } = await supabase.from('novedades').update({ ...campos, version }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id, estado: ya.estado, version });
    }

    if (action === 'novedad-estado') {
      const id = String(b.id || '');
      const estado = String(b.estado || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!esEstado(estado)) return res.status(400).json({ error: 'estado inválido' });

      const { data: ya, error: errLeer } = await supabase.from('novedades').select('id, publicada_at').eq('id', id).maybeSingle();
      if (errLeer) throw new Error(errLeer.message);
      if (!ya) return res.status(404).json({ error: 'esa novedad ya no existe' });

      const campos = { estado, updated_at: new Date().toISOString() };
      // La fecha de publicación y el autor se sellan la PRIMERA vez y no se vuelven a tocar:
      // despublicar y volver a publicar no la convierte en una novedad de hoy.
      if (estado === 'publicada' && !ya.publicada_at) {
        campos.publicada_at = new Date().toISOString();
        campos.autor = yo;
      }
      const { error } = await supabase.from('novedades').update(campos).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'novedad-borrar') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      // Las lecturas se van solas por el `on delete cascade`: si quedaran huérfanas, el conteo de
      // "leída por N" de otra novedad no cambia, pero la tabla junta basura que nadie limpia.
      const { error } = await supabase.from('novedades').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `action inválida (${action || 'vacía'})` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
