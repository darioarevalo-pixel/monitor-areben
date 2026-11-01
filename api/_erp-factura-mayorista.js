/**
 * Facturación de MAYORISTAS desde el panel de WhatsApp (pedido de Darío §5; decidido por Bruno 31-oct). Lo puro está en
 * `lib/erp/factura-mayorista.core.js`; las filas, en `facturas` (base de BDI, `sql/migrate-facturas-mayorista.sql`).
 *
 *   - factura LIBRE: sin venta («100 fundas» con nuestro nombre y precio a mano). Suma al techo del mes (`mes`), ⛔ mueve stock
 *     ni toca la cuenta corriente: el motor ni se entera, salvo la ficha si se completan los datos fiscales en el mismo paso.
 *   - las facturas de la FICHA del cliente (`cliente_id`).
 *
 * Doble llave, como el pedido: verlo = `PANEL_CUENTA_CORRIENTE`; facturar ADEMÁS `VENTA_MAYORISTA_REAL` (en producción el
 * ambiente de ARCA es el REAL: una factura con CAE ⛔ se borra).
 */
import { CBTE, cuitValido, ptoVtaDe } from '../motor/arca/arca.core.js'
import { facturarLote } from '../motor/arca/lote.core.js'
import { diaArgentino } from '../lib/envios/portal.core.js'
import {
  facturacionDelPedido, leerFacturaLibre, leerParte, leerRenglones, opcionDeCondicionPanel, partePorMonto, productosPendientes, quedaPorFacturar,
  receptorMayorista,
} from '../lib/erp/factura-mayorista.core.js'
import { claveDeFactura, clavesDeFactura, puedeFacturar } from '../lib/erp/factura.core.js'
import { SIN_ARCA, baseFacturacion, repoFacturas } from './_facturacion.js'
import { panelCuentaPrendido } from './_erp-clientes.js'
import { escribirPrendido, nombresDe } from './_erp-pedido.js'
import { pedirFacturaPorMail } from '../lib/mailer/factura.core.js'
import { UMBRAL_IDENTIFICAR, ambienteSeguro, arcaDe, facturarVentaPropia, filaParaPdf } from './_erp.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIN_MIGRAR = 'Falta la migración de la facturación de mayoristas (sql/migrate-facturas-mayorista.sql).'

/**
 * El `repo` del lote, con los campos de la factura que el lote ⛔ conoce (clase, renglones, cliente, venta de la parte) puestos
 * en la fila que RESERVA: así quedan desde el primer momento, también si la corrida se corta antes del CAE.
 * @param {any} repo @param {Map<string, object>} extras venta_id → campos
 */
export function repoConExtras(repo, extras) {
  return { ...repo, reservar: (filas) => repo.reservar(filas.map((f) => ({ ...f, ...(extras.get(String(f.venta_id)) || {}) }))) }
}

/** La ficha fiscal del cliente (motor de BDI). */
const leerFicha = async (pg, clienteId) =>
  (await pg.query('select id, empresa_id, doc, nombre, razon_social, condicion_iva, domicilio, email from cliente where id = $1', [clienteId])).rows[0] ?? null

/**
 * Completa la ficha con lo que se pidió en el mismo paso (`ponerFiscalCliente` del motor: la MISMA ficha, ⛔ otra).
 * @returns {Promise<null | { status: number, error: string }>}
 */
async function completarFicha(pg, ficha, datos) {
  const m = await import('../motor/venta/cliente.mjs')
  if (typeof m.ponerFiscalCliente !== 'function') return { status: 409, error: 'Falta traer el motor con los datos fiscales de la ficha.' }
  const r = await m.ponerFiscalCliente(pg, {
    empresa_id: ficha.empresa_id, cliente_id: ficha.id, doc: datos.doc || undefined, condicion_iva: datos.condicionIva,
    razon_social: datos.razonSocial || undefined, domicilio: datos.domicilio || undefined,
  })
  return r.ok ? null : { status: 409, error: r.error?.mensaje ?? 'No se pudo completar la ficha.' }
}

