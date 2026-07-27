// Devoluciones (post-venta) — tabla `devoluciones` (ver sql/migrate-devoluciones.sql).
//
// Cubre los tres escenarios con un solo motor: devolución total, parcial por falta de stock, y
// falla que vuelve por correo. Lo que los distingue no es el tipo de reclamo sino dos decisiones
// independientes: `destino_prenda` (qué pasa con la prenda) y `compensacion` (qué recibe el
// cliente). Ver el plan en ~/.claude/plans/hidden-rolling-zephyr.md.
//
//   GET  ?store=bdi|zattia[&estado=][&pendientes=1][&limit=]     → lista.
//   POST { store, action:'crear', orden_tn, items, motivo, ... } → crea el borrador + token.
//   POST { store, action:'decidir', id, destino_prenda, compensacion, montos… } → ADMIN.
//   POST { store, action:'reintegro', id, comprobante? }         → la plata devuelta. ADMIN.
//   POST { store, action:'anulacion', id }                       → la venta anulada en GN. ADMIN.
//   POST { store, action:'tn-stock', id }                        → variante corregida en TN. ADMIN.
//   POST { store, action:'estado', id, estado, nota? }           → cambia estado.
//   POST { store, action:'fotos', id, fotos }                    → suma fotos cargadas por el equipo.
//   POST { store, action:'falla', id, falla_ids }                → linkea las fallas creadas.
//   POST { store, action:'editar', id, ...campos }               → edita.
//   POST { store, action:'eliminar', id }                        → borra. ADMIN.
//
// ⚠️ DOS COSAS QUE NO HACE Y NO PUEDE HACER
//
// 1. **No anula la venta en Gestión Nube**: GN no lo expone por API (ver api/crear-venta.js y el
//    módulo lib/verif-ventas/, que existe solo para listar lo que hay que anular a mano). Por eso
//    `stock_estado` es una TRAZA de un paso manual, igual que el `reingreso_estado` de Cambios.
// 2. **No recalcula los montos.** El cálculo vive en UN solo lugar, `lib/devoluciones/tipos.ts`,
//    con tests. Replicarlo acá en JS sería el mismo espejo TS/JS que ya arrastra Cambios
//    (`totalDe` vs `calcularTotalCambio`), que es una fuente conocida de desincronización. Lo que
//    sí hace es **validar rangos**: nada negativo y nada por encima del total de la orden.
//
// A diferencia de _cambios.js —donde todo el gate de roles es client-side— acá las acciones que
// mueven plata exigen función de administración TAMBIÉN en el servidor.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';

