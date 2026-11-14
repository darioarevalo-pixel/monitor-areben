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
  'wholesale_orders:sensitive': { explica: 'Ver el contacto del cliente y el precio por renglón de los pedidos mayoristas. Sin este permiso esos campos vienen en `null`.', datos: 'Id del cliente, teléfono, mail y precio por renglón.' },
  'internal_orders:read': { explica: 'Leer las incidencias que pasan por el depósito: canjes y reemplazos.', datos: 'Código, cliente, motivo, descripción, depósito, renglones que salen con su ubicación y lo que vuelve.' },
  'internal_orders:sensitive': { explica: 'Ver el destinatario de los canjes y los reemplazos, para la etiqueta. Sin este permiso `recipient` viene en `null`.', datos: 'Nombre, teléfono, DNI y domicilio del destinatario.' },
  'collections:read': { explica: 'Leer lo que falta cobrar de un pedido de Tienda Nube al entregarlo.', datos: 'Estado del cobro, total, lo que falta y por qué medio, y el saldo a favor y la deuda en cuenta corriente del cliente.' },
  'locations:read': { explica: 'Leer la ubicación física de cada variante por depósito.', datos: 'Código de barras, SKU, depósito y ubicación.' },
  'variants:read': { explica: 'Leer el catálogo de variantes, para escanear.', datos: 'Producto, talle o modelo, SKU, código de barras y si está activa.' },
})

/** Lo que un token ⛔ puede hacer nunca (B.4). Cada línea tiene su control y su prueba en `test/ext-pg.mjs` y `test/ext.test.mjs`. */
export const NUNCA = Object.freeze([
  'Ver costos, márgenes ni listas de precios.',
  'Ver el documento o el domicilio del cliente, salvo el destinatario de un canje o un reemplazo con `internal_orders:sensitive`.',
  'Ver el teléfono o el mail del cliente, o el precio por renglón, sin `wholesale_orders:sensitive`.',
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

/**
 * LOS CÓDIGOS con prefijo (Bruno, 13-nov; pedido de Ger 12-nov §2.3): uno por tipo de documento, igual en el monitor, el ERP y la API,
 * para imprimir en la comanda y leer al escanear. El número es el de siempre (el id del caso del monitor, el número del pedido): sólo
 * cambia el prefijo. ⛔ chocan con lo que ya circula impreso: números pelados de TN, `GN-`, remitos `R`+6 sin guion, `OC-`, `A-`, `T-`.
 */
export const PREFIJOS = Object.freeze({ canje: 'CJ', reemplazo: 'CB', mayorista: 'M' })
export const codigoDe = (tipo, n) => (n == null || !Number.isSafeInteger(Number(n)) || Number(n) <= 0 ? null : `${PREFIJOS[tipo]}-${String(Number(n)).padStart(4, '0')}`)

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
export function pedidoExterno(p, { sensibles = false } = {}) {
  const cli = sensibles ? p.cliente_datos ?? null : null
  return {
    id: p.numero,
    number: p.numero,
    code: codigoDe('mayorista', p.numero),
    sale_number: p.venta_numero == null ? null : Number(p.venta_numero),
    status: ETAPA_A_STATUS[p.etapa],
    is_test: p.prueba === true,
    warehouse: DEPOSITO_A_WAREHOUSE[p.deposito] ?? 'other',
    customer_name: p.cliente,
    customer: cli && { id: cli.id ?? null, gn_id: cli.gn_id == null ? null : Number(cli.gn_id), phone: cli.telefono ?? null, email: cli.email ?? null },
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
      unit_price: sensibles && l.precio != null ? monto(l.precio) : null,
    })),
  }
}

/** Lo que sale cuando el caso del monitor no dice de quién es (sin la tabla, o un ajuste sin caso). */
export const CLIENTE_INCIDENCIA = 'Incidencia'
const RAZON_DE_MOTIVO = Object.freeze({ canje: 'canje', fallado: 'replacement' })
const VIAS = Object.freeze({ correo: 'correo_argentino', andreani: 'andreani', cadete: 'courier', presencial: 'in_person' })

