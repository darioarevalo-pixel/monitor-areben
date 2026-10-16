/**
 * Buscador y ficha de una venta propia (pestaña `erp › Ventas`), contra el contrato de la venta
 * (`~/Documents/erp-monitor/contrato-venta.md`, §2): se LEE directo de la base (`venta`, `venta_ficha`);
 * escribir es del motor (`motor/venta/`). Puro: el handler (`api/_erp.js`) lee las filas y esto las arma.
 *
 * 🔑 Una venta ⛔ se edita: anular es otra fila (`venta_anulacion`) y cambiar es otra venta de tipo
 * `cambio` atada a la original ⇒ la ficha muestra la original Y sus cambios.
 * 🔑 `prueba`: lo que entra por `erp › Caja` antes del corte de GN ⛔ movió el libro ni se facturó ⇒
 * se ve marcado, siempre.
 */

import { cobro, idsDeFeria, medioDeCuenta, montoAEsperar, renglones } from '../caja/core.core.js'

/** Lo que alcanza para que un motivo diga algo («x» ⛔). */
export const MOTIVO_MINIMO = 5

/**
 * Cómo se lee el texto del buscador: un número de venta (`123` o `#123`; sin `#`, hasta 6 cifras), un rango de fechas
 * (`desde`/`hasta`, YYYY-MM-DD) o un cliente (nombre, DNI, mail, WhatsApp). Sin nada: las últimas.
 * @param {{ q?: any, desde?: any, hasta?: any }} x
 * @returns {{ numero: number | null, cliente: string | null, desde: string | null, hasta: string | null, error?: undefined } | { error: string }}
 */
export function leerBusqueda({ q, desde, hasta }) {
  const t = String(q ?? '').trim()
  const fecha = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? String(s) : null)
  const r = { numero: null, cliente: null, desde: fecha(desde), hasta: fecha(hasta) }
  if ((desde && !r.desde) || (hasta && !r.hasta)) return { error: 'Fecha inválida' }
  if (r.desde && r.hasta && r.desde > r.hasta) return { error: 'La fecha «desde» es posterior a «hasta».' }
  // `#123` siempre es número; sin `#`, hasta 6 cifras es número y de 7 en adelante es un DNI o CUIT (cliente).
  const num = t.replace(/^#/, '')
  if (/^\d{1,9}$/.test(num) && (t.startsWith('#') || num.length <= 6)) r.numero = Number(num)
  else if (t.length >= 3) r.cliente = t.replace(/[%_,()]/g, ' ')
  else if (t.length) return { error: 'Escribí el número de venta o al menos 3 letras del cliente.' }
  return r
}

/**
 * El día argentino (UTC−3, sin horario de verano) como rango ISO, para filtrar `ocurrida_en`.
 * `hasta` incluye el día entero.
 */
export function rangoDeDias(desde, hasta) {
  return {
    desde: desde ? `${desde}T03:00:00.000Z` : null,
    hasta: hasta ? new Date(Date.parse(`${hasta}T03:00:00.000Z`) + 86_400_000).toISOString() : null,
  }
}

const num = (x) => (x == null ? null : Number(x))

/** Una fila de `venta` para la lista del buscador. */
export function filaDeVenta(v) {
  return {
    id: v.id, numero: Number(v.numero), marca: v.marca, tipo: v.tipo, estado: v.estado, origen: v.origen,
    canal: v.canal, deposito: v.deposito, total: Number(v.total), prueba: !!v.prueba, ocurridaEn: v.ocurrida_en,
    cliente: v.cliente ? (v.cliente.nombre || v.cliente.doc || null) : null,
  }
}

/**
 * La ficha a partir de la fila de `venta_ficha` (líneas y pagos como jsonb), con el nombre de cada
 * prenda (del espejo de GN, `inventario`: `nombres` = Map `product_id/size_id` → { nombre, talle }),
 * los cambios que salieron de ella y, si es un cambio, la original.
 */
