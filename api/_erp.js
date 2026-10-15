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
 *   GET  ?recurso=erp&vista=ventas&marca=…&q=nº|cliente&desde&hasta    busca ventas propias (las del motor)
 *   GET  ?recurso=erp&vista=venta&marca=…&id=UUID                      la ficha: prendas, pagos, factura, estado
 *   POST {recurso:'erp', accion:'anular', marca, ventaId, motivo}      anula una venta propia (por el motor)
 *   GET  ?recurso=erp&vista=saldo&marca=…&doc=DNI                      el saldo a favor de la clienta (el de prueba)
 *   GET  ?recurso=erp&vista=clientas&marca=…&q=CUIT|nombre             las fichas de clientas (factura A en la Caja)
 *   POST {recurso:'erp', accion:'cambiar', marca, id, ventaId, devueltas, items, pagos, total, desde?, pago?, comprobante?, cliente?}
 *        el cambio en el local: cobra la diferencia con el descuento de la forma de pago y, con transferencia,
 *        contesta `esperando` hasta que llega el pago (la pantalla repite el MISMO pedido)
 *   POST {recurso:'erp', accion:'facturar-venta', marca, ventaId, clase:'A'|'B', doc?, condicion?, razonSocial?, domicilio?, reimprimir?}
 *   POST {recurso:'erp', accion:'facturar-cambio', marca, ventaId, simular?}   NC por lo devuelto + factura por lo nuevo
 *        la factura A PEDIDO de una venta propia (la Caja): una, con su CAE, y atada a la venta en el motor
 *   POST {recurso:'erp', accion:'nota-credito-venta', marca, ventaId}  la NC de una venta propia ANULADA con factura
 *
 * El monto de cada factura lo rearma el SERVIDOR con los cobros: del navegador sólo viajan los ids.
 * Contra qué ARCA se factura lo decide `ambienteDeEntorno` (homologación por defecto).
 */
import { createClient } from '@supabase/supabase-js'
import { exigirUsuario } from './_auth.js'
import { esAdmin } from '../lib/permisos.core.js'
import { cfgDeMarca } from './_recepciones-base.js'
import { leerTodo } from '../lib/supabase/paginar.core.js'
import { SIN_ARCA, arcaConectado, baseFacturacion, clienteArcaDelEntorno, repoFacturas } from './_facturacion.js'
import { CBTE, COND_IVA, DOC, ambienteDeEntorno, ptoVtaDe } from '../motor/arca/arca.core.js'
import { techoDelMes } from '../motor/arca/techo.core.js'
import { claveVenta, resumenDelMes, ventasParaFacturar } from '../motor/arca/mes.core.js'
import { POR_PEDIDO, facturarLote } from '../motor/arca/lote.core.js'
import { diaArgentino } from '../lib/envios/portal.core.js'
import { stockDeVariante } from '../lib/erp/stock.core.js'
import { armarDiferencias, leerFecha } from '../lib/erp/diferencias.core.js'
import { SIN_PAGAR, armarPedidosSinPagar } from '../lib/erp/pedidos-tn.core.js'
import { armarPrecioDeProducto, leerCarga, lineaDelProducto } from '../lib/erp/precio.core.js'
import { armarFicha, cambiadasDe, cobroDelCambio, diferenciaDeCambio, filaDeVenta, leerAnular, leerBusqueda, leerCambiar, rangoDeDias, textoDelMotor } from '../lib/erp/venta.core.js'
import { marcaDeCaja } from '../lib/caja/marcas.core.js'
import { armarFacturaDelCambio, claveDeFactura, clavesDeFactura, distintaDeLaPedida, leerFacturar, mesDeVenta, opcionDeCondicion, puedeFacturar, puedeFacturarCambio, puedeHacerNC, renglonesDeVenta } from '../lib/erp/factura.core.js'
import { cruzarTransferencia, pagosRecientes } from '../lib/pagos-recibidos/core.core.js'
import { reglasDeHoy, reglasGuardadas } from './_caja-reglas.js'
import { pagosDelDia, usosDe } from './_pagos-recibidos.js'
import { ANTES_MANUAL_MS, RECIENTES_CAJA, diasDelCruce } from '../lib/caja/cruce.core.js'

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
  if (!arcaConectado()) return { status: 409, error: SIN_ARCA }

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
export async function notaDeCredito({ facturaId, usuario }, deps = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(String(facturaId || ''))) return { status: 400, error: 'Factura inválida' }
  const { ambiente, error } = ambienteSeguro()
  if (!ambiente) return { status: 409, error }
  const sb = deps.sb || (deps.repo ? null : baseFacturacion())
  const f = deps.leerFactura ? await deps.leerFactura(facturaId) : await (async () => {
    const { data, error: e } = await sb.from('facturas')
      .select('id, ambiente, marca, venta_id, tipo, pto_vta, numero, fecha, total, doc_tipo, doc_nro, cond_iva, estado').eq('id', facturaId).maybeSingle()
    if (e) throw new Error(`facturas: ${e.message}`)
    return data
  })()
  if (!f || f.ambiente !== ambiente) return { status: 404, error: 'La factura no existe en este ambiente.' }
  if (f.estado !== 'autorizada') return { status: 409, error: 'Sólo una factura autorizada (con CAE) lleva nota de crédito.' }
  const tipo = { [CBTE.FACTURA_A]: CBTE.NC_A, [CBTE.FACTURA_B]: CBTE.NC_B }[f.tipo]
  if (!tipo) return { status: 409, error: 'Eso ya es una nota de crédito.' }
  // 🔴 Una NC PARCIAL (la de un cambio) ya acreditó parte: ésta sale por lo que le QUEDA a la factura (la entera
  // acreditaría dos veces lo devuelto). Acreditada del todo ⇒ ⛔ sale.
  const previas = deps.ncsDeFactura ? await deps.ncsDeFactura(f.id) : await ncsDeFactura(sb, f.id)
  if (previas.some((x) => String(x.venta_id) === String(f.venta_id))) return { status: 409, error: 'La venta ya tiene nota de crédito' }
  const queda = Math.round(Number(f.total) * 100 - previas.reduce((a, x) => a + Math.round(Number(x.total) * 100), 0)) / 100
  if (!(queda > 0)) return { status: 409, error: 'La factura ya está acreditada entera (por las notas de crédito de sus cambios).' }
  const arca = arcaDe(deps, sb)
  if (!arca) return { status: 409, error: SIN_ARCA }
  const hoy = diaArgentino(Date.now())
  const r = await facturarLote({
    arca, repo: deps.repo || repoFacturas(sb), ambiente, marca: f.marca, ptoVta: Number(f.pto_vta), tipo,
    comprobantes: [{
      ventaId: f.venta_id, mes: hoy.slice(0, 7), tipo, fecha: hoy, total: queda, asociadoId: f.id,
      receptor: { docTipo: Number(f.doc_tipo), docNro: Number(f.doc_nro), condicionIva: Number(f.cond_iva) },
      asociado: { tipo: Number(f.tipo), ptoVta: Number(f.pto_vta), numero: Number(f.numero), fecha: f.fecha },
    }],
    reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
    lote: globalThis.crypto.randomUUID(), usuario,
  })
  const [hecha] = r.autorizadas
  if (hecha) return { ambiente, autorizada: { id: hecha.id, numero: hecha.numero, cae: hecha.cae, total: hecha.total } }
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