/**
 * La factura LIBRE. `body`: `{ clienteId, renglones: [{ descripcion, cantidad, unitario }], doc?, condicion?, razonSocial?, domicilio? }`.
 * Sin datos fiscales suficientes contesta 409 con `falta` (la pantalla los pide en el mismo paso y vuelve a mandar).
 * @param {{ body: any, usuario: string|null, quien?: any }} p
 * @param {{ conMotor: Function, prendido?: boolean, escribir?: boolean, arca?: any, repo?: any, sb?: any, env?: any }} deps
 */
export async function facturaLibrePanel({ body, usuario, quien = usuario }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, quien))) return { status: 409, error: 'La cuenta corriente del panel está apagada.' }
  if (!(deps.escribir ?? (await escribirPrendido()))) return { status: 409, error: 'Se factura desde acá el día que BDI pasa al ERP. Hasta entonces, en Gestión Nube.' }
  if (!usuario) return { status: 400, error: 'Falta quién lo hace' }
  const p = leerFacturaLibre(body)
  if (p.error) return { status: 400, error: p.error }
  const { ambiente, error: errorAmbiente } = ambienteSeguro()
  if (!ambiente) return { status: 409, error: errorAmbiente }
  const sb = deps.sb || (deps.repo ? null : baseFacturacion())

  return deps.conMotor('bdi', 'La factura', async (pg) => {
    const ficha = await leerFicha(pg, p.clienteId)
    if (!ficha) return { status: 404, error: 'No está ese cliente.' }
    const rec = receptorMayorista(ficha, p.datos)
    if (rec.falta) return { status: 409, error: rec.falta, falta: true }
    const arca = arcaDe(deps, sb)
    if (!arca) return { status: 409, error: SIN_ARCA }
    if (rec.guardar) {
      const mal = await completarFicha(pg, ficha, rec.ficha)
      if (mal) return mal
    }
    const hoy = diaArgentino(Date.now())
    const ventaId = `libre:${globalThis.crypto.randomUUID()}`
    const extras = new Map([[ventaId, { clase: 'libre', renglones: p.renglones, cliente_id: ficha.id }]])
    const r = await facturarLote({
      arca, repo: repoConExtras(deps.repo || repoFacturas(sb), extras), ambiente, marca: 'bdi',
      ptoVta: ptoVtaDe(ambiente, 'bdi', deps.env || process.env), tipo: rec.tipo,
      comprobantes: [{ ventaId, mes: hoy.slice(0, 7), tipo: rec.tipo, fecha: hoy, total: p.total, receptor: rec.receptor }],
      reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
      lote: globalThis.crypto.randomUUID(), usuario,
    })
    const [hecha] = r.autorizadas
    if (!hecha) {
      const motivos = [...r.rechazadas, ...r.noSalen].flatMap((x) => x.motivos || [])
      return { status: 409, error: `ARCA no la autorizó: ${motivos.join(' · ') || 'sin motivo'}` }
    }
    const receptor = { nombre: rec.ficha.razonSocial || ficha.razon_social || ficha.nombre, domicilio: rec.ficha.domicilio || ficha.domicilio || null }
    return { ok: true, factura: { ...filaParaPdf(hecha, { numero: null, renglones: p.renglones, receptor }), clase: 'libre' } }
  })
}

/**
 * Las facturas de la ficha del cliente (las que salieron desde el panel: libre y por partes), con lo que hace falta para el PDF,
 * y los datos fiscales de la ficha (para saber qué pedir antes de facturar). Sólo lee.
 * @param {{ clienteId?: string, usuario?: any }} p @param {{ conMotor: Function, prendido?: boolean, sb?: any }} deps
 */
