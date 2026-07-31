// Productos cuya vinculación foto→color ya se revisó a ojo — tabla tn_fotos_verificadas
// (ver sql/migrate-tn-fotos-verificadas.sql).
//
//   GET  ?recurso=fotos-verificadas&store=bdi|zattia   → { ok, verificadas: [{tn_id, huella}] }
//   POST { recurso:'fotos-verificadas', store, tn_id, huella, nombre?, usuario? } → verifica
//   POST { recurso:'fotos-verificadas', store, tn_id, action:'quitar' }           → lo desmarca
//
// La `huella` es lo que hace que esto no mienta: es la firma del estado de fotos al momento de
// revisar (`huellaDe` en lib/tncat/auditoria.ts). La pantalla la recalcula al abrir y compara —
// si alguien tocó las fotos, el producto vuelve solo a la lista de pendientes. Por eso es NOT
// NULL y por eso el POST la exige: una fila sin huella escondería el producto para siempre.
//
// Es un archivo `_`: NO es una ruta. Entra por api/datos.js (el plan Hobby de Vercel admite 12
// funciones por deploy y cada archivo de ruta cuenta una).
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario } from './_auth.js';

// A diferencia de las otras tablas del monitor, `tn_fotos_verificadas` tiene RLS PRENDIDO: la
// clave pública no entra ni a leer ni a escribir (marcar "verificado" sin mirar es fabricar la
// mentira que la tabla existe para evitar). Por eso acá interesa si la key es la de servicio:
// con la pública las consultas no fallan con "permiso denegado", devuelven vacío — y eso se
// vería como "nunca revisaste nada", que es un error mudo. Se prefiere gritar.
function cfgFor(store) {
  if (store === 'zattia') {
    const servicio = process.env.ZATTIA_SUPABASE_SERVICE_KEY;
    return { url: process.env.ZATTIA_SUPABASE_URL, key: servicio || process.env.ZATTIA_SUPABASE_KEY, servicio: !!servicio };
  }
  const servicio = process.env.SUPABASE_SERVICE_KEY;
  return {
    url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co',
    key: servicio || process.env.SUPABASE_KEY,
    servicio: !!servicio,
  };
}

export default async function handler(req, res) {
  if (!(await exigirUsuario(req, res))) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  if (!cfg.servicio) {
    const nombre = store === 'zattia' ? 'ZATTIA_SUPABASE_SERVICE_KEY' : 'SUPABASE_SERVICE_KEY';
    return res.status(500).json({
      ok: false,
      error: `Falta ${nombre} en Vercel: con la clave pública esta tabla no se puede leer ni escribir (tiene RLS prendido).`,
    });
  }
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('tn_fotos_verificadas')
        .select('tn_id, huella, nombre, usuario, updated_at')
        .eq('store', store);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, verificadas: data || [] });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const tnId = b.tn_id != null ? String(b.tn_id) : '';
      if (!tnId) return res.status(400).json({ error: 'falta tn_id' });

      if (b.action === 'quitar') {
        const { error } = await supabase.from('tn_fotos_verificadas').delete().eq('store', store).eq('tn_id', tnId);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      // Sin huella la fila escondería el producto para siempre: se rechaza.
      const huella = b.huella ? String(b.huella) : '';
      if (!huella) return res.status(400).json({ error: 'falta huella' });

      const row = {
        store,
        tn_id: tnId,
        huella,
        nombre: b.nombre ? String(b.nombre) : null,
        usuario: b.usuario ? String(b.usuario) : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('tn_fotos_verificadas').upsert(row, { onConflict: 'store,tn_id' });
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    // La tabla puede no estar creada todavía en una de las dos bases (la migración se corre por
    // marca). Sin esto el mensaje que llega a la pantalla es "relation ... does not exist", que
    // no le dice a nadie qué hacer. El resto de la sección funciona igual sin la tabla.
    const falta = /does not exist|schema cache|PGRST205|42P01/i.test(e.message || '');
    return res.status(500).json({
      ok: false,
      error: falta
        ? `Falta crear la tabla de revisiones en la base de ${store}. Corré sql/migrate-tn-fotos-verificadas.sql.`
        : e.message,
    });
  }
}