/**
 * El cliente de ARCA de este servidor, o null si ⛔ tiene el certificado (prod hoy): la puerta que pide un CAE contesta
 * 409 `SIN_ARCA` ANTES de reservar nada, ⛔ un 500 de adentro del cliente. Un oráculo o un test lo inyecta en `deps.arca`.
 */
function arcaDe(deps, sb) {
  if (deps.arca) return deps.arca
  return arcaConectado() ? clienteArcaDelEntorno(sb).arca : null
}

/** La empresa de cada marca (tabla `marca` del motor): ⛔ cambia ⇒ una lectura por marca y por instancia. */
const empresas = new Map()
async function empresaDeMarca(sb, marca) {
  if (!empresas.has(marca)) {
    const m = await sb.from('marca').select('empresa_id').eq('id', marca).maybeSingle()
    if (m.error) throw new Error(`marca: ${m.error.message}`)
    if (!m.data) return null
    empresas.set(marca, m.data.empresa_id)
  }
  return empresas.get(marca)
}

/**
 * Nombre y talle de cada variante (`producto/talle`) del espejo, para los renglones de una venta, su ficha, su
 * factura y las Diferencias. 🔴 Paginado: el espejo tiene una fila por talle Y depósito ⇒ 300 productos pasan
 * las 1000 filas que devuelve Supabase de una, y cortaba CALLADO (87 de 92 sin nombre en BDI, medido 14-oct).
 * @param {any} b supabase de la marca @param {Iterable<any>} productos ids de producto (se repiten: se sacan)
 */
async function nombresDeVariantes(b, productos) {
  const ids = [...new Set(productos)]
  /** @type {Map<string, { nombre: string, talle: string }>} */
  const nombres = new Map()
  const tandas = []
  for (let i = 0; i < ids.length; i += 200) tandas.push(ids.slice(i, i + 200))
  const leidas = await Promise.all(tandas.map((t) => leerTodo(b, 'inventario', (x) => x.select('product_id, size_id, product_name, size_name').in('product_id', t).order('product_id').order('size_id'))))
  for (const r of leidas.flat()) nombres.set(`${r.product_id}/${r.size_id}`, { nombre: r.product_name, talle: r.size_name })
  return nombres
}

/** Número y renglones de las ventas PROPIAS facturadas (por su uuid), de `venta_ficha`. */
async function renglonesPropios(b, marca, ids, { numeros, detalles }) {
  const fichas = await leerTodo(b, 'venta_ficha', (q) => q.select('id, numero, tipo, total, lineas, detalle').in('id', ids))
  const nombres = await nombresDeVariantes(b, fichas.flatMap((f) => (f.lineas || []).map((l) => l.product_id)))
  for (const f of fichas) {
    numeros.set(claveVenta(marca, f.id), String(f.detalle?.gn_number ?? f.numero))
    // Un CAMBIO tiene DOS comprobantes con su clave (la NC de lo devuelto y la factura de lo nuevo): sus líneas ⛔ suman
    // ninguno de los dos ⇒ sin detalle, el PDF lleva un renglón por el total de cada uno.
    if (f.tipo === 'cambio') continue
    detalles.set(claveVenta(marca, f.id), renglonesDeVenta(f, nombres))
  }
}

