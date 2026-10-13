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
 *   POST {recurso:'erp', accion:'cerrar', mes}                      congela el techo del mes
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
import { CBTE, COND_IVA, DOC, ambienteDeEntorno, ptoVtaDe } from '../lib/arca/arca.core.js'
import { techoDelMes } from '../lib/arca/techo.core.js'
import { claveVenta, resumenDelMes, ventasParaFacturar } from '../lib/arca/mes.core.js'
import { POR_PEDIDO, facturarLote } from '../lib/arca/lote.core.js'
import { diaArgentino } from '../lib/envios/portal.core.js'

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
 * Las facturas que el monitor emitió en el mes (autorizadas, del ambiente de hoy), con lo que el PDF
 * necesita: la fila tal como se le mandó a ARCA y el número de la venta en GN para el renglón.
 */
export async function facturasDelMes(mes) {
  const { ambiente, error } = ambienteSeguro()
  if (!ambiente) return { status: 409, error }
  const sb = baseFacturacion()
  const facturas = await leerTodo(sb, 'facturas', (q) => q
    .select('id, ambiente, marca, venta_id, tipo, pto_vta, numero, fecha, total, neto, iva, doc_tipo, doc_nro, cond_iva, estado, cae, cae_vence')
    .eq('ambiente', ambiente).eq('mes', mes).eq('estado', 'autorizada').order('creado_en'))
  const numeros = new Map()
  for (const marca of MARCAS) {
    const ids = [...new Set(facturas.filter((f) => f.marca === marca).map((f) => f.venta_id))]
    if (!ids.length) continue
    const { url, key } = cfgDeMarca(marca)
    const b = createClient(url, key)
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error: e } = await b.from('ventas').select('id, number').in('id', ids.slice(i, i + 300))
      if (e) throw new Error(`ventas (${marca}): ${e.message}`)
      for (const v of data) numeros.set(claveVenta(marca, v.id), v.number != null ? String(v.number) : null)
    }
  }
  return {
    ambiente,
    facturas: facturas.map((f) => ({
      ...f, total: Number(f.total), neto: Number(f.neto), iva: Number(f.iva), numero: Number(f.numero), doc_nro: Number(f.doc_nro),
      venta_numero: numeros.get(claveVenta(f.marca, f.venta_id)) ?? null,
    })),
  }
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

    if (body.accion === 'facturar') {
      const r = await facturarVentas({ mes, marca: String(body.marca || ''), ventaIds: body.ventaIds, usuario: perfil.name || perfil.user || null })
      return res.status(r.status || 200).json(r.status ? { error: r.error } : r)
    }

    return res.status(400).json({ error: 'Acción inválida' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