export async function facturasDeClientePanel({ clienteId = '', usuario = null }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, usuario))) return { prendido: false }
  if (!UUID.test(String(clienteId))) return { status: 400, error: 'Falta el cliente' }
  const { ambiente, error } = ambienteSeguro()
  if (!ambiente) return { status: 409, error }
  const ficha = await deps.conMotor('bdi', 'La ficha del cliente', (pg) => leerFicha(pg, String(clienteId)))
  if (ficha && typeof ficha === 'object' && ficha.status) return ficha
  if (!ficha) return { status: 404, error: 'No está ese cliente.' }
  const sb = deps.sb || baseFacturacion()
  const { data, error: e } = await sb.from('facturas')
    .select('id, ambiente, marca, venta_id, venta_ref, clase, tipo, pto_vta, numero, fecha, total, neto, iva, doc_tipo, doc_nro, cond_iva, estado, cae, cae_vence, renglones')
    .eq('ambiente', ambiente).eq('cliente_id', String(clienteId)).eq('estado', 'autorizada').order('creado_en', { ascending: false }).limit(100)
  const fiscal = {
    doc: ficha.doc ?? null, razonSocial: ficha.razon_social ?? null, domicilio: ficha.domicilio ?? null, email: ficha.email ?? null,
    condicion: opcionDeCondicionPanel(ficha.condicion_iva),
  }
  if (e) {
    if (e.code === '42703') return { prendido: true, ambiente, fiscal, facturas: [], sinMigrar: SIN_MIGRAR }
    throw new Error(`facturas: ${e.message}`)
  }
  const receptor = { nombre: ficha.razon_social || ficha.nombre, domicilio: ficha.domicilio ?? null }
  return {
    prendido: true, ambiente, fiscal,
    facturas: (data || []).map((f) => ({ ...filaParaPdf(f, { numero: null, renglones: f.renglones || [], receptor }), clase: f.clase, venta_ref: f.venta_ref ?? null })),
  }
}

/**
 * En qué quedó la facturación de la venta de un pedido (la hoja: «Facturado ✓» / «Facturado $X de $Y»). La entera está en
 * `venta_id` = la venta; cada parte en `<venta>:parte:<uuid>` (con `venta_ref`); sus NC llevan el mismo `venta_id`.
 * @param {any} sb @param {{ ambiente: string, ventaId: string, total: number }} p
 */
export async function facturacionDeVenta(sb, { ambiente, ventaId, total }) {
  if (!UUID.test(String(ventaId))) return facturacionDelPedido([], total)
  const { data, error } = await sb.from('facturas').select('id, tipo, clase, total, asociado_id, pto_vta, numero, fecha')
    .eq('ambiente', ambiente).eq('estado', 'autorizada')
    .or(`venta_id.eq.${ventaId},venta_id.like."${ventaId}:parte:*",venta_ref.eq.${ventaId}`)
  if (error) throw new Error(`facturas: ${error.message}`)
  return facturacionDelPedido(data || [], total)
}

/**
 * La hoja del pedido con su facturación. Si la base de facturas ⛔ contesta, la hoja sale igual, sin el dato (`null`):
 * la hoja es para trabajar el pedido, ⛔ se cae por esto.
 * @param {any} r lo que devolvió `pedidoDelPanel` @param {{ sb?: any }} deps
 */
export async function conFacturacion(r, deps = {}) {
  if (!r?.prendido || !r.pedido?.venta_id) return r
  const { ambiente } = ambienteSeguro()
  if (!ambiente) return { ...r, facturacion: null }
  try {
    const facturacion = await facturacionDeVenta(deps.sb || baseFacturacion(), { ambiente, ventaId: String(r.pedido.venta_id), total: Number(r.pedido.total) })
    return { ...r, facturacion }
  } catch (e) {
    console.error(`[erp] facturación del pedido ${r.pedido.id}: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}`)
    return { ...r, facturacion: null }
  }
}

/**
 * «Facturar» desde la HOJA DEL PEDIDO: la factura ENTERA de su venta, a la FICHA del pedido (Darío §5). Es la misma puerta
 * que la Caja (`facturarVentaPropia`: candado, «ya tiene factura», frena con partes), con el receptor de la ficha y la fila
 * marcada `clase: 'venta'` + `cliente_id` (así sale en «Facturas» de la tarjeta y se manda por mail). Sin datos fiscales se
 * piden en el mismo paso y se guardan en la MISMA ficha (`ponerFiscalCliente`).
 * `body`: `{ pedidoId, doc?, condicion?, razonSocial?, domicilio? }`.
 * @param {{ body: any, usuario: string|null, quien?: any }} p
 * @param {{ conMotor: Function, prendido?: boolean, escribir?: boolean, arca?: any, repo?: any, sb?: any, b?: any, leerPedido?: Function, buscarFactura?: Function, tienePartes?: Function }} deps
 */
