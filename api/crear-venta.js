// Crea una venta en Gestión Nube para la "Sesión de fotos" (descuenta stock del depósito o del local).
// POST { store, origen:'deposito'|'local', items:[{product_id,size_id,quantity}], comments, solicitudId, user, pass }
// Seguridad: valida que (user, pass) sea un usuario válido del Monitor (login server-side).
// Usa GN_TOKEN_VENTAS (Zattia) / GN_TOKEN_VENTAS_BDI (BDI): token con permiso de ventas.
import { usuarioValido } from './_auth.js';

const GN_BASE = 'https://www.gestionnube.com/api/v1';

// Config descubierta de GN. store_id por ubicación (según cómo el Monitor cuenta deposito/local).
// BDI: deposito = Deposito Minorista (13307), local = Local (18393). channel 12 = "Ninguno".
const SF_CFG = {
  zattia: { client_id: 312923, channel_id: 12, sale_type_id: 1, currency_id: 1, store: { deposito: 18210, local: 11780 } },
  bdi:    { client_id: 338755, channel_id: 12, sale_type_id: 1, currency_id: 1, store: { deposito: 13307, local: 18393 } },
};
// Cliente propio para las ventas de FALLAS (payload con proposito:'falla'), distinto del de Sesión
// de fotos: así en GN cada venta técnica queda atribuida a su cliente correcto. Sin proposito, se usa
// el client_id de SF_CFG (fotos), o sea el comportamiento de siempre (compatible hacia atrás).
const FALLA_CLIENT = { zattia: 424420, bdi: 159334 };
// Ídem para las ventas de CAMBIOS (payload proposito:'cambio').
const CAMBIO_CLIENT = { zattia: 621329, bdi: 621331 };
// Fase B.4 — venta REAL del cambio (accion:'cambio_real'): usa un canal NORMAL (para que CUENTE en la
// analítica, NO el 12 "Ninguno") y la forma de pago real. IDs descubiertos escaneando ventas de GN
// (Bruno eligió: canal "Otro Canal" 13; Tarjeta → MercadoPago 2; Transferencia → Transferencia Bancaria 5).
// Son los IDs por defecto de GN (SF_CFG ya comparte el 12 "Ninguno" en las 2 cuentas) → mismos para ambas.
// ⚠ Zattia sin verificar (su token de lectura estaba vencido): confirmar con 1 cambio de prueba en Zattia.
const CAMBIO_CHANNEL = { zattia: 13, bdi: 13 };
const CAMBIO_PAYMENT = {
  zattia: { tarjeta: 2, transferencia: 5 },
  bdi: { tarjeta: 2, transferencia: 5 },
};
const TOKENS = { zattia: process.env.GN_TOKEN_VENTAS, bdi: process.env.GN_TOKEN_VENTAS_BDI };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gnFetch(url, opts, tries = 3) {
  let last;
  for (let a = 1; a <= tries; a++) {
    try { const r = await fetch(url, opts); if (r.ok) return r; last = r; if ((r.status === 429 || r.status >= 500) && a < tries) { await sleep(800 * a); continue; } return r; }
    catch (e) { last = e; if (a < tries) { await sleep(800 * a); continue; } throw e; }
  }
  return last;
}
// usuarioValido vivía acá; ahora es compartida (api/_auth.js) porque observaciones,
// inventario-vivo y conteos-deposito exigen lo mismo. Devuelve el perfil o null en
// vez de un booleano: el `if (!(await ...))` de abajo funciona igual.

