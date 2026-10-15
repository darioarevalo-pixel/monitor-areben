/**
 * ERP (key `erp`): lo que el monitor va construyendo para reemplazar a Gestión Nube. Por ahora una
 * pestaña, Facturación. Entra por `api/datos.js?recurso=erp` (⛔ un archivo de ruta nuevo: el plan
 * Hobby admite 12 funciones).
 *
 * 🔴 SÓLO ADMIN, en el servidor (Bruno, 12-oct-2026: «que lo vean Bruno y Darío» mientras se
 * construye). ⛔ alcanza con esconderlo del menú: acá se pide un CAE.
 *
 *   GET  ?recurso=erp&vista=facturacion&mes=YYYY-MM   el mes: techo, facturado, pendiente, ventas
 *   GET  ?recurso=erp&vista=facturas&mes=YYYY-MM      las facturas del monitor del mes (para el PDF)
 *   POST {recurso:'erp', accion:'facturar', mes, marca, ventaIds}   factura esas ventas (un lote)
 *   POST {recurso:'erp', accion:'nota-credito', facturaId}            anula ENTERA una factura del monitor con NC (ARCA)
 *   POST {recurso:'erp', accion:'cerrar', mes}                      congela el techo del mes
 *   GET  ?recurso=erp&vista=pedidos-tn&marca=…                      los pedidos de TN abiertos y sin pagar (retienen stock)
 *   GET  ?recurso=erp&vista=diferencias&marca=…&fecha=YYYY-MM-DD    lo que el libro ⛔ explicó ese día + la sobreventa
 *   GET  ?recurso=erp&vista=stock&marca=bdi|zattia&q=texto            busca prendas (SKU, código, nombre)
 *   GET  ?recurso=erp&vista=precio&marca=…&producto=ID                precio por lista y costo del producto, con GN y TN al lado
 *   POST {recurso:'erp', accion:'cargar-precio'|'cargar-costo', marca, producto, monto, lista?, desde?, motivo?, proveedor?}
 *   GET  ?recurso=erp&vista=stock&marca=…&producto=ID&talle=ID       el libro y GN de esa prenda, con historial
 *
 * El monto de cada factura lo rearma el SERVIDOR con los cobros: del navegador sólo viajan los ids.
 * Contra qué ARCA se factura lo decide `ambienteDeEntorno` (homologación por defecto).
 */
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { esAdmin } from '../lib/permisos.core.js'
import { cfgDeMarca } from './_recepciones-base.js'
import { leerTodo } from '../lib/supabase/paginar.core.js'
import { baseFacturacion, clienteArcaDelEntorno, repoFacturas } from './_facturacion.js'
import { CBTE, COND_IVA, DOC, ambienteDeEntorno, ptoVtaDe } from '../motor/arca/arca.core.js'
import { techoDelMes } from '../motor/arca/techo.core.js'
import { claveVenta, resumenDelMes, ventasParaFacturar } from '../motor/arca/mes.core.js'
import { POR_PEDIDO, facturarLote } from '../motor/arca/lote.core.js'
import { diaArgentino } from '../lib/envios/portal.core.js'
import { stockDeVariante } from '../lib/erp/stock.core.js'
import { armarDiferencias, leerFecha } from '../lib/erp/diferencias.core.js'
import { SIN_PAGAR, armarPedidosSinPagar } from '../lib/erp/pedidos-tn.core.js'
import { armarPrecioDeProducto, leerCarga } from '../lib/erp/precio.core.js'
import { lineaDe } from '../lib/lineas.core.js'

const MARCAS = ['bdi', 'zattia']
/** Desde este monto la factura B pide DNI (ARCA). ⚠️ Confirmar con el contador antes de producción. */
const UMBRAL_IDENTIFICAR = 10_000_000

