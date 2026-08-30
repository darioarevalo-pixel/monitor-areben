// "Organización" — de quién es cada cosa, sin fecha. Tablas `organizacion_nodos` + `organizacion_resp`.
//
//   GET  ?recurso=organizacion                                   → { ok, nodos, resp, puede }
//   POST { recurso:'organizacion', action:'resp-guardar', resp }
//   POST { recurso:'organizacion', action:'resp-borrar', id }
//   POST { recurso:'organizacion', action:'nodo-guardar', nodo }
//   POST { recurso:'organizacion', action:'nodo-borrar', id }
//
// ⛔ Archivo `_`: NO es una ruta, entra por `api/datos.js` con `?recurso=organizacion`. El plan
// Hobby de Vercel admite 12 funciones y hay 7 usadas. Crear `api/organizacion.js` "por prolijidad"
// frena TODOS los deploys sin error visible. Ya pasó una vez.
//
// # Tres cosas que este handler NO hace, y van escritas para que su ausencia no se lea como olvido
//
// 1. **No valida `store`.** Quién responde de qué no cambia entre BDI y Zattia: es la misma persona
//    en las dos. Igual que `sistema` y `agenda`. El `Content-Type: application/json` del POST sigue
//    siendo obligatorio: sin él Vercel no parsea el cuerpo y el síntoma sería "falta id".
// 2. **No usa `puedeVer` en el GET.** `organizacion` está en `KEYS_PARA_TODOS`: la ve todo el
//    equipo, que es la contracara de que exista. Un reparto que sólo ve quien lo escribió no reparte
//    nada. Alcanza con `exigirUsuario`.
// 3. **No filtra por destino.** A diferencia de la Agenda, acá la pregunta no es "¿qué me toca?"
//    sino "¿de quién es esto?" — y ésa se hace sobre el trabajo de OTRO. Esconder lo ajeno rompería
//    justo el uso.
//
// 🔑 **`autor` sale de `perfil.name`, NUNCA del body**, como en `_sistema.js`.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { esAdmin, marcasConAcceso } from '../lib/permisos.core.js';
import { filaValida, visiblesPara } from '../lib/organizacion/core.js';

/** Los cinco sectores. Espejo de `Funcion` en `lib/permisos.ts:42`, que es TS y no se puede importar. */
const SECTORES = ['direccion', 'marketing', 'local', 'deposito', 'administracion'];
const TIPOS_NODO = ['sector', 'persona', 'puesto'];

/** Siempre la base de BDI: acá no hay marca. Mismo criterio que `_sistema.js`. */
function cfgMaestra() {
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
  };
}

/** Editar es cross-marca: tildado en cualquiera de las dos alcanza, porque esto no tiene marca. */
function puedeEditar(perfil) {
  return marcasConAcceso(perfil, 'organizacion.editar', ['bdi', 'zattia']).length > 0;
}

const CAMPOS_RESP = 'id, sector, persona, clase, titulo, detalle, manual_id, orden, activo, autor, created_at, updated_at';
const CAMPOS_NODO = 'id, label, tipo, padre_id, persona, nota, orden, activo, interno';

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const yo = perfil.name || null;
  if (!yo) return res.status(400).json({ error: 'La sesión no tiene nombre; volvé a entrar.' });

  const cfg = cfgMaestra();
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: 'Faltan credenciales de Supabase.' });
  const supabase = createClient(cfg.url, cfg.key);
  const editar = puedeEditar(perfil);

  try {
    if (req.method === 'GET') {
      // Las dos tablas juntas: son chicas (decenas de filas) y la pantalla siempre necesita las
      // dos — el organigrama dibuja a la persona y la ficha cuelga de ahí.
      //
      // ⚠️ **Se devuelven también las apagadas.** `activo:false` es "esto ya no es de nadie", que es
      // información, no basura; el filtro vive en el núcleo (`delSector`, `grises`) y la pantalla
      // decide si las muestra. Filtrarlas acá dejaría a quien edita sin poder reactivar una.
      const [nod, rsp] = await Promise.all([
        supabase.from('organizacion_nodos').select(CAMPOS_NODO).order('orden').order('label'),
        supabase.from('organizacion_resp').select(CAMPOS_RESP).order('orden').order('titulo'),
      ]);
      if (nod.error) throw new Error(nod.error.message);
      if (rsp.error) throw new Error(rsp.error.message);
      // Las ramas `interno` —la conducción del negocio: compras, mayorista, finanzas— ⛔ no se le
      // mandan a quien no es admin. Al lado de su sector son ruido, y esconderlas en la pantalla
      // dejaría el dato viajando: lo que no viaja no se dibuja por accidente.
      const nodos = visiblesPara(nod.data || [], esAdmin(perfil));
      return res.status(200).json({ ok: true, nodos, resp: rsp.data || [], puede: { editar } });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = String(b.action || '');
    if (!editar) return res.status(403).json({ error: 'No tenés permiso para editar la organización.' });

    if (action === 'resp-borrar' || action === 'nodo-borrar') {
      const id = String(b.id || '');
      if (!id) return res.status(400).json({ error: 'falta id' });
      const tabla = action === 'resp-borrar' ? 'organizacion_resp' : 'organizacion_nodos';
      // Un nodo con hijos no se elimina en silencio: los hijos suben a la raíz y el organigrama
      // queda diciendo otra cosa. Se avisa y no se toca.
      if (tabla === 'organizacion_nodos') {
        const { data: hijos, error: errH } = await supabase.from('organizacion_nodos').select('id').eq('padre_id', id).limit(1);
        if (errH) throw new Error(errH.message);
        if (hijos && hijos.length) {
          return res.status(409).json({ error: 'De ese nodo cuelga gente. Movelos primero, o apagalo en vez de eliminarlo.' });
        }
      }
      const { error } = await supabase.from(tabla).delete().eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'resp-guardar') {
      const r = b.resp || {};
      // 🔑 El mismo freno que corre la pantalla, corrido de nuevo acá. La pantalla puede estar
      // vieja, y un script puede postear sin pantalla ninguna.
      const motivo = filaValida(r, SECTORES);
      if (motivo) return res.status(400).json({ error: motivo });

      const fila = {
        id: String(r.id),
        sector: String(r.sector),
        // El vacío del formulario llega como `''` y NO es lo mismo que null: `''` sería una persona
        // que se llama "". Se normaliza acá, que es la frontera.
        persona: r.persona ? String(r.persona) : null,
        clase: String(r.clase),
        titulo: String(r.titulo).trim(),
        detalle: r.detalle ? String(r.detalle) : null,
        manual_id: r.manual_id ? String(r.manual_id) : null,
        orden: Number.isFinite(Number(r.orden)) ? Number(r.orden) : 0,
        activo: r.activo !== false,
        autor: yo,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('organizacion_resp').upsert([fila], { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id: fila.id });
    }

    if (action === 'nodo-guardar') {
      const n = b.nodo || {};
      const id = String(n.id || '');
      const label = String(n.label || '').trim();
      if (!id) return res.status(400).json({ error: 'falta id' });
      if (!label) return res.status(400).json({ error: 'falta el nombre del nodo' });
      const tipo = TIPOS_NODO.includes(String(n.tipo)) ? String(n.tipo) : 'persona';
      const padre = n.padre_id ? String(n.padre_id) : null;
      // Un nodo que cuelga de sí mismo desaparece del árbol (`arbol()` lo sube a la raíz, pero la
      // fila queda mintiendo). Se corta en la puerta.
      if (padre && padre === id) return res.status(400).json({ error: 'un nodo no puede colgar de sí mismo' });

      const fila = {
        id,
        label,
        tipo,
        padre_id: padre,
        persona: n.persona ? String(n.persona) : null,
        nota: n.nota ? String(n.nota) : null,
        interno: !!n.interno,
        orden: Number.isFinite(Number(n.orden)) ? Number(n.orden) : 0,
        activo: n.activo !== false,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('organizacion_nodos').upsert([fila], { onConflict: 'id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id });
    }

    return res.status(400).json({ error: `acción inválida (usá resp-guardar, resp-borrar, nodo-guardar, nodo-borrar)` });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'error' });
  }
}