export async function facturarPedidoPanel({ body, usuario, quien = usuario }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, quien))) return { status: 409, error: 'La cuenta corriente del panel está apagada.' }
  if (!(deps.escribir ?? (await escribirPrendido()))) return { status: 409, error: 'Se factura desde acá el día que BDI pasa al ERP. Hasta entonces, en Gestión Nube.' }
  if (!usuario) return { status: 400, error: 'Falta quién lo hace' }
  const pedidoId = String(body?.pedidoId ?? '')
  if (!UUID.test(pedidoId)) return { status: 400, error: 'Falta el pedido' }
  const datos = { doc: body?.doc, condicion: body?.condicion, razonSocial: body?.razonSocial, domicilio: body?.domicilio }
  const sb = deps.sb || (deps.repo ? null : baseFacturacion())

  return deps.conMotor('bdi', 'La factura del pedido', async (pg) => {
    const leer = deps.leerPedido || (async (db, e) => (await import('../motor/pedido/venta.mjs')).fichaDePedidoMayorista(db, e))
    const r = await leer(pg, { pedido_id: pedidoId })
    if (!r.ok) return { status: r.error?.codigo === 'NO_ENCONTRADO' ? 404 : 400, error: r.error?.mensaje ?? 'No se pudo leer el pedido.' }
    const p = r.pedido
    if (p.anulado_en) return { status: 409, error: 'El pedido está anulado: no se factura.' }
    if (!p.venta_id || !p.cliente_id) return { status: 409, error: 'El pedido todavía no entró al ERP con un cliente.' }
    const ficha = await leerFicha(pg, String(p.cliente_id))
    if (!ficha) return { status: 404, error: 'No está la ficha del cliente del pedido.' }
    const rec = receptorMayorista(ficha, datos)
    if (rec.falta) return { status: 409, error: rec.falta, falta: true }
    if (rec.guardar) {
      const mal = await completarFicha(pg, ficha, rec.ficha)
      if (mal) return mal
    }
    const ventaId = String(p.venta_id)
    const repo = deps.repo || repoFacturas(sb)
    const hecha = await facturarVentaPropia({ marca: 'bdi', body: { ventaId }, usuario }, {
      db: pg, sb, arca: deps.arca, b: deps.b, buscarFactura: deps.buscarFactura, tienePartes: deps.tienePartes,
      repo: { ...repo, reservar: (filas) => repo.reservar(filas.map((f) => ({ ...f, clase: 'venta', cliente_id: ficha.id }))) },
      pedida: { ventaId, tipo: rec.tipo, receptor: rec.receptor },
      receptorPdf: { nombre: rec.ficha.razonSocial || ficha.razon_social || ficha.nombre, domicilio: rec.ficha.domicilio || ficha.domicilio || null },
    })
    if (hecha.status) return hecha
    return { ...hecha, factura: { ...hecha.factura, clase: 'venta' } }
  })
}

const FACTURAS = [CBTE.FACTURA_A, CBTE.FACTURA_B]
const NCS = [CBTE.NC_A, CBTE.NC_B]
const cts = (x) => Math.round(Number(x) * 100)
const plataTexto = (n) => `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`

/**
 * Lo facturado de una venta, de `facturas` (la base de BDI): si tiene la ENTERA viva (cualquiera de sus claves, como la busca
 * `facturarVentaPropia`) y sus PARTES (`venta_ref` = la clave) con sus renglones y lo que les acreditaron sus NC. Cuenta lo
 * que ⛔ está rechazado, como el disparador `facturas_no_pasarse` (una reservada ya ocupa lugar).
 * @param {any} sb @param {{ ambiente: string, clave: string, claves: string[] }} p
 * @returns {Promise<{ sinMigrar: true } | { entera: boolean, partes: Array<{ id: string, total: number, acreditado: number, renglones: any[] }> }>}
 */