const finDeMes = (mes) => {
  const [y, m] = mes.split('-').map(Number)
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

function ambienteSeguro() {
  try { return { ambiente: ambienteDeEntorno(process.env) } } catch (e) { return { ambiente: null, error: e.message } }
}

/** Todo lo que hace falta para mostrar (o facturar) un mes. */
export async function leerMes(mes) {
  const sb = baseFacturacion()
  const { ambiente, error: errorAmbiente } = ambienteSeguro()
  const desde = `${mes}-01`, hasta = finDeMes(mes)

  const [cuentas, periodo] = await Promise.all([
    leerTodo(sb, 'cuentas_cobro', (q) => q.select('nombre, tipo')),
    sb.from('facturacion_mes').select('*').eq('mes', mes).maybeSingle(),
  ])
  if (periodo.error) throw new Error(`facturacion_mes: ${periodo.error.message}`)
  const tipos = new Map(cuentas.map((c) => [c.nombre, c.tipo]))

  // Cobros del mes y facturas de GN, de la base de cada marca.
  const porMarca = await Promise.all(MARCAS.map(async (marca) => {
    const { url, key } = cfgDeMarca(marca)
    const b = createClient(url, key)
    const cobros = await leerTodo(b, 'ventas_cobros', (q) => q.select('venta_id, fecha, cuenta, monto').gte('fecha', desde).lte('fecha', hasta).order('venta_id').order('n'))
    const facturasGNDelMes = await leerTodo(b, 'ventas_factura_gn', (q) => q.select('venta_id, monto').gte('fecha', desde).lte('fecha', hasta).order('venta_id'))
    // Una venta cobrada este mes pudo facturarse en GN en OTRO mes: se busca por id, ⛔ por fecha.
    const ids = [...new Set(cobros.map((c) => c.venta_id))]
    const conFacturaGN = new Set()
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await b.from('ventas_factura_gn').select('venta_id').in('venta_id', ids.slice(i, i + 300))
      if (error) throw new Error(`ventas_factura_gn (${marca}): ${error.message}`)
      for (const f of data) conFacturaGN.add(claveVenta(marca, f.venta_id))
    }
    return {
      cobros: cobros.map((c) => ({ ...c, marca })),
      facturasGN: facturasGNDelMes.map((f) => ({ ...f, marca })),
      conFacturaGN,
    }
  }))

  const facturasMonitor = ambiente
    ? await leerTodo(sb, 'facturas', (q) => q.select('marca, venta_id, tipo, total, estado, mes').eq('ambiente', ambiente).neq('estado', 'rechazada').order('creado_en'))
    : []
  const yaFacturadas = new Set(porMarca.flatMap((p) => [...p.conFacturaGN]))
  for (const f of facturasMonitor) if (f.tipo === CBTE.FACTURA_A || f.tipo === CBTE.FACTURA_B) yaFacturadas.add(claveVenta(f.marca, f.venta_id))

  const cobros = porMarca.flatMap((p) => p.cobros)
  const calculado = techoDelMes(cobros, tipos, mes)
  const cerrado = periodo.data?.estado === 'cerrado'
  const techo = cerrado ? Number(periodo.data.techo) : calculado.total
  const resumen = resumenDelMes({
    techo,
    facturasGN: porMarca.flatMap((p) => p.facturasGN),
    facturasMonitor: facturasMonitor.filter((f) => f.mes === mes),
  })
  return {
    sb, ambiente, errorAmbiente, tipos, cobros, yaFacturadas, calculado,
    periodo: periodo.data || null, resumen,
    ventas: ventasParaFacturar(cobros, tipos, mes, yaFacturadas),
  }
}

/**
 * Factura esas ventas de una marca (un lote). Devuelve `{ status, error }` si no se puede, o el
 * resultado del lote. Exportada para la prueba de punta a punta contra homologación.
 */
