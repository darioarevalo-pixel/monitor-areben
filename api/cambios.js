// Cambios (post-venta) — tabla cambios (ver sql/migrate-cambios.sql). Local inicia, Admin motor.
// La venta de IDA (producto nuevo, baja stock) la crea el CLIENTE vía /api/crear-venta; acá se REGISTRA.
// El reingreso del devuelto es MANUAL (GN no acepta venta negativa por API) → se traza reingreso_estado.
//
//   GET  ?store=bdi|zattia[&reingreso=pendiente][&limit=]        → lista (opcional: solo pendientes de reingreso).
//   POST { store, action:'crear', orden_tn?, cliente?, via?, items_devueltos, items_nuevos, usuario? } → crea.
//   POST { store, action:'confirmar', id, gn_venta_ida_id?, gn_venta_ida_number?, via?, usuario? } → confirma.
//   POST { store, action:'estado', id, estado, usuario?, nota? }  → cambia estado.
//   POST { store, action:'reingreso', id, usuario? }             → marca el reingreso como HECHO.
//   POST { store, action:'editar', id, ...campos }               → edita.
//   POST { store, action:'eliminar', id }                        → borra.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

function cfgFor(store) {
  if (store === 'zattia') {
    return { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY };
  }
  return { url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co', key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY };
}

const ESTADOS = ['iniciado', 'confirmado', 'en_transito', 'recibido', 'cerrado', 'anulado'];
// Cambios SOLO por envío (el físico se hace presencial sin tool).
const VIAS = ['andreani', 'correo', 'cadete'];
const COLS = 'id, store, orden_tn, cliente, via, estado, items_devueltos, items_nuevos, diferencia, diferencia_estado, reingreso_estado, seguimiento, gn_venta_ida_id, gn_venta_ida_number, usuario, historial, created_at, updated_at';

const sumaItems = (its) => (Array.isArray(its) ? its : []).reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 1), 0);

function diferenciaDe(devueltos, nuevos) {
  const dif = sumaItems(nuevos) - sumaItems(devueltos);
  const estado = dif === 0 ? 'parejo' : dif > 0 ? 'a_cobrar' : 'a_devolver';
  return { diferencia: dif, diferencia_estado: estado };
}