export async function facturasDeVentaParte(sb, { ambiente, clave, claves }) {
  const ent = await sb.from('facturas').select('id').eq('ambiente', ambiente).eq('marca', 'bdi').in('venta_id', claves)
    .eq('clase', 'venta').in('tipo', FACTURAS).neq('estado', 'rechazada').limit(1)
  if (ent.error) {
    if (ent.error.code === '42703') return { sinMigrar: true }
    throw new Error(`facturas (entera): ${ent.error.message}`)
  }
  const ps = await sb.from('facturas').select('id, total, renglones').eq('ambiente', ambiente).eq('marca', 'bdi').eq('venta_ref', clave)
    .eq('clase', 'parte').in('tipo', FACTURAS).neq('estado', 'rechazada')
  if (ps.error) throw new Error(`facturas (partes): ${ps.error.message}`)
  const ids = (ps.data || []).map((p) => String(p.id))
  const acreditado = new Map()
  if (ids.length) {
    const nc = await sb.from('facturas').select('asociado_id, total').in('asociado_id', ids).in('tipo', NCS).neq('estado', 'rechazada')
    if (nc.error) throw new Error(`facturas (NC de las partes): ${nc.error.message}`)
    for (const n of nc.data || []) acreditado.set(String(n.asociado_id), (acreditado.get(String(n.asociado_id)) || 0) + cts(n.total))
  }
  return {
    entera: (ent.data || []).length > 0,
    partes: (ps.data || []).map((p) => ({ id: String(p.id), total: Number(p.total), acreditado: (acreditado.get(String(p.id)) || 0) / 100, renglones: p.renglones || [] })),
  }
}

/** El motivo del disparador `facturas_no_pasarse`, dicho para la pantalla (la base frena aunque la puerta ya lo haya medido). */
function motivoDeLaBase(e) {
  const m = e instanceof Error ? e.message : String(e)
  if (!/FACTURA_PARTE/.test(m)) return null
  if (/entera/.test(m)) return 'La venta ya tiene la factura entera: no se factura por partes.'
  if (/se pasa/.test(m)) return 'Con esta parte se pasa del total de la venta (otra parte salió recién): volvé a abrir y mirá cuánto queda.'
  return 'La base no dejó hacer esta parte.'
}

/**
 * «Facturar una PARTE» desde la HOJA DEL PEDIDO (Darío §5; Bruno 31-oct: «facturar por partes SÍ se hace»). Dos pasos, la
 * misma acción:
 *   - `proponer` (⛔ factura): lo que queda de la venta y los productos que todavía ⛔ entraron en una parte; con `monto`, la
 *     propuesta de renglones (`partePorMonto`: 'ajustados' —el default, «la mayoría»: los precios cambian para que dé JUSTO el
 *     monto— o 'reales').
 *   - `emitir`: los renglones como los dejó Darío (corregibles) ⇒ una factura `clase: 'parte'` por su total, ≤ lo que queda.
 * El tope es el TOTAL de la venta (`venta_ficha`); la llave es `<clave>:parte:<uuid>` con `venta_ref` = la clave con que
 * factura la entera (`claveDeFactura`): así el freno de la entera (`conPartes`) y el de la parte se ven. 🔴 Con la entera viva
 * la parte ⛔ sale; y pasarse lo frena además la BASE (dos partes a la vez). El mes del techo es el de HOY (la parte se
 * factura hoy, como la libre). ⛔ mueve stock ni la cuenta corriente: la venta ya existe.
 * @param {{ body: any, usuario: string|null, quien?: any }} p
 * @param {{ conMotor: Function, prendido?: boolean, escribir?: boolean, arca?: any, repo?: any, sb?: any, env?: any, leerPedido?: Function, facturasDeVenta?: Function, nombres?: Function }} deps
 */
