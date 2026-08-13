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
import { puedeVerAlguna } from '../lib/permisos.core.js';

// A diferencia de las otras tablas del monitor, `tn_fotos_verificadas` tiene RLS PRENDIDO: la
// clave pública no entra ni a leer ni a escribir (marcar "verificado" sin mirar es fabricar la
// mentira que la tabla existe para evitar). Por eso acá interesa si la key es la de servicio:
// con la pública las consultas no fallan con "permiso denegado", devuelven vacío — y eso se
// vería como "nunca revisaste nada", que es un error mudo. Se prefiere gritar.
//
// Se mira **la clave, no el nombre de la variable**: en Vercel la de servicio puede estar
// cargada como `SUPABASE_KEY` a secas, y chequear el nombre daba un falso "falta la clave"
// con la clave puesta. Las keys de Supabase son JWT y traen el rol adentro.
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
  // Solo se frena cuando se sabe con certeza que es la pública. Si el rol no se puede leer, se
  // deja pasar y contesta la base: mejor un error real que un bloqueo por las dudas.
  return { url, key, esPublica: rolDe(key) === 'anon' };
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  // 🔴 Hasta el 13-ago-2026 el control terminaba en `exigirUsuario`. Acá pesa más que en otros
  // lados: esta tabla es la que dice qué fotos ya se miraron, y marcar "verificado" desde una
  // cuenta cualquiera es exactamente la mentira que la tabla existe para evitar — el mismo
  // razonamiento que dos comentarios más arriba justifica su RLS. El permiso lo da la sección
  // que la usa, que es la de Tienda Nube (`components/tncat/FotosCard.tsx`).
  if (!puedeVerAlguna(perfil, store, ['tncat'])) {
    return res.status(403).json({ error: 'No tenés acceso a Tienda Nube en esta marca.' });
  }

  // 🔑 La firma sale de `perfil.name`, NO del body. Hasta el 13-ago-2026 salía de `b.usuario`,
  // o sea que el historial de una falla o de un conteo se podía firmar con el nombre de otro
  // —basta con cambiar un campo del POST— y el rastro de auditoría no valía nada. Los handlers
  // que ya lo hacían bien (`api/_canjes.js:498`, `api/_reclamos.js`) son el molde.
  const yo = perfil.name || null;

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
        usuario: yo,
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
