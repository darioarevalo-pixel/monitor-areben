// Lectura del ledger del sync TN→GN — tabla `sync_procesados`.
//
//   GET  ?recurso=sync-tn&store=stunned[&tipo=venta][&desde=YYYY-MM-DD]  → { ok, rows }
//   POST { recurso:'sync-tn', store, ref_id, action:'liberar' }          → suelta una reserva trabada
//
// Es un archivo `_`: NO es una ruta, entra por api/datos.js (el plan Hobby admite 12 funciones y
// cada archivo de ruta cuenta una). La escritura de verdad —crear la venta en GN— NO vive acá:
// vive en api/crear-venta.js, que es el único lugar del repo con el token de ventas de GN.
//
// `liberar` es el desbloqueo MANUAL del caso dudoso: cuando GN cortó con 5xx y no se sabe si la
// venta se creó, la reserva queda puesta a propósito y sólo la suelta alguien que fue a mirar a GN.
import { exigirUsuario } from './_auth.js';
import { liberar, listar } from './_sync-ledger.js';

const STORES = ['bdi', 'zattia', 'stunned'];

export default async function handler(req, res) {
  if (!(await exigirUsuario(req, res))) return;

  const b = req.body || {};
  const store = String((req.method === 'POST' ? b.store : req.query.store) || '').toLowerCase();
  if (!STORES.includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi, zattia o stunned)' });

  try {
    if (req.method === 'GET') {
      const tipo = String(req.query.tipo || 'venta');
      const rows = await listar(store, tipo, req.query.desde || undefined);
      return res.status(200).json({ ok: true, rows });
    }

    if (req.method === 'POST' && b.action === 'liberar') {
      const ref = b.ref_id != null ? String(b.ref_id) : '';
      if (!ref) return res.status(400).json({ error: 'falta ref_id (el número de orden de TN)' });
      await liberar(store, ref);
      return res.status(200).json({ ok: true, liberada: ref });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
