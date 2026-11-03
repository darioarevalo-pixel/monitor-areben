/**
 * El CONTRATO de la API externa (estándar de Ger B.1/B.2/B.8 + su respuesta §4): lo que sale hacia afuera, en inglés, con mapas
 * explícitos desde los nombres internos y una LISTA CERRADA de campos. Un campo que se agregue a una pantalla ⛔ sale solo.
 * Puro: ⛔ toca la base.
 */

/** El negocio de un token. El negocio sale del token, ⛔ de un parámetro. `base`: dónde están sus ubicaciones. ⛔ Stunned. */
export const NEGOCIOS = Object.freeze({
  bdi: Object.freeze({ id: 1, name: 'BDI Accesorios', slug: 'bdi', base: 'bdi' }),
  zattia: Object.freeze({ id: 2, name: 'Zattia', slug: 'zattia', base: 'zattia' }),
  // Bruno, 3-nov: Stunned pasa por Logística. Vive en la base de Zattia; sus ubicaciones se filtran por su línea y no tiene mayoristas (0 y 404).
  stunned: Object.freeze({ id: 3, name: 'Stunned', slug: 'stunned', base: 'zattia' }),
})

/** Los permisos: qué deja hacer y qué datos salen (B.4). Es lo que acepta quien da de alta el token. */
export const PERMISOS = Object.freeze({
  'wholesale_orders:read': { explica: 'Leer los pedidos mayoristas mandados a preparar.', datos: 'Cliente y quién pidió, entrega, notas, renglones con ubicación, total, saldo y zona de despacho.' },
  'wholesale_orders:write': { explica: 'Marcar que el depósito empezó a preparar un pedido mayorista.', datos: 'El pedido como queda.' },
  'locations:read': { explica: 'Leer la ubicación física de cada variante por depósito.', datos: 'Código de barras, SKU, depósito y ubicación.' },
})

/** Lo que un token ⛔ puede hacer nunca (B.4). Cada línea tiene su control y su prueba en `test/ext-pg.mjs` y `test/ext.test.mjs`. */
export const NUNCA = Object.freeze([
  'Ver costos, márgenes, precios por renglón ni listas de precios.',
  'Ver el teléfono, el mail o el documento del cliente.',
  'Leer datos de otro negocio.',
  'Actuar a nombre de otra persona: no hay cabecera para declararlo.',
  'Cambiar renglones, cobrar o anular un pedido.',
])

const ETAPA_A_STATUS = Object.freeze({ a_preparar: 'to_prepare', en_preparacion: 'preparing', preparado: 'prepared', despachado: 'dispatched', anulado: 'cancelled' })
export const STATUS = Object.freeze(Object.values(ETAPA_A_STATUS))
export const ETAPA_DE_STATUS = Object.freeze(Object.fromEntries(Object.entries(ETAPA_A_STATUS).map(([e, s]) => [s, e])))

const DEPOSITO_A_WAREHOUSE = Object.freeze({ local: 'store', deposito_minorista: 'retail_warehouse', deposito_mayorista: 'wholesale_warehouse', deposito: 'warehouse', evento: 'event' })
export const WAREHOUSES = Object.freeze(Object.values(DEPOSITO_A_WAREHOUSE))
export const DEPOSITO_DE_WAREHOUSE = Object.freeze(Object.fromEntries(Object.entries(DEPOSITO_A_WAREHOUSE).map(([d, w]) => [w, d])))

const ZONA = Object.freeze({ despacho: 'dispatch', pendiente_pago: 'pending_payment' })

const instante = (x) => (x == null ? null : new Date(x).toISOString())
/** Los montos van como texto decimal (`"2000.00"`, regla de esta integración, Ger §4.1): sin perder precisión en el camino. */
export const monto = (x) => Number(x).toFixed(2)

/** Lo que el catálogo guarda en `contacto.entrega` («Envío a todo el país», «Retiro en Rosario») o el panel escribe a mano. */
export function metodoDeEntrega(texto) {
  if (texto == null || !String(texto).trim()) return null
  const t = String(texto).toLowerCase()
  if (t.includes('retir')) return 'pickup'
  if (t.includes('envío') || t.includes('envio')) return 'shipping'
  return 'other'
}