/** El reemplazo de un reclamo siempre se le manda al cliente (`lib/reclamos/nota.ts` del monitor); el canje dice el suyo. Sin el caso, null. */
function entregaDeIncidencia(a) {
  if (a.motivo === 'fallado') return 'shipping'
  if (a.retiro_local === true) return 'pickup'
  if (a.retiro_local === false) return 'shipping'
  return null
}

const limpio = (x) => (x == null || !String(x).trim() ? null : String(x).trim())
const nombreCompleto = (d) => limpio([limpio(d?.nombre), limpio(d?.apellido)].filter(Boolean).join(' '))

/**
 * El destinatario, de la ficha de la persona del canje (o la copia que el monitor congela al despachar). Sin calle, `address` es null:
 * hay que cargarla. El canje ⛔ va a sucursal: la persona tiene un solo domicilio ⇒ `home`.
 */
export function destinatarioDe(d) {
  if (!d || typeof d !== 'object') return null
  const calle = limpio(d.calle)
  const r = {
    name: nombreCompleto(d), phone: limpio(d.telefono), document: limpio(d.dni),
    address: calle ? {
      street: calle, number: limpio(d.numero), floor: limpio(d.piso), apartment: limpio(d.depto), neighborhood: limpio(d.barrio),
      zipcode: limpio(d.cp), city: limpio(d.localidad), province: limpio(d.provincia), notes: limpio(d.direccion_nota),
    } : null,
    delivery_type: calle ? 'home' : null,
  }
  return Object.values(r).some((v) => v != null) ? r : null
}

/** Un ajuste que pasa por el depósito, con sus renglones, en el contrato. */
export function incidenciaExterna(a, { sensibles = false } = {}) {
  const tipo = a.motivo === 'canje' ? 'canje' : 'reemplazo'
  const sale = a.renglones.filter((l) => Number(l.diferencia) < 0)
  const linea = (l, cantidad) => ({
    product_id: Number(l.product_id), size_id: Number(l.size_id), sku: l.sku ?? null, barcode: l.barcode ?? null, name: l.nombre ?? null, size: l.talle ?? null, quantity: cantidad, location: l.ubicacion ?? null,
  })
  const vuelve = (a.vuelve ?? []).filter((l) => Number(l.cantidad) > 0)
  return {
    id: `A-${a.numero}`,
    code: codigoDe(tipo, a.caso_id),
    is_test: a.prueba === true,
    reason: RAZON_DE_MOTIVO[a.motivo],
    status: a.anulado_en ? 'cancelled' : 'active',
    cancelled_at: a.anulado_en ? instante(a.anulado_en) : null,
    customer_name: limpio(a.cliente) ?? CLIENTE_INCIDENCIA,
    description: a.detalle ?? null,
    warehouse: DEPOSITO_A_WAREHOUSE[a.deposito] ?? 'other',
    delivery_method: entregaDeIncidencia(a),
    carrier: VIAS[a.via_ida] ?? null,
    recipient: sensibles ? destinatarioDe(a.destino) : null,
    tiendanube_order: a.orden_tn ?? null,
    created_at: instante(a.creado_en),
    updated_at: instante(a.actualizado_en),
    lines: sale.map((l) => linea(l, Math.abs(Number(l.diferencia)))),
    return_method: vuelve.length ? VIAS[a.via_vuelta] ?? null : null,
    return_lines: vuelve.map((l) => ({
      product_id: l.product_id == null ? null : Number(l.product_id), size_id: l.size_id == null ? null : Number(l.size_id), sku: limpio(l.sku), barcode: limpio(l.barcode), name: limpio(l.producto), size: limpio(l.variante), quantity: Number(l.cantidad),
    })),
  }
}

