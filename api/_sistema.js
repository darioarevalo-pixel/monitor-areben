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
import { esParaMi, normalizarDestino } from '../lib/novedades/destino.core.js';

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

function puedeEditarManuales(perfil) {
  return marcasConAcceso(perfil, 'manuales.editar', ['bdi', 'zattia']).length > 0;
}

const CAMPOS = 'id, estado, importante, titulo, cuerpo, version, autor, publicada_at, destino, created_at, updated_at';

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const yo = perfil.name || null;
  if (!yo) return res.status(400).json({ error: 'La sesión no tiene nombre; volvé a entrar.' });

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const supabase = createClient(cfg.url, cfg.key);
  const publicar = puedePublicar(perfil);
  const editarManuales = puedeEditarManuales(perfil);

  try {
    if (req.method === 'GET' && String(req.query.vista || '') === 'manual') {
      // El CUERPO de un manual, al abrirlo. El índice ya viajó con el GET general.
      const id = String(req.query.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const { data, error } = await supabase.from('manuales').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return res.status(404).json({ error: 'ese manual ya no existe' });
      if (!data.publicado && !editarManuales) return res.status(403).json({ error: 'ese manual todavía no está publicado' });
      return res.status(200).json({ ok: true, manual: data });
    }

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

      // El ÍNDICE de manuales (sin cuerpo) viaja acá para que `SeccionHeader` sepa si dibujar el
      // botón "Cómo se usa" sin hacer una request por sección. Son ~40 filas de cuatro campos.
      const [nov, lec, man] = await Promise.all([
        q,
        supabase.from('novedades_leidas').select('novedad_id, version, leida_at').eq('usuario', yo),
        supabase.from('manuales').select('id, seccion, titulo, publicado').order('orden').order('titulo'),
      ]);
      if (nov.error) throw new Error(nov.error.message);
      if (lec.error) throw new Error(lec.error.message);
      if (man.error) throw new Error(man.error.message);

      // `paraMi` se calcula ACÁ y no en la pantalla, y son dos preguntas distintas:
      //  - quien publica RECIBE la lista entera, porque la tiene que administrar;
      //  - `paraMi` dice si además le toca a él, que es lo que mira el badge y el cartel.
      // A quien no publica se le sacan directamente las que no son suyas: que no le lleguen ni por
      // la red es más barato de razonar que confiar en que la pantalla las esconda.
      const conDestino = (nov.data || []).map((n) => ({ ...n, paraMi: esParaMi(n.destino, perfil) }));

      return res.status(200).json({
        ok: true,
        novedades: publicar ? conDestino : conDestino.filter((n) => n.paraMi),
        leidas: lec.data || [],
        // Los manuales sin publicar sólo los ve quien los edita: uno a medio escribir no ayuda.
        manuales: (man.data || []).filter((m) => m.publicado || editarManuales),
        puede: { publicar, editarManuales },
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

    if (action === 'manual-guardar' || action === 'manual-borrar') {
      if (!editarManuales) return res.status(403).json({ error: 'No tenés permiso para editar los manuales.' });

      if (action === 'manual-borrar') {
        const id = String(b.id || '');
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { error } = await supabase.from('manuales').delete().eq('id', id);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      const m = b.manual || {};
      const id = String(m.id || '');
      const titulo = String(m.titulo || '').trim();
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!titulo) return res.status(400).json({ error: 'falta el título' });

      // La sección NO se puede validar acá contra las keys reales: este archivo es JS plano y
      // `lib/nav.ts` es TypeScript. Se valida donde importa —el editor ofrece un desplegable con
      // las keys de verdad— y `tests/manuales.test.ts` amarra que lo cargado sea una key válida.
      // Acá sólo se corta lo absurdo, para que no entre un texto largo por error.
      const seccion = m.seccion ? String(m.seccion).slice(0, 60) : null;

      const fila = {
        id,
        seccion,
        titulo,
        cuerpo: String(m.cuerpo || ''),
        orden: Number.isFinite(Number(m.orden)) ? Number(m.orden) : 0,
        publicado: !!m.publicado,
        autor: yo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('manuales').upsert([fila], { onConflict: 'id' });
      if (error) {
        // El índice único parcial es el que impide dos manuales para la misma pantalla. Sin este
        // mensaje, Postgres contesta su texto crudo y el editor muestra un 500 indescifrable.
        if (String(error.message).includes('idx_manuales_seccion')) {
          return res.status(409).json({ error: 'Esa pantalla ya tiene un manual. Editá el que existe en vez de crear otro.' });
        }
        throw new Error(error.message);
      }
      return res.status(200).json({ ok: true, id });
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
      // El destino sí viaja en el cuerpo (a diferencia del estado): es parte de lo que se escribe,
      // no un permiso. `normalizarDestino` lo deja en algo válido pase lo que pase.
      const campos = {
        titulo,
        cuerpo,
        importante: !!n.importante,
        destino: normalizarDestino(n.destino),
        updated_at: new Date().toISOString(),
      };

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