export function armarFicha(f, { nombres = new Map(), cambios = [], original = null, cambiadas = new Map(), montos = new Map() } = {}) {
  const lineas = (f.lineas || []).map((l) => {
    const n = nombres.get(`${l.product_id}/${l.size_id}`) || {}
    return {
      id: l.id, n: l.n, producto: String(l.product_id), talle: String(l.size_id), nombre: n.nombre ?? null, talleNombre: n.talle ?? null,
      sku: l.sku ?? null, cantidad: Number(l.cantidad), precio: Number(l.precio), descuento: Number(l.descuento || 0),
      rebaja: Number(l.rebaja || 0), importe: Number(l.importe), devuelta: Number(l.cantidad) < 0, lineaOrigenId: l.linea_origen_id ?? null,
      cambiado: Number(cambiadas.get(l.id) || 0),
    }
  })
  const pagos = (f.pagos || []).map((p) => ({ cuenta: p.cuenta ?? null, medio: p.medio ?? null, monto: Number(p.monto), base: num(p.base), porcentaje: num(p.porcentaje) }))
  const anulacion = f.anulacion ? { motivo: f.anulacion.motivo, usuario: f.anulacion.usuario, anuladaEn: f.anulacion.anulada_en, devolucion: f.anulacion.devolucion ?? null } : null
  const facturas = (f.facturas || []).map((x) => ({ facturaId: x.factura_id, tipo: x.tipo }))
  const facturada = facturas.some((x) => x.tipo === 'factura')
  const conNotaDeCredito = facturas.some((x) => x.tipo === 'nc')
  const acreditadaEntera = estaAcreditadaEntera(facturas, montos)
  return {
    venta: { ...filaDeVenta(f), subtotal: Number(f.subtotal), usuario: f.usuario, registradaEn: f.registrada_en, origenRef: f.origen_ref, gnSaleId: f.gn_sale_id ?? null, ventaOriginalId: f.venta_original_id ?? null },
    cliente: f.cliente ? { nombre: f.cliente.nombre ?? null, doc: f.cliente.doc ?? null, email: f.cliente.email ?? null, whatsapp: f.cliente.whatsapp ?? null } : null,
    lineas, pagos, anulacion, facturas, facturada, conNotaDeCredito, acreditadaEntera,
    cambios: cambios.map(filaDeVenta),
    original: original ? filaDeVenta(original) : null,
    puedeAnular: puedeAnular(f),
  }
}

/**
 * ¿Las NC atadas ya acreditan la factura ENTERA? Con montos (`montos` = Map facturaId → total, de `facturas`), ⛔ con
 * «hay alguna NC»: la PARCIAL de un cambio también se ata a la original y deja saldo por acreditar al anular.
 * Sin montos ⇒ false (la ficha ofrece la NC y el servidor, que sabe los montos, frena). Caminado 16-oct, #235: con la NC
 * de la anulación hecha la ficha seguía ofreciendo «Hacer nota de crédito».
 */
export function estaAcreditadaEntera(facturas, montos) {
  const c = (x) => Math.round(Number(montos.get(x.facturaId)) * 100)
  const factura = facturas.find((x) => x.tipo === 'factura')
  if (!factura || !montos.has(factura.facturaId)) return false
  const ncs = facturas.filter((x) => x.tipo === 'nc' && montos.has(x.facturaId))
  return ncs.length > 0 && ncs.reduce((a, x) => a + c(x), 0) >= c(factura)
}

/** Lo que frena el anular ANTES de mandarlo (el motor vuelve a chequear todo). null = se puede. */
export function puedeAnular(f) {
  if (f.estado === 'anulada') return 'Ya está anulada.'
  if (f.tiene_cambio) return 'Tiene un cambio: primero se anula el cambio.'
  return null
}

