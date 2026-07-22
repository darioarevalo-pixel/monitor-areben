// Depósito de fallas (post-venta) — tabla fallas_deposito (ver sql/migrate-fallas*.sql).
// Flujo por roles: Local carga ('cargada', ubicacion 'local'), Administración recibe ('recibida',
// ubicacion 'deposito') y confirma ('confirmada'). La venta en GN (que descuenta) la crea el CLIENTE
// posteando a /api/crear-venta (tiene los tokens de ventas); acá solo se REGISTRA el resultado.
//
//   GET  ?store=bdi|zattia[&limit=]                          → lista las fallas de la marca.
//   POST { store, action:'crear', producto, sku?, cantidad?, motivo?, ubicacion?,
//          product_id?, size_id?, valuacion_costo?, valuacion_pvp_feria?, usuario? } → crea + barcode.
//   POST { store, action:'recibir', id, usuario? }           → ubicacion→deposito, estado 'recibida'.
//   POST { store, action:'confirmar', id, gn_venta_id?, gn_venta_number?, usuario? } → estado 'confirmada'.
//   POST { store, action:'estado', id, estado, usuario?, nota? } → vendida_feria | descartada, etc.
//   POST { store, action:'editar', id, ...campos }           → edita campos de una falla.
//
// Mismo molde que api/conteos-deposito.js y api/sku-map.js: escribe con la service key (se saltea
// RLS) y exige usuario logueado del Monitor.
import { createClient } from '@supabase/supabase-js';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

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

const ESTADOS = ['cargada', 'recibida', 'confirmada', 'en_deposito', 'vendida_feria', 'descartada'];
const COLS = 'id, store, sku, producto, cantidad, motivo, valuacion_costo, valuacion_pvp_feria, estado, ubicacion, product_id, size_id, barcode, gn_integration_id, gn_venta_id, gn_venta_number, usuario, historial, created_at, updated_at';

// Espejo de lib/postventa/barcode.ts (una función .js de Vercel no importa un .ts; se mantiene igual).
function generarBarcodeFalla(store, id) {
  const marca = (store || '').slice(0, 1).toUpperCase() || 'X';
  return `FAL${marca}${String(id).padStart(6, '0')}`;
}

// Campos editables por creación / edición (nunca store ni id ni historial directo).
function camposDe(b) {
  const f = {};
  if (b.sku !== undefined) f.sku = b.sku ? String(b.sku) : null;
  if (b.producto !== undefined) f.producto = String(b.producto || '');
  if (b.cantidad !== undefined) f.cantidad = Math.max(1, parseInt(b.cantidad, 10) || 1);
  if (b.motivo !== undefined) f.motivo = b.motivo ? String(b.motivo) : null;
  if (b.ubicacion !== undefined) f.ubicacion = b.ubicacion === 'deposito' ? 'deposito' : 'local';
  if (b.product_id !== undefined) f.product_id = b.product_id ? String(b.product_id) : null;
  if (b.size_id !== undefined) f.size_id = b.size_id ? String(b.size_id) : null;
  if (b.valuacion_costo !== undefined) f.valuacion_costo = b.valuacion_costo === '' || b.valuacion_costo == null ? null : Number(b.valuacion_costo);
  if (b.valuacion_pvp_feria !== undefined) f.valuacion_pvp_feria = b.valuacion_pvp_feria === '' || b.valuacion_pvp_feria == null ? null : Number(b.valuacion_pvp_feria);
  return f;
}

// Lee historial actual y le apila un evento (sin pisar lo anterior).
async function apilarHistorial(supabase, store, id, evento) {
  const { data: prev, error } = await supabase.from('fallas_deposito').select('historial').eq('id', id).eq('store', store).single();
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
      const { data, error } = await supabase
        .from('fallas_deposito')
        .select(COLS)
        .eq('store', store)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, fallas: data || [] });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const action = b.action || 'crear';

      if (action === 'crear') {
        if (!b.producto || !String(b.producto).trim()) return res.status(400).json({ error: 'falta el producto' });
        const usuario = b.usuario ? String(b.usuario) : null;
        const row = {
          store,
          estado: 'cargada',
          usuario,
          historial: [{ estado: 'cargada', at: new Date().toISOString(), usuario, nota: 'alta (local)' }],
          ...camposDe(b),
        };
        if (!row.ubicacion) row.ubicacion = 'local';
        const { data, error } = await supabase.from('fallas_deposito').insert(row).select('id').single();
        if (error) throw new Error(error.message);
        // El barcode se deriva del id (único por base): insert → generar → update.
        const barcode = generarBarcodeFalla(store, data.id);
        const { error: e2 } = await supabase.from('fallas_deposito').update({ barcode }).eq('id', data.id).eq('store', store);
        if (e2) throw new Error(e2.message);
        return res.status(200).json({ ok: true, id: data.id, barcode });
      }

      const id = parseInt(b.id, 10);
      if (!id) return res.status(400).json({ error: 'falta id' });

      if (action === 'recibir') {
        const hist = await apilarHistorial(supabase, store, id, { estado: 'recibida', at: new Date().toISOString(), usuario: b.usuario ? String(b.usuario) : null, nota: b.nota ? String(b.nota) : 'recibida en depósito' });
        const { error } = await supabase.from('fallas_deposito').update({ estado: 'recibida', ubicacion: 'deposito', historial: hist, updated_at: new Date().toISOString() }).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'venta') {
        // La venta en GN (precio 0, baja de stock) la dispara el CLIENTE al ENTREGAR (carga en Local).
        // Acá solo se REGISTRA el resultado. No cambia el estado (sigue 'cargada').
        const upd = { gn_integration_id: `falla-${id}`, updated_at: new Date().toISOString() };
        if (b.gn_venta_id != null && b.gn_venta_id !== '') upd.gn_venta_id = String(b.gn_venta_id);
        if (b.gn_venta_number != null && b.gn_venta_number !== '') upd.gn_venta_number = String(b.gn_venta_number);
        upd.historial = await apilarHistorial(supabase, store, id, { estado: 'cargada', at: new Date().toISOString(), usuario: b.usuario ? String(b.usuario) : null, nota: `venta GN ${b.gn_venta_number || b.gn_venta_id || ''} (baja de stock)` });
        const { error } = await supabase.from('fallas_deposito').update(upd).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'confirmar') {
        // Administración VALIDA los datos de la carga. NO toca GN (la venta ya se hizo al entregar).
        const hist = await apilarHistorial(supabase, store, id, { estado: 'confirmada', at: new Date().toISOString(), usuario: b.usuario ? String(b.usuario) : null, nota: 'datos confirmados' });
        const { error } = await supabase.from('fallas_deposito').update({ estado: 'confirmada', historial: hist, updated_at: new Date().toISOString() }).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'estado') {
        const estado = String(b.estado || '');
        if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'estado inválido' });
        const hist = await apilarHistorial(supabase, store, id, { estado, at: new Date().toISOString(), usuario: b.usuario ? String(b.usuario) : null, nota: b.nota ? String(b.nota) : null });
        const { error } = await supabase.from('fallas_deposito').update({ estado, historial: hist, updated_at: new Date().toISOString() }).eq('id', id).eq('store', store);
        if (error) throw new Error(error.message);
        return res.status(200).json({ ok: true });
      }

      if (action === 'editar') {
        const campos = camposDe(b);
        if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });
        campos.updated_at = new Date().toISOString();
        const { error } = await supabase.from('fallas_deposito').update(campos).eq('id', id).eq('store', store);
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
