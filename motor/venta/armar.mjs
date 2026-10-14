/**
 * La venta propia, sin red ni base: valida lo que entra y arma las filas que `registrar.mjs` escribe en
 * UNA transacción. El contrato (lo que recibe y devuelve, y por qué) es
 * `~/Documents/erp-monitor/contrato-venta.md` ⇒ un cambio acá es un cambio allá primero.
 *
 * 🔑 Las líneas y los pagos tienen la forma de `Fila` y `Pago` de `lib/caja/core.core.js` del monitor:
 * la Caja le pasa al motor lo mismo que hoy arma para GN, ⛔ lo rearma.
 *
 * Devuelve `{ ok: true, … }` o `{ ok: false, error: { codigo, mensaje, campo? } }`: ⛔ lanza por un error
 * de negocio (la pantalla tiene que poder mostrarlo).
 */
import { randomUUID } from 'node:crypto'

export const ORIGENES = ['caja', 'tn', 'mayorista', 'postventa', 'ml']
export const CANALES = ['local', 'online', 'mayorista', 'ml']
/** Diferencia que se tolera al sumar pesos (el redondeo de la Caja es en pesos enteros, pero GN guarda 2 decimales). */
const TOLERANCIA = 0.01

const fallo = (codigo, mensaje, campo) => ({ ok: false, error: campo ? { codigo, mensaje, campo } : { codigo, mensaje } })
const num = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x))
const pesos = (x) => Math.round(num(x) * 100) / 100
const cierra = (a, b) => Math.abs(a - b) <= TOLERANCIA

/**
 * La configuración que lee `registrar.mjs` de las tablas de §3 (marca, deposito, cuenta_cobro).
 * @typedef {{ marcas: Record<string, { empresa_id: string, depositos: string[] }>,
 *   cuentas: Array<{ id: string, marca: string, gn_cuenta_id: number | null, activa?: boolean }> }} Conf
 */

/** La cuenta de cobro de un pago: por su uuid o, mientras la Caja guarda ésos, por el id de GN. */
export function cuentaDe(conf, marca, cuenta) {
  const deLaMarca = conf.cuentas.filter((c) => c.marca === marca && c.activa !== false)
  if (typeof cuenta === 'string' && !/^\d+$/.test(cuenta)) return deLaMarca.find((c) => c.id === cuenta) ?? null
  const n = Number(cuenta)
  return Number.isInteger(n) && n > 0 ? deLaMarca.find((c) => Number(c.gn_cuenta_id) === n) ?? null : null
}

/** Las líneas: cada una con su importe, y que la suma dé el `subtotal`. `signo` −1 para las devueltas. */
function validarLineas(lineas, campo) {
  if (!Array.isArray(lineas) || lineas.length === 0) return fallo('ENTRADA_INVALIDA', 'La venta no tiene prendas', campo)
  for (const [i, l] of lineas.entries()) {
    const c = `${campo}[${i}]`
    if (!l || typeof l !== 'object') return fallo('ENTRADA_INVALIDA', 'Prenda vacía', c)
    if (!(Number.isInteger(num(l.product_id)) && num(l.product_id) > 0)) return fallo('ENTRADA_INVALIDA', 'Falta el producto', `${c}.product_id`)
    if (!(Number.isInteger(num(l.size_id)) && num(l.size_id) > 0)) return fallo('ENTRADA_INVALIDA', 'Falta el talle', `${c}.size_id`)
    if (!(Number.isInteger(num(l.cantidad)) && num(l.cantidad) > 0)) return fallo('ENTRADA_INVALIDA', 'La cantidad tiene que ser un entero mayor que 0', `${c}.cantidad`)
    for (const k of ['precio', 'importe']) if (!(Number.isFinite(num(l[k])) && num(l[k]) >= 0)) return fallo('ENTRADA_INVALIDA', `Falta el ${k}`, `${c}.${k}`)
  }
  return null
}