export async function facturarVentas({ mes, marca, ventaIds, usuario }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const pedidos = [...new Set((Array.isArray(ventaIds) ? ventaIds : []).map(String))]
  if (!pedidos.length) return { status: 400, error: 'No hay ventas elegidas' }
  if (pedidos.length > POR_PEDIDO) return { status: 400, error: `Hasta ${POR_PEDIDO} ventas por vez` }

  const m = await leerMes(mes)
  if (!m.ambiente) return { status: 409, error: m.errorAmbiente }
  const ptoVta = ptoVtaDe(m.ambiente, marca, process.env)
  // El monto lo rearma el servidor: una venta que ya no está entre las facturables se informa.
  const disponibles = new Map(m.ventas.filter((v) => v.marca === marca).map((v) => [v.ventaId, v]))
  const elegidas = pedidos.map((id) => disponibles.get(id)).filter(Boolean)
  const noDisponibles = pedidos.filter((id) => !disponibles.has(id))
  const suma = elegidas.reduce((a, v) => a + Math.round(v.monto * 100), 0) / 100
  if (suma > m.resumen.pendiente + 0.005) {
    return { status: 409, error: `El grupo suma $${suma} y lo pendiente del mes es $${m.resumen.pendiente}` }
  }

  const hoy = diaArgentino(Date.now())
  const { arca } = clienteArcaDelEntorno(m.sb)
  const r = await facturarLote({
    arca, repo: repoFacturas(m.sb), ambiente: m.ambiente, marca, ptoVta, tipo: CBTE.FACTURA_B,
    comprobantes: elegidas.map((v) => ({
      ventaId: v.ventaId, mes, tipo: CBTE.FACTURA_B, fecha: hoy, total: v.monto,
      receptor: { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0, condicionIva: COND_IVA.CONSUMIDOR_FINAL },
    })),
    reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
    lote: globalThis.crypto.randomUUID(), usuario,
  })
  return {
    ambiente: m.ambiente, ptoVta,
    autorizadas: r.autorizadas.map((f) => ({ ventaId: f.venta_id, numero: f.numero, cae: f.cae, total: f.total })),
    rechazadas: r.rechazadas.map((f) => ({ ventaId: f.venta_id, motivos: f.motivos })),
    noSalen: [...r.noSalen.map((c) => ({ ventaId: c.ventaId, motivos: c.motivos })), ...noDisponibles.map((id) => ({ ventaId: id, motivos: ['Ya no está entre las ventas para facturar'] }))],
  }
}

/**
 * La NOTA DE CRÉDITO de una factura del monitor: la anula ENTERA (una por venta, como GN hoy), con la
 * factura asociada para ARCA y el mismo receptor. Sale por el MISMO camino que las facturas (`facturarLote`:
 * candado, número reservado antes del CAE, una sola por venta). 🔴 Con CAE ⛔ se borra.
 * El mes del techo es el de HOY (la NC resta en el período en que se emite) — ❓ a confirmar con el contador.
 */
export async function notaDeCredito({ facturaId, usuario }) {
  if (!/^[0-9a-f-]{36}$/i.test(String(facturaId || ''))) return { status: 400, error: 'Factura inválida' }
  const { ambiente, error } = ambienteSeguro()
  if (!ambiente) return { status: 409, error }
  const sb = baseFacturacion()
  const { data: f, error: e } = await sb.from('facturas')
    .select('id, ambiente, marca, venta_id, tipo, pto_vta, numero, fecha, total, doc_tipo, doc_nro, cond_iva, estado').eq('id', facturaId).maybeSingle()
  if (e) throw new Error(`facturas: ${e.message}`)
  if (!f || f.ambiente !== ambiente) return { status: 404, error: 'La factura no existe en este ambiente.' }
  if (f.estado !== 'autorizada') return { status: 409, error: 'Sólo una factura autorizada (con CAE) lleva nota de crédito.' }
  const tipo = { [CBTE.FACTURA_A]: CBTE.NC_A, [CBTE.FACTURA_B]: CBTE.NC_B }[f.tipo]
  if (!tipo) return { status: 409, error: 'Eso ya es una nota de crédito.' }
  const hoy = diaArgentino(Date.now())
  const { arca } = clienteArcaDelEntorno(sb)
  const r = await facturarLote({
    arca, repo: repoFacturas(sb), ambiente, marca: f.marca, ptoVta: Number(f.pto_vta), tipo,
    comprobantes: [{
      ventaId: f.venta_id, mes: hoy.slice(0, 7), tipo, fecha: hoy, total: Number(f.total), asociadoId: f.id,
      receptor: { docTipo: Number(f.doc_tipo), docNro: Number(f.doc_nro), condicionIva: Number(f.cond_iva) },
      asociado: { tipo: Number(f.tipo), ptoVta: Number(f.pto_vta), numero: Number(f.numero), fecha: f.fecha },
    }],
    reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
    lote: globalThis.crypto.randomUUID(), usuario,
  })
  const [hecha] = r.autorizadas
  if (hecha) return { ambiente, autorizada: { numero: hecha.numero, cae: hecha.cae, total: hecha.total } }
  const motivos = [...r.rechazadas, ...r.noSalen].flatMap((x) => x.motivos || [])
  return { status: 409, error: motivos.join(' · ') || 'ARCA no autorizó la nota de crédito.' }
}