// GN aplica el descuento POR LÍNEA como MONTO (ignora el `discount` a nivel venta en el POST — verificado).
// Reparte un descuento total entre las líneas prorrateando por subtotal; el remanente por redondeo va a la
// última línea, y cada descuento se topea al subtotal de su línea. Muta lineItems (agrega it.discount).
function repartirDescuento(lineItems, total) {
  const D = Math.max(0, Math.round(Number(total) || 0));
  if (!D || !lineItems.length) return;
  const subs = lineItems.map(it => (it.quantity || 0) * (it.unit_price || 0));
  const totalSub = subs.reduce((s, x) => s + x, 0) || 1;
  let asignado = 0;
  lineItems.forEach((it, i) => {
    let d = i === lineItems.length - 1 ? D - asignado : Math.round(D * subs[i] / totalSub);
    d = Math.min(Math.max(d, 0), subs[i]);
    it.discount = d; asignado += d;
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const b = req.body || {};
  const store = String(b.store || '').toLowerCase();
  const cfg = SF_CFG[store];
  if (!cfg) return res.status(400).json({ error: 'No hay configuración de ventas para esta cuenta.' });
  const TOKEN = TOKENS[store];
  if (!TOKEN) return res.status(500).json({ error: `Falta el token de ventas de GN para ${store} en el entorno.` });

  // ── Estado de una venta (solo lectura, sin login) — para saber si ya se anuló en GN ──
  if (b.accion === 'estado') {
    const ventaId = parseInt(b.ventaId, 10);
    if (!ventaId) return res.status(400).json({ error: 'ventaId inválido' });
    try {
      const r = await gnFetch(`${GN_BASE}/ventas/${ventaId}`, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
      if (r.status === 404) return res.status(200).json({ ok: true, existe: false });
      const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = null; }
      const v = (d && d.data) ? d.data : d;
      if (!r.ok || !v) return res.status(200).json({ ok: true, existe: true, desconocido: true });
      return res.status(200).json({ ok: true, existe: true, active: v.active, archived: v.archived, sale_state_id: v.sale_state_id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (!(await usuarioValido(b.user, b.pass))) return res.status(403).json({ error: 'Usuario o contraseña inválidos.' });

  // ── Venta REAL de un Cambio (Fase B.4) ── precio real + descuento + envío + forma de pago + canal normal
  // (CUENTA en la analítica). El cliente arma el descuento (Σdevueltos + % de la forma) y el shipping; acá
  // solo se relaya al payload de GN. Baja stock del producto NUEVO (el devuelto se reingresa aparte, manual).
  if (b.accion === 'cambio_real') {
    if (!['deposito', 'local'].includes(b.origen)) return res.status(400).json({ error: 'origen inválido' });
    const channel = CAMBIO_CHANNEL[store];
    const forma = String(b.forma_pago || '');
    const paymentId = (CAMBIO_PAYMENT[store] || {})[forma];
    if (!channel) return res.status(400).json({ error: `Falta configurar el canal de venta real del cambio para ${store} (CAMBIO_CHANNEL). Corré scripts/gn-formas-pago.mjs y completá el id.` });
    if (!paymentId) return res.status(400).json({ error: `Falta configurar la forma de pago "${forma || '—'}" del cambio para ${store} (CAMBIO_PAYMENT).` });
    const its = Array.isArray(b.items) ? b.items.filter(it => it && it.product_id && it.size_id && +it.quantity > 0) : [];
    if (!its.length) return res.status(400).json({ error: 'items vacíos' });
    const store_id = cfg.store[b.origen];
    const lineItems = its.map(it => ({ product_id: parseInt(it.product_id, 10), size_id: parseInt(it.size_id, 10), quantity: parseInt(it.quantity, 10), unit_price: Number(it.unit_price) || 0, store_id }));
    // Descuento del cambio (Σdevueltos + manual + forma) repartido POR LÍNEA (GN ignora el discount a nivel venta).
    repartirDescuento(lineItems, Number(b.descuento) || 0);
    const payload = {
      client_id: CAMBIO_CLIENT[store] || cfg.client_id, channel_id: channel, sale_type_id: cfg.sale_type_id, currency_id: cfg.currency_id,
      store_id, discount_inventory: true, payment_method_id: paymentId,
      comments: String(b.comments || '').slice(0, 500),
      integration_source: 'monitor-cambio', integration_id: `${b.solicitudId || 'cambio'}-real`,
      items: lineItems,
    };
    // El ENVÍO NO va a la venta de GN (queda solo en Monitor): el total de la venta = cobro de productos.
    payload.is_exchange = true;
    try {
      const r = await gnFetch(`${GN_BASE}/ventas`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
      const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 500); }
      if (!r.ok) return res.status(r.status).json({ error: 'GN rechazó la venta del cambio', status: r.status, detalle: d });
      const v = (d && d.data) ? d.data : d;
      return res.status(200).json({ ok: true, store_id, venta: { id: v && v.id, number: v && v.number } });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Crear venta ── (GN no soporta anular/borrar por API: eso se hace a mano en la web de GN)
  if (!['deposito', 'local'].includes(b.origen)) return res.status(400).json({ error: 'origen inválido' });
  // Reingreso (Cambios/Devoluciones): admite cantidad NEGATIVA para SUMAR stock. GN no tiene API de ingreso,
  // así que se prueba con una "venta" de cantidad negativa + discount_inventory. SOLO esta acción admite
  // negativos; el camino normal (fotos/solicitudes/fallas) sigue exigiendo quantity > 0.
  const esReingreso = b.accion === 'reingreso';
  const okQty = (it) => (esReingreso ? +it.quantity !== 0 : +it.quantity > 0);
  const items = Array.isArray(b.items) ? b.items.filter(it => it && it.product_id && it.size_id && okQty(it)) : [];
  if (!items.length) return res.status(400).json({ error: 'items vacíos' });

  const store_id = cfg.store[b.origen];
  // Las ventas de fallas usan su propio cliente de GN; el resto (fotos) sigue con el de SF_CFG.
  const clientId =
    (b.proposito === 'falla' && FALLA_CLIENT[store]) ? FALLA_CLIENT[store] :
    (b.proposito === 'cambio' && CAMBIO_CLIENT[store]) ? CAMBIO_CLIENT[store] :
    cfg.client_id;
  // Reingreso: el renglón lleva el PRECIO REAL (para que GN acepte la cantidad negativa), y un descuento a
  // nivel venta iguala el subtotal → total 0 (baja de plata nula, solo movimiento de stock).
  // Falla (proposito:'falla'): precio de LISTA + 100% de descuento → total $0, pero valuada con el precio real.
  // Fotos: precio 0 y sin descuento, idéntico a antes.
  const esFalla = b.proposito === 'falla';
  const lineItems = items.map(it => ({
    product_id: parseInt(it.product_id, 10),
    size_id: parseInt(it.size_id, 10),
    quantity: parseInt(it.quantity, 10),
    unit_price: (esReingreso || esFalla) ? (Number(it.unit_price) || 0) : 0,
    store_id,
  }));
  const payload = {
    client_id: clientId, channel_id: cfg.channel_id, sale_type_id: cfg.sale_type_id, currency_id: cfg.currency_id,
    store_id, discount_inventory: true,
    comments: String(b.comments || '').slice(0, 500),
    integration_source: 'monitor-sesion-fotos',
    integration_id: `${b.solicitudId || 'sf'}-${b.origen}`,
    items: lineItems,
  };
  if (esReingreso) {
    // discount a nivel venta = subtotal (negativo) → total 0. is_exchange marca el movimiento como cambio.
    payload.discount = lineItems.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    payload.is_exchange = true;
  } else if (esFalla) {
    // 100% de descuento POR LÍNEA (GN lo aplica como monto por ítem): descuento = subtotal → total 0.
    lineItems.forEach(it => { it.discount = it.quantity * it.unit_price; });
  }

  try {
    const r = await gnFetch(`${GN_BASE}/ventas`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 500); }
    if (!r.ok) return res.status(r.status).json({ error: 'GN rechazó la venta', status: r.status, detalle: d });
    const v = (d && d.data) ? d.data : d;
    return res.status(200).json({ ok: true, store_id, venta: { id: v && v.id, number: v && v.number } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
