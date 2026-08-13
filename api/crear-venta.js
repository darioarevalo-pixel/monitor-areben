// Crea una venta en Gestión Nube para la "Sesión de fotos" (descuenta stock del depósito o del local).
// POST { store, origen:'deposito'|'local', items:[{product_id,size_id,quantity}], comments, solicitudId, user, pass }
// Seguridad: valida que (user, pass) sea un usuario válido del Monitor (login server-side).
// Usa GN_TOKEN_VENTAS (Zattia) / GN_TOKEN_VENTAS_BDI (BDI): token con permiso de ventas.
import { corsOrigenPropio, exigirUsuario } from './_auth.js';
import { confirmar as confirmarLedger, liberar as liberarLedger, reservar as reservarLedger } from './_sync-ledger.js';
// La nota de las ventas importadas de TN. Vive en `lib/` y en JS plano porque el dry-run de la
// pantalla muestra EXACTAMENTE esta nota antes de que alguien apriete Importar: si fueran dos
// implementaciones, la pantalla prometería una cosa y GN guardaría otra.
import { notaTnImport } from '../lib/sync-tn/nota.core.js';

const GN_BASE = 'https://www.gestionnube.com/api/v1';

// Config descubierta de GN. store_id por ubicación (según cómo el Monitor cuenta deposito/local).
// BDI: deposito = Deposito Minorista (13307), local = Local (18393). channel 12 = "Ninguno".
const SF_CFG = {
  zattia: { client_id: 312923, channel_id: 12, sale_type_id: 1, currency_id: 1, store: { deposito: 18210, local: 11780 } },
  bdi:    { client_id: 338755, channel_id: 12, sale_type_id: 1, currency_id: 1, store: { deposito: 13307, local: 18393 } },
  // STUNNED no tiene cuenta de GN propia: es la línea STU adentro del GN de Zattia, así que hereda
  // sus ubicaciones y su token. Sólo se usa para la acción `tn_import` (las ventas online que hoy
  // alguien carga a mano); no hay sesión de fotos ni fallas de Stunned.
  stunned: { client_id: null, channel_id: 12, sale_type_id: 1, currency_id: 1, store: { deposito: 18210, local: 11780 } },
};
// Cliente propio para las ventas de FALLAS (payload con proposito:'falla'), distinto del de Sesión
// de fotos: así en GN cada venta técnica queda atribuida a su cliente correcto. Sin proposito, se usa
// el client_id de SF_CFG (fotos), o sea el comportamiento de siempre (compatible hacia atrás).
const FALLA_CLIENT = { zattia: 424420, bdi: 159334 };
// Ídem para las ventas de CAMBIOS (payload proposito:'cambio').
const CAMBIO_CLIENT = { zattia: 621329, bdi: 621331 };
// Ídem para las entregas de CANJES en el local (payload proposito:'canje'). Es el cliente
// "PUBLICIDAD BDI" que ya existía en GN (id verificado contra la tabla `clientes` del espejo): un
// canje con una influencer ES publicidad, así que no se creó uno nuevo. Sólo BDI: es la única marca
// con local. Sin id, el handler corta con un error explícito en vez de caer al cliente de fotos —
// una venta atribuida al cliente equivocado no se puede corregir por API.
const CANJE_CLIENT = { bdi: 159249 };
// El canal de la entrega de un canje. Hoy 12 = "Ninguno", o sea VENTA TÉCNICA: `esVentaTecnica()`
// la reconoce y `lib/datos.ts` la descarta antes del ETL, así que esas unidades NO aparecen en
// rotación, vida útil, caducados ni CRM. Es la decisión de Bruno (11-ago-2026), tomada sabiendo eso.
// 🔑 Está acá y no sale de `cfg.channel_id` para que revertirla cueste una línea: el día que exista
// un canal propio "Canje" en GN, se cambia este número y se agrega `if (n.includes('canje')) return
// 'tecnica'` en `canalDe` (lib/liquidacion/resultado.ts) para que no ensucie el precio promedio.
const CANJE_CHANNEL = { bdi: 12 };
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
// ── Importación de una orden de Tienda Nube (acción `tn_import`) ──
// El cliente de GN al que se le atribuyen TODAS las ventas online de Stunned. Bruno lo creó a mano
// en el GN de Zattia (11-ago-2026). Sin id el handler CORTA con un error explícito (igual que
// CANJE_CLIENT) en vez de caer al cliente de fotos: una venta atribuida al cliente equivocado no se
// corrige por API.
// 📌 Ojo con lo que dábamos por sabido: `POST /clientes` **SÍ existe** en la API de GN (el `Allow`
// de la ruta dice `GET, HEAD, POST`; nunca se ejerció). O sea que dar de alta un cliente por
// comprador —como hace la integración NATIVA de TN, que creó el 645183 "Camila Galvan" con mail y
// teléfono— es posible. Hoy NO se hace: es una decisión de Bruno, porque llenaría el padrón de
// clientes de GN con cada comprador online. Mientras no se haga, quién compró vive en la NOTA
// (`lib/sync-tn/nota.core.js`) y en ningún otro lado.
// 🔑 Acá va el **id interno**, NO el `number` que se ve en la pantalla de GN. Se distinguen por el
// orden de magnitud: el `id` es un contador GLOBAL de GN (dos clientes creados a la vez en cuentas
// distintas salieron 621329 y 621331) y hoy anda por 64x.xxx; el `number` es por cuenta y en BDI
// recién llega a ~13.900 con 13.970 clientes. Un 6 dígitos es id; un 4-5 dígitos es number.
const TN_IMPORT_CLIENT = { stunned: 645285 };
// Canal 16 = "Tienda Nube" en GN (verificado: es el que filtra `verificar_ventas` en bdi-catalogo
// para cruzar contra las órdenes de TN). Es un canal NORMAL, no el 12 "Ninguno": si fuera el 12,
// `esVentaTecnica` la descartaría y la venta online de Stunned no aparecería en ningún reporte —
// que es exactamente el agujero que este sync viene a tapar.
const TN_IMPORT_CHANNEL = { stunned: 16 };