/**
 * Las facturas que el monitor emitió en el mes (autorizadas, del ambiente de hoy), con lo que el PDF
 * necesita: la fila tal como se le mandó a ARCA y el número de la venta en GN para el renglón.
 */
/** El descuento (o el redondeo hacia arriba, que GN guarda como descuento negativo) y el envío de una venta. */
export function ajustesDeVenta(v) {
  const r = []
  const d = Number(v.discount) || 0, s = Number(v.shipping_cost) || 0
  if (d > 0) r.push({ descripcion: 'Descuento', cantidad: 1, unitario: -d, importe: -d })
  if (d < 0) r.push({ descripcion: 'Redondeo', cantidad: 1, unitario: -d, importe: -d })
  if (s > 0) r.push({ descripcion: 'Envío', cantidad: 1, unitario: s, importe: s })
  return r
}

export async function facturasDelMes(mes) {
  const { ambiente, error } = ambienteSeguro()
  if (!ambiente) return { status: 409, error }
  const sb = baseFacturacion()
  const facturas = await leerTodo(sb, 'facturas', (q) => q
    .select('id, ambiente, marca, venta_id, tipo, pto_vta, numero, fecha, total, neto, iva, doc_tipo, doc_nro, cond_iva, estado, cae, cae_vence')
    .eq('ambiente', ambiente).eq('mes', mes).eq('estado', 'autorizada').order('creado_en'))
  const numeros = new Map(), detalles = new Map()
  for (const marca of MARCAS) {
    const ids = [...new Set(facturas.filter((f) => f.marca === marca).map((f) => f.venta_id))]
    if (!ids.length) continue
    const { url, key } = cfgDeMarca(marca)
    const b = createClient(url, key)
    for (let i = 0; i < ids.length; i += 300) {
      const tanda = ids.slice(i, i + 300)
      const { data, error: e } = await b.from('ventas').select('id, number, discount, shipping_cost').in('id', tanda)
      if (e) throw new Error(`ventas (${marca}): ${e.message}`)
      for (const v of data) numeros.set(claveVenta(marca, v.id), v.number != null ? String(v.number) : null)
      const d = await leerTodo(b, 'venta_detalles', (q) => q.select('sale_id, product_name, size, quantity, unit_price, total').in('sale_id', tanda).order('id'))
      for (const r of d) {
        const k = claveVenta(marca, r.sale_id)
        if (!detalles.has(k)) detalles.set(k, [])
        detalles.get(k).push({ descripcion: [r.product_name, r.size].filter(Boolean).join(' - '), cantidad: Number(r.quantity), unitario: Number(r.unit_price), importe: Number(r.total) })
      }
      // GN guarda las prendas SIN el descuento ni el envío de la venta: total = prendas − descuento + envío
      // (medido sep-2026: explica el 98% de las ventas). Van como renglones, igual que en la factura de GN.
      for (const v of data) {
        const k = claveVenta(marca, v.id)
        if (!detalles.has(k)) continue
        for (const extra of ajustesDeVenta(v)) detalles.get(k).push(extra)
      }
    }
  }
  return {
    ambiente,
    facturas: facturas.map((f) => ({
      ...f, total: Number(f.total), neto: Number(f.neto), iva: Number(f.iva), numero: Number(f.numero), doc_nro: Number(f.doc_nro),
      venta_numero: numeros.get(claveVenta(f.marca, f.venta_id)) ?? null,
      renglones: detalles.get(claveVenta(f.marca, f.venta_id)) || [],
    })),
  }
}