function validarPagos(pagos, conf, marca, total) {
  if (!Array.isArray(pagos)) return { error: fallo('ENTRADA_INVALIDA', 'Faltan los pagos', 'pagos') }
  const filas = []
  for (const [i, p] of pagos.entries()) {
    const cuenta = p && cuentaDe(conf, marca, p.cuenta)
    if (!cuenta) return { error: fallo('CUENTA_DESCONOCIDA', `La cuenta de cobro ${p && p.cuenta} no es de ${marca}`, `pagos[${i}].cuenta`) }
    if (!Number.isFinite(num(p.monto))) return { error: fallo('ENTRADA_INVALIDA', 'Falta el monto', `pagos[${i}].monto`) }
    filas.push({ cuenta_cobro_id: cuenta.id, base: pesos(p.base ?? p.monto), porcentaje: num(p.porcentaje) || 0, descuento: pesos(p.descuento || 0), redondeo: pesos(p.redondeo || 0), monto: pesos(p.monto) })
  }
  const suma = filas.reduce((s, p) => s + p.monto, 0)
  if (!cierra(suma, total)) return { error: fallo('PAGOS_NO_CIERRAN', `Los pagos suman ${pesos(suma)} y la venta es de ${total}`, 'pagos') }
  return { filas }
}

/** Lo común a la venta y al cambio: origen, marca, depósito, usuario. */
function validarCabecera(e) {
  if (!e || typeof e !== 'object') return fallo('ENTRADA_INVALIDA', 'Falta la venta')
  if (!ORIGENES.includes(e.origen)) return fallo('ENTRADA_INVALIDA', `Origen desconocido: ${e.origen}`, 'origen')
  if (!(typeof e.origen_ref === 'string' && e.origen_ref.trim())) return fallo('ENTRADA_INVALIDA', 'Falta origen_ref (la clave que evita duplicar)', 'origen_ref')
  if (!(typeof e.usuario === 'string' && e.usuario.trim())) return fallo('ENTRADA_INVALIDA', 'Falta quién la hizo', 'usuario')
  if (typeof e.prueba !== 'boolean') return fallo('ENTRADA_INVALIDA', 'Falta decir si es de prueba', 'prueba')
  if (e.ocurrida_en != null && Number.isNaN(Date.parse(e.ocurrida_en))) return fallo('ENTRADA_INVALIDA', 'Fecha inválida', 'ocurrida_en')
  return null
}

function validarLugar(e, conf) {
  const m = conf.marcas[e.marca]
  if (!m) return fallo('MARCA_DESCONOCIDA', `Marca desconocida: ${e.marca}`, 'marca')
  if (!m.depositos.includes(e.deposito)) return fallo('DEPOSITO_DESCONOCIDO', `${e.deposito} no es un depósito de ${e.marca}`, 'deposito')
  return null
}

/** Una línea guardada: la de la entrada, con su id, su número y el costo que le pone `registrar.mjs`. */
const filaDeLinea = (venta_id, l, n, signo, extra = {}) => ({
  id: randomUUID(), venta_id, n,
  product_id: num(l.product_id), size_id: num(l.size_id), sku: l.sku ?? null, barcode: l.barcode ?? null,
  cantidad: signo * num(l.cantidad), precio: pesos(l.precio), descuento: pesos(l.descuento || 0),
  rebaja: pesos(l.rebaja || 0), importe: signo * pesos(l.importe), costo_unitario: null, costo_fuente: null,
  linea_origen_id: null, ...extra,
})

/** El movimiento del libro de una línea (`stock_movimiento` de sql/001-libro.sql). ⛔ hay si es de prueba. */
export function movimientoDe(venta, linea, tipo) {
  return {
    linea: venta.marca, product_id: linea.product_id, size_id: linea.size_id, sku: linea.sku, barcode: linea.barcode,
    deposito: venta.deposito, cantidad: -linea.cantidad, tipo, origen: 'motor',
    clave: `${venta.id}:${linea.id}`, origen_ref: `${venta.id}:${linea.id}`,
    ocurrido_en: venta.ocurrida_en, hora_exacta: true, grupo: venta.id, detalle: { venta_numero: null },
  }
}

/**
 * La venta lista para escribir: `{ ok, venta, lineas, pagos, movimientos }`. ⛔ incluye el `numero`
 * (lo da la base, por marca) ni el costo (lo pone `registrar.mjs` con lo vigente).
 * @param {any} e la entrada del contrato (§1 registrarVenta) @param {Conf} conf @param {{ ahora?: Date }} [op]
 */