/** Una fila de `ubicacionesExternas`, en el contrato. `code` va TAL CUAL: de «estantería-piso» sale el orden de armado en Logística. */
export function ubicacionExterna(u) {
  return { id: Number(u.id), barcode: u.barcode ?? null, sku: u.sku ?? null, warehouse: DEPOSITO_A_WAREHOUSE[u.deposito] ?? 'other', code: u.texto, updated_at: instante(u.actualizado_en) }
}

/** Una fila de `listarVariantes`, en el contrato. */
export function varianteExterna(v) {
  return { product_id: Number(v.product_id), size_id: Number(v.size_id), sku: v.sku ?? null, barcode: v.barcode ?? null, name: v.nombre ?? null, size: v.talle ?? null, image_url: v.foto ?? null, active: v.activa === true, updated_at: instante(v.actualizado_en) }
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
    unit_price: { ...montoS('Precio por unidad. Viene en `null` sin `wholesale_orders:sensitive`.'), nullable: true },
  }),
  ExtWholesaleOrderCustomer: cerrado('El cliente. Solo con `wholesale_orders:sensitive`.', {
    id: n('string', 'Id del cliente en el ERP.'),
    gn_id: n('integer', 'Id del cliente en Gestión Nube, si viene de ahí. Los clientes nuevos no lo tienen.'),
    phone: n('string', 'WhatsApp de quien pidió o, si no está, el del cliente.'),
    email: n('string', 'Mail del cliente.'),
  }),
  ExtWholesaleOrder: cerrado('Un pedido mayorista mandado a preparar. Los que todavía no se mandaron no se publican.', {
    id: s('integer', 'Numérico y estable.'),
    number: s('integer', 'El número del pedido. Puede coincidir con un número de Tienda Nube: para imprimir y escanear, `code`.'),
    code: s('string', 'El código del pedido, el que usa la gente: `M-` y el número con 4 cifras (`M-0075`). Único en el negocio; es el mismo que muestra el ERP.', { pattern: '^M-\\d{4,}$', examples: ['M-0075'] }),
    sale_number: n('integer', 'El número de la venta del ERP (`#1934` en Ventas), cuando el pedido ya se confirmó como venta. Sirve para cruzar con Ventas; para la comanda, `code`.'),
    status: s('string', '`preparing` lo pone `start-picking`. `prepared` y `dispatched` los actualiza el ERP leyendo `GET /orders` de Logística, desde el corte de BDI; antes de eso no avanzan solos.', { enum: STATUS }),
    is_test: s('boolean', '`true`: pedido de prueba. No mueve stock y no hay que prepararlo físicamente.'),
    warehouse: s('string', 'Depósito del que sale.'),
    customer_name: n('string', 'El cliente.'),
    customer: { allOf: [{ $ref: '#/components/schemas/ExtWholesaleOrderCustomer' }], nullable: true, description: 'Viene en `null` sin `wholesale_orders:sensitive`.' },
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
  ExtVariant: cerrado('Una variante del catálogo del negocio del token.', {
    product_id: s('integer', 'Producto. Con `size_id` identifica la variante.'),
    size_id: s('integer', 'Talle o modelo.'),
    sku: n('string', 'SKU. En BDI hay variantes sin SKU o que lo comparten: para identificar, `barcode`.'),
    barcode: n('string', 'Código de barras.'),
    name: n('string', 'Nombre del producto.'),
    size: n('string', 'Talle o modelo.'),
    image_url: n('string', 'Foto de la variante o, si no tiene, la de su producto. Copiada de GN; puede faltar.'),
    active: s('boolean', 'La variante y su producto están activos. Las inactivas siguen saliendo para poder darlas de baja.'),
    updated_at: s('string', 'Último cambio de la variante o de su producto.', { format: 'date-time' }),
  }),
  ExtVariantsPage: pagina('Una página de variantes.', 'ExtVariant'),
  ExtInternalOrderLine: cerrado('Un renglón que SALE del depósito, para escanear.', {
    product_id: s('integer', 'Producto.'),
    size_id: s('integer', 'Talle o modelo.'),
    sku: n('string', 'SKU.'),
    barcode: n('string', 'Código de barras.'),
    name: n('string', 'Nombre del producto.'),
    size: n('string', 'Talle o modelo.'),
    quantity: s('integer', 'Cantidad.'),
    location: n('string', 'Ubicación actual en el depósito, tal cual. No mueve `updated_at`.'),
  }),
  ExtInternalOrderReturnLine: cerrado('Un renglón que VUELVE del cliente: lo tiene que retirar el correo o el cadete. No entra al stock al despachar.', {
    product_id: n('integer', 'Producto, si se conoce.'),
    size_id: n('integer', 'Talle o modelo, si se conoce.'),
    sku: n('string', 'SKU.'),
    barcode: n('string', 'Código de barras, si se conoce.'),
    name: n('string', 'Nombre del producto.'),
    size: n('string', 'Talle o modelo.'),
    quantity: s('integer', 'Cantidad.'),
  }),
  ExtAddress: cerrado('Un domicilio, en campos.', {
    street: s('string', 'Calle.'),
    number: n('string', 'Altura.'),
    floor: n('string', 'Piso.'),
    apartment: n('string', 'Depto.'),
    neighborhood: n('string', 'Barrio.'),
    zipcode: n('string', 'Código postal.'),
    city: n('string', 'Localidad.'),
    province: n('string', 'Provincia.'),
    notes: n('string', 'Indicaciones para encontrarlo.'),
  }),
  ExtRecipient: cerrado('A quién se le manda. Solo con `internal_orders:sensitive`.', {
    name: n('string', 'Nombre y apellido.'),
    phone: n('string', 'Teléfono.'),
    document: n('string', 'DNI.'),
    address: { allOf: [{ $ref: '#/components/schemas/ExtAddress' }], nullable: true, description: 'El domicilio. `null` si falta: hay que cargarlo a mano.' },
    delivery_type: n('string', '`home` (a domicilio) o `branch` (a sucursal del correo). `null` sin domicilio.', { enum: ['home', 'branch', null] }),
  }),
  ExtInternalOrder: cerrado('Una incidencia que pasa por el depósito. El stock ya salió al crearse. Si el canje o el reclamo se anula, sale con `status: cancelled` y deja de haber que prepararla.', {
    id: s('string', 'Estable, con la forma `A-90` (el número del ajuste de stock). No se puede repetir con el `id` numérico de un mayorista. Para imprimir y escanear, `code`.'),
    code: n('string', 'El código del caso, el que usa la gente y muestra el monitor: `CJ-0090` un canje, `CB-0051` un cambio o reemplazo. Único en el negocio. `null` solo si el ajuste no tiene caso (no debería pasar).', { pattern: '^(CJ|CB)-\\d{4,}$', examples: ['CJ-0090', 'CB-0051'] }),
    is_test: s('boolean', '`true`: es de antes del corte del negocio, cuando la venta todavía sale de Gestión Nube. Sirve para probar: no hay que prepararla.'),
    reason: s('string', '`canje` o `replacement` (el cambio o reemplazo de un reclamo).', { enum: Object.values(RAZON_DE_MOTIVO) }),
    status: s('string', '`active` o `cancelled`. Una anulación mueve `updated_at`.', { enum: ['active', 'cancelled'] }),
    cancelled_at: instanteS('Cuándo se anuló.'),
    customer_name: s('string', 'El cliente: la persona del canje o el cliente del reclamo. «Incidencia» solo si el caso no lo dice.'),
    description: n('string', 'El detalle, como texto para leer. Lo que hace falta para trabajar viene en los otros campos.'),
    warehouse: s('string', 'Depósito del que sale. Con `store` (el local), la entrega el mostrador: no pasa por el depósito.'),
    delivery_method: n('string', '`pickup` (retiro en el local) o `shipping`. El reemplazo de un reclamo siempre es `shipping`.', { enum: ['pickup', 'shipping', null] }),
    carrier: n('string', 'Por dónde sale, cuando ya se decidió: `correo_argentino`, `andreani`, `courier` (cadete) o `in_person`.', { enum: [...Object.values(VIAS), null] }),
    recipient: { allOf: [{ $ref: '#/components/schemas/ExtRecipient' }], nullable: true, description: 'El destinatario, para la etiqueta. Viene en `null` sin `internal_orders:sensitive`, y en los reemplazos: va a la dirección de la venta de `tiendanube_order`.' },
    tiendanube_order: n('string', 'El número de la venta de Tienda Nube a la que refiere, cuando se conoce.'),
    created_at: s('string', 'Cuándo se creó.', { format: 'date-time' }),
    updated_at: s('string', 'Cuándo se aplicó o, si se anuló, cuándo se anuló.', { format: 'date-time' }),
    lines: { type: 'array', description: 'Lo que SALE del depósito.', items: { $ref: '#/components/schemas/ExtInternalOrderLine' } },
    return_method: n('string', 'Cómo vuelve lo de `return_lines`: `correo_argentino`, `andreani`, `courier` (lo retira el cadete al entregar) o `in_person` (lo trae el cliente al local). `null` si no vuelve nada o todavía no se decidió.', { enum: [...Object.values(VIAS), null] }),
    return_lines: { type: 'array', description: 'Lo que VUELVE del cliente. Vacío en los canjes.', items: { $ref: '#/components/schemas/ExtInternalOrderReturnLine' } },
  }),
  ExtInternalOrdersPage: pagina('Una página de incidencias.', 'ExtInternalOrder'),
  ExtAmountDue: cerrado('Lo que falta cobrar de un pedido de Tienda Nube, según el ERP. Es lo que va en la comanda y en Entregas.', {
    tiendanube_order: s('string', 'El número del pedido en Tienda Nube.'),
    status: s('string', '`pending`: falta cobrarlo entero. `paid`: no hay nada que cobrar. `partially_paid`: Tienda Nube dice que se pagó una parte (una seña) y no dice cuánto: mirarlo antes de entregar. `cancelled`: cancelado o devuelto, no se entrega.', { enum: ['pending', 'paid', 'partially_paid', 'cancelled'] }),
    total: montoS('Total del pedido, envío incluido.'),
    amount_due: { ...montoS('Lo que hay que cobrar al entregar. `null` con `partially_paid`: el ERP no sabe cuánto falta.'), type: ['string', 'null'] },
    payment_method: n('string', 'Cómo se espera cobrar, según lo que eligió el cliente: `cash` (efectivo), `transfer` o `other`. `null` si no hay nada que cobrar.', { enum: ['cash', 'transfer', 'other', null] }),
    payment_gateway: n('string', 'El medio de pago tal como lo trae Tienda Nube («Efectivo», «Pago Nube»…).'),
    paid_via: n('string', 'Por dónde se pagó: `tiendanube` (en la tienda) o `delivery` (lo cobró Logística al entregar: su `delivery.payment_method` de `GET /orders`).', { enum: ['tiendanube', 'delivery', null] }),
    paid_at: instanteS('Cuándo se pagó.'),
    customer_credit: { ...montoS('Saldo a favor del cliente en este negocio. Es del cliente, no del pedido: el mostrador decide si lo usa. `null` si el pedido no tiene cliente en el ERP.'), type: ['string', 'null'] },
    customer_debt: { ...montoS('Lo que el cliente quedó debiendo en cuenta corriente en este negocio. `null` si el pedido no tiene cliente en el ERP.'), type: ['string', 'null'] },
    updated_at: instanteS('Última vez que el ERP leyó el pedido de Tienda Nube.'),
  }),
  ExtStartPickingRequest: cerrado('La versión del pedido que vio el depósito.', {
    expected: cerrado('Lo que se vio.', { updated_at: s('string', 'El `updated_at` leído.', { format: 'date-time' }) }),
  }),
  ExtStartPickingResult: cerrado('El pedido después de empezar.', {
    already: s('boolean', '`true` si ya había empezado: no cambia nada y se puede reintentar.'),
    order: { $ref: '#/components/schemas/ExtWholesaleOrder' },
  }),
})