export async function partePedidoPanel({ body, usuario, quien = usuario }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, quien))) return { status: 409, error: 'La cuenta corriente del panel está apagada.' }
  if (!(deps.escribir ?? (await escribirPrendido()))) return { status: 409, error: 'Se factura desde acá el día que BDI pasa al ERP. Hasta entonces, en Gestión Nube.' }
  if (!usuario) return { status: 400, error: 'Falta quién lo hace' }
  const x = leerParte(body)
  if (x.error) return { status: 400, error: x.error }
  const { ambiente, error: errorAmbiente } = ambienteSeguro()
  if (!ambiente) return { status: 409, error: errorAmbiente }
  const sb = deps.sb || (deps.repo && deps.facturasDeVenta ? null : baseFacturacion())

  return deps.conMotor('bdi', 'La parte del pedido', async (pg) => {
    const leer = deps.leerPedido || (async (db, e) => (await import('../motor/pedido/venta.mjs')).fichaDePedidoMayorista(db, e))
    const r = await leer(pg, { pedido_id: x.pedidoId })
    if (!r.ok) return { status: r.error?.codigo === 'NO_ENCONTRADO' ? 404 : 400, error: r.error?.mensaje ?? 'No se pudo leer el pedido.' }
    const p = r.pedido
    if (p.anulado_en) return { status: 409, error: 'El pedido está anulado: no se factura.' }
    if (!p.venta_id || !p.cliente_id) return { status: 409, error: 'El pedido todavía no entró al ERP con un cliente.' }
    const [f] = (await pg.query('select * from venta_ficha where id = $1', [String(p.venta_id)])).rows
    const frena = puedeFacturar(f, { ambiente, facturada: (f?.facturas || []).some((v) => v.tipo === 'factura') })
    if (frena) return { status: f ? 409 : 404, error: frena }
    const clave = claveDeFactura(f)
    const hechas = await (deps.facturasDeVenta || facturasDeVentaParte)(sb, { ambiente, clave, claves: clavesDeFactura(f) })
    if (hechas.sinMigrar) return { status: 409, error: SIN_MIGRAR }
    if (hechas.entera) return { status: 409, error: 'La venta ya tiene la factura entera: no se factura por partes.' }

    // Lo vendido, de la VENTA (sus precios reales: importe ÷ cantidad), con los nombres de la hoja.
    const lineas = (f.lineas || []).filter((l) => Number(l.cantidad) > 0 && l.size_id != null)
    const n = await (deps.nombres || nombresDe)(pg, lineas)
    const vendidos = lineas.map((l) => {
      const k = `${Number(l.product_id)}:${Number(l.size_id)}`
      const nombre = n.producto.get(String(l.product_id)) ?? l.sku ?? `Producto ${l.product_id}`
      return { clave: k, descripcion: [nombre, n.talle.get(k)].filter(Boolean).join(' - '), cantidad: Number(l.cantidad), unitario: Number(l.importe) / Number(l.cantidad) }
    })
    // Una parte que su NC dejó en cero devuelve también sus productos.
    const vivas = hechas.partes.filter((q) => cts(q.total) - cts(q.acreditado) > 0)
    const pendientes = productosPendientes(vendidos, vivas)
    const estado = quedaPorFacturar(Number(f.total), hechas.partes)
    if (!(estado.queda > 0)) return { status: 409, error: 'La venta ya está facturada entera, por partes.' }
    if (x.monto != null && cts(x.monto) > cts(estado.queda)) return { status: 409, error: `Quedan ${plataTexto(estado.queda)} por facturar de esta venta.` }

    if (x.paso === 'proponer') {
      const base = { ok: true, ...estado, partes: hechas.partes.length, pendientes }
      if (x.monto == null) return base
      const prop = partePorMonto({ pendientes, monto: x.monto, precios: x.precios })
      if (prop.error) return { status: 409, error: prop.error }
      return { ...base, precios: x.precios, propuesta: prop }
    }

    const lr = leerRenglones(x.renglones, { claves: new Set(vendidos.map((v) => v.clave)) })
    if (lr.error) return { status: 400, error: lr.error }
    if (cts(lr.total) > cts(estado.queda)) return { status: 409, error: `Quedan ${plataTexto(estado.queda)} por facturar de esta venta: los renglones suman ${plataTexto(lr.total)}.` }
    const ficha = await leerFicha(pg, String(p.cliente_id))
    if (!ficha) return { status: 404, error: 'No está la ficha del cliente del pedido.' }
    const rec = receptorMayorista(ficha, x.datos)
    if (rec.falta) return { status: 409, error: rec.falta, falta: true }
    const arca = arcaDe(deps, sb)
    if (!arca) return { status: 409, error: SIN_ARCA }
    if (rec.guardar) {
      const mal = await completarFicha(pg, ficha, rec.ficha)
      if (mal) return mal
    }
    const hoy = diaArgentino(Date.now())
    const ventaId = `${clave}:parte:${globalThis.crypto.randomUUID()}`
    const extras = new Map([[ventaId, { clase: 'parte', venta_ref: clave, tope: Number(f.total), renglones: lr.renglones, cliente_id: ficha.id }]])
    let hecho
    try {
      hecho = await facturarLote({
        arca, repo: repoConExtras(deps.repo || repoFacturas(sb), extras), ambiente, marca: 'bdi',
        ptoVta: ptoVtaDe(ambiente, 'bdi', deps.env || process.env), tipo: rec.tipo,
        comprobantes: [{ ventaId, mes: hoy.slice(0, 7), tipo: rec.tipo, fecha: hoy, total: lr.total, receptor: rec.receptor }],
        reglas: { umbralIdentificar: UMBRAL_IDENTIFICAR, hoy },
        lote: globalThis.crypto.randomUUID(), usuario,
      })
    } catch (e) {
      const motivo = motivoDeLaBase(e)
      if (motivo) return { status: 409, error: motivo }
      throw e
    }
    const [hecha] = hecho.autorizadas
    if (!hecha) {
      const motivos = [...hecho.rechazadas, ...hecho.noSalen].flatMap((y) => y.motivos || [])
      return { status: 409, error: `ARCA no la autorizó: ${motivos.join(' · ') || 'sin motivo'}` }
    }
    const receptor = { nombre: rec.ficha.razonSocial || ficha.razon_social || ficha.nombre, domicilio: rec.ficha.domicilio || ficha.domicilio || null }
    return {
      ok: true, ...quedaPorFacturar(Number(f.total), [...hechas.partes, { total: lr.total }]),
      factura: { ...filaParaPdf(hecha, { numero: p.numero, renglones: lr.renglones, receptor }), clase: 'parte', venta_ref: clave },
    }
  })
}

