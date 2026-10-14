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

import { renglones } from '../caja/core.core.js'

/** Lo que alcanza para que un motivo diga algo («x» ⛔). */
export const MOTIVO_MINIMO = 5

/**
 * Cómo se lee el texto del buscador: un número de venta (`123` o `#123`), un rango de fechas
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
  const num = t.replace(/^#/, '')
  if (/^\d{1,9}$/.test(num)) r.numero = Number(num)
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
export function armarFicha(f, { nombres = new Map(), cambios = [], original = null, cambiadas = new Map() } = {}) {
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
  return {
    venta: { ...filaDeVenta(f), subtotal: Number(f.subtotal), usuario: f.usuario, registradaEn: f.registrada_en, origenRef: f.origen_ref, gnSaleId: f.gn_sale_id ?? null, ventaOriginalId: f.venta_original_id ?? null },
    cliente: f.cliente ? { nombre: f.cliente.nombre ?? null, doc: f.cliente.doc ?? null, email: f.cliente.email ?? null, whatsapp: f.cliente.whatsapp ?? null } : null,
    lineas, pagos, anulacion, facturas, facturada,
    cambios: cambios.map(filaDeVenta),
    original: original ? filaDeVenta(original) : null,
    puedeAnular: puedeAnular(f),
  }
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
  const pagos = (Array.isArray(body?.pagos) ? body.pagos : []).map((p) => ({ cuenta: Number(p?.cuenta), monto: Number(p?.monto) }))
  if (pagos.some((p) => !(Number.isInteger(p.cuenta) && p.cuenta > 0) || !(Number.isFinite(p.monto) && p.monto > 0))) return { error: 'Pago inválido' }
  return { id, ventaId, devueltas: devueltas.map((d) => ({ linea_id: String(d.lineaId), cantidad: Number(d.cantidad) })), nuevas, pagos }
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
}

/** Cómo se lee cada valor en pantalla. */
export const NOMBRE_ORIGEN_VENTA = { caja: 'Caja', tn: 'Tienda Nube', mayorista: 'Mayorista', postventa: 'Postventa', ml: 'Mercado Libre' }
export const NOMBRE_CANAL = { local: 'Local', online: 'Online', mayorista: 'Mayorista', ml: 'Mercado Libre' }
export const NOMBRE_MARCA = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }
