// La cola de redacción de descripciones de producto — tabla tn_descripciones
// (ver sql/migrate-tn-descripciones.sql).
//
//   GET  ?recurso=tn-desc&store=zattia                              → { ok, filas: [...] }
//   POST { recurso:'tn-desc', store, tn_id, nombre?, op:'insumo',   insumo }
//   POST { recurso:'tn-desc', store, tn_id, op:'borrador', borrador:{parrafo,bullets} }
//   POST { recurso:'tn-desc', store, tn_id, op:'aprobar' }
//   POST { recurso:'tn-desc', store, tn_id, op:'quitar' }
//
// 🔑 Dos niveles de permiso, y la línea está donde está el costo: cargar el INSUMO ("gasa,
// botones nacarados") lo hace el local y sólo pide la sección; aprobar un borrador pide el
// sub `publicar`, porque de ahí en adelante el texto sale a la tienda en vivo.
//
// ⛔ Este archivo NO escribe en TiendaNube. Escribir es otro verbo, en otro repo
// (`bdi-catalogo/api/tn-categorias.js`), y no hay ningún camino que haga las dos cosas.
//
// Es un archivo `_`: NO es una ruta. Entra por api/datos.js (el plan Hobby de Vercel admite
// 12 funciones por deploy y cada archivo de ruta cuenta una).
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';
import { puedeVerAlguna, puedeSub, esAdmin } from '../lib/permisos.core.js';

// `tn_descripciones` tiene RLS PRENDIDO: la clave pública no entra ni a leer ni a escribir.
// Acá pesa más que en ninguna otra tabla, porque adentro vive `html_previo` — la ÚNICA copia
// que existe de la descripción anterior, ya que TiendaNube no tiene historial. Con la pública
// las consultas no fallan: devuelven vacío, y eso se leería como "no hay respaldo". Se grita.
// Se mira **la clave, no el nombre de la variable** (en Vercel la de servicio puede estar
// cargada como `SUPABASE_KEY` a secas). Las keys de Supabase son JWT y traen el rol adentro.
function rolDe(key) {
  if (!key) return null;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString('utf8'));
    return payload.role || null;
  } catch {
    return null; // no es un JWT (formato nuevo sb_secret_/sb_publishable_): no se opina
  }
}

function cfgFor(store) {
  const key =
    store === 'zattia'
      ? process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY
      : process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
  const url =
    store === 'zattia'
      ? process.env.ZATTIA_SUPABASE_URL
      : process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co';
  return { url, key, esPublica: rolDe(key) === 'anon' };
}

const COLUMNAS =
  'tn_id, nombre, insumo, insumo_por, insumo_at, borrador, html_previo, hash_previo, html_escrito, verificado, estado, aprobado_por, aprobado_at, escrito_at, error, updated_at';

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const body = req.method === 'POST' ? req.body || {} : {};
  const store = String((req.method === 'POST' ? body.store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  if (!puedeVerAlguna(perfil, store, ['gen-desc'])) {
    return res.status(403).json({ error: 'No tenés acceso a Redacción en esta marca.' });
  }

  // 🔑 La firma sale de `perfil.name`, NO del body: si saliera del POST, el rastro de quién
  // aprobó un texto que salió a la tienda se podría firmar con el nombre de otro cambiando
  // un campo. Es el molde de `api/_canjes.js` y `api/_tn-fotos-verificadas.js`.
  const yo = perfil.name || null;
  const puedePublicar = esAdmin(perfil) || puedeSub(perfil, store, 'gen-desc', 'publicar');

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  if (cfg.esPublica) {
    const nombre = store === 'zattia' ? 'ZATTIA_SUPABASE_SERVICE_KEY' : 'SUPABASE_SERVICE_KEY';
    return res.status(500).json({
      ok: false,
      error: `En Vercel falta ${nombre} (la que hay es la clave pública). Esta tabla tiene RLS prendido y la pública no entra.`,
    });
  }
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('tn_descripciones').select(COLUMNAS).eq('store', store);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, filas: data || [], puedePublicar });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no soportado' });

    const tnId = body.tn_id != null ? String(body.tn_id) : '';
    if (!tnId) return res.status(400).json({ error: 'falta tn_id' });
    const op = String(body.op || '');
    const ahora = new Date().toISOString();

    if (op === 'quitar') {
      if (!puedePublicar) return res.status(403).json({ error: 'Sacar una fila de la cola pide el permiso de aprobar.' });
      const { error } = await supabase.from('tn_descripciones').delete().eq('store', store).eq('tn_id', tnId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    // El insumo lo carga el local: es la única op que NO pide `publicar`. Sin esto no hay
    // de dónde salga la tela, que es el dato que ni la foto ni Gestión Nube tienen.
    if (op === 'insumo') {
      const fila = {
        store,
        tn_id: tnId,
        nombre: body.nombre != null ? String(body.nombre) : null,
        insumo: String(body.insumo || '').trim() || null,
        insumo_por: yo,
        insumo_at: ahora,
        estado: String(body.insumo || '').trim() ? 'con-insumo' : 'sin-insumo',
        updated_at: ahora,
      };
      const { error } = await supabase.from('tn_descripciones').upsert(fila, { onConflict: 'store,tn_id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (!puedePublicar) return res.status(403).json({ error: 'Esta acción pide el permiso de aprobar y publicar.' });

    if (op === 'borrador') {
      const b = body.borrador;
      // ⛔ Se valida la FORMA acá aunque la pantalla ya haya validado: el handler es la
      // frontera, y un borrador que no es un objeto con bullets rompería la pantalla del
      // que lo abra después, no la del que lo guardó.
      if (!b || typeof b !== 'object' || typeof b.parrafo !== 'string' || !Array.isArray(b.bullets)) {
        return res.status(400).json({ error: 'borrador inválido: se espera {parrafo, bullets:[{etiqueta,texto}]}' });
      }
      const fila = {
        store,
        tn_id: tnId,
        nombre: body.nombre != null ? String(body.nombre) : null,
        borrador: b,
        estado: 'borrador',
        // Un borrador nuevo desaprueba lo que hubiera: si no, quedaría aprobado un texto
        // que nadie leyó, con la firma de quien aprobó el anterior.
        aprobado_por: null,
        aprobado_at: null,
        updated_at: ahora,
      };
      const { error } = await supabase.from('tn_descripciones').upsert(fila, { onConflict: 'store,tn_id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (op === 'aprobar') {
      // ⛔ No se aprueba lo que no está: sin borrador guardado, aprobar sellaría una firma
      // sobre nada y la fila diría "listo para publicar" con el campo vacío.
      const { data, error: e1 } = await supabase
        .from('tn_descripciones')
        .select('borrador')
        .eq('store', store)
        .eq('tn_id', tnId)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!data || !data.borrador) return res.status(400).json({ error: 'no hay borrador guardado para aprobar' });
      const { error } = await supabase
        .from('tn_descripciones')
        .update({ estado: 'aprobado', aprobado_por: yo, aprobado_at: ahora, updated_at: ahora })
        .eq('store', store)
        .eq('tn_id', tnId);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `op desconocida: ${op || '(vacía)'}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