/**
 * Stock e historial de una prenda (sólo lectura). Sin `producto`: busca en el espejo de GN
 * (`inventario`) por SKU, código de barras o nombre. Con `producto` y `talle`: lo que dice el libro
 * (`stock_movimiento`, cada fila) y lo que dice GN ahora, por depósito.
 */
export async function stockDePrenda({ marca, q, producto, talle }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const { url, key } = cfgDeMarca(marca)
  const b = createClient(url, key)
  if (!producto) {
    const t = String(q || '').trim()
    if (t.length < 3) return { status: 400, error: 'Escribí al menos 3 letras o números.' }
    const like = `%${t.replace(/[%_,()]/g, ' ')}%`
    const { data, error } = await b.from('inventario')
      .select('product_id, product_name, size_id, size_name, sku, barcode, store_name, available_quantity')
      .or(`sku.ilike.${like},barcode.eq.${t.replace(/[,()]/g, '')},product_name.ilike.${like}`)
      .order('product_name').order('size_name').limit(400)
    if (error) throw new Error(`inventario: ${error.message}`)
    const porVariante = new Map()
    for (const r of data) {
      const k = `${r.product_id}/${r.size_id}`
      const v = porVariante.get(k) || { producto: String(r.product_id), talle: String(r.size_id), nombre: r.product_name, talleNombre: r.size_name, sku: r.sku, barcode: r.barcode, gn: 0 }
      v.gn += Number(r.available_quantity || 0)
      porVariante.set(k, v)
    }
    return { variantes: [...porVariante.values()].slice(0, 60), cortado: porVariante.size > 60 }
  }
  if (!/^\d+$/.test(String(producto)) || !/^\d+$/.test(String(talle))) return { status: 400, error: 'Prenda inválida' }
  const [movs, gn] = await Promise.all([
    leerTodo(b, 'stock_movimiento', (x) => x.select('id, deposito, cantidad, tipo, origen, origen_ref, ocurrido_en, linea, detalle')
      .eq('product_id', producto).eq('size_id', talle).order('id')),
    b.from('inventario').select('product_name, size_name, sku, barcode, store_name, available_quantity').eq('product_id', producto).eq('size_id', talle),
  ])
  if (gn.error) throw new Error(`inventario: ${gn.error.message}`)
  const f = gn.data[0] || {}
  return {
    prenda: { producto: String(producto), talle: String(talle), nombre: f.product_name ?? null, talleNombre: f.size_name ?? null, sku: f.sku ?? null, barcode: f.barcode ?? null },
    ...stockDeVariante({ marca, movimientos: movs, gn: gn.data }),
  }
}

const PG_DE_MARCA = { bdi: 'DATABASE_URL_BDI', zattia: 'DATABASE_URL_ZATTIA' }

/**
 * La SOBREVENTA: las variantes × depósito con el libro en NEGATIVO hoy. Se suma en la base (por pg, con la
 * conexión del motor: supabase-js ⛔ agrupa). Sin la conexión ⇒ null (la pantalla dice que falta).
 */
async function negativosDelLibro(marca) {
  const conexion = process.env[PG_DE_MARCA[marca]]
  if (!conexion) return null
  const { default: pg } = await import('pg')
  const db = new pg.Client({ connectionString: conexion, connectionTimeoutMillis: 5000, statement_timeout: 15000 })
  await db.connect()
  try {
    return (await db.query(`select linea, product_id, size_id, deposito, sum(cantidad)::int as nivel from stock_movimiento
      group by 1, 2, 3, 4 having sum(cantidad) < 0 order by 5 limit 300`)).rows
  } finally {
    await db.end().catch(() => {})
  }
}