/** El cuerpo del POST de anular, validado. */
export function leerAnular(body) {
  const ventaId = String(body?.ventaId ?? '')
  const motivo = String(body?.motivo ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(ventaId)) return { error: 'Venta inválida' }
  if (motivo.length < MOTIVO_MINIMO) return { error: `Escribí el motivo (al menos ${MOTIVO_MINIMO} letras).` }
  return { ventaId, motivo }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Cuánto de cada línea ya volvió en cambios CONFIRMADOS: `filas` = las `venta_linea` de los cambios
 * (`linea_origen_id`, `cantidad` negativa). Map línea original → unidades.
 */
export function cambiadasDe(filas) {
  const m = new Map()
  for (const f of filas || []) if (f.linea_origen_id && Number(f.cantidad) < 0) m.set(f.linea_origen_id, (m.get(f.linea_origen_id) || 0) - Number(f.cantidad))
  return m
}

const pesos = (x) => Math.round(Number(x) * 100) / 100

/**
 * La diferencia del cambio, con la MISMA cuenta que el motor (`armarCambio`): lo devuelto al precio que se
 * PAGÓ (el importe de la línea por unidad, ⛔ el de hoy) en negativo, lo nuevo en positivo.
 * > 0: paga la clienta · < 0: queda a favor · 0: sin diferencia.
 * @param {{ lineas: Array<{ id: string, cantidad: number, importe: number }>, devueltas: Array<{ lineaId: string, cantidad: number }>, nuevas: Array<{ importe: number }> }} x
 */
export function diferenciaDeCambio({ lineas, devueltas, nuevas }) {
  const porId = new Map(lineas.map((l) => [l.id, l]))
  const vuelve = devueltas.reduce((s, d) => {
    const l = porId.get(d.lineaId)
    return l && l.cantidad > 0 ? s + pesos(l.importe / l.cantidad) * d.cantidad : s
  }, 0)
  return pesos(nuevas.reduce((s, n) => s + Number(n.importe), 0) - vuelve)
}

/**
 * El cuerpo del POST de cambiar, validado. `id` lo genera la pantalla (uuid): es la clave que evita
 * duplicar el cambio si se aprieta dos veces. Lo nuevo se arma con `renglones` de la Caja (el MISMO
 * código: el importe de cada prenda), ⛔ una copia.
 */
export function leerCambiar(body) {
  const id = String(body?.id ?? '')
  const ventaId = String(body?.ventaId ?? '')
  if (!UUID.test(id)) return { error: 'Falta el número del cambio (lo genera la pantalla).' }
  if (!UUID.test(ventaId)) return { error: 'Venta inválida' }
  const devueltas = Array.isArray(body?.devueltas) ? body.devueltas : []
  if (!devueltas.length) return { error: 'Marcá qué prenda devuelve.' }
  for (const d of devueltas) {
    if (!UUID.test(String(d?.lineaId ?? '')) || !(Number.isInteger(Number(d?.cantidad)) && Number(d.cantidad) > 0)) return { error: 'Prenda devuelta inválida' }
  }
  const items = Array.isArray(body?.items) ? body.items : []
  let nuevas = []
  try {
    nuevas = items.length ? renglones(items).map((f, i) => ({ ...f, ...(items[i]?.sku ? { sku: String(items[i].sku).slice(0, 80) } : {}) })) : []
  } catch (e) {
    return { error: e.message }
  }
  // Los pagos como los pide la Caja (`PagoPedido`: cuenta y, salvo el último, la base): el SERVIDOR les
  // pone el descuento y el redondeo con `cobroDelCambio`, ⛔ los trae la pantalla.
  const crudos = Array.isArray(body?.pagos) ? body.pagos : []
  const pagos = crudos.map((p, i) => (i === crudos.length - 1 ? { cuenta: Number(p?.cuenta) } : { cuenta: Number(p?.cuenta), base: Number(p?.base) }))
  if (pagos.some((p) => !(Number.isInteger(p.cuenta) && p.cuenta > 0))) return { error: 'Pago inválido' }
  const total = body?.total == null ? null : Number(body.total)
  if (total != null && !(Number.isFinite(total) && total >= 0)) return { error: 'Total inválido' }
  const desde = Date.parse(String(body?.desde ?? ''))
  const pago = body?.pago == null || body.pago === '' ? null : String(body.pago).slice(0, 60)
  const comprobante = String(body?.comprobante ?? '').trim().slice(0, 200) || null
  const cliente = leerClienteCambio(body?.cliente)
  if (cliente && cliente.error) return { error: cliente.error }
  const saldo = body?.saldo == null || body.saldo === '' ? 0 : Number(body.saldo)
  if (!(Number.isFinite(saldo) && saldo >= 0)) return { error: 'El saldo a usar no es válido.' }
  if (saldo > 0 && !cliente) return { error: 'Para usar el saldo a favor, cargá el DNI y el nombre de la clienta.' }
  return {
    id, ventaId, devueltas: devueltas.map((d) => ({ linea_id: String(d.lineaId), cantidad: Number(d.cantidad) })), nuevas, pagos, total,
    desde: Number.isFinite(desde) ? desde : null, pago, comprobante, cliente: cliente || null, saldo: Math.round(saldo * 100) / 100,
  }
}

/**
 * La clienta del cambio (para guardarle el SALDO A FAVOR: Bruno, 14-oct). Sin nada ⇒ null; con algo, el
 * documento y el nombre son obligatorios (el motor la busca por documento).
 */
export function leerClienteCambio(x) {
  if (!x || typeof x !== 'object') return null
  const doc = String(x.doc ?? '').replace(/\D/g, '')
  const nombre = String(x.nombre ?? '').trim().slice(0, 120)
  const whatsapp = String(x.whatsapp ?? '').replace(/[^\d+]/g, '').slice(0, 20) || null
  const email = String(x.email ?? '').trim().slice(0, 120) || null
  if (!doc && !nombre && !whatsapp && !email) return null
  if (!/^\d{7,11}$/.test(doc)) return { error: 'El DNI o CUIT de la clienta: 7 a 11 números.' }
  if (nombre.length < 3) return { error: 'Falta el nombre de la clienta.' }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'El mail de la clienta no es válido.' }
  return { doc, nombre, whatsapp, email }
}