export async function facturasDelMes(mes) {
  const { ambiente, error } = ambienteSeguro()
  if (!ambiente) return { status: 409, error }
  const sb = baseFacturacion()
  const facturas = await leerTodo(sb, 'facturas', (q) => q
    .select('id, ambiente, marca, venta_id, tipo, pto_vta, numero, fecha, total, neto, iva, doc_tipo, doc_nro, cond_iva, estado, cae, cae_vence')
    .eq('ambiente', ambiente).eq('mes', mes).eq('estado', 'autorizada').order('creado_en'))
  const numeros = new Map(), detalles = new Map(), receptores = new Map()
  for (const marca of MARCAS) {
    const todas = [...new Set(facturas.filter((f) => f.marca === marca).map((f) => f.venta_id))]
    if (!todas.length) continue
    const { url, key } = cfgDeMarca(marca)
    const b = createClient(url, key)
    // El receptor de las A (y sus NC): la razón social y el domicilio de la ficha de la clienta, por su CUIT.
    const cuits = [...new Set(facturas.filter((f) => f.marca === marca && Number(f.doc_tipo) === DOC.CUIT).map((f) => String(f.doc_nro)))]
    for (let i = 0; i < cuits.length; i += 200) {
      // La ficha es una por EMPRESA y documento (§11): sin la empresa, el PDF podría salir con la de otra.
      const empresa = await empresaDeMarca(b, marca)
      if (!empresa) break
      const { data, error: e } = await b.from('cliente').select('doc, nombre, razon_social, domicilio').eq('empresa_id', empresa).in('doc', cuits.slice(i, i + 200))
      if (e) throw new Error(`cliente (${marca}): ${e.message}`)
      for (const c of data) receptores.set(`${marca}/${c.doc}`, { nombre: c.razon_social || c.nombre, domicilio: c.domicilio })
    }
    // Las de una venta propia sin venta de GN (la factura a pedido de la Caja) van por el uuid del motor.
    const ids = todas.filter((id) => /^\d+$/.test(id))
    const propias = todas.filter((id) => !/^\d+$/.test(id))
    if (propias.length) await renglonesPropios(b, marca, propias, { numeros, detalles })
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
      receptor_nombre: receptores.get(`${f.marca}/${f.doc_nro}`)?.nombre ?? null,
      receptor_domicilio: receptores.get(`${f.marca}/${f.doc_nro}`)?.domicilio ?? null,
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

/**
 * La conexión pg de la base de la marca (la del rol `motor`): para que ESCRIBA el motor (⛔ supabase-js: no tiene
 * transacciones) y para sumar el libro. Sin la variable ⛔ está conectado todavía: se dice, ⛔ se adivina.
 */
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
 * Ventas propias (las que escribe el motor, `motor/venta/`): busca por número, cliente o fecha. Lee
 * directo de la base (contrato de la venta, §2); ⛔ escribe. Stunned vive en la base de Zattia.
 */
export async function buscarVentas({ marca, q, desde, hasta }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const b = leerBusqueda({ q, desde, hasta })
  if (b.error) return { status: 400, error: b.error }
  const { url, key } = cfgDeMarca(marca)
  const sb = createClient(url, key)
  let consulta = sb.from('venta').select('id, numero, marca, tipo, estado, origen, canal, deposito, total, prueba, ocurrida_en, cliente:cliente_id (nombre, doc)')
  if (b.numero != null) consulta = consulta.eq('numero', b.numero)
  if (b.cliente) {
    const like = `%${b.cliente}%`
    const { data, error } = await sb.from('cliente').select('id').or(`nombre.ilike.${like},doc.ilike.${like},email.ilike.${like},whatsapp.ilike.${like}`).limit(200)
    if (error) throw new Error(`cliente: ${error.message}`)
    if (!data.length) return { ventas: [], cortado: false }
    consulta = consulta.in('cliente_id', data.map((c) => c.id))
  }
  const r = rangoDeDias(b.desde, b.hasta)
  if (r.desde) consulta = consulta.gte('ocurrida_en', r.desde)
  if (r.hasta) consulta = consulta.lt('ocurrida_en', r.hasta)
  const { data, error } = await consulta.order('ocurrida_en', { ascending: false }).limit(101)
  if (error) throw new Error(`venta: ${error.message}`)
  return { ventas: data.slice(0, 100).map(filaDeVenta), cortado: data.length > 100 }
}

/** La ficha de una venta propia (`venta_ficha`), con el nombre de cada prenda y sus cambios. */
export async function fichaDeVenta({ marca, id }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return { status: 400, error: 'Venta inválida' }
  const { url, key } = cfgDeMarca(marca)
  const sb = createClient(url, key)
  const { data: f, error } = await sb.from('venta_ficha').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`venta_ficha: ${error.message}`)
  if (!f) return { status: 404, error: 'La venta no existe.' }
  const columnas = 'id, numero, marca, tipo, estado, origen, canal, deposito, total, prueba, ocurrida_en'
  const [cambios, original, nombres] = await Promise.all([
    sb.from('venta').select(columnas).eq('venta_original_id', id).order('ocurrida_en'),
    f.venta_original_id ? sb.from('venta').select(columnas).eq('id', f.venta_original_id).maybeSingle() : Promise.resolve({ data: null }),
    nombresDeVariantes(sb, (f.lineas || []).map((l) => l.product_id)),
  ])
  for (const [t, r] of [['venta', cambios], ['venta', original]]) if (r.error) throw new Error(`${t}: ${r.error.message}`)
  // Lo que ya volvió en cambios confirmados: cuánto se puede devolver todavía de cada línea.
  const vivos = (cambios.data || []).filter((c) => c.estado === 'confirmada').map((c) => c.id)
  const devueltas = vivos.length ? await sb.from('venta_linea').select('linea_origen_id, cantidad').in('venta_id', vivos).lt('cantidad', 0) : { data: [] }
  if (devueltas.error) throw new Error(`venta_linea: ${devueltas.error.message}`)
  return armarFicha(f, { nombres, cambios: cambios.data || [], original: original.data, cambiadas: cambiadasDe(devueltas.data) })
}

/** Abre la conexión del motor de la marca, corre `fn(db, motor)` y la cierra. Sin la variable: 409, dicho. */
async function conMotor(marca, que, fn) {
  const conexion = process.env[PG_DE_MARCA[marca]]
  if (!conexion) return { status: 409, error: `${que} todavía no está conectado: falta la conexión del motor en Vercel.` }
  const [{ default: pg }, motor] = await Promise.all([import('pg'), import('../motor/venta/registrar.mjs')])
  const db = new pg.Client({ connectionString: conexion, connectionTimeoutMillis: 5000, statement_timeout: 15000 })
  try {
    await db.connect()
    return await fn(db, motor)
  } finally {
    await db.end().catch(() => {})
  }
}

const errorDelMotor = (r) => ({ status: r.error.codigo === 'NO_ENCONTRADA' ? 404 : 409, error: textoDelMotor(r.error) })

/** Anula una venta propia con motivo (sólo admin: lo chequea el handler). La plata vuelve a los mismos pagos. */
export async function anularVentaPropia({ marca, body, usuario }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const a = leerAnular(body)
  if (a.error) return { status: 400, error: a.error }
  return conMotor(marca, 'Anular', async (db, { anularVenta }) => {
    const r = await anularVenta(db, { venta_id: a.ventaId, motivo: a.motivo, usuario })
    if (!r.ok) return errorDelMotor(r)
    return { ok: true, movimientos: r.movimientos, ncPendiente: r.nc_pendiente }
  })
}

/**
 * El cambio en el local (`erp › Caja`): entra lo devuelto, sale lo nuevo, y la diferencia se cobra o
 * queda a favor. 🔑 Hasta el corte de GN es de PRUEBA (⛔ mueve el libro): el local sigue cambiando en GN.
 * Que ⛔ se devuelva más de lo vendido lo hace cumplir el motor (`DEVUELVE_DE_MAS`), y la diferencia la
 * vuelve a sumar él: si ⛔ coincide con el pago, 409.
 */
/**
 * El saldo a favor de una clienta, por documento (el de PRUEBA mientras el cambio es de prueba): para
 * ofrecerlo como forma de pago en el cambio. Lee la vista `saldo_favor` del motor (contrato §6).
 */
export async function saldoDeClienta({ marca, doc }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const d = String(doc ?? '').replace(/\D/g, '')
  if (!/^\d{7,11}$/.test(d)) return { status: 400, error: 'Documento inválido' }
  const { url, key } = cfgDeMarca(marca)
  const sb = createClient(url, key)
  // La ficha es UNA por empresa y documento (§11): sin la empresa, dos empresas en la misma base harían
  // que `maybeSingle` falle con dos filas, o que el saldo saliera de la ficha de la otra.
  const empresa = await empresaDeMarca(sb, marca)
  if (!empresa) return { status: 409, error: `La marca ${marca} no está en el motor de esta base.` }
  const cl = await sb.from('cliente').select('id, nombre').eq('empresa_id', empresa).eq('doc', d).maybeSingle()
  if (cl.error) throw new Error(`cliente: ${cl.error.message}`)
  if (!cl.data) return { cliente: null, saldo: 0 }
  const s = await sb.from('saldo_favor').select('saldo').eq('cliente_id', cl.data.id).eq('marca', marca).eq('prueba', true).maybeSingle()
  if (s.error) throw new Error(`saldo_favor: ${s.error.message}`)
  return { cliente: { nombre: cl.data.nombre }, saldo: Number(s.data?.saldo || 0) }
}

export async function cambiarVentaPropia({ marca, body, usuario }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const c = leerCambiar(body)
  if (c.error) return { status: 400, error: c.error }
  const cajaDe = marcaDeCaja(marca)
  if (!cajaDe) return { status: 400, error: 'El cambio en la Caja es de Zattia y BDI.' }
  const { url, key } = cfgDeMarca(marca)
  const sb = createClient(url, key)
  return conMotor(marca, 'El cambio', async (db, { registrarCambio }) => {
    // La diferencia con la MISMA cuenta que el motor (lo devuelto al precio que se pagó), y su cobro con
    // las reglas de HOY de la Caja: el descuento de la forma de pago lo pone el servidor.
    const lineas = (await db.query('select id, cantidad, importe from venta_linea where venta_id = $1', [c.ventaId])).rows
      .map((l) => ({ id: l.id, cantidad: Number(l.cantidad), importe: Number(l.importe) }))
    const diferencia = diferenciaDeCambio({ lineas, devueltas: c.devueltas.map((d) => ({ lineaId: d.linea_id, cantidad: d.cantidad })), nuevas: c.nuevas })
    /** @type {{ pagos: any[], total: number, espera: number }} */
    let cobrado
    try {
      const reglas = await reglasDeHoy(sb, marca, await reglasGuardadas(sb, marca, cajaDe))
      cobrado = cobroDelCambio({ diferencia, pagos: c.pagos, reglas, nuevas: c.nuevas, saldo: c.saldo })
    } catch (e) {
      return { status: 400, error: e.message }
    }
    if (c.total != null && Math.round(c.total * 100) !== Math.round(cobrado.total * 100)) {
      return { status: 409, error: `La pantalla dice $${c.total} y el servidor $${cobrado.total}: recargá la venta y volvé a cobrar.`, total: cobrado.total }
    }
    // 🔑 Con transferencia se ESPERA el pago, como en la Caja (Bruno, 14-oct): recién con el pago encontrado
    // en Mercado Pago (o confirmado a mano con el comprobante, sin cuenta conectada) se registra el cambio.
    let mp = null
    if (cobrado.espera > 0) {
      const t = await esperarTransferencia({ sb, db, marca, c, espera: cobrado.espera, usuario })
      if (!t.llego) return { ok: true, esperando: true, espera: cobrado.espera, total: cobrado.total, ...t.para }
      mp = t.mp
    }
    // El saldo a favor paga con la cuenta «Saldo a favor» del motor (va por uuid: ⛔ tiene cuenta en GN).
    if (cobrado.pagos.some((p) => p.cuenta === 'saldo')) {
      const [cs] = (await db.query(`select id from cuenta_cobro where marca = $1 and medio = 'saldo'`, [marca])).rows
      if (!cs) return { status: 409, error: 'Falta la cuenta «Saldo a favor» en el ERP (sql/007 del motor).' }
      cobrado = { ...cobrado, pagos: cobrado.pagos.map((p) => (p.cuenta === 'saldo' ? { ...p, cuenta: cs.id } : p)) }
    }
    const r = await registrarCambio(db, {
      origen: 'caja', origen_ref: c.id, marca, usuario: usuario || 'erp', prueba: true, deposito: 'local',
      venta_original_id: c.ventaId, devueltas: c.devueltas, nuevas: c.nuevas, pagos: cobrado.pagos,
      ...(c.cliente ? { cliente: c.cliente } : {}),
      ...(mp ? { detalle: { mp } } : {}),
    })
    if (!r.ok) return errorDelMotor(r)
    return { ok: true, venta: r.venta, total: cobrado.total, aFavor: r.a_favor, saldo: r.saldo ?? null, ncPendiente: r.nc_pendiente, yaExistia: !!r.ya_existia }
  })
}

/**
 * La factura A PEDIDO de una venta propia (`erp › Caja`): una sola, con su CAE, por el MISMO `facturarLote` que
 * la masiva (candado, reserva del número, corte resuelto consultando a ARCA). La clave en `facturas` es la venta
 * de GN si la refleja una (`claveDeFactura`): así ninguna de las dos puertas factura dos veces la misma venta.
 * Con CAE, el motor la ata a la venta (`venta_factura`). Si esa fila ⛔ se pudo escribir, la próxima vez que se
 * pide la MISMA factura se ata y se devuelve (⛔ sale otra: el lote la ve facturada).
 * 🔴 Una venta de prueba ⛔ se factura en producción (`puedeFacturar`).
 */
export async function facturarVentaPropia({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const p = leerFacturar(body)
  if (p.error) return { status: 400, error: p.error }
  const { ambiente, error: errorAmbiente } = ambienteSeguro()
  if (!ambiente) return { status: 409, error: errorAmbiente }
  const b = deps.b || (() => { const { url, key } = cfgDeMarca(marca); return createClient(url, key) })()
  const sb = deps.sb || (deps.repo ? null : baseFacturacion())
  const repo = deps.repo || repoFacturas(sb)
  const buscar = deps.buscarFactura || ((clave) => facturaDeClave(sb, { ambiente, marca, clave }))
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'La factura desde la Caja', fn)

  return correr(async (db) => {
    const [f] = (await db.query('select * from venta_ficha where id = $1', [p.ventaId])).rows
    const clave = f ? claveDeFactura(f) : null
    let ya = null
    for (const k of f ? clavesDeFactura(f) : []) if ((ya = await buscar(k))) break
    if (body?.reimprimir && !ya) return { status: 404, error: 'No se encontró la factura de esta venta en este ambiente.' }
    if (ya && !body?.reimprimir) {
      const otra = distintaDeLaPedida(ya, p)
      if (otra) return { status: 409, error: otra }
    }
    // Con la factura ya hecha (`ya`), «ya tiene factura» ⛔ frena: se devuelve la misma (y se ata si faltaba).
    const frena = puedeFacturar(f, { ambiente, facturada: !ya && (f?.facturas || []).some((x) => x.tipo === 'factura') })
    if (frena) return { status: f ? 409 : 404, error: frena }
    if (!ya && clave !== String(f.id)) {
      // La factura que GN ya le hizo (la cajera la facturó en el POS de GN) también cuenta.
      const gn = await b.from('ventas_factura_gn').select('venta_id').eq('venta_id', clave).limit(1)
      if (gn.error) throw new Error(`ventas_factura_gn: ${gn.error.message}`)
      if (gn.data.length) return { status: 409, error: 'Esa venta ya está facturada en GN.' }
    }

    let factura = ya
    if (!factura) {
      const arca = arcaDe(deps, sb)
      if (!arca) return { status: 409, error: SIN_ARCA }
      const ptoVta = ptoVtaDe(ambiente, marca, process.env)
      const hoy = diaArgentino(Date.now())
      const r = await facturarLote({
        arca, repo, ambiente, marca, ptoVta, tipo: p.tipo,
        comprobantes: [{ ventaId: clave, mes: mesDeVenta(f.ocurrida_en), tipo: p.tipo, fecha: hoy, total: Number(f.total), receptor: p.receptor }],
        reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
        lote: globalThis.crypto.randomUUID(), usuario,
      })
      if (r.rechazadas.length) return { status: 409, error: `ARCA la rechazó: ${r.rechazadas[0].motivos.join(' · ')}` }
      if (r.noSalen.length) {
        // Facturada entre la lectura y el candado (la masiva u otra caja): se ata la que ya está.
        factura = await buscar(clave)
        if (!factura) return { status: 409, error: r.noSalen[0].motivos.join(' · ') }
      } else factura = r.autorizadas[0]
    }
    if (factura.estado !== 'autorizada') return { status: 409, error: 'Esa venta tiene una factura a medio pedir: probá de nuevo en un minuto.' }
    const sinAtar = await atarFactura(db, { venta: f, facturaId: factura.id, tipo: 'factura' })
    const { receptor, sinFicha } = p.cliente
      ? await guardarFichaA(db, { venta: f, doc: p.receptor.docNro, condicionIva: p.receptor.condicionIva, ...p.cliente })
      : { receptor: await receptorDeFicha(db, { empresaId: f.empresa_id, factura }), sinFicha: null }
    const nombres = await nombresDeVariantes(b, (f.lineas || []).map((l) => l.product_id))
    return { ok: true, yaEstaba: !!ya, sinAtar, sinFicha, factura: filaParaPdf(factura, { numero: f.detalle?.gn_number ?? f.numero, renglones: renglonesDeVenta(f, nombres), receptor }) }
  })
}

/**
 * La NOTA DE CRÉDITO de una venta propia ANULADA que tenía factura (el «falta la nota de crédito» del anular):
 * la de la factura entera, por `notaDeCredito`, y atada a la venta en el motor (`venta_factura` tipo `nc`).
 * Sólo anulada: a una venta que sigue en pie, una NC le deja la factura anulada y el lote ⛔ la deja refacturar.
 * Repetirla ⇒ el lote contesta «ya tiene nota de crédito» (⛔ sale otra).
 */
export async function notaDeCreditoDeVenta({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const ventaId = String(body?.ventaId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(ventaId)) return { status: 400, error: 'Venta inválida' }
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'La nota de crédito', fn)
  return correr(async (db) => {
    const [f] = (await db.query('select id, estado, facturas from venta_ficha where id = $1', [ventaId])).rows
    if (!f) return { status: 404, error: 'La venta no existe.' }
    const frena = puedeHacerNC(f)
    if (frena) return { status: 409, error: frena }
    const factura = (f.facturas || []).find((x) => x.tipo === 'factura')
    const r = await notaDeCredito({ facturaId: factura.factura_id, usuario }, deps)
    if (r.status) return r
    const sinAtar = await atarFactura(db, { venta: f, facturaId: r.autorizada.id, tipo: 'nc' })
    return { ok: true, ambiente: r.ambiente, autorizada: r.autorizada, sinAtar }
  })
}

/**
 * La FICHA de la clienta de una factura A (contrato §11): CUIT, razón social, condición y domicilio quedan guardados
 * (`guardarCliente`, una por empresa y documento) ⇒ la próxima vez la Caja la encuentra por CUIT o nombre y ⛔ se tipea.
 * La factura ya tiene CAE: si la ficha ⛔ se guarda, se avisa y ⛔ se frena. Devuelve el receptor para el PDF.
 */
async function guardarFichaA(db, { venta, doc, condicionIva, razonSocial, domicilio }) {
  const receptor = { nombre: razonSocial, domicilio: domicilio || null }
  const { guardarCliente } = await import('../motor/venta/registrar.mjs')
  const r = await guardarCliente(db, { empresa_id: venta.empresa_id, doc: String(doc), nombre: razonSocial, razon_social: razonSocial, condicion_iva: condicionIva, domicilio })
  if (r.ok) return { receptor: { nombre: r.cliente.razon_social || r.cliente.nombre, domicilio: r.cliente.domicilio }, sinFicha: null }
  console.error(`[erp] ficha de ${doc} sin guardar: ${r.error.codigo} ${r.error.mensaje}`)
  return { receptor, sinFicha: `La factura salió, pero la ficha de la clienta no se guardó: ${r.error.mensaje}` }
}

/** El receptor de una factura A ya hecha (reimprimir), de la ficha por su CUIT. null si ⛔ es A o ⛔ hay ficha. */
async function receptorDeFicha(db, { empresaId, factura }) {
  if (Number(factura.doc_tipo) !== DOC.CUIT || !empresaId) return null
  const [c] = (await db.query('select nombre, razon_social, domicilio from cliente where empresa_id = $1 and doc = $2', [empresaId, String(factura.doc_nro)])).rows
  return c ? { nombre: c.razon_social || c.nombre, domicilio: c.domicilio } : null
}

/** Las fichas de clientas para la factura A (`erp › Caja`): por CUIT/DNI (prefijo) o por nombre. */
export async function clientasDeLaCaja({ marca, q }) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  return conMotor(marca, 'Buscar clientas', async (db, { buscarClientes }) => {
    const [m] = (await db.query('select empresa_id from marca where id = $1', [marca])).rows
    if (!m) return { status: 409, error: 'La marca no está en la base del motor.' }
    const r = await buscarClientes(db, { empresa_id: m.empresa_id, texto: String(q ?? ''), limite: 8 })
    if (!r.ok) return errorDelMotor(r)
    return {
      clientas: r.clientes.map((c) => ({
        doc: c.doc, nombre: c.nombre, razonSocial: c.razon_social, domicilio: c.domicilio, condicion: opcionDeCondicion(c.condicion_iva),
      })),
    }
  })
}