/**
 * Las diferencias de un día del libro (pestaña `erp › Diferencias`, sólo lectura): `stock_diff` del día
 * (el último calculado si ⛔ se pide), su resumen, los días que hay para elegir y la sobreventa de hoy.
 */
export async function diferenciasDelDia({ marca, fecha: pedida }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const f = leerFecha(pedida)
  if (f.error) return { status: 400, error: f.error }
  const { url, key } = cfgDeMarca(marca)
  const b = createClient(url, key)
  const dias = await b.from('stock_libro_dia').select('fecha, resumen, foto_desde, foto_hasta').order('fecha', { ascending: false }).limit(30)
  if (dias.error) throw new Error(`stock_libro_dia: ${dias.error.message}`)
  const fecha = f.fecha ?? dias.data[0]?.fecha ?? null
  const dia = dias.data.find((d) => d.fecha === fecha) ?? null
  const [filas, negativos] = await Promise.all([
    fecha ? leerTodo(b, 'stock_diff', (x) => x.select('product_id, size_id, deposito, linea, delta_gn, delta_libro, nivel_gn, nivel_libro, clase, explicacion').eq('fecha', fecha).order('product_id')) : [],
    negativosDelLibro(marca).catch((e) => ({ error: e.message })),
  ])
  const negs = Array.isArray(negativos) ? negativos : []
  const ids = [...new Set([...filas, ...negs].map((r) => Number(r.product_id)))]
  const nombres = new Map()
  // 🔴 Paginado: el espejo tiene una fila por talle Y depósito ⇒ 300 productos pasan las 1000 filas que
  // devuelve Supabase de una, y cortaba CALLADO (87 de 92 sin nombre en BDI, medido 14-oct).
  for (let i = 0; i < ids.length; i += 200) {
    const data = await leerTodo(b, 'inventario', (x) => x.select('product_id, size_id, product_name, size_name').in('product_id', ids.slice(i, i + 200)).order('product_id').order('size_id'))
    for (const r of data) nombres.set(`${r.product_id}/${r.size_id}`, { nombre: r.product_name, talle: r.size_name })
  }
  return {
    fecha, dias: dias.data.map((d) => d.fecha), fotoDesde: dia?.foto_desde ?? null, fotoHasta: dia?.foto_hasta ?? null,
    ...armarDiferencias({ filas, nombres, resumen: dia?.resumen, negativos: negs }),
    sobreventaSinConexion: negativos === null, sobreventaError: negativos && !Array.isArray(negativos) ? negativos.error : null,
  }
}

/**
 * Precio y costo de un PRODUCTO (pestaña `erp › Precios`, sólo lectura): lo vigente por lista y el costo como los tiene
 * el motor (sql/009), su historial, y al lado GN (el espejo `productos`) y Tienda Nube (`tn_variante` por los SKU del
 * producto, con cuándo se leyó: puede estar vieja). Se busca con la misma búsqueda de Stock.
 */