/** Un pedido de `pedidosDeLogistica` (`lib/pedido/venta.mjs`), en el contrato. */
export function pedidoExterno(p) {
  return {
    id: p.numero,
    number: p.numero,
    status: ETAPA_A_STATUS[p.etapa],
    warehouse: DEPOSITO_A_WAREHOUSE[p.deposito] ?? 'other',
    customer_name: p.cliente,
    contact_name: p.persona,
    delivery_method: metodoDeEntrega(p.entrega),
    notes: p.notas,
    to_prepare_at: instante(p.a_preparar_en),
    preparing_at: instante(p.preparacion_en),
    prepared_at: instante(p.preparado_en),
    changed_at: instante(p.cambio_en),
    cancelled_at: instante(p.anulado_en),
    total: monto(p.total),
    amount_due: monto(p.falta),
    is_settled: p.pagado,
    has_credit_account: p.cuenta_corriente,
    payment_zone: ZONA[p.zona],
    updated_at: instante(p.actualizado_en),
    lines: p.renglones.map((l) => ({
      product_id: l.product_id, size_id: l.size_id, sku: l.sku, barcode: l.barcode, name: l.nombre, size: l.talle, quantity: l.cantidad, location: l.ubicacion,
    })),
  }
}

/** Una fila de `ubicacionesExternas`, en el contrato. `code` va TAL CUAL: de «estantería-piso» sale el orden de armado en Logística. */
export function ubicacionExterna(u) {
  return { id: Number(u.id), barcode: u.barcode ?? null, sku: u.sku ?? null, warehouse: DEPOSITO_A_WAREHOUSE[u.deposito] ?? 'other', code: u.texto, updated_at: instante(u.actualizado_en) }
}

/** `GET /me` (B.5). */
export function meExterno(t) {
  const n = NEGOCIOS[t.negocio]
  return {
    app: t.app, key_prefix: t.key_prefix, business: { id: n.id, name: n.name, slug: n.slug }, scopes: t.permisos,
    user: { id: Number(t.dueno_id), name: t.dueno_nombre, email: t.dueno_email ?? null }, expires_at: instante(t.vence_en),
  }
}

// ── Esquemas de salida (OpenAPI 3.1) ───────────────────────────────────────────────────────────────

const s = (type, description, extra = {}) => ({ type, description, ...extra })
const n = (type, description, extra = {}) => ({ type: [type, 'null'], description, ...extra })
const cerrado = (description, properties) => ({ type: 'object', description, additionalProperties: false, required: Object.keys(properties), properties })
const instanteS = (d) => n('string', d, { format: 'date-time' })
const montoS = (d) => s('string', `${d} Texto decimal, para no perder precisión.`, { pattern: '^\\d+\\.\\d{2}$', examples: ['2000.00'] })
const pagina = (description, ref) => cerrado(description, {
  items: { type: 'array', items: { $ref: `#/components/schemas/${ref}` } },
  total: s('integer', 'Cuántos hay con estos filtros, ⛔ en esta página.'),
  limit: s('integer', 'El límite aplicado.'),
  offset: s('integer', 'El desplazamiento aplicado.'),
})