/**
 * Ata la factura (o la NC) a la venta en el motor: `vincularFactura` (`venta_factura` es INMUTABLE desde 009 ⇒ ⛔ insert
 * directo). Repetirla devuelve la misma fila. Si el motor ⛔ la ata (la venta se anuló entre medio, otro tipo…), el
 * comprobante YA tiene CAE: ⛔ se tira; se dice a pantalla y al log, y queda para atar a mano.
 * @returns {Promise<string|null>} null si quedó atada; si no, el aviso
 */
async function atarFactura(db, { venta, facturaId, tipo }) {
  const { vincularFactura } = await import('../motor/venta/registrar.mjs')
  const r = await vincularFactura(db, { venta_id: venta.id, factura_id: String(facturaId), tipo })
  if (r.ok) return null
  console.error(`[erp] ${tipo} ${facturaId} sin atar a la venta ${venta.id}: ${r.error.codigo} ${r.error.mensaje}`)
  return `Salió con CAE, pero no quedó atada a la venta en el ERP: ${textoDelMotor(r.error)}`
}

/** Las NC (⛔ rechazadas) asociadas a una factura: lo que ya se le acreditó. */
async function ncsDeFactura(sb, facturaId) {
  const { data, error } = await sb.from('facturas').select('id, venta_id, total').eq('asociado_id', facturaId).in('tipo', [CBTE.NC_A, CBTE.NC_B]).neq('estado', 'rechazada')
  if (error) throw new Error(`facturas: ${error.message}`)
  return data
}

