// Reclamos (post-venta) — tabla `devoluciones` (ver sql/migrate-devoluciones.sql).
//
// Un solo motor para todo lo que sale mal después de una venta, **cambios incluidos**. Lo que
// distingue un caso de otro no es un "tipo de reclamo" sino dos decisiones independientes:
// `destino_prenda` (qué pasa con el producto) y `compensacion` (qué recibe el cliente). Un cambio es
// simplemente `compensacion='otro_producto'`: comparte tabla, número (`R-0042`) y pendientes.
//
//   GET  ?store=bdi|zattia[&estado=][&pendientes=1][&limit=]     → lista.
//   POST { store, action:'crear', orden_tn, items, motivo, ... } → crea el borrador + token.
//   POST { store, action:'decidir', id, destino_prenda, compensacion, montos… } → ADMIN.
//   POST { store, action:'cambio', id, items_nuevos, forma_pago, envio…, pagado? } → el POS.
//   POST { store, action:'procesar', id, gn_venta_id, gn_venta_number } → registra la venta del cambio.
//   POST { store, action:'reingreso', id }                       → el devuelto volvió al stock en GN.
//   POST { store, action:'cobrado', id }                         → la diferencia del cambio entró.
//   POST { store, action:'reintegro', id, comprobante? }         → la plata devuelta. ADMIN.
//   POST { store, action:'anulacion', id }                       → la venta anulada en GN. ADMIN.
//   POST { store, action:'tn-stock', id }                        → variante corregida en TN. ADMIN.
//   POST { store, action:'estado', id, estado, nota? }           → cambia estado.
//   POST { store, action:'fotos', id, fotos }                    → suma fotos cargadas por el equipo.
//   POST { store, action:'falla', id, falla_ids }                → linkea las fallas creadas.
//   POST { store, action:'editar', id, ...campos }               → edita.
//   POST { store, action:'eliminar', id }                        → borra. ADMIN.
//
// ⚠️ **`cambio` y `procesar` NO son de administración, a propósito.** Un cambio no es una decisión
// que alguien tenga que autorizar —ya se sabe qué se hace, se cobra la diferencia y listo—, así que
// el Local lo resuelve de punta a punta. Administración solo entra si la cuenta queda a favor del
// cliente, porque ahí sí sale plata de la caja: eso cae en `reintegro`, que sí está gateado.
//
// ⚠️ DOS COSAS QUE NO HACE Y NO PUEDE HACER
//
// 1. **No anula la venta en Gestión Nube ni reingresa lo devuelto**: GN no expone ninguna de las
//    dos por API (ver api/crear-venta.js y el módulo lib/verif-ventas/, que existe solo para listar
//    lo que hay que anular a mano). Por eso `stock_estado` y `reingreso_estado` son TRAZAS de pasos
//    manuales: lo que el sistema hace es no dejar que nadie se olvide.
// 2. **No recalcula los montos.** El cálculo vive en UN solo lugar, `lib/reclamos/tipos.ts`, con
//    tests. Replicarlo acá en JS sería un espejo TS/JS, que es una fuente conocida de
//    desincronización — ya pasó con el motor viejo de Cambios. Lo que sí hace es **validar
//    rangos**: nada negativo y nada por encima del total de la orden.
//
// Las acciones que mueven plata exigen función de administración TAMBIÉN en el servidor: el gate
// de la UI es comodidad, no seguridad.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { exigirUsuario, soloMismoOrigen } from './_auth.js';
// Los permisos se IMPORTAN, no se copian: la misma implementación que usa la app.
import { esAdmin, tieneFuncion } from '../lib/permisos.core.js';

function cfgFor(store) {
  if (store === 'zattia') {
    return { url: process.env.ZATTIA_SUPABASE_URL, key: process.env.ZATTIA_SUPABASE_SERVICE_KEY || process.env.ZATTIA_SUPABASE_KEY };
  }
  return { url: process.env.SUPABASE_URL || 'https://srqzzffmiiescffabtlc.supabase.co', key: process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY };
}