const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LETRA = { 1: 'A', 6: 'B' }
/** En homologación la factura es de PRUEBA: sólo a una casilla de la empresa, ⛔ a un cliente. */
export const CASILLA_INTERNA = '@arebensrl.com'

/**
 * «Enviar por mail» una factura YA hecha de la ficha del cliente (Darío §5; Bruno 31-oct: un botón). El PDF lo arma el
 * navegador (el mismo de «PDF»); acá se valida que la factura exista, sea de ESE cliente y esté autorizada, y el número,
 * el total y la fecha salen de la BASE, ⛔ del pedido. Sale por Mailer (SES) con el remitente de la marca.
 * `body`: `{ clienteId, facturaId, para, pdf }` (pdf en base64; `lib/erp/entrada.core.js` le da su propio tope).
 * ⛔ pide `VENTA_MAYORISTA_REAL`: la factura ya está hecha; mandarla no factura nada.
 * @param {{ body: any, quien?: any }} p
 * @param {{ conMotor: Function, prendido?: boolean, sb?: any, mailer?: any, ambiente?: string }} deps
 */
export async function enviarFacturaPanel({ body, quien = null }, deps) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, quien))) return { status: 409, error: 'La cuenta corriente del panel está apagada.' }
  const clienteId = String(body?.clienteId ?? ''), facturaId = String(body?.facturaId ?? '')
  if (!UUID.test(clienteId) || !UUID.test(facturaId)) return { status: 400, error: 'Falta la factura o el cliente' }
  const para = String(body?.para ?? '').trim().toLowerCase()
  if (!MAIL.test(para) || para.length > 200) return { status: 400, error: 'El mail no es válido.' }
  const pdf = String(body?.pdf ?? '')
  if (!pdf) return { status: 400, error: 'Falta el PDF.' }
  const ambiente = deps.ambiente || (() => { const a = ambienteSeguro(); return a.ambiente })()
  if (!ambiente) return { status: 409, error: ambienteSeguro().error }
  if (ambiente !== 'produccion' && !para.endsWith(CASILLA_INTERNA)) {
    return { status: 409, error: `Es una factura de PRUEBA (homologación de ARCA): sólo se manda a una casilla ${CASILLA_INTERNA}.` }
  }

  const sb = deps.sb || baseFacturacion()
  const { data, error } = await sb.from('facturas').select('id, ambiente, marca, tipo, pto_vta, numero, fecha, total, estado, cliente_id')
    .eq('id', facturaId).eq('ambiente', ambiente).eq('cliente_id', clienteId).limit(1)
  if (error) throw new Error(`facturas: ${error.message}`)
  const f = data?.[0]
  if (!f) return { status: 404, error: 'No está esa factura en la ficha de este cliente.' }
  if (f.estado !== 'autorizada') return { status: 409, error: 'La factura no está autorizada por ARCA.' }
  const letra = LETRA[Number(f.tipo)]
  if (!letra) return { status: 409, error: 'Sólo se mandan facturas A o B.' }

  const ficha = await deps.conMotor('bdi', 'La ficha del cliente', (pg) => leerFicha(pg, clienteId))
  if (ficha && typeof ficha === 'object' && ficha.status) return ficha
  const comprobante = `${letra} ${String(f.pto_vta).padStart(5, '0')}-${String(f.numero).padStart(8, '0')}`
  const r = await pedirFacturaPorMail(deps.mailer || { url: process.env.MAILER_URL, key: process.env.MAILER_TICKET_KEY, fetch }, {
    marca: f.marca, para, comprobante, cliente: ficha?.razon_social || ficha?.nombre || '', total: Number(f.total), fecha: String(f.fecha).slice(0, 10),
    archivo: `Factura ${comprobante}.pdf`, pdf,
  })
  if (!r.ok && !r.configurado) return { status: 503, error: 'Falta la conexión con Mailer (MAILER_URL / MAILER_TICKET_KEY) en Vercel.' }
  if (!r.ok) return { status: 502, error: `No salió: ${r.motivo}` }
  return { ok: true, para, de: r.de, comprobante }
}

