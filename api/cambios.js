// Cambios (post-venta) — tabla cambios (ver sql/migrate-cambios.sql). Local inicia, Admin motor.
// La venta de IDA (producto nuevo, baja stock) la crea el CLIENTE vía /api/crear-venta; acá se REGISTRA.
// El reingreso del devuelto es MANUAL (GN no acepta venta negativa por API) → se traza reingreso_estado.
//
//   GET  ?store=bdi|zattia[&reingreso=pendiente][&limit=]        → lista (opcional: solo pendientes de reingreso).
//   POST { store, action:'crear', orden_tn?, cliente?, via?, items_devueltos, items_nuevos, usuario? } → crea.
//   POST { store, action:'confirmar', id, gn_venta_ida_id?, gn_venta_ida_number?, via?, usuario? } → confirma (flujo viejo).
//   POST { store, action:'procesar', id, gn_venta_id?, gn_venta_number?, usuario? } → registra la venta REAL (B.4) → en_transito.
//   POST { store, action:'cobrado', id, usuario? }               → marca la diferencia como cobrada.
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

const ESTADOS = ['borrador', 'iniciado', 'confirmado', 'en_transito', 'recibido', 'cerrado', 'anulado'];
// Cambios SOLO por envío (el físico se hace presencial sin tool).
const VIAS = ['andreani', 'correo', 'cadete'];
const FORMAS = { tarjeta: 0, transferencia: 10 }; // % de descuento sobre la diferencia (Bruno)
const ENVIO_PAGA = ['nosotros', 'cliente'];
const COLS = 'id, store, orden_tn, cliente, via, estado, items_devueltos, items_nuevos, diferencia, diferencia_estado, reingreso_estado, seguimiento, gn_venta_ida_id, gn_venta_ida_number, envio_costo, envio_paga, forma_pago, descuento_forma, descuento_manual, pagado, cobro_estado, total, gn_venta_id, gn_venta_number, usuario, historial, created_at, updated_at';

const sumaItems = (its) => (Array.isArray(its) ? its : []).reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 1), 0);

function diferenciaDe(devueltos, nuevos) {
  const dif = sumaItems(nuevos) - sumaItems(devueltos);
  const estado = dif === 0 ? 'parejo' : dif > 0 ? 'a_cobrar' : 'a_devolver';
  return { diferencia: dif, diferencia_estado: estado };
}