const TOKENS = {
  zattia: process.env.GN_TOKEN_VENTAS,
  bdi: process.env.GN_TOKEN_VENTAS_BDI,
  // Stunned vive en el GN de Zattia: mismo token.
  stunned: process.env.GN_TOKEN_VENTAS,
};

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

export default async function handler(req, res) {
  // El `*` que había acá dejaba que CUALQUIER sitio de internet le POSTeara al endpoint que crea
  // ventas reales en GN y descuenta stock. No era un resto: este endpoint SÍ se llama cruzando de
  // dominio (por URL absoluta, a propósito), así que sacarlo del todo habría roto Sesión de fotos,
  // Reclamos y Fallas. Lo que cambia es el `*` por la lista de `ORIGENES_PROPIOS`.
  if (corsOrigenPropio(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const b = req.body || {};
  const store = String(b.store || '').toLowerCase();
  const cfg = SF_CFG[store];
  if (!cfg) return res.status(400).json({ error: 'No hay configuración de ventas para esta cuenta.' });
  const TOKEN = TOKENS[store];
  if (!TOKEN) return res.status(500).json({ error: `Falta el token de ventas de GN para ${store} en el entorno.` });

  // `exigirUsuario` acepta el header `x-monitor-auth` Y el user/pass del body: es estrictamente más
  // permisivo que el chequeo que había, así que los llamadores viejos siguen andando igual, y los
  // nuevos pueden llamar con `apiFetch` como el resto del Monitor.
  //
  // 🔴 **Va ANTES de la rama `estado`, y eso cambió el 13-ago-2026.** Esa rama contestaba arriba
  // del guard, con el `Access-Control-Allow-Origin: *` de la línea 96 puesto: cualquiera en
  // internet podía preguntar por una venta arbitraria de Gestión Nube usando NUESTRO token, y
  // enumerar por `ventaId` hasta armarse el mapa de qué números existen y cuáles se anularon. Que
  // sea de sólo lectura no lo hace público: lee de nuestra cuenta.
  //
  // El único llamador es `consultarEstadoGN` (`lib/sesionfotos/ventas.ts`), que corre adentro del
  // Monitor con sesión abierta y pasó a mandar el sobre con `apiFetch`. No hay llamador anónimo
  // legítimo.
  const perfil = await exigirUsuario(req, res);
  if (!perfil) return;

  // ── Estado de una venta (solo lectura en GN) — para saber si ya se anuló ──
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

  // ── Importar una orden de Tienda Nube como venta de GN (sync de Stunned) ──
  // El orden de los pasos ES el diseño: se RESERVA en el ledger antes de postear. GN no anula
  // ventas por API ⇒ una duplicada se limpia a mano en la web de GN, así que ante cualquier duda
  // este handler prefiere no crear la venta.
  if (b.accion === 'tn_import') {
    const tnOrder = String(b.tn_order || '').trim();
    if (!tnOrder) return res.status(400).json({ error: 'falta tn_order (el número de orden de Tienda Nube)' });
    const clientId = TN_IMPORT_CLIENT[store];
    const channel = TN_IMPORT_CHANNEL[store];
    if (!clientId) return res.status(400).json({ error: `Falta el cliente de GN para las ventas importadas de ${store} (TN_IMPORT_CLIENT). Crealo en Gestión Nube y cargá el id.` });
    if (!channel) return res.status(400).json({ error: `Falta el canal de GN para las ventas importadas de ${store} (TN_IMPORT_CHANNEL).` });
    const its = Array.isArray(b.items) ? b.items.filter(it => it && it.product_id && it.size_id && Number.isInteger(+it.quantity) && +it.quantity > 0) : [];
    if (!its.length) return res.status(400).json({ error: 'items vacíos o con cantidades que GN no acepta' });
    if (its.length !== (b.items || []).length) return res.status(400).json({ error: 'hay renglones inválidos: la orden se importa entera o no se importa' });
    const origen = ['deposito', 'local'].includes(b.origen) ? b.origen : 'local';
    const store_id = cfg.store[origen];

    // 1) Reservar. Si otra corrida (u otra pestaña) ya la tomó, no se postea NADA.
    let reserva;
    try {
      reserva = await reservarLedger(store, tnOrder, { usuario: perfil.name || perfil.user || null, items: its.length });
    } catch (e) {
      return res.status(500).json({ error: `No se pudo reservar la orden en el registro: ${e.message}` });
    }
    if (reserva.ocupado) {
      return res.status(409).json({ ya: true, error: `La orden #${tnOrder} ya está tomada por el registro del sync.`, detalle: reserva.fila && reserva.fila.detalle });
    }

    const payload = {
      client_id: clientId, channel_id: channel, sale_type_id: cfg.sale_type_id, currency_id: cfg.currency_id,
      store_id, discount_inventory: true,
      comments: notaTnImport(tnOrder, b),
      // Campo propio de GN para el número de orden de TN. Lo llena la integración NATIVA, y el motor
      // del sync ya lo lee para reconocer una orden como "ya está en GN" (lib/sync-tn/core.ts). Si GN
      // lo acepta en el POST, nuestras ventas quedan reconocibles por ese camino además de por
      // `integration_id`, y se cruzan igual que las nativas. Si lo ignora, no rompe nada.
      tn_order: tnOrder,
      integration_source: 'monitor-sync-tn', integration_id: tnOrder,
      items: its.map(it => ({ product_id: parseInt(it.product_id, 10), size_id: parseInt(it.size_id, 10), quantity: parseInt(it.quantity, 10), unit_price: Number(it.unit_price) || 0, store_id })),
      discount_amount: Math.max(0, Math.round(Number(b.descuento) || 0)),
    };

    try {
      // 2) Postear a GN.
      const r = await gnFetch(`${GN_BASE}/ventas`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
      const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t.slice(0, 500); }
      if (!r.ok) {
        // 4xx = rechazo determinístico: la venta NO se creó. Se suelta la reserva para poder
        // corregir el mapeo y reintentar. Un 5xx cae al catch de abajo, que es otra historia.
        if (r.status >= 400 && r.status < 500) {
          await liberarLedger(store, tnOrder).catch(() => {});
          return res.status(r.status).json({ error: 'Gestión Nube rechazó la venta', status: r.status, detalle: d });
        }
        await confirmarLedger(store, tnOrder, { estado: 'dudoso', error: `GN ${r.status}` }).catch(() => {});
        return res.status(502).json({ dudoso: true, error: `No sabemos si la venta se creó (Gestión Nube contestó ${r.status}). Buscá la orden #${tnOrder} en GN antes de reintentar.` });
      }
      const v = (d && d.data) ? d.data : d;
      await confirmarLedger(store, tnOrder, { estado: 'ok', gn_venta_id: v && v.id, gn_number: v && v.number, store_id }).catch(() => {});
      return res.status(200).json({ ok: true, store_id, venta: { id: v && v.id, number: v && v.number } });
    } catch (e) {
      // Red caída o timeout: NO se sabe si GN llegó a crear la venta. La reserva QUEDA puesta a
      // propósito, y sólo la suelta alguien que fue a mirar a GN (api/datos?recurso=sync-tn,
      // action:'liberar'). Perder una venta cuesta 30 segundos de carga a mano; duplicarla, no.
      await confirmarLedger(store, tnOrder, { estado: 'dudoso', error: e.message }).catch(() => {});
      return res.status(502).json({ dudoso: true, error: `No sabemos si la venta se creó (${e.message}). Buscá la orden #${tnOrder} en GN antes de reintentar.` });
    }
  }

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
    const payload = {
      client_id: CAMBIO_CLIENT[store] || cfg.client_id, channel_id: channel, sale_type_id: cfg.sale_type_id, currency_id: cfg.currency_id,
      store_id, discount_inventory: true, payment_method_id: paymentId,
      comments: String(b.comments || '').slice(0, 500),
      integration_source: 'monitor-cambio', integration_id: `${b.solicitudId || 'cambio'}-real`,
      items: lineItems,
      // Descuento del cambio (Σdevueltos + manual + forma) A NIVEL VENTA (campo GN `discount_amount`, verificado).
      discount_amount: Math.max(0, Math.round(Number(b.descuento) || 0)),
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
  // El canje se corta ACÁ si la marca no tiene cliente configurado: caer al de fotos dejaría la
  // venta atribuida a "Sesión de fotos" y GN no permite corregir eso por API.
  if (b.proposito === 'canje' && !CANJE_CLIENT[store]) {
    return res.status(400).json({ error: `No hay cliente de GN configurado para los canjes de ${store} (CANJE_CLIENT).` });
  }
  // Las ventas de fallas usan su propio cliente de GN; el resto (fotos) sigue con el de SF_CFG.
  const clientId =
    (b.proposito === 'falla' && FALLA_CLIENT[store]) ? FALLA_CLIENT[store] :
    (b.proposito === 'cambio' && CAMBIO_CLIENT[store]) ? CAMBIO_CLIENT[store] :
    (b.proposito === 'canje' && CANJE_CLIENT[store]) ? CANJE_CLIENT[store] :
    cfg.client_id;
  // Reingreso: el renglón lleva el PRECIO REAL (para que GN acepte la cantidad negativa), y un descuento a
  // nivel venta iguala el subtotal → total 0 (baja de plata nula, solo movimiento de stock).
  // Falla (proposito:'falla') y canje entregado en el local (proposito:'canje'): precio de LISTA +
  // 100% de descuento → total $0, pero valuada con el precio real. Lo que se regaló tiene un costo y
  // a precio 0 el histórico de GN no dice cuánto.
  // Fotos: precio 0 y sin descuento, idéntico a antes.
  const esFalla = b.proposito === 'falla';
  const esCanje = b.proposito === 'canje';
  const valuadaCero = esFalla || esCanje;
  const lineItems = items.map(it => ({
    product_id: parseInt(it.product_id, 10),
    size_id: parseInt(it.size_id, 10),
    quantity: parseInt(it.quantity, 10),
    unit_price: (esReingreso || valuadaCero) ? (Number(it.unit_price) || 0) : 0,
    store_id,
  }));
  const payload = {
    client_id: clientId, channel_id: esCanje ? CANJE_CHANNEL[store] : cfg.channel_id, sale_type_id: cfg.sale_type_id, currency_id: cfg.currency_id,
    store_id, discount_inventory: true,
    comments: String(b.comments || '').slice(0, 500),
    integration_source: esCanje ? 'monitor-canje' : 'monitor-sesion-fotos',
    integration_id: `${b.solicitudId || 'sf'}-${b.origen}`,
    items: lineItems,
  };
  if (esReingreso) {
    // discount a nivel venta = subtotal (negativo) → total 0. is_exchange marca el movimiento como cambio.
    payload.discount = lineItems.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    payload.is_exchange = true;
  } else if (valuadaCero) {
    // 100% de descuento A NIVEL VENTA (`discount_amount` = subtotal) → total 0, mostrando el precio de lista.
    payload.discount_amount = lineItems.reduce((s, it) => s + it.quantity * it.unit_price, 0);
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