// Los ocho vigentes, más los dos históricos que quedaron en filas viejas (si se sacaran, editar
// un reclamo viejo lo rechazaría por "motivo inválido").
const MOTIVOS = [
  'arrepentimiento', 'no_esperaba', 'talle', 'falla', 'faltante', 'mal_armado', 'no_llego', 'sin_stock',
  'no_era_lo_esperado', 'otro',
];
const EXPECTATIVAS = ['plata', 'mismo_producto', 'otro_producto', 'completar'];
const DESTINOS = ['stock', 'falla', 'no_salio', 'perdida'];
const COMPENSACIONES = ['plata_total', 'plata_parcial', 'otra_unidad', 'otro_producto', 'reenvio', 'cupon', 'ninguna'];
const FORMAS_PAGO = ['tarjeta', 'transferencia'];
const ESTADOS = ['borrador', 'esperando_cliente', 'en_revision', 'resuelto', 'en_transito', 'recibido', 'cerrado', 'anulado'];
const PENDIENTES = ['pendiente', 'hecho', 'no_aplica'];
const COBROS = ['no_aplica', 'pendiente', 'cobrado'];
// Quién paga el envío del cambio. Cambia el total a cobrar, no solo la logística.
const ENVIO_PAGA = ['cliente', 'nosotros'];
// Cómo vuelve el producto. 'presencial' = la trae al local: sin envío, sin etiqueta, sin seguimiento.
const VIAS = ['correo', 'andreani', 'cadete', 'presencial'];

const COLS = `id, store, orden_tn, cliente, token_vence, motivo, motivo_detalle, relato_cliente, fotos,
  destino_prenda, compensacion, estado, items, monto_producto, monto_acordado, monto_envio_devuelto,
  monto_total, pago_metodo, pago_gateway, devolver_envio, retorno_sugerido, retorno_decidido,
  via_retorno, envio_costo, seguimiento_vuelta, envio_ida_costo, seguimiento_ida,
  gn_venta_id, gn_venta_number, gn_venta_reemplazo_id, gn_venta_reemplazo_number, stock_estado, reintegro_estado,
  tn_stock_estado, reintegro_at, reintegro_por, reintegro_comprobante, cupon_codigo, falla_ids,
  costo_caso, expectativa, reclamo_correo, reclamo_correo_estado, mensajes, items_correctos,
  items_nuevos, forma_pago, diferencia, descuento_manual, solicitud_envio,
  pagado, cobro_estado, envio_paga, reingreso_estado,
  usuario, historial, created_at, updated_at`.replace(/\s+/g, ' ');
// El `token` NUNCA sale en los listados: es la llave del link público. Se pide aparte, de a uno.

/** El día que el link deja de servir. Un reclamo no debería tardar más que esto. */
const DIAS_TOKEN = 15;

/** ¿Puede mover plata? Admin o función de administración. */
function esAdministracion(perfil) {
  return esAdmin(perfil) || tieneFuncion(perfil, 'administracion');
}

const num = (v) => (v == null || v === '' ? null : Number(v));
const texto = (v) => (v == null || v === '' ? null : String(v));