/**
 * 🔑 El cobro de la diferencia del cambio, con el DESCUENTO de la forma de pago (Bruno, 14-oct: «como la
 * Caja»): es `cobro()` de la Caja sobre UN renglón por la diferencia, sin rebaja a la venta. La pantalla y
 * el servidor, igual. Devuelve también lo que hay que ESPERAR por transferencia (`montoAEsperar`).
 * 🔴 Con una prenda de FERIA entre lo nuevo ⛔ se cobra acá: la feria tiene precio final y cuenta propia
 * (`exigirFeria`), y repartir una diferencia entre feria y normal ⛔ está decidido (pregunta para Bruno).
 * 🔑 SALDO A FAVOR (Bruno, 14-oct): `saldo` = cuánto del saldo de la clienta paga la diferencia. Va PRIMERO,
 * sin descuento (es plata que ya pagó) y con la cuenta `'saldo'` (el servidor la cambia por la del motor); el
 * resto, con la forma de pago y su descuento. Si el saldo alcanza, ⛔ hace falta otra forma de pago.
 * @param {{ diferencia: number, pagos: Array<{ cuenta: number, base?: number }>, reglas: any, nuevas: Array<{ product_id: number }>, saldo?: number }} x
 */
export function cobroDelCambio({ diferencia, pagos, reglas, nuevas, saldo = 0 }) {
  if (!(diferencia > 0)) return { pagos: [], total: 0, espera: 0 }
  const usado = pesos(Math.min(Math.max(Number(saldo) || 0, 0), diferencia))
  const deSaldo = usado > 0 ? [{ cuenta: 'saldo', base: usado, porcentaje: 0, descuento: 0, redondeo: 0, monto: usado }] : []
  if (usado > 0) {
    const resto = pesos(diferencia - usado)
    if (!(resto > 0)) return { pagos: deSaldo, total: usado, espera: 0 }
    const r = cobroDelCambio({ diferencia: resto, pagos, reglas, nuevas })
    return { pagos: [...deSaldo, ...r.pagos], total: pesos(usado + r.total), espera: r.espera }
  }
  if (!Array.isArray(pagos) || !pagos.length) throw new Error('Falta la forma de pago de la diferencia.')
  for (const p of pagos) if (!medioDeCuenta(p.cuenta, reglas)) throw new Error(`La cuenta ${p.cuenta} no es una forma de pago de la Caja.`)
  const feria = idsDeFeria(reglas)
  if ((nuevas || []).some((n) => feria.has(Number(n.product_id)))) throw new Error('Con una prenda en oferta entre lo que se lleva, el cambio todavía se cobra en GN.')
  const fila = { product_id: 0, size_id: 0, cantidad: 1, precio: diferencia, descuento: 0, rebaja: 0, importe: diferencia }
  const c = cobro({ filas: [fila], pagos, reglas, descuentoVenta: null })
  const conDescuento = c.pagos.map(({ rebaja: _r, ...p }) => p)
  return { pagos: conDescuento, total: c.total, espera: montoAEsperar(c.pagos, reglas) }
}