export function armarVenta(e, conf, { ahora = new Date() } = {}) {
  const mal = validarCabecera(e) || validarLugar(e, conf)
  if (mal) return mal
  if (!CANALES.includes(e.canal)) return fallo('ENTRADA_INVALIDA', `Canal desconocido: ${e.canal}`, 'canal')
  const malas = validarLineas(e.lineas, 'lineas')
  if (malas) return malas
  const subtotal = pesos(e.subtotal), total = pesos(e.total)
  if (!Number.isFinite(subtotal) || !Number.isFinite(total)) return fallo('ENTRADA_INVALIDA', 'Faltan el subtotal y el total', 'total')
  const sumaLineas = e.lineas.reduce((s, l) => s + pesos(l.importe), 0)
  if (!cierra(sumaLineas, subtotal)) return fallo('TOTAL_NO_CIERRA', `Las prendas suman ${pesos(sumaLineas)} y el subtotal es ${subtotal}`, 'subtotal')
  const p = validarPagos(e.pagos, conf, e.marca, total)
  if (p.error) return p.error

  const venta = {
    id: randomUUID(), empresa_id: conf.marcas[e.marca].empresa_id, marca: e.marca, tipo: 'venta', estado: 'confirmada',
    origen: e.origen, origen_ref: e.origen_ref.trim(), canal: e.canal, deposito: e.deposito,
    cliente_id: e.cliente_id ?? null, venta_original_id: null, subtotal, total, prueba: e.prueba,
    usuario: e.usuario.trim(), ocurrida_en: new Date(e.ocurrida_en ?? ahora).toISOString(), detalle: e.detalle ?? {},
  }
  const lineas = e.lineas.map((l, i) => filaDeLinea(venta.id, l, i + 1, 1))
  const pagos = p.filas.map((f) => ({ id: randomUUID(), venta_id: venta.id, ...f }))
  const movimientos = venta.prueba ? [] : lineas.map((l) => movimientoDe(venta, l, 'venta'))
  return { ok: true, venta, lineas, pagos, movimientos }
}

/**
 * El cambio: UNA venta de tipo `cambio` con las devueltas en negativo (al precio que se PAGARON) y las
 * nuevas en positivo. `original` = `{ venta, lineas }` como están en la base, con `cambiado` por línea
 * (lo ya devuelto en cambios anteriores).
 * @param {any} e la entrada del contrato (§1 registrarCambio) @param {Conf} conf
 * @param {{ venta: any, lineas: any[] }} original @param {{ ahora?: Date }} [op]
 */