// Total desglosado (mismo criterio que lib/cambios/tipos.ts calcularTotalCambio): el descuento por forma
// aplica SOLO sobre la diferencia a cobrar; el envío se suma solo si lo paga el cliente.
function totalDe(devueltos, nuevos, forma, envioCosto, envioPaga, descuentoManual) {
  const { diferencia } = diferenciaDe(devueltos, nuevos);
  const pct = forma && FORMAS[forma] != null ? FORMAS[forma] : 0;
  // Descuento manual en $ primero (topeado al subtotal), luego el % de forma sobre lo que queda.
  const manual = diferencia > 0 ? Math.min(Math.max(Number(descuentoManual) || 0, 0), diferencia) : 0;
  const base = Math.max(diferencia - manual, 0);
  const descuentoForma = diferencia > 0 ? Math.round((base * pct) / 100) : 0;
  const descuento = manual + descuentoForma;
  const envioACobrar = envioPaga === 'cliente' ? Number(envioCosto) || 0 : 0;
  return { diferencia, descuento_forma: pct, total: diferencia - descuento + envioACobrar };
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
        // Fase B.4: nace como BORRADOR (solicitud editable); la venta real se dispara al PROCESAR.
        const forma = FORMAS[b.forma_pago] != null ? b.forma_pago : null;
        const envio_paga = ENVIO_PAGA.includes(b.envio_paga) ? b.envio_paga : null;
        const envio_costo = b.envio_costo != null && b.envio_costo !== '' ? Number(b.envio_costo) : null;
        const descuento_manual = b.descuento_manual != null && b.descuento_manual !== '' ? Number(b.descuento_manual) : null;
        const { descuento_forma, total } = totalDe(devueltos, nuevos, forma, envio_costo, envio_paga, descuento_manual);
        const row = {
          store, orden_tn: b.orden_tn ? String(b.orden_tn) : null, cliente: b.cliente ? String(b.cliente) : null,
          via, estado: 'borrador', items_devueltos: devueltos, items_nuevos: nuevos,
          diferencia, diferencia_estado, reingreso_estado: 'pendiente', usuario,
          seguimiento: b.seguimiento ? String(b.seguimiento) : null,
          envio_costo, envio_paga, forma_pago: forma, descuento_forma, descuento_manual, total,
          pagado: b.pagado === true, cobro_estado: 'no_aplica',
          historial: [{ estado: 'borrador', at: new Date().toISOString(), usuario, nota: 'borrador' }],
        };
        const { data, error } = await supabase.from('cambios').insert(row).select('id').single();
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true, id: data?.id, diferencia, diferencia_estado, total });
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

      if (action === 'procesar') {
        // Se genera la venta REAL desde el botón "Marcar como pagado" → ya está cobrado al procesar.
        // El cambio pasa a 'en_transito' (el paquete del nuevo sale; el devuelto vuelve después) y el
        // cobro NO queda pendiente (el modelo viejo de "cobrar la diferencia después" se retiró).
        const upd = { estado: 'en_transito', cobro_estado: 'no_aplica', updated_at: new Date().toISOString() };
        if (b.gn_venta_id != null && b.gn_venta_id !== '') upd.gn_venta_id = String(b.gn_venta_id);
        if (b.gn_venta_number != null && b.gn_venta_number !== '') upd.gn_venta_number = String(b.gn_venta_number);
        upd.historial = await apilarHistorial(supabase, store, id, { estado: 'en_transito', at: new Date().toISOString(), usuario: b.usuario ? String(b.usuario) : null, nota: b.gn_venta_id ? `procesado · venta GN ${b.gn_venta_number || b.gn_venta_id}` : 'procesado' });
        const { error } = await supabase.from('cambios').update(upd).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'cobrado') {
        // El admin ya cobró la diferencia en GN → marca el cobro hecho.
        const hist = await apilarHistorial(supabase, store, id, { estado: null, at: new Date().toISOString(), usuario: b.usuario ? String(b.usuario) : null, nota: 'cobro marcado' });
        const { error } = await supabase.from('cambios').update({ cobro_estado: 'cobrado', historial: hist, updated_at: new Date().toISOString() }).eq('id', id).eq('store', store);
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
        // Fase B.4 — envío / forma de pago / pagado
        if (b.envio_costo !== undefined) campos.envio_costo = b.envio_costo != null && b.envio_costo !== '' ? Number(b.envio_costo) : null;
        if (b.envio_paga !== undefined) campos.envio_paga = ENVIO_PAGA.includes(b.envio_paga) ? b.envio_paga : null;
        if (b.forma_pago !== undefined) campos.forma_pago = FORMAS[b.forma_pago] != null ? b.forma_pago : null;
        if (b.descuento_manual !== undefined) campos.descuento_manual = b.descuento_manual != null && b.descuento_manual !== '' ? Number(b.descuento_manual) : null;
        if (b.pagado !== undefined) campos.pagado = b.pagado === true;
        // Recalcular diferencia + total si cambió algo que los afecta (líneas, forma, envío o descuento manual).
        const tocaTotal = Array.isArray(b.items_devueltos) || Array.isArray(b.items_nuevos) || b.forma_pago !== undefined || b.envio_costo !== undefined || b.envio_paga !== undefined || b.descuento_manual !== undefined;
        if (tocaTotal) {
          const devueltos = Array.isArray(b.items_devueltos) ? b.items_devueltos : undefined;
          const nuevos = Array.isArray(b.items_nuevos) ? b.items_nuevos : undefined;
          if (devueltos) campos.items_devueltos = devueltos;
          if (nuevos) campos.items_nuevos = nuevos;
          const { data: prev } = await supabase.from('cambios').select('items_devueltos, items_nuevos, forma_pago, envio_costo, envio_paga, descuento_manual').eq('id', id).eq('store', store).single();
          const d = devueltos ?? prev?.items_devueltos ?? [];
          const n = nuevos ?? prev?.items_nuevos ?? [];
          const forma = campos.forma_pago !== undefined ? campos.forma_pago : prev?.forma_pago;
          const envioCosto = campos.envio_costo !== undefined ? campos.envio_costo : prev?.envio_costo;
          const envioPaga = campos.envio_paga !== undefined ? campos.envio_paga : prev?.envio_paga;
          const descuentoManual = campos.descuento_manual !== undefined ? campos.descuento_manual : prev?.descuento_manual;
          const dif = diferenciaDe(d, n);
          const t = totalDe(d, n, forma, envioCosto, envioPaga, descuentoManual);
          campos.diferencia = dif.diferencia;
          if (b.diferencia_estado === undefined) campos.diferencia_estado = dif.diferencia_estado;
          campos.descuento_forma = t.descuento_forma;
          campos.total = t.total;
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