/** Qué dice cada error del motor, en palabras del equipo. */
export const MENSAJE_ERROR_MOTOR = {
  NO_ENCONTRADA: 'La venta no existe.',
  YA_ANULADA: 'La venta ya estaba anulada.',
  TIENE_CAMBIO: 'La venta tiene un cambio: primero se anula el cambio.',
  FALTA_MOTIVO: 'Falta el motivo.',
  ANULADA: 'La venta está anulada: no se puede cambiar.',
  DEVUELVE_DE_MAS: 'Se está devolviendo más de lo que vendió esa venta (contando los cambios anteriores). ¿Se escaneó dos veces?',
  PAGOS_NO_CIERRAN: 'La diferencia cambió: recargá la venta y volvé a cobrar.',
  CUENTA_DESCONOCIDA: 'Esa forma de pago no está cargada en el ERP.',
  CONFLICTO_IDEMPOTENCIA: 'Con este número ya se registró otro cambio: empezá uno nuevo.',
  OTRA_MARCA: 'Un cambio entre marcas todavía no se puede.',
  FALTA_CLIENTE: 'Para dejarle saldo a favor, cargá el DNI y el nombre de la clienta.',
  SALDO_INSUFICIENTE: 'La clienta no tiene saldo a favor suficiente.',
  SALDO_USADO: 'El saldo a favor de este cambio ya se usó: primero se anula la venta que lo usó.',
  SIN_FACTURA: 'La venta no tiene factura: la nota de crédito va contra una factura.',
}

/**
 * El texto de un error del motor para la pantalla. Un código sin traducción cae al `mensaje` del motor, que está escrito
 * como nota (con «⛔» por «no»): en pantalla el ⛔ se lee como emoji y la frase dice lo contrario.
 * @param {{ codigo: string, mensaje: string }} error
 */
export function textoDelMotor(error) {
  return MENSAJE_ERROR_MOTOR[error.codigo] || String(error.mensaje || '').replace(/\u26D4\s*/g, 'no ')
}

/** Cómo se lee cada valor en pantalla. */
export const NOMBRE_ORIGEN_VENTA = { caja: 'Caja', tn: 'Tienda Nube', mayorista: 'Mayorista', postventa: 'Postventa', ml: 'Mercado Libre' }
export const NOMBRE_CANAL = { local: 'Local', online: 'Online', mayorista: 'Mayorista', ml: 'Mercado Libre' }
export const NOMBRE_MARCA = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