/** El comprobante (⛔ rechazado) de esa clave y esos tipos, o null. */
async function comprobanteDeClave(sb, { ambiente, marca, clave, tipos }) {
  const { data, error } = await sb.from('facturas').select('*').eq('ambiente', ambiente).eq('marca', marca).eq('venta_id', clave)
    .in('tipo', tipos).neq('estado', 'rechazada').order('creado_en').limit(1)
  if (error) throw new Error(`facturas: ${error.message}`)
  return data[0] || null
}

/**
 * Facturar un CAMBIO desde la Caja (Bruno, 14-oct): **NC por lo devuelto + factura por lo nuevo**, con la clase y el
 * receptor de la factura de la venta ORIGINAL (`armarFacturaDelCambio` dice cuánto). Las dos van por el MISMO lote
 * (candado, número reservado, una por clave) con la clave del CAMBIO ⇒ repetir devuelve las mismas y una que faltó
 * (se cortó a la mitad) sale sola. La NC queda asociada a la factura original y atada a la venta ORIGINAL (`nc`); la
 * factura nueva, al cambio. `simular` dice cuánto saldría, ⛔ pide nada.
 */
export async function facturarCambio({ marca, body, usuario }, deps = {}) {
  if (!MARCAS.includes(marca)) return { status: 400, error: 'Marca inválida' }
  const ventaId = String(body?.ventaId ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(ventaId)) return { status: 400, error: 'Cambio inválido' }
  const { ambiente, error: errorAmbiente } = ambienteSeguro()
  if (!ambiente) return { status: 409, error: errorAmbiente }
  const b = deps.b || (() => { const { url, key } = cfgDeMarca(marca); return createClient(url, key) })()
  const sb = deps.sb || (deps.repo ? null : baseFacturacion())
  const repo = deps.repo || repoFacturas(sb)
  const buscar = deps.buscarComprobante || ((clave, tipos) => comprobanteDeClave(sb, { ambiente, marca, clave, tipos }))
  const leerFactura = deps.leerFactura || (async (id) => { const r = await sb.from('facturas').select('*').eq('id', id).maybeSingle(); if (r.error) throw new Error(`facturas: ${r.error.message}`); return r.data })
  const ncsDe = deps.ncsDeFactura || ((id) => ncsDeFactura(sb, id))
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'Facturar el cambio', fn)

  return correr(async (db) => {
    const [cambio] = (await db.query('select * from venta_ficha where id = $1', [ventaId])).rows
    const [original] = cambio?.venta_original_id ? (await db.query('select * from venta_ficha where id = $1', [cambio.venta_original_id])).rows : []
    const atada = (original?.facturas || []).find((x) => x.tipo === 'factura')
    const facturaOriginal = atada ? await leerFactura(atada.factura_id) : null
    const frena = puedeFacturarCambio(cambio, original, { ambiente, facturaOriginal })
    if (frena) return { status: cambio ? 409 : 404, error: frena }

    // 🔴 Dos cambios de la MISMA venta facturándose a la vez verían lo mismo acreditado y juntos podrían pasarse de la
    // factura: un candado por venta original (el del lote es por clave, o sea por cambio). La simulación ⛔ lo toma.
    const candado = `cambio-factura:${original.id}`
    if (!body?.simular && !(await db.query('select pg_try_advisory_lock(hashtext($1)) as ok', [candado])).rows[0].ok) {
      return { status: 409, error: 'Otro cambio de esta venta se está facturando: probá de nuevo en un minuto.' }
    }
    try {
      const tipos = Number(facturaOriginal.tipo) === CBTE.FACTURA_A ? { nc: CBTE.NC_A, factura: CBTE.FACTURA_A } : { nc: CBTE.NC_B, factura: CBTE.FACTURA_B }
      const [ncYa, facturaYa] = await Promise.all([buscar(cambio.id, [tipos.nc]), buscar(cambio.id, [tipos.factura])])
      const otras = (await ncsDe(facturaOriginal.id)).filter((x) => String(x.venta_id) !== String(cambio.id))
      const nombres = await nombresDeVariantes(b, (cambio.lineas || []).map((l) => l.product_id))
      const plan = armarFacturaDelCambio({ cambio, original, facturaOriginal, acreditado: otras.reduce((a, x) => a + Number(x.total), 0), nombres })
      if ('error' in plan) return { status: 409, error: plan.error }
      const numero = cambio.detalle?.gn_number ?? cambio.numero
      if (body?.simular) {
        return { ok: true, simulado: true, clase: tipos.factura === CBTE.FACTURA_A ? 'A' : 'B', nc: plan.nc?.total ?? 0, factura: plan.factura?.total ?? 0, ncYa: !!ncYa, facturaYa: !!facturaYa }
      }

      // El cliente de ARCA sólo si falta pedir algo: reimprimir lo que ya salió anda sin certificado.
      const falta = (plan.nc && !ncYa) || (plan.factura && !facturaYa)
      const arca = falta ? arcaDe(deps, sb) : null
      if (falta && !arca) return { status: 409, error: SIN_ARCA }
      const hoy = diaArgentino(Date.now())
      const receptor = { docTipo: Number(facturaOriginal.doc_tipo), docNro: Number(facturaOriginal.doc_nro), condicionIva: Number(facturaOriginal.cond_iva) }
      const ptoVta = ptoVtaDe(ambiente, marca, process.env)
      const reglas = { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy }
      /** Uno de los dos comprobantes: el que ya está, o sale por el lote (con la clave del cambio). */
      const emitir = async (ya, tipo, comprobante) => {
        if (ya) return { fila: ya }
        const r = await facturarLote({ arca, repo, ambiente, marca, ptoVta, tipo, comprobantes: [{ ventaId: cambio.id, tipo, fecha: hoy, receptor, ...comprobante }], reglas, lote: globalThis.crypto.randomUUID(), usuario })
        if (r.autorizadas[0]) return { fila: r.autorizadas[0], nueva: true }
        if (r.noSalen.length) { const otra = await buscar(cambio.id, [tipo]); if (otra) return { fila: otra } }
        return { error: [...r.rechazadas, ...r.noSalen].flatMap((x) => x.motivos || []).join(' · ') || 'ARCA no la autorizó.' }
      }
      const avisos = []
      let nc = null, factura = null
      if (plan.nc) {
        const e = await emitir(ncYa, tipos.nc, {
          mes: hoy.slice(0, 7), total: plan.nc.total, asociadoId: facturaOriginal.id,
          asociado: { tipo: Number(facturaOriginal.tipo), ptoVta: Number(facturaOriginal.pto_vta), numero: Number(facturaOriginal.numero), fecha: facturaOriginal.fecha },
        })
        if (e.error) return { status: 409, error: `La nota de crédito no salió: ${e.error}` }
        if (e.fila.estado !== 'autorizada') return { status: 409, error: 'La nota de crédito del cambio está a medio pedir: probá de nuevo en un minuto.' }
        nc = filaParaPdf(e.fila, { numero, renglones: plan.nc.renglones })
        const sin = await atarFactura(db, { venta: original, facturaId: e.fila.id, tipo: 'nc' })
        if (sin) avisos.push(sin)
      }
      if (plan.factura) {
        const e = await emitir(facturaYa, tipos.factura, { mes: mesDeVenta(cambio.ocurrida_en), total: plan.factura.total })
        if (e.error) return { status: 409, error: `${nc ? 'Salió la nota de crédito, pero la factura de lo nuevo no: ' : 'La factura de lo nuevo no salió: '}${e.error}` }
        if (e.fila.estado !== 'autorizada') return { status: 409, error: 'La factura del cambio está a medio pedir: probá de nuevo en un minuto.' }
        factura = filaParaPdf(e.fila, { numero, renglones: plan.factura.renglones })
        const sin = await atarFactura(db, { venta: cambio, facturaId: e.fila.id, tipo: 'factura' })
        if (sin) avisos.push(sin)
      }
      const receptorPdf = await receptorDeFicha(db, { empresaId: cambio.empresa_id, factura: facturaOriginal })
      for (const x of [nc, factura]) if (x && receptorPdf) Object.assign(x, { receptor_nombre: receptorPdf.nombre, receptor_domicilio: receptorPdf.domicilio })
      return { ok: true, yaEstaban: !!(ncYa || !plan.nc) && !!(facturaYa || !plan.factura), nc, factura, avisos }
    } finally {
      if (!body?.simular) await db.query('select pg_advisory_unlock(hashtext($1))', [candado]).catch(() => {})
    }
  })
}