export async function precioDeProducto({ marca, producto }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!/^\d+$/.test(String(producto ?? ''))) return { status: 400, error: 'Producto inválido' }
  const { url, key } = cfgDeMarca(marca)
  const b = createClient(url, key)
  const [inv, listas, vigentes, costo, hPrecio, hCosto, gn, lecturas] = await Promise.all([
    b.from('inventario').select('product_name, sku').eq('product_id', producto),
    b.from('lista_precio').select('id, nombre'),
    b.from('precio_vigente').select('lista, precio, fuente, vigente_desde, usuario, motivo').eq('product_id', producto),
    b.from('costo_vigente').select('costo, proveedor, fuente, vigente_desde, usuario, motivo').eq('product_id', producto).maybeSingle(),
    b.from('producto_precio').select('lista, precio, fuente, vigente_desde, usuario, motivo').eq('product_id', producto).order('vigente_desde', { ascending: false }).limit(40),
    b.from('producto_costo').select('costo, proveedor, fuente, vigente_desde, usuario, motivo').eq('product_id', producto).order('vigente_desde', { ascending: false }).limit(40),
    b.from('productos').select('retailer_price, wholesaler_price, unit_cost').eq('id', producto).maybeSingle(),
    b.from('tn_catalogo_lectura').select('tienda, leida_en'),
  ])
  for (const [t, r] of [['inventario', inv], ['lista_precio', listas], ['precio_vigente', vigentes], ['costo_vigente', costo], ['producto_precio', hPrecio], ['producto_costo', hCosto], ['productos', gn], ['tn_catalogo_lectura', lecturas]]) {
    if (r.error) throw new Error(`${t}: ${r.error.message}`)
  }
  const skus = [...new Set((inv.data || []).map((x) => x.sku).filter(Boolean))]
  const tn = skus.length ? await b.from('tn_variante').select('tienda, sku, precio, precio_promocional, costo').in('sku', skus) : { data: [] }
  if (tn.error) throw new Error(`tn_variante: ${tn.error.message}`)
  const tienda = tn.data[0]?.tienda
  return {
    producto: String(producto), nombre: inv.data[0]?.product_name ?? null, skus: skus.length,
    tnLeidaEn: (lecturas.data || []).find((x) => x.tienda === tienda)?.leida_en ?? null,
    ...armarPrecioDeProducto({ listas: listas.data, vigentes: vigentes.data, costo: costo.data, historialPrecio: hPrecio.data, historialCosto: hCosto.data, gn: gn.data, tn: tn.data }),
  }
}

/** Abre la conexión del motor de la marca, corre `fn(db)` y la cierra. Sin la variable: 409, dicho. */
async function conMotor(marca, que, fn) {
  const conexion = process.env[PG_DE_MARCA[marca]]
  if (!conexion) return { status: 409, error: `${que} todavía ⛔ está conectado: falta la conexión del motor en Vercel.` }
  const { default: pg } = await import('pg')
  const db = new pg.Client({ connectionString: conexion })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end().catch(() => {})
  }
}

/**
 * CARGAR un precio (de una lista) o el costo de un producto en el ERP (`cargarPrecio` / `cargarCosto` del motor, contrato
 * §13): una fila nueva `fuente = 'carga'` que manda sobre las copias de GN y TN. 🔴 Mientras GN vive, ⛔ cambia lo que
 * cobra la Caja ni lo que muestra TN: queda en el ERP. La marca del motor es la LÍNEA del producto (Stunned adentro de la
 * base de Zattia, por el SKU).
 */
export async function cargarPrecioCosto({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const c = leerCarga(body)
  if (c.error) return { status: 400, error: c.error }
  const b = deps.b || (() => { const { url, key } = cfgDeMarca(marca); return createClient(url, key) })()
  const inv = await b.from('inventario').select('sku').eq('product_id', c.producto).limit(1)
  if (inv.error) throw new Error(`inventario: ${inv.error.message}`)
  if (!inv.data.length) return { status: 404, error: 'El producto no está en el espejo de GN.' }
  const linea = lineaDe(marca, inv.data[0].sku)
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'Cargar precios', fn)
  return correr(async (db) => {
    const { cargarPrecio, cargarCosto } = await import('../motor/venta/precio.mjs')
    const comun = { marca: linea, product_id: Number(c.producto), vigente_desde: c.desde, usuario: usuario || 'admin', motivo: c.motivo }
    const r = c.que === 'precio'
      ? await cargarPrecio(db, { ...comun, lista: c.lista, precio: c.monto })
      : await cargarCosto(db, { ...comun, costo: c.monto, proveedor: c.proveedor })
    if (!r.ok) return { status: 409, error: r.error.mensaje }
    return { ok: true, vigente: r.vigente ?? null }
  })
}