function cfgFor(store) {
  if (store === 'zattia') {
    return { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY };
  }
  return { url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co', key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY };
}

// Los siete vigentes, más los dos históricos que quedaron en filas viejas (si se sacaran, editar
// un reclamo viejo lo rechazaría por "motivo inválido").
const MOTIVOS = [
  'arrepentimiento', 'no_esperaba', 'falla', 'faltante', 'mal_armado', 'no_llego', 'sin_stock',
  'no_era_lo_esperado', 'otro',
];
const EXPECTATIVAS = ['plata', 'mismo_producto', 'otro_producto', 'completar'];
const DESTINOS = ['stock', 'falla', 'no_salio', 'perdida'];
const COMPENSACIONES = ['plata_total', 'plata_parcial', 'otra_unidad', 'reenvio', 'cupon', 'ninguna'];
const ESTADOS = ['borrador', 'esperando_cliente', 'en_revision', 'resuelto', 'en_transito', 'recibido', 'cerrado', 'anulado'];
const PENDIENTES = ['pendiente', 'hecho', 'no_aplica'];
// Cómo vuelve la prenda. 'presencial' = la trae al local: sin envío, sin etiqueta, sin seguimiento.
const VIAS = ['correo', 'andreani', 'cadete', 'presencial'];

const COLS = `id, store, orden_tn, cliente, token_vence, motivo, motivo_detalle, relato_cliente, fotos,
  destino_prenda, compensacion, estado, items, monto_producto, monto_acordado, monto_envio_devuelto,
  monto_total, pago_metodo, pago_gateway, devolver_envio, retorno_sugerido, retorno_decidido,
  via_retorno, envio_costo, seguimiento_vuelta, envio_ida_costo, seguimiento_ida,
  gn_venta_id, gn_venta_number, gn_venta_reemplazo_id, gn_venta_reemplazo_number, stock_estado, reintegro_estado,
  tn_stock_estado, reintegro_at, reintegro_por, reintegro_comprobante, cupon_codigo, falla_ids,
  costo_caso, expectativa, reclamo_correo, reclamo_correo_estado, mensajes, items_correctos,
  usuario, historial, created_at, updated_at`.replace(/\s+/g, ' ');
// El `token` NUNCA sale en los listados: es la llave del link público. Se pide aparte, de a uno.

/** El día que el link deja de servir. Un reclamo no debería tardar más que esto. */
const DIAS_TOKEN = 15;

/** ¿Puede mover plata? Admin o función de administración. Es el gate que _cambios.js no tiene. */
function esAdministracion(perfil) {
  if (!perfil) return false;
  if (perfil.admin === true) return true;
  const fs = Array.isArray(perfil.funcion) ? perfil.funcion : [];
  return fs.includes('administracion');
}

const num = (v) => (v == null || v === '' ? null : Number(v));
const texto = (v) => (v == null || v === '' ? null : String(v));

/**
 * Historial append-only: se re-lee la fila, se apila el evento y se guarda. Mismo patrón que
 * `apilarHistorial` de _cambios.js — no es atómico, pero dos acciones simultáneas sobre el MISMO
 * reclamo no pasan en la práctica (lo maneja una persona por vez).
 */
async function apilar(supabase, id, evento, extra = {}) {
  const { data: previo } = await supabase.from('devoluciones').select('historial').eq('id', id).single();
  const historial = Array.isArray(previo?.historial) ? previo.historial : [];
  historial.push(evento);
  const { error } = await supabase.from('devoluciones').update({ ...extra, historial, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export default async function handler(req, res) {
  if (soloMismoOrigen(req, res, 'GET, POST, OPTIONS')) return;
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  const store = String((req.method === 'POST' ? (req.body || {}).store : req.query.store) || '').toLowerCase();
  if (!['bdi', 'zattia'].includes(store)) return res.status(400).json({ error: 'store inválido (usá bdi o zattia)' });

  const cfg = cfgFor(store);
  if (!cfg.url || !cfg.key) return res.status(500).json({ error: `Faltan credenciales de Supabase para ${store}.` });
  const supabase = createClient(cfg.url, cfg.key);
  const usuario = perfil.name || null;
  const ahora = () => new Date().toISOString();

  try {
    if (req.method === 'GET') {
      const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
      let q = supabase.from('devoluciones').select(COLS).eq('store', store).order('created_at', { ascending: false }).limit(limit);
      if (ESTADOS.includes(req.query.estado)) q = q.eq('estado', req.query.estado);
      // Lo que le falta algo: sirve para el aviso de "hay N reclamos con plata sin devolver".
      if (req.query.pendientes === '1') q = q.or('reintegro_estado.eq.pendiente,stock_estado.eq.pendiente,tn_stock_estado.eq.pendiente');
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, devoluciones: data || [] });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

    const b = req.body || {};
    const action = b.action || 'crear';

    if (action === 'crear') {
      const items = Array.isArray(b.items) ? b.items : [];
      if (!items.length) return res.status(400).json({ error: 'faltan los productos del reclamo' });
      const motivo = MOTIVOS.includes(b.motivo) ? b.motivo : 'otro';
      // El reclamo por falta de stock es el único que nace sabiendo qué pasa con la prenda: nada,
      // porque nunca salió. Y es el único que arranca con el pendiente de corregir TN.
      const sinStock = motivo === 'sin_stock';
      const vence = new Date(Date.now() + DIAS_TOKEN * 86400000).toISOString();
      const row = {
        store,
        orden_tn: texto(b.orden_tn),
        cliente: texto(b.cliente),
        token: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''), // 64 hex: no se adivina
        token_vence: vence,
        motivo,
        motivo_detalle: texto(b.motivo_detalle),
        expectativa: EXPECTATIVAS.includes(b.expectativa) ? b.expectativa : null,
        items_correctos: Array.isArray(b.items_correctos) ? b.items_correctos : [],
        // El pedido que se perdió en el camino arranca con el reclamo al transportista pendiente:
        // es plata recuperable y sin este pendiente no la persigue nadie.
        reclamo_correo_estado: motivo === 'no_llego' ? 'pendiente' : 'no_aplica',
        fotos: Array.isArray(b.fotos) ? b.fotos : [],
        destino_prenda: sinStock ? 'no_salio' : (DESTINOS.includes(b.destino_prenda) ? b.destino_prenda : null),
        estado: 'borrador',
        items,
        monto_producto: num(b.monto_producto),
        pago_metodo: texto(b.pago_metodo),
        pago_gateway: texto(b.pago_gateway),
        gn_venta_id: texto(b.gn_venta_id),
        gn_venta_number: texto(b.gn_venta_number),
        stock_estado: 'pendiente',
        reintegro_estado: 'pendiente',
        tn_stock_estado: sinStock ? 'pendiente' : 'no_aplica',
        usuario,
        historial: [{ estado: 'borrador', at: ahora(), usuario, nota: 'reclamo abierto' }],
      };
      const { data, error } = await supabase.from('devoluciones').insert(row).select('id, token').single();
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true, id: data?.id, token: data?.token });
    }

    const id = parseInt(b.id, 10);
    if (!id) return res.status(400).json({ error: 'falta id' });

    // ── Lo que mueve plata o toca stock: solo administración ──────────────────────
    const DE_ADMIN = ['decidir', 'reintegro', 'anulacion', 'tn-stock', 'eliminar'];
    if (DE_ADMIN.includes(action) && !esAdministracion(perfil)) {
      return res.status(403).json({ error: 'Esto lo hace Administración: pedile a alguien con ese permiso.' });
    }

    if (action === 'decidir') {
      // La decisión de fondo: qué pasa con la prenda y qué recibe el cliente. Se guarda también
      // lo que sugirió la cuenta, para poder ver después cuándo se fue en contra y si valió.
      const destino = DESTINOS.includes(b.destino_prenda) ? b.destino_prenda : null;
      const compensacion = COMPENSACIONES.includes(b.compensacion) ? b.compensacion : null;
      if (!destino || !compensacion) return res.status(400).json({ error: 'falta el destino de la prenda o la compensación' });

      const total = num(b.monto_total);
      if (total != null && total < 0) return res.status(400).json({ error: 'el monto no puede ser negativo' });
      // Red de seguridad contra un monto disparatado: nunca más que lo que se pagó por la orden.
      const techo = num(b.techo_orden);
      if (total != null && techo != null && total > techo + 1) {
        return res.status(400).json({ error: `el monto (${total}) supera lo que se pagó por la orden (${techo})` });
      }

      // Si la prenda no vuelve, no hay nada que esperar ni venta que anular por el retorno.
      const vuelve = destino === 'stock' || (destino === 'falla' && b.retorno_decidido === true);
      const extra = {
        destino_prenda: destino,
        compensacion,
        monto_producto: num(b.monto_producto),
        monto_acordado: num(b.monto_acordado),
        monto_envio_devuelto: num(b.monto_envio_devuelto),
        monto_total: total,
        devolver_envio: b.devolver_envio === true,
        retorno_sugerido: b.retorno_sugerido === true,
        retorno_decidido: b.retorno_decidido === true,
        via_retorno: VIAS.includes(b.via_retorno) ? b.via_retorno : null,
        envio_costo: num(b.envio_costo),
        envio_ida_costo: num(b.envio_ida_costo),
        costo_caso: num(b.costo_caso),
        cupon_codigo: texto(b.cupon_codigo),
        estado: vuelve ? 'en_transito' : 'resuelto',
        // Sin plata que devolver (le mandamos otra unidad o un cupón), el pendiente no aplica.
        reintegro_estado: compensacion === 'otra_unidad' || compensacion === 'ninguna' ? 'no_aplica' : 'pendiente',
        // Si se le manda otra unidad igual, el cliente se queda con lo que compró: **la venta
        // original NO se anula**. Anularla devolvería al stock una unidad que nunca volvió y
        // dejaría la venta sin registrar. En el resto de los casos sí hay que anularla.
        stock_estado: compensacion === 'otra_unidad' ? 'no_aplica' : 'pendiente',
      };
      await apilar(supabase, id, { estado: extra.estado, at: ahora(), usuario, nota: `decidido: ${destino} · ${compensacion}` }, extra);
      return res.status(200).json({ ok: true, estado: extra.estado });
    }

    if (action === 'reintegro') {
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: 'plata devuelta' }, {
        reintegro_estado: 'hecho',
        reintegro_at: ahora(),
        reintegro_por: usuario,
        reintegro_comprobante: texto(b.comprobante),
      });
      return res.status(200).json({ ok: true });
    }

    if (action === 'anulacion') {
      // No la anula: registra que alguien la anuló a mano en GN, porque la API no lo permite.
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: 'venta anulada a mano en GN' }, { stock_estado: 'hecho' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'tn-stock') {
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: 'stock corregido en TN' }, { tn_stock_estado: 'hecho' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'estado') {
      if (!ESTADOS.includes(b.estado)) return res.status(400).json({ error: 'estado inválido' });
      await apilar(supabase, id, { estado: b.estado, at: ahora(), usuario, nota: texto(b.nota) }, { estado: b.estado });
      return res.status(200).json({ ok: true });
    }

    if (action === 'fotos') {
      const nuevas = Array.isArray(b.fotos) ? b.fotos : [];
      if (!nuevas.length) return res.status(400).json({ error: 'no vinieron fotos' });
      const { data: previo } = await supabase.from('devoluciones').select('fotos').eq('id', id).single();
      const fotos = (Array.isArray(previo?.fotos) ? previo.fotos : []).concat(nuevas);
      await apilar(supabase, id, { estado: 'en_revision', at: ahora(), usuario, nota: `${nuevas.length} foto(s)` }, { fotos });
      return res.status(200).json({ ok: true, fotos: fotos.length });
    }

    if (action === 'falla') {
      const ids = (Array.isArray(b.falla_ids) ? b.falla_ids : []).map((n) => parseInt(n, 10)).filter(Boolean);
      if (!ids.length) return res.status(400).json({ error: 'faltan los ids de las fallas' });
      const { data: previo } = await supabase.from('devoluciones').select('falla_ids').eq('id', id).single();
      const falla_ids = [...new Set((Array.isArray(previo?.falla_ids) ? previo.falla_ids : []).concat(ids))];
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: `pasó a Fallas (${ids.join(', ')})` }, { falla_ids });
      return res.status(200).json({ ok: true, falla_ids });
    }

    if (action === 'editar') {
      const campos = {};
      if (b.orden_tn !== undefined) campos.orden_tn = texto(b.orden_tn);
      if (b.cliente !== undefined) campos.cliente = texto(b.cliente);
      if (b.motivo !== undefined && MOTIVOS.includes(b.motivo)) campos.motivo = b.motivo;
      if (b.motivo_detalle !== undefined) campos.motivo_detalle = texto(b.motivo_detalle);
      if (b.relato_cliente !== undefined) campos.relato_cliente = texto(b.relato_cliente);
      if (b.items !== undefined && Array.isArray(b.items)) campos.items = b.items;
      if (b.envio_costo !== undefined) campos.envio_costo = num(b.envio_costo);
      if (b.seguimiento_vuelta !== undefined) campos.seguimiento_vuelta = texto(b.seguimiento_vuelta);
      if (b.seguimiento_ida !== undefined) campos.seguimiento_ida = texto(b.seguimiento_ida);
      if (b.envio_ida_costo !== undefined) campos.envio_ida_costo = num(b.envio_ida_costo);
      if (b.via_retorno !== undefined && VIAS.includes(b.via_retorno)) campos.via_retorno = b.via_retorno;
      if (b.gn_venta_reemplazo_id !== undefined) campos.gn_venta_reemplazo_id = texto(b.gn_venta_reemplazo_id);
      if (b.gn_venta_reemplazo_number !== undefined) campos.gn_venta_reemplazo_number = texto(b.gn_venta_reemplazo_number);
      if (b.gn_venta_id !== undefined) campos.gn_venta_id = texto(b.gn_venta_id);
      if (b.gn_venta_number !== undefined) campos.gn_venta_number = texto(b.gn_venta_number);
      if (b.cupon_codigo !== undefined) campos.cupon_codigo = texto(b.cupon_codigo);
      if (b.expectativa !== undefined && EXPECTATIVAS.includes(b.expectativa)) campos.expectativa = b.expectativa;
      if (b.reclamo_correo !== undefined) campos.reclamo_correo = texto(b.reclamo_correo);
      if (b.items_correctos !== undefined && Array.isArray(b.items_correctos)) campos.items_correctos = b.items_correctos;
      if (b.reclamo_correo_estado !== undefined && PENDIENTES.includes(b.reclamo_correo_estado)) campos.reclamo_correo_estado = b.reclamo_correo_estado;
      // Los tres pendientes se pueden volver atrás a mano si alguien se apuró a tildarlos.
      for (const k of ['stock_estado', 'reintegro_estado', 'tn_stock_estado']) {
        if (b[k] !== undefined && PENDIENTES.includes(b[k])) campos[k] = b[k];
      }
      if (!Object.keys(campos).length) return res.status(400).json({ error: 'nada para editar' });
      const { error } = await supabase.from('devoluciones').update({ ...campos, updated_at: ahora() }).eq('id', id);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    if (action === 'eliminar') {
      const { error } = await supabase.from('devoluciones').delete().eq('id', id).eq('store', store);
      if (error) throw new Error(error.message);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `acción desconocida: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}