/** La factura (⛔ rechazada) que ya tiene esa clave en `facturas`, o null. */
async function facturaDeClave(sb, { ambiente, marca, clave }) {
  const { data, error } = await sb.from('facturas').select('*').eq('ambiente', ambiente).eq('marca', marca).eq('venta_id', clave)
    .in('tipo', [CBTE.FACTURA_A, CBTE.FACTURA_B]).neq('estado', 'rechazada').order('creado_en').limit(1)
  if (error) throw new Error(`facturas: ${error.message}`)
  return data[0] || null
}

/** Una fila de `facturas` con la forma de `FacturaEmitida` (el PDF). */
function filaParaPdf(f, { numero, renglones, receptor = null }) {
  return {
    id: f.id, ambiente: f.ambiente, marca: f.marca, venta_id: f.venta_id, tipo: Number(f.tipo), pto_vta: Number(f.pto_vta),
    numero: Number(f.numero), fecha: f.fecha, total: Number(f.total), neto: Number(f.neto), iva: Number(f.iva),
    doc_tipo: Number(f.doc_tipo), doc_nro: Number(f.doc_nro), cond_iva: Number(f.cond_iva), estado: f.estado, cae: f.cae, cae_vence: f.cae_vence,
    venta_numero: numero != null ? String(numero) : null, renglones,
    receptor_nombre: receptor?.nombre ?? null, receptor_domicilio: receptor?.domicilio ?? null,
  }
}