/** Los pedidos de TN abiertos y sin pagar de la base de la marca (Zattia trae también los de Stunned). */
export async function pedidosSinPagar({ marca }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const { url, key } = cfgDeMarca(marca)
  const b = createClient(url, key)
  const ordenes = await leerTodo(b, 'tn_orden', (x) => x.select('tienda, tn_id, numero, creada_en, status, payment_status, medio, gateway, total')
    .eq('status', 'open').in('payment_status', SIN_PAGAR).order('creada_en'))
  const ids = ordenes.map((o) => o.tn_id)
  const lineas = []
  for (let i = 0; i < ids.length; i += 200) {
    lineas.push(...await leerTodo(b, 'tn_orden_linea', (x) => x.select('tienda, tn_id, nombre, sku, cantidad').in('tn_id', ids.slice(i, i + 200)).order('tn_id').order('linea_id')))
  }
  const [lectura] = (await b.from('tn_lectura').select('tienda, leida_en').order('leida_en', { ascending: false }).limit(1)).data || []
  return { ...armarPedidosSinPagar({ ordenes, lineas, ahora: Date.now() }), leidaEn: lectura?.leida_en ?? null }
}

export default async function handler(req, res) {
  const perfil = await exigirUsuario(req, res)
  if (!perfil) return
  if (!esAdmin(perfil)) return res.status(403).json({ error: 'El ERP es sólo para administradores mientras se construye.' })
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'método no permitido' })

  const body = req.body || {}
  const mes = String(req.query.mes || body.mes || diaArgentino(Date.now()).slice(0, 7))
  if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'Mes inválido' })

  try {
    if (req.method === 'GET' && req.query.vista === 'pedidos-tn') {
      const r = await pedidosSinPagar({ marca: String(req.query.marca || '') })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'diferencias') {
      const r = await diferenciasDelDia({ marca: String(req.query.marca || ''), fecha: req.query.fecha })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'precio') {
      const r = await precioDeProducto({ marca: String(req.query.marca || ''), producto: req.query.producto })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'stock') {
      const r = await stockDePrenda({ marca: String(req.query.marca || ''), q: req.query.q, producto: req.query.producto, talle: req.query.talle })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'facturas') {
      const r = await facturasDelMes(mes)
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET') {
      const m = await leerMes(mes)
      return res.status(200).json({
        mes, ambiente: m.ambiente, errorAmbiente: m.errorAmbiente || null,
        estado: m.periodo?.estado || 'abierto', cerradoPor: m.periodo?.cerrado_por || null, cerradoEn: m.periodo?.cerrado_en || null,
        techoCalculado: m.calculado.total, sinClasificar: m.calculado.sinClasificar, porCuenta: m.calculado.porCuenta,
        ...m.resumen,
        ventas: m.ventas,
        porPedido: POR_PEDIDO,
        puntosDeVenta: m.ambiente ? Object.fromEntries(MARCAS.map((x) => { try { return [x, ptoVtaDe(m.ambiente, x, process.env)] } catch { return [x, null] } })) : {},
      })
    }

    if (body.accion === 'cerrar') {
      const m = await leerMes(mes)
      if (m.periodo?.estado === 'cerrado') return res.status(409).json({ error: 'El mes ya está cerrado' })
      const { error } = await m.sb.from('facturacion_mes').upsert({
        mes, estado: 'cerrado', techo: m.calculado.total,
        desglose: { porCuenta: m.calculado.porCuenta, sinClasificar: m.calculado.sinClasificar },
        calculado_en: new Date().toISOString(), cerrado_por: perfil.name || perfil.user || null, cerrado_en: new Date().toISOString(),
      })
      if (error) throw new Error(`facturacion_mes: ${error.message}`)
      return res.status(200).json({ ok: true, techo: m.calculado.total })
    }

    if (body.accion === 'cargar-precio' || body.accion === 'cargar-costo') {
      const r = await cargarPrecioCosto({ marca: String(body.marca || ''), body: { ...body, que: body.accion === 'cargar-precio' ? 'precio' : 'costo' }, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'nota-credito') {
      const r = await notaDeCredito({ facturaId: body.facturaId, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'facturar') {
      const r = await facturarVentas({ mes, marca: String(body.marca || ''), ventaIds: body.ventaIds, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    return res.status(400).json({ error: 'Acción inválida' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