export const ESQUEMAS = Object.freeze({
  ExtError: {
    type: 'object', description: 'Todos los errores tienen esta forma. Un `409` suma `conflicts` y `order`; un `422`, `errors`.', required: ['status', 'code', 'detail'],
    properties: {
      status: s('integer', 'Código HTTP.'),
      code: s('string', 'Estable, para programar contra él: `missing_token`, `invalid_token`, `token_expired`, `token_revoked`, `token_owner_disabled`, `business_disabled`, `insufficient_scope`, `not_found`, `method_not_allowed`, `conflict`, `validation_error`, `rate_limited`, `internal_error`.'),
      detail: s('string', 'Mensaje para una persona, en castellano.'),
      errors: { type: 'array', description: 'Sólo en el `422`.', items: { type: 'object', required: ['field', 'message'], properties: { field: { type: 'string' }, message: { type: 'string' } } } },
      conflicts: { type: 'array', description: 'Sólo en el `409` por versión.', items: { type: 'object', required: ['field', 'expected', 'current'], properties: { field: { type: 'string' }, expected: {}, current: {} } } },
      order: { $ref: '#/components/schemas/ExtWholesaleOrder', description: 'En el `409`: el pedido como está ahora.' },
    },
  },
  ExtMe: cerrado('De quién es el token y qué puede hacer.', {
    app: s('string', 'El nombre con el que se creó el token.'),
    key_prefix: s('string', 'El prefijo: lo único del token que se guarda legible.'),
    business: cerrado('El negocio del token.', { id: s('integer', 'Id del negocio.'), name: s('string', 'Nombre.'), slug: s('string', 'Clave corta.', { enum: Object.keys(NEGOCIOS) }) }),
    scopes: { type: 'array', description: 'Los permisos.', items: { type: 'string' } },
    user: cerrado('La persona a cuyo nombre actúa.', { id: s('integer', 'Id.'), name: s('string', 'Nombre.'), email: n('string', 'Mail.') }),
    expires_at: instanteS('Cuándo vence; `null` si no vence.'),
  }),
  ExtWholesaleOrderLine: cerrado('Un renglón para escanear.', {
    product_id: s('integer', 'Producto.'),
    size_id: n('integer', 'Talle o modelo.'),
    sku: n('string', 'SKU. En BDI hay variantes que lo comparten: para identificar, `barcode`.'),
    barcode: n('string', 'Código de barras.'),
    name: n('string', 'Nombre del producto.'),
    size: n('string', 'Talle o modelo.'),
    quantity: s('integer', 'Cantidad pedida.'),
    location: n('string', 'Ubicación actual en el depósito del pedido, «estantería-piso». No mueve `updated_at`.'),
  }),
  ExtWholesaleOrder: cerrado('Un pedido mayorista mandado a preparar. Los que todavía no se mandaron no se publican.', {
    id: s('integer', 'Numérico y estable.'),
    number: s('integer', 'El número que se ve.'),
    status: s('string', '`preparing` lo pone `start-picking`. `prepared` y `dispatched` los actualiza el ERP leyendo `GET /orders` de Logística, desde el corte de BDI; antes de eso no avanzan solos.', { enum: STATUS }),
    warehouse: s('string', 'Depósito del que sale.'),
    customer_name: n('string', 'El cliente.'),
    contact_name: n('string', 'Quién lo pidió.'),
    delivery_method: n('string', '`pickup`, `shipping` u `other` (texto libre del panel).'),
    notes: n('string', 'Notas del pedido.'),
    to_prepare_at: instanteS('Cuándo se mandó a preparar.'),
    preparing_at: instanteS('Cuándo empezó el depósito.'),
    prepared_at: instanteS('Cuándo quedó armado.'),
    changed_at: instanteS('Última vez que se cambió después de mandarse a preparar: el aviso al depósito.'),
    cancelled_at: instanteS('Cuándo se anuló.'),
    total: montoS('Total del pedido.'),
    amount_due: montoS('Lo que falta pagar. Con `is_settled: true` puede quedar hasta $1.000 en la cuenta corriente.'),
    is_settled: s('boolean', 'Pagado. Incluye la tolerancia de $1.000.'),
    has_credit_account: s('boolean', 'El cliente tiene cuenta corriente.'),
    payment_zone: s('string', 'La calcula el ERP. `pending_payment` no se despacha: releer el pedido justo antes de despachar.', { enum: Object.values(ZONA) }),
    updated_at: s('string', 'La versión del pedido. Se mueve también con un pago o un cambio de crédito del cliente. Es lo que va en `expected.updated_at`.', { format: 'date-time' }),
    lines: { type: 'array', description: 'Los renglones.', items: { $ref: '#/components/schemas/ExtWholesaleOrderLine' } },
  }),
  ExtWholesaleOrdersPage: pagina('Una página de pedidos.', 'ExtWholesaleOrder'),
  ExtLocation: cerrado('Dónde está una variante en un depósito.', {
    id: s('integer', 'Numérico. Si la ubicación se vacía y vuelve a cargarse, cambia.'),
    barcode: n('string', 'Código de barras.'),
    sku: n('string', 'SKU. En BDI hay variantes que lo comparten: el filtro `sku` puede traer más de una.'),
    warehouse: s('string', 'Depósito.'),
    code: s('string', '«estantería-piso» (`12-3`): de ahí sale el orden de armado.'),
    updated_at: s('string', 'Último cambio.', { format: 'date-time' }),
  }),
  ExtLocationsPage: pagina('Una página de ubicaciones.', 'ExtLocation'),
  ExtStartPickingRequest: cerrado('La versión del pedido que vio el depósito.', {
    expected: cerrado('Lo que se vio.', { updated_at: s('string', 'El `updated_at` leído.', { format: 'date-time' }) }),
  }),
  ExtStartPickingResult: cerrado('El pedido después de empezar.', {
    already: s('boolean', '`true` si ya había empezado: no cambia nada y se puede reintentar.'),
    order: { $ref: '#/components/schemas/ExtWholesaleOrder' },
  }),
})