/**
 * Historial append-only: se re-lee la fila, se apila el evento y se guarda. No es atómico, pero dos
 * acciones simultáneas sobre el MISMO reclamo no pasan en la práctica (lo maneja una persona por
 * vez).
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
      // El link del cliente, de a uno y a pedido. No sale en el listado porque un listado se
      // loguea, se cachea y se comparte; el token es la llave del portal público.
      // Mismo molde que `vista=token` de Canjes (`_canjes.js`).
      if (req.query.vista === 'token') {
        const id = parseInt(req.query.id, 10);
        if (!id) return res.status(400).json({ error: 'falta id' });
        const { data, error } = await supabase
          .from('devoluciones').select('token, token_vence').eq('store', store).eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return res.status(404).json({ error: 'no existe ese reclamo' });
        return res.status(200).json({ ok: true, token: data.token || null, vence: data.token_vence || null });
      }

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
      // El reclamo por falta de stock es el único que nace sabiendo qué pasa con el producto: nada,
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

    // Regenerar el link del cliente. Hace falta porque el token vence a los DIAS_TOKEN y hasta
    // ahora no había forma de emitir uno nuevo: el reclamo quedaba sin link para siempre.
    // Solo mientras el portal siga sirviendo — una vez decidido el reclamo el link muere a
    // propósito y de ahí en más se le avisa por WhatsApp (ver `_reclamo.js`, ABIERTO).
    if (action === 'reemitir-token') {
      const { data: fila, error: eLee } = await supabase
        .from('devoluciones').select('estado').eq('store', store).eq('id', id).maybeSingle();
      if (eLee) throw new Error(eLee.message);
      if (!fila) return res.status(404).json({ error: 'no existe ese reclamo' });
      if (!['borrador', 'esperando_cliente', 'en_revision'].includes(fila.estado)) {
        return res.status(400).json({ error: 'El reclamo ya está decidido: el link del cliente no va más. Avisale por WhatsApp.' });
      }
      const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
      const vence = new Date(Date.now() + DIAS_TOKEN * 86400000).toISOString();
      await apilar(supabase, id, { estado: fila.estado, at: ahora(), usuario, nota: 'link del cliente regenerado' }, { token, token_vence: vence });
      return res.status(200).json({ ok: true, token, vence });
    }

    if (action === 'decidir') {
      // La decisión de fondo: qué pasa con el producto y qué recibe el cliente. Se guarda también
      // lo que sugirió la cuenta, para poder ver después cuándo se fue en contra y si valió.
      const destino = DESTINOS.includes(b.destino_prenda) ? b.destino_prenda : null;
      const compensacion = COMPENSACIONES.includes(b.compensacion) ? b.compensacion : null;
      if (!destino || !compensacion) return res.status(400).json({ error: 'falta el destino de el producto o la compensación' });

      const total = num(b.monto_total);
      if (total != null && total < 0) return res.status(400).json({ error: 'el monto no puede ser negativo' });
      // Red de seguridad contra un monto disparatado: nunca más que lo que se pagó por la orden.
      const techo = num(b.techo_orden);
      if (total != null && techo != null && total > techo + 1) {
        return res.status(400).json({ error: `el monto (${total}) supera lo que se pagó por la orden (${techo})` });
      }

      // Si el producto no vuelve, no hay nada que esperar ni venta que anular por el retorno.
      const vuelve = destino === 'stock' || (destino === 'falla' && b.retorno_decidido === true);
      // Un cambio no se salda con los pendientes de una devolución, y confundirlos lo dejaba
      // trabado sin poder cerrarse nunca. Ver el bloque `esCambio` más abajo.
      const esCambio = compensacion === 'otro_producto';
      const diferencia = num(b.diferencia);
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
        // El cambio por otro producto: lo que se lleva y cuánto queda de diferencia.
        items_nuevos: Array.isArray(b.items_nuevos) ? b.items_nuevos : [],
        forma_pago: FORMAS_PAGO.includes(b.forma_pago) ? b.forma_pago : null,
        diferencia,
        descuento_manual: num(b.descuento_manual),
        envio_paga: ENVIO_PAGA.includes(b.envio_paga) ? b.envio_paga : null,
        // **Un cambio decidido acá todavía no existe como cambio: queda en BORRADOR.**
        // Falta lo esencial —qué se lleva, la forma de pago, la diferencia, el cobro— y eso se
        // arma en el POS. Mandarlo a `en_transito` como al resto lo dejaba diciendo "En camino de
        // vuelta" sobre algo que nunca se armó, y encima fuera del estado en el que el POS ofrece
        // "Crear venta": el local no podía terminarlo.
        estado: esCambio ? 'borrador' : (vuelve ? 'en_transito' : 'resuelto'),
        // ── Los pendientes ────────────────────────────────────────────────────────
        //
        // **En un cambio son otros**, y tratarlo como una devolución lo dejaba imposible de
        // cerrar: se le exigía anular la venta original y devolver plata, y ninguna de las dos
        // corresponde. El cliente se queda con la compra —solo cambia el artículo—, así que la
        // venta NO se anula; y la plata sale únicamente si la diferencia quedó a favor suyo.
        // Lo que sí hay que hacer, y no existía como pendiente, es reingresar a mano lo devuelto:
        // GN no acepta una venta negativa por API.
        reintegro_estado: esCambio
          ? (diferencia != null && diferencia < 0 ? 'pendiente' : 'no_aplica')
          // Sin plata que devolver (le mandamos otra unidad o un cupón), el pendiente no aplica.
          : (compensacion === 'otra_unidad' || compensacion === 'ninguna' ? 'no_aplica' : 'pendiente'),
        // Si se le manda otra unidad igual, el cliente se queda con lo que compró: **la venta
        // original NO se anula**. Anularla devolvería al stock una unidad que nunca volvió y
        // dejaría la venta sin registrar. En el resto de los casos sí hay que anularla.
        stock_estado: esCambio || compensacion === 'otra_unidad' ? 'no_aplica' : 'pendiente',
        reingreso_estado: esCambio ? 'pendiente' : 'no_aplica',
        cobro_estado: esCambio && diferencia != null && diferencia > 0 ? 'pendiente' : 'no_aplica',
      };
      await apilar(supabase, id, { estado: extra.estado, at: ahora(), usuario, nota: `decidido: ${destino} · ${compensacion}` }, extra);
      return res.status(200).json({ ok: true, estado: extra.estado });
    }

    // ── El cambio: se arma en dos tiempos y NO lo aprueba Administración ──────────
    //
    // Está deliberadamente fuera de `DE_ADMIN`. Un cambio no es una decisión que alguien tenga que
    // autorizar: es una operación de mostrador donde ya se sabe qué se hace. Mientras `decidir`
    // estuvo siendo el único camino, el Local literalmente no podía armar uno.
    //
    // Guarda el borrador tal como esté, **sin exigir nada**: el cambio se arma en dos tiempos (se
    // elige qué devuelve y qué se lleva, sale la diferencia, se le pasa al cliente, y queda a medio
    // hacer hasta que paga). Lo que sí valida es el gate de facturar, en `procesar`.
    if (action === 'cambio') {
      const campos = {
        compensacion: 'otro_producto',
        destino_prenda: 'stock', // lo que vuelve en un cambio está sano y se revende
      };
      if (b.orden_tn !== undefined) campos.orden_tn = texto(b.orden_tn);
      if (b.cliente !== undefined) campos.cliente = texto(b.cliente);
      if (b.motivo !== undefined && MOTIVOS.includes(b.motivo)) campos.motivo = b.motivo;
      if (b.items !== undefined && Array.isArray(b.items)) campos.items = b.items;
      if (b.items_nuevos !== undefined && Array.isArray(b.items_nuevos)) campos.items_nuevos = b.items_nuevos;
      if (b.forma_pago !== undefined) campos.forma_pago = FORMAS_PAGO.includes(b.forma_pago) ? b.forma_pago : null;
      if (b.via_retorno !== undefined) campos.via_retorno = VIAS.includes(b.via_retorno) ? b.via_retorno : null;
      if (b.envio_paga !== undefined) campos.envio_paga = ENVIO_PAGA.includes(b.envio_paga) ? b.envio_paga : null;
      if (b.envio_costo !== undefined) campos.envio_costo = num(b.envio_costo);
      if (b.descuento_manual !== undefined) campos.descuento_manual = num(b.descuento_manual);
      if (b.solicitud_envio !== undefined) campos.solicitud_envio = texto(b.solicitud_envio);
      if (b.seguimiento_ida !== undefined) campos.seguimiento_ida = texto(b.seguimiento_ida);
      if (b.seguimiento_vuelta !== undefined) campos.seguimiento_vuelta = texto(b.seguimiento_vuelta);
      if (b.pagado !== undefined) campos.pagado = b.pagado === true;
      // La diferencia la calcula el cliente con `calcularCambio` (un solo lugar, con tests). Acá
      // solo se valida el rango: un cambio no puede cobrar más que el valor de lo que se lleva.
      if (b.diferencia !== undefined) {
        const d = num(b.diferencia);
        const techo = num(b.techo_nuevos);
        if (d != null && techo != null && d > techo + 1) {
          return res.status(400).json({ error: `la diferencia (${d}) supera lo que se lleva (${techo})` });
        }
        campos.diferencia = d;
      }
      // El cobro sigue a la diferencia salvo que ya se haya cobrado: no se pisa un cobro hecho.
      const { data: previo } = await supabase.from('devoluciones').select('cobro_estado').eq('id', id).single();
      if (campos.diferencia !== undefined && previo?.cobro_estado !== 'cobrado') {
        campos.cobro_estado = campos.diferencia > 0 ? 'pendiente' : 'no_aplica';
      }
      await apilar(supabase, id, { estado: 'borrador', at: ahora(), usuario, nota: b.pagado === true ? 'cambio marcado como pagado' : 'borrador del cambio guardado' }, campos);
      return res.status(200).json({ ok: true });
    }

    // Registra la venta REAL que ya se creó en Gestión Nube (la crea el cliente contra
    // `crear-venta.js`, que es el único que sabe hablar con GN). A partir de acá el producto que
    // vuelve queda como pendiente de reingreso MANUAL: la API de GN no acepta una venta negativa.
    if (action === 'procesar') {
      const extra = {
        gn_venta_id: texto(b.gn_venta_id),
        gn_venta_number: texto(b.gn_venta_number),
        pagado: true,
        estado: 'en_transito',
        reingreso_estado: 'pendiente',
        // La venta original no se anula nunca en un cambio: el cliente se queda con su compra.
        stock_estado: 'no_aplica',
      };
      await apilar(supabase, id, { estado: 'en_transito', at: ahora(), usuario, nota: `venta del cambio creada en GN${b.gn_venta_number ? ` (#${b.gn_venta_number})` : ''}` }, extra);
      return res.status(200).json({ ok: true });
    }

    // El producto devuelto volvió al stock a mano en GN. Como `anulacion`, es una TRAZA de un paso
    // manual: el sistema no lo hace ni puede hacerlo.
    if (action === 'reingreso') {
      await apilar(supabase, id, { estado: 'recibido', at: ahora(), usuario, nota: 'devuelto reingresado a mano en GN' }, { reingreso_estado: 'hecho' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'cobrado') {
      await apilar(supabase, id, { estado: 'resuelto', at: ahora(), usuario, nota: 'diferencia cobrada' }, { cobro_estado: 'cobrado' });
      return res.status(200).json({ ok: true });
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
      if (b.items_nuevos !== undefined && Array.isArray(b.items_nuevos)) campos.items_nuevos = b.items_nuevos;
      if (b.forma_pago !== undefined && FORMAS_PAGO.includes(b.forma_pago)) campos.forma_pago = b.forma_pago;
      if (b.solicitud_envio !== undefined) campos.solicitud_envio = texto(b.solicitud_envio);
      if (b.descuento_manual !== undefined) campos.descuento_manual = num(b.descuento_manual);
      if (b.envio_paga !== undefined && ENVIO_PAGA.includes(b.envio_paga)) campos.envio_paga = b.envio_paga;
      if (b.pagado !== undefined) campos.pagado = b.pagado === true;
      if (b.cobro_estado !== undefined && COBROS.includes(b.cobro_estado)) campos.cobro_estado = b.cobro_estado;
      if (b.reclamo_correo_estado !== undefined && PENDIENTES.includes(b.reclamo_correo_estado)) campos.reclamo_correo_estado = b.reclamo_correo_estado;
      // Los pendientes se pueden volver atrás a mano si alguien se apuró a tildarlos.
      for (const k of ['stock_estado', 'reintegro_estado', 'tn_stock_estado', 'reingreso_estado']) {
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