/** Cuánto atrás puede empezar la espera de un cambio (la pantalla manda cuándo empezó). */
const ESPERA_MAXIMA_MS = 6 * 3600_000

/**
 * ¿Llegó la transferencia del cambio? Con la MISMA lectura de Mercado Pago y el MISMO cruce que la Caja
 * (`cruzarTransferencia`). Los pagos ya tomados: los de la Caja (`caja_venta`, `caja_venta_mp`) y los de los
 * cambios del motor (`venta.detalle.mp`). Sin cuenta de MP conectada: lo confirma el admin con el comprobante.
 * 🔴 La Caja ⛔ ve los pagos que toma un cambio (es de prueba y la Caja vende a GN): al corte, un candado común.
 */
async function esperarTransferencia({ sb, db, marca, c, espera, usuario }) {
  const ahora = Date.now()
  const desde = new Date(c.desde && c.desde <= ahora && c.desde > ahora - ESPERA_MAXIMA_MS ? c.desde : ahora).toISOString()
  // BDI ⛔ tiene la tabla de las cuentas de MP (14-oct): es lo mismo que «sin cuenta conectada».
  const usos = await usosDe(sb, marca).catch((e) => {
    if (e && (e.code === 'PGRST205' || e.code === '42P01')) return []
    throw e
  })
  if (!usos.length) {
    if (c.comprobante && c.comprobante.length >= 4) return { llego: true, mp: { cruce: 'admin', comprobante: c.comprobante, por: usuario || null, en: new Date(ahora).toISOString() } }
    return { llego: false, para: { desde, cruce: { estado: 'sin_cuenta', motivo: 'Esta tienda todavía no tiene la cuenta de Mercado Pago conectada: mirá el comprobante en el teléfono de la clienta y confirmá con el número de operación.' } } }
  }
  const hace2d = new Date(Date.parse(desde) - 2 * 86400000).toISOString()
  const [porDia, unoSolo, sumados, deCambios] = await Promise.all([
    Promise.all(diasDelCruce(Date.parse(desde), ahora).map((dia) => pagosDelDia(sb, usos, dia))),
    sb.from('caja_venta').select('mp_pago_id').eq('store', marca).not('mp_pago_id', 'is', null).gte('creada_en', hace2d),
    sb.from('caja_venta_mp').select('mp_pago_id').eq('store', marca).gte('creado_en', hace2d),
    db.query(`select detalle->'mp'->>'pago_id' as id from venta where marca = $1 and estado = 'confirmada' and detalle->'mp'->>'pago_id' is not null and registrada_en >= $2`, [marca, hace2d]),
  ])
  if (unoSolo.error) throw new Error(unoSolo.error.message)
  if (sumados.error && sumados.error.code !== '42P01') throw new Error(sumados.error.message)
  const vistos = new Set()
  const pagos = porDia.flatMap((x) => x.pagos).filter((p) => !vistos.has(p.id) && vistos.add(p.id))
  const reclamados = [...(unoSolo.data || []), ...(sumados.data || [])].map((r) => r.mp_pago_id).concat(deCambios.rows.map((r) => r.id))
  const d = cruzarTransferencia({ monto: espera, desde, pagos, reclamados, competidoras: 0, elegido: c.pago, antesManual: ANTES_MANUAL_MS })
  if (d.estado === 'llego') return { llego: true, mp: { pago_id: String(d.pago.id), cruce: d.por, pago_en: d.pago.cuando, diferencia: d.pago.diferencia || 0, por: usuario || null } }
  const recientes = pagosRecientes({ monto: espera, desde, pagos, reclamados, cuantos: RECIENTES_CAJA })
  return { llego: false, para: { desde, cruce: d, recientes } }
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
  const nombres = await nombresDeVariantes(b, ids)
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
  const inv = await b.from('inventario').select('product_name, sku, barcode').eq('product_id', producto)
  if (inv.error) throw new Error(`inventario: ${inv.error.message}`)
  const skus = [...new Set((inv.data || []).map((x) => x.sku).filter(Boolean))]
  const linea = lineaDelProducto(marca, skus)
  // Todo por (LÍNEA, producto): las vistas del motor son por marca, y en la base de Zattia conviven zattia y stunned.
  const [listas, vigentes, efectivos, costo, hPrecio, hCosto, gn, lecturas] = await Promise.all([
    b.from('lista_precio').select('id, nombre'),
    b.from('precio_vigente').select('lista, precio, fuente, vigente_desde, usuario, motivo').eq('marca', linea).eq('product_id', producto),
    b.from('precio_lista').select('lista, precio, fuente, de_lista').eq('marca', linea).eq('product_id', producto),
    b.from('costo_vigente').select('costo, proveedor, fuente, vigente_desde, usuario, motivo').eq('marca', linea).eq('product_id', producto).limit(1),
    b.from('producto_precio').select('lista, precio, fuente, vigente_desde, usuario, motivo').eq('marca', linea).eq('product_id', producto).order('vigente_desde', { ascending: false }).limit(40),
    b.from('producto_costo').select('costo, proveedor, fuente, vigente_desde, usuario, motivo').eq('marca', linea).eq('product_id', producto).order('vigente_desde', { ascending: false }).limit(40),
    b.from('productos').select('retailer_price, wholesaler_price, unit_cost').eq('id', producto).maybeSingle(),
    b.from('tn_catalogo_lectura').select('tienda, leida_en'),
  ])
  for (const [t, r] of [['lista_precio', listas], ['precio_vigente', vigentes], ['costo_vigente', costo], ['producto_precio', hPrecio], ['producto_costo', hCosto], ['productos', gn], ['tn_catalogo_lectura', lecturas]]) {
    if (r.error) throw new Error(`${t}: ${r.error.message}`)
  }
  // `precio_lista` llega con sql/011: sin ella, lo vigente de cada lista tal cual (⛔ es un error).
  if (efectivos.error && !/precio_lista/.test(efectivos.error.message)) throw new Error(`precio_lista: ${efectivos.error.message}`)
  // TN por SKU (como lo guardó TN y en mayúsculas, sin espacios) y por código de barras: como cruza la copia del motor.
  const claves = [...new Set(skus.flatMap((s) => [s, s.trim().toUpperCase()]))]
  const barras = [...new Set((inv.data || []).map((x) => x.barcode).filter(Boolean))]
  const [porSku, porBarra] = await Promise.all([
    claves.length ? b.from('tn_variante').select('tienda, variant_id, sku, precio, precio_promocional, costo').in('sku', claves) : { data: [] },
    barras.length ? b.from('tn_variante').select('tienda, variant_id, sku, precio, precio_promocional, costo').in('barcode', barras) : { data: [] },
  ])
  for (const r of [porSku, porBarra]) if (r.error) throw new Error(`tn_variante: ${r.error.message}`)
  const tn = [...new Map([...porSku.data, ...porBarra.data].map((v) => [`${v.tienda}/${v.variant_id}`, v])).values()]
  const tienda = tn[0]?.tienda
  return {
    producto: String(producto), nombre: inv.data[0]?.product_name ?? null, skus: skus.length, linea,
    tnLeidaEn: (lecturas.data || []).find((x) => x.tienda === tienda)?.leida_en ?? null,
    ...armarPrecioDeProducto({
      listas: listas.data, vigentes: vigentes.data, efectivos: efectivos.error ? null : efectivos.data, costo: costo.data[0] ?? null,
      historialPrecio: hPrecio.data, historialCosto: hCosto.data, gn: gn.data, tn,
    }),
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
  const c = leerCarga(body, { hoy: diaArgentino(Date.now()) })
  if (c.error) return { status: 400, error: c.error }
  const b = deps.b || (() => { const { url, key } = cfgDeMarca(marca); return createClient(url, key) })()
  const inv = await b.from('inventario').select('sku').eq('product_id', c.producto)
  if (inv.error) throw new Error(`inventario: ${inv.error.message}`)
  if (!inv.data.length) return { status: 404, error: 'El producto no está en el espejo de GN.' }
  const linea = lineaDelProducto(marca, inv.data.map((x) => x.sku))
  const correr = deps.db ? (fn) => fn(deps.db) : (fn) => conMotor(marca, 'Cargar precios', fn)
  return correr(async (db) => {
    const { cargarPrecio, cargarCosto } = await import('../motor/venta/precio.mjs')
    const comun = { marca: linea, product_id: Number(c.producto), vigente_desde: c.desde, usuario: usuario || 'admin', motivo: c.motivo }
    const r = c.que === 'precio'
      ? await cargarPrecio(db, { ...comun, lista: c.lista, precio: c.monto })
      : await cargarCosto(db, { ...comun, costo: c.monto, proveedor: c.proveedor })
    if (!r.ok) return { status: 409, error: r.error.mensaje }
    // Sin «desde» tiene que valer YA: si lo vigente ⛔ es lo recién cargado, se dice (⛔ «cargado» callado).
    const fila = r.precio ?? r.costo, v = r.vigente
    const esLaMisma = v && v.fuente === 'carga' && Number(v[c.que]) === Number(fila[c.que]) && Date.parse(v.vigente_desde) === Date.parse(fila.vigente_desde)
    const aviso = !c.desde && !esLaMisma ? 'Quedó guardado, pero lo vigente sigue siendo otra fila: revisá el historial.' : null
    return { ok: true, futuro: !!c.desde, aviso }
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

    if (req.method === 'GET' && req.query.vista === 'ventas') {
      const r = await buscarVentas({ marca: String(req.query.marca || ''), q: req.query.q, desde: req.query.desde, hasta: req.query.hasta })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'venta') {
      const r = await fichaDeVenta({ marca: String(req.query.marca || ''), id: req.query.id })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'clientas') {
      const r = await clientasDeLaCaja({ marca: String(req.query.marca || ''), q: req.query.q })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (req.method === 'GET' && req.query.vista === 'saldo') {
      const r = await saldoDeClienta({ marca: String(req.query.marca || ''), doc: req.query.doc })
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

    if (body.accion === 'anular') {
      const r = await anularVentaPropia({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'cambiar') {
      const r = await cambiarVentaPropia({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'nota-credito-venta') {
      const r = await notaDeCreditoDeVenta({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'facturar-cambio') {
      const r = await facturarCambio({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    if (body.accion === 'facturar-venta') {
      const r = await facturarVentaPropia({ marca: String(body.marca || ''), body, usuario: perfil.name || perfil.user || null })
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