async function apilarHistorial(supabase, store, id, evento) {
  const { data: prev, error } = await supabase.from('cambios').select('historial').eq('id', id).eq('store', store).single();
  if (error) throw new Error(error.message);
  const hist = Array.isArray(prev?.historial) ? prev.historial : [];
  hist.push(evento);
  return hist;
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  if (!(await exigirUsuario(req, res))) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);

  try {
    if (req.method === 'GET') {
      const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
      let q = supabase.from('cambios').select(COLS).eq('store', store).order('created_at', { ascending: false }).limit(limit);
      if (req.query.reingreso === 'pendiente') q = q.eq('reingreso_estado', 'pendiente');
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, cambios: data || [] });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const action = b.action || 'crear';

      if (action === 'crear') {
        const devueltos = Array.isArray(b.items_devueltos) ? b.items_devueltos : [];
        const nuevos = Array.isArray(b.items_nuevos) ? b.items_nuevos : [];
        if (!devueltos.length && !nuevos.length) return res.status(400).json({ error: 'faltan productos del cambio' });
        const via = VIAS.includes(b.via) ? b.via : 'andreani';
        const usuario = b.usuario ? String(b.usuario) : null;
        const { diferencia, diferencia_estado } = diferenciaDe(devueltos, nuevos);
        const row = {
          store, orden_tn: b.orden_tn ? String(b.orden_tn) : null, cliente: b.cliente ? String(b.cliente) : null,
          via, estado: 'iniciado', items_devueltos: devueltos, items_nuevos: nuevos,
          diferencia, diferencia_estado, reingreso_estado: 'pendiente', usuario,
          seguimiento: b.seguimiento ? String(b.seguimiento) : null,
          historial: [{ estado: 'iniciado', at: new Date().toISOString(), usuario, nota: 'iniciado' }],
        };
        const { data, error } = await supabase.from('cambios').insert(row).select('id').single();
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, id: data?.id, diferencia, diferencia_estado });
      }

      const id = parseInt(b.id, 10);
      if (!id) return res.status(400).json({ error: 'falta id' });

      if (action === 'confirmar') {
        // La venta de ida ya la creó el cliente. Cambios son siempre por ENVÍO → queda 'en_transito'
        // (el paquete de ida sale; el reingreso del devuelto se hace a mano cuando vuelve).
        const via = VIAS.includes(b.via) ? b.via : null;
        const estado = 'en_transito';
        const upd = { estado, updated_at: new Date().toISOString() };
        if (via) upd.via = via;
        if (b.gn_venta_ida_id != null && b.gn_venta_ida_id !== '') upd.gn_venta_ida_id = String(b.gn_venta_ida_id);
        if (b.gn_venta_ida_number != null && b.gn_venta_ida_number !== '') upd.gn_venta_ida_number = String(b.gn_venta_ida_number);
        upd.historial = await apilarHistorial(supabase, store, id, { estado, at: new Date().toISOString(), usuario: b.usuario ? String(b.usuario) : null, nota: b.gn_venta_ida_id ? `confirmado · venta ida GN ${b.gn_venta_ida_number || b.gn_venta_ida_id}` : 'confirmado' });
        const { error } = await supabase.from('cambios').update(upd).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'reingreso') {
        // El admin ya reingresó el devuelto a mano en GN → se marca hecho. Si estaba 'recibido', pasa a 'cerrado'.
        const { data: prev, error: e0 } = await supabase.from('cambios').select('estado').eq('id', id).eq('store', store).single();
        if (e0) throw new Error(e0.message);
        const estado = prev?.estado === 'recibido' ? 'cerrado' : prev?.estado;
        const hist = await apilarHistorial(supabase, store, id, { estado, at: new Date().toISOString(), usuario: b.usuario ? String(b.usuario) : null, nota: 'reingreso hecho en GN (manual)' });
        const { error } = await supabase.from('cambios').update({ reingreso_estado: 'hecho', estado, historial: hist, updated_at: new Date().toISOString() }).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'estado') {
        const estado = String(b.estado || '');
        if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'estado inválido' });
        const hist = await apilarHistorial(supabase, store, id, { estado, at: new Date().toISOString(), usuario: b.usuario ? String(b.usuario) : null, nota: b.nota ? String(b.nota) : null });
        const { error } = await supabase.from('cambios').update({ estado, historial: hist, updated_at: new Date().toISOString() }).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'editar') {
        const campos = {};
        if (b.orden_tn !== undefined) campos.orden_tn = b.orden_tn ? String(b.orden_tn) : null;
        if (b.cliente !== undefined) campos.cliente = b.cliente ? String(b.cliente) : null;
        if (b.via !== undefined && VIAS.includes(b.via)) campos.via = b.via;
        if (b.seguimiento !== undefined) campos.seguimiento = b.seguimiento ? String(b.seguimiento) : null;
        if (b.diferencia_estado !== undefined) campos.diferencia_estado = b.diferencia_estado ? String(b.diferencia_estado) : null;
        if (Array.isArray(b.items_devueltos) || Array.isArray(b.items_nuevos)) {
          const devueltos = Array.isArray(b.items_devueltos) ? b.items_devueltos : undefined;
          const nuevos = Array.isArray(b.items_nuevos) ? b.items_nuevos : undefined;
          if (devueltos) campos.items_devueltos = devueltos;
          if (nuevos) campos.items_nuevos = nuevos;
          // Recalcular la diferencia si cambiaron las líneas (usa las nuevas o relee las viejas).
          const { data: prev } = await supabase.from('cambios').select('items_devueltos, items_nuevos').eq('id', id).eq('store', store).single();
          const d = devueltos ?? prev?.items_devueltos ?? [];
          const n = nuevos ?? prev?.items_nuevos ?? [];
          const dif = diferenciaDe(d, n);
          campos.diferencia = dif.diferencia;
          if (b.diferencia_estado === undefined) campos.diferencia_estado = dif.diferencia_estado;
        }
        if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });
        campos.updated_at = new Date().toISOString();
        const { error } = await supabase.from('cambios').update(campos).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'eliminar') {
        const { error } = await supabase.from('cambios').delete().eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'action inválida' });
    }

    return res.status(405).json({ error: 'método no permitido' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