export function armarCambio(e, conf, original, { ahora = new Date() } = {}) {
  const mal = validarCabecera(e)
  if (mal) return mal
  if (!original || !original.venta) return fallo('NO_ENCONTRADA', 'No está la venta que se cambia', 'venta_original_id')
  const o = original.venta
  if (o.estado === 'anulada') return fallo('ANULADA', `La venta ${o.numero} está anulada`, 'venta_original_id')
  if (o.prueba !== e.prueba) return fallo('ENTRADA_INVALIDA', 'Una venta de prueba se cambia con un cambio de prueba (y al revés)', 'prueba')
  const lugar = validarLugar({ marca: o.marca, deposito: e.deposito }, conf)
  if (lugar) return lugar
  if (!Array.isArray(e.devueltas) || e.devueltas.length === 0) return fallo('ENTRADA_INVALIDA', 'No hay prendas devueltas', 'devueltas')
  const nuevasMal = e.nuevas && e.nuevas.length ? validarLineas(e.nuevas, 'nuevas') : null
  if (nuevasMal) return nuevasMal

  const venta = {
    id: randomUUID(), empresa_id: conf.marcas[o.marca].empresa_id, marca: o.marca, tipo: 'cambio', estado: 'confirmada',
    origen: e.origen, origen_ref: e.origen_ref.trim(), canal: o.canal, deposito: e.deposito,
    cliente_id: o.cliente_id ?? null, venta_original_id: o.id, subtotal: 0, total: 0, prueba: e.prueba,
    usuario: e.usuario.trim(), ocurrida_en: new Date(e.ocurrida_en ?? ahora).toISOString(), detalle: e.detalle ?? {},
  }
  const porId = new Map(original.lineas.map((l) => [l.id, l]))
  const devueltasPorLinea = new Map()
  const lineas = []
  for (const [i, d] of e.devueltas.entries()) {
    const l = porId.get(d && d.linea_id)
    if (!l || l.cantidad <= 0) return fallo('ENTRADA_INVALIDA', 'Esa prenda no es de la venta', `devueltas[${i}].linea_id`)
    const cant = num(d.cantidad)
    if (!(Number.isInteger(cant) && cant > 0)) return fallo('ENTRADA_INVALIDA', 'La cantidad tiene que ser un entero mayor que 0', `devueltas[${i}].cantidad`)
    const ya = (devueltasPorLinea.get(l.id) || 0) + cant
    if (ya + (num(l.cambiado) || 0) > l.cantidad) return fallo('DEVUELVE_DE_MAS', `Se vendieron ${l.cantidad} y ya se cambiaron ${num(l.cambiado) || 0}`, `devueltas[${i}].cantidad`)
    devueltasPorLinea.set(l.id, ya)
    // Al precio que se PAGÓ: el importe de la línea prorrateado por unidad, ⛔ el de hoy.
    const unitario = pesos(l.importe / l.cantidad)
    lineas.push(filaDeLinea(venta.id, { ...l, cantidad: cant, importe: unitario * cant }, lineas.length + 1, -1, {
      linea_origen_id: l.id, costo_unitario: l.costo_unitario ?? null, costo_fuente: l.costo_fuente ?? null,
    }))
  }
  for (const l of e.nuevas || []) lineas.push(filaDeLinea(venta.id, l, lineas.length + 1, 1))
  const diferencia = pesos(lineas.reduce((s, l) => s + l.importe, 0))
  venta.subtotal = diferencia
  venta.total = Math.max(diferencia, 0)
  const p = validarPagos(e.pagos || [], conf, o.marca, venta.total)
  if (p.error) return p.error
  const pagos = p.filas.map((f) => ({ id: randomUUID(), venta_id: venta.id, ...f }))
  const movimientos = venta.prueba ? [] : lineas.map((l) => movimientoDe(venta, l, l.cantidad < 0 ? 'cambio_entra' : 'cambio_sale'))
  return { ok: true, venta, lineas, pagos, movimientos, diferencia, a_favor: diferencia < 0 ? -diferencia : 0 }
}

/**
 * La anulación: la fila y los movimientos contrarios (lo que salió vuelve al depósito de la venta).
 * @param {{ venta: any, lineas: any[], tieneCambio?: boolean }} actual
 * @param {{ motivo: string, usuario: string, devolucion?: Array<{ cuenta: any, monto: number }> }} e
 */
export function armarAnulacion(actual, e, { ahora = new Date() } = {}) {
  if (!actual || !actual.venta) return fallo('NO_ENCONTRADA', 'No está la venta')
  const v = actual.venta
  if (v.estado === 'anulada') return fallo('YA_ANULADA', `La venta ${v.numero} ya está anulada`)
  if (actual.tieneCambio) return fallo('TIENE_CAMBIO', `La venta ${v.numero} tiene un cambio: primero se anula el cambio`)
  if (!(e && typeof e.motivo === 'string' && e.motivo.trim())) return fallo('FALTA_MOTIVO', 'Falta el motivo', 'motivo')
  if (!(typeof e.usuario === 'string' && e.usuario.trim())) return fallo('ENTRADA_INVALIDA', 'Falta quién la anula', 'usuario')
  const en = ahora.toISOString()
  const anulacion = { venta_id: v.id, motivo: e.motivo.trim(), usuario: e.usuario.trim(), anulada_en: en, devolucion: e.devolucion ?? null }
  const contra = { ...v, ocurrida_en: en }
  const movimientos = v.prueba ? [] : actual.lineas.map((l) => ({
    ...movimientoDe(contra, l, 'anulacion'),
    cantidad: l.cantidad, // lo contrario de la venta: lo que salió, vuelve
    clave: `${v.id}:${l.id}`, origen_ref: `${v.id}:${l.id}:anulacion`,
  }))
  return { ok: true, anulacion, movimientos }
}