/**
 * El PADRÓN de ARCA (habilitado por Bruno 31-oct, F. 3283/E): CUIT ⇒ razón social, condición frente al IVA y domicilio fiscal,
 * para llenar los datos fiscales al facturar (corregibles: ⛔ se guardan acá, se guardan al facturar). Sólo LEE de ARCA:
 * ⛔ pide el corte de BDI, sí la cuenta del panel prendida. Si ARCA no contesta, el error sale dicho y se tipea como antes.
 * 🔴 Con el cert de HOMOLOGACIÓN el padrón contesta «Computador no autorizado»: sólo anda en producción.
 * @param {{ cuit?: string, usuario?: any }} p @param {{ prendido?: boolean, arca?: any, sb?: any }} deps
 */
export async function padronDelPanel({ cuit = '', usuario = null }, deps = {}) {
  if (!(deps.prendido ?? panelCuentaPrendido(process.env, usuario))) return { prendido: false }
  const c = String(cuit).replace(/\D/g, '')
  if (!cuitValido(c)) return { status: 400, error: 'Ese CUIT no es válido: revisá los números.' }
  const { ambiente, error: errorAmbiente } = ambienteSeguro()
  if (!ambiente && !deps.arca) return { status: 409, error: errorAmbiente }
  const arca = arcaDe(deps, deps.sb || (deps.arca ? null : baseFacturacion()))
  if (!arca) return { status: 409, error: SIN_ARCA }
  try {
    const p = await arca.persona(c)
    return {
      prendido: true, cuit: c, razonSocial: p.razonSocial, condicion: opcionDeCondicionPanel(p.condicionIva),
      domicilio: p.domicilioTexto, estadoClave: p.estadoClave, avisos: p.avisos,
    }
  } catch (e) {
    const m = String(e?.message || e)
    if (/arca_ta_servicio/.test(m) && /does not exist|schema cache|relation/i.test(m)) {
      return { status: 409, error: 'Falta la migración del padrón de ARCA (sql/migrate-arca-ta-servicio.sql).' }
    }
    return { status: 502, error: /^Padrón de ARCA: /.test(m) ? `${m.replace(/^Padrón de ARCA: /, 'ARCA dice: ')}` : `No se pudo consultar ARCA (${m}).` }
  }
}
