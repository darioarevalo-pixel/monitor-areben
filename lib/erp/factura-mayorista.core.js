/**
 * Facturación de MAYORISTAS (pedido de Darío §5; decidido por Bruno 31-oct). Lo puro: la clase de la factura, los renglones
 * de una factura LIBRE y la propuesta de una PARTE por monto. La base y ARCA, en `api/_erp-factura-mayorista.js`.
 *
 * 🔑 ARCA sólo recibe el TOTAL (y el receptor): los renglones son NUESTROS (van al PDF y a `facturas.renglones`). Por eso una
 * parte con precios «ajustados» es válida: lo fiscal es el monto.
 * 🔑 Tres clases en `facturas.clase` (sql `migrate-facturas-mayorista.sql`): 'venta' (la entera), 'parte', 'libre'.
 * Se dice PRODUCTOS, ⛔ prendas (Bruno 31-oct).
 */
import { CBTE, COND_IVA, DOC, cuitValido } from '../../motor/arca/arca.core.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const c = (x) => Math.round(Number(x) * 100)
const pesos = (cts) => cts / 100
const textoCorto = (v, tope) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, tope) : '')

/**
 * Las condiciones que ARCA acepta en la clase A (`FEParamGetCondicionIvaReceptor`, medido 31-oct en homologación:
 * A = 1 · 6 · 13 · 16; B = 4 · 5 · 7 · 8 · 9 · 10 · 15). 🔴 Darío pidió «monotributo ⇒ B», pero ARCA ⛔ acepta una B con
 * condición 6: queda como pregunta para Bruno (PENDIENTES del ERP, 31-oct) y mientras manda ARCA.
 */
export const CONDICIONES_A = new Set([COND_IVA.RESPONSABLE_INSCRIPTO, COND_IVA.MONOTRIBUTO, 13, 16])
export const tipoMayorista = (condicionIva) => (CONDICIONES_A.has(Number(condicionIva)) ? CBTE.FACTURA_A : CBTE.FACTURA_B)

/** Las condiciones que se eligen en el panel (las que tienen los mayoristas). */
export const CONDICIONES_PANEL = {
  ri: COND_IVA.RESPONSABLE_INSCRIPTO, monotributo: COND_IVA.MONOTRIBUTO, exento: COND_IVA.EXENTO, consumidor: COND_IVA.CONSUMIDOR_FINAL,
}
export const opcionDeCondicionPanel = (cond) => Object.keys(CONDICIONES_PANEL).find((k) => CONDICIONES_PANEL[k] === Number(cond)) ?? null

/**
 * El receptor, de la FICHA del cliente (`cliente` del motor) o de lo que se pide en el mismo paso (`datos`: doc, condicion,
 * razonSocial, domicilio). Devuelve `{ receptor, tipo, guardar }` (guardar = completar la ficha) o `{ falta }` con lo que
 * hay que pedir. A: CUIT válido + razón social + domicilio. B: con CUIT o DNI, o sin identificar (el lote frena el
 * umbral). Lo que se pide pisa lo de la ficha.
 */
export function receptorMayorista(ficha, datos = {}) {
  const docPedido = String(datos.doc ?? '').replace(/\D/g, '')
  const doc = docPedido || String(ficha?.doc ?? '').replace(/\D/g, '')
  const condPedida = datos.condicion ? CONDICIONES_PANEL[String(datos.condicion)] : null
  if (datos.condicion && !condPedida) return { falta: 'Elegí la condición frente al IVA.' }
  const condicionIva = condPedida ?? (ficha?.condicion_iva != null ? Number(ficha.condicion_iva) : null)
  const razonSocial = textoCorto(datos.razonSocial, 120) || ficha?.razon_social || ''
  const domicilio = textoCorto(datos.domicilio, 200) || ficha?.domicilio || ''
  const guardar = !!(docPedido || condPedida || textoCorto(datos.razonSocial, 120) || textoCorto(datos.domicilio, 200))
  if (condicionIva == null) return { falta: 'Falta la condición frente al IVA del cliente.' }
  const tipo = tipoMayorista(condicionIva)
  if (tipo === CBTE.FACTURA_A) {
    if (!cuitValido(doc)) return { falta: 'La factura A necesita el CUIT del cliente (11 números, válido).' }
    if (razonSocial.length < 2) return { falta: 'La factura A lleva la razón social del cliente.' }
    if (domicilio.length < 3) return { falta: 'La factura A lleva el domicilio del cliente.' }
    return { tipo, guardar, receptor: { docTipo: DOC.CUIT, docNro: Number(doc), condicionIva }, ficha: { doc, condicionIva, razonSocial, domicilio } }
  }
  let r
  if (!doc) r = { docTipo: DOC.SIN_IDENTIFICAR, docNro: 0, condicionIva }
  else if (/^\d{7,8}$/.test(doc)) r = { docTipo: DOC.DNI, docNro: Number(doc), condicionIva }
  else if (doc.length === 11 && cuitValido(doc)) r = { docTipo: DOC.CUIT, docNro: Number(doc), condicionIva }
  else return { falta: 'El documento es un DNI (7 u 8 números) o un CUIT (11, válido).' }
  return { tipo, guardar, receptor: r, ficha: { doc: doc || null, condicionIva, razonSocial: razonSocial || null, domicilio: domicilio || null } }
}

export const MAX_RENGLONES = 40
export const MAX_TOTAL = 100_000_000

/**
 * Renglones escritos a mano (la LIBRE, o la parte corregida antes de emitir): `[{ descripcion, cantidad, unitario }]`.
 * Cantidad entera > 0; unitario > 0 con centavos; importe = cantidad × unitario. Devuelve `{ renglones, total }` o `{ error }`.
 */
export function leerRenglones(lista) {
  if (!Array.isArray(lista) || !lista.length) return { error: 'Cargá al menos un renglón.' }
  if (lista.length > MAX_RENGLONES) return { error: `Son ${MAX_RENGLONES} renglones como mucho.` }
  const renglones = []
  let total = 0
  for (const [i, x] of lista.entries()) {
    const descripcion = textoCorto(x?.descripcion, 120)
    const cantidad = Number(x?.cantidad)
    const unit = c(x?.unitario)
    if (descripcion.length < 2) return { error: `Renglón ${i + 1}: falta qué es.` }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100_000) return { error: `Renglón ${i + 1}: la cantidad es un número entero mayor a 0.` }
    if (!(unit > 0)) return { error: `Renglón ${i + 1}: el precio tiene que ser mayor a 0.` }
    const importe = unit * cantidad
    total += importe
    renglones.push({ descripcion, cantidad, unitario: pesos(unit), importe: pesos(importe) })
  }
  if (total > c(MAX_TOTAL)) return { error: 'El total es demasiado grande.' }
  return { renglones, total: pesos(total) }
}

/** El cuerpo de la factura LIBRE: `{ clienteId, renglones, doc?, condicion?, razonSocial?, domicilio? }`. */
export function leerFacturaLibre(body) {
  const clienteId = String(body?.clienteId ?? '')
  if (!UUID.test(clienteId)) return { error: 'Falta el cliente' }
  const r = leerRenglones(body?.renglones)
  if (r.error) return r
  return { clienteId, ...r, datos: { doc: body?.doc, condicion: body?.condicion, razonSocial: body?.razonSocial, domicilio: body?.domicilio } }
}

/**
 * Lo que le queda por facturar a una venta: su total menos las partes vivas (menos lo que les devolvieron sus NC).
 * `partes` = `[{ total, acreditado? }]`. En centavos para ⛔ sumar errores de redondeo.
 */
export function quedaPorFacturar(totalVenta, partes = []) {
  const hecho = partes.reduce((a, p) => a + c(p.total) - c(p.acreditado || 0), 0)
  return { total: Number(totalVenta), facturado: pesos(hecho), queda: pesos(Math.max(0, c(totalVenta) - hecho)) }
}

/**
 * Los productos que todavía ⛔ entraron en una parte: lo vendido menos las cantidades de los renglones de las partes de
 * antes (por `clave`, la variante). `vendidos` = `[{ clave, descripcion, cantidad, unitario }]` (unitario = el precio REAL).
 */
export function productosPendientes(vendidos, partesAntes = []) {
  const usado = new Map()
  for (const p of partesAntes) for (const r of p.renglones || []) if (r.clave) usado.set(r.clave, (usado.get(r.clave) || 0) + Number(r.cantidad))
  const out = []
  for (const v of vendidos) {
    const ya = Math.min(usado.get(v.clave) || 0, Number(v.cantidad))
    if (ya) usado.set(v.clave, usado.get(v.clave) - ya)
    const cantidad = Number(v.cantidad) - ya
    if (cantidad > 0) out.push({ ...v, cantidad })
  }
  return out
}

/**
 * La PROPUESTA de renglones para una parte de `monto` (Bruno 31-oct), corregible antes de emitir:
 *  - 'ajustados' (el default, «la mayoría»): los productos pendientes, con los precios AJUSTADOS para que el total dé JUSTO
 *    el monto (proporcional; la diferencia de centavos la absorbe un renglón de 1 unidad, separándolo si hace falta).
 *  - 'reales': a precio real, entran productos (de a uno, del más caro al más barato) hasta acercarse sin pasarse.
 * Devuelve `{ renglones, total }` o `{ error }`. 🔴 El monto ⛔ puede pasar lo que queda (eso lo mide quien llama, y la base).
 */
export function partePorMonto({ pendientes, monto, precios = 'ajustados' }) {
  const objetivo = c(monto)
  if (!(objetivo > 0)) return { error: 'Poné el monto a facturar.' }
  const items = (pendientes || []).filter((p) => Number(p.cantidad) > 0 && c(p.unitario) > 0)
  if (!items.length) return { error: 'No quedan productos sin facturar en esta venta: cargá los renglones a mano.' }
  const ren = (p, cantidad, unit) => ({ clave: p.clave ?? null, descripcion: p.descripcion, cantidad, unitario: pesos(unit), importe: pesos(unit * cantidad) })

  if (precios === 'reales') {
    const orden = [...items].sort((a, b) => c(b.unitario) - c(a.unitario))
    let resto = objetivo
    const out = []
    for (const p of orden) {
      const u = c(p.unitario)
      const n = Math.min(Number(p.cantidad), Math.floor(resto / u))
      if (n > 0) { out.push(ren(p, n, u)); resto -= n * u }
    }
    if (!out.length) return { error: 'Con precios reales ningún producto entra en ese monto.' }
    return { renglones: out, total: pesos(objetivo - resto) }
  }
  if (precios !== 'ajustados') return { error: 'Los precios son reales o ajustados.' }

  const base = items.reduce((a, p) => a + c(p.unitario) * Number(p.cantidad), 0)
  const f = objetivo / base
  const out = items.map((p) => ({ p, cantidad: Number(p.cantidad), unit: Math.max(1, Math.round(c(p.unitario) * f)) }))
  let dif = objetivo - out.reduce((a, x) => a + x.unit * x.cantidad, 0)
  if (dif !== 0) {
    // La diferencia de redondeo va a UNA unidad: un renglón de 1 si hay, si no se separa una unidad del último.
    let i = out.findIndex((x) => x.cantidad === 1 && x.unit + dif > 0)
    if (i < 0) {
      const j = out.length - 1
      if (out[j].unit + dif <= 0) return { error: 'El monto es demasiado chico para esos productos.' }
      out[j].cantidad -= 1
      out.push({ p: out[j].p, cantidad: 1, unit: out[j].unit })
      i = out.length - 1
    }
    out[i].unit += dif
    dif = 0
  }
  const renglones = out.filter((x) => x.cantidad > 0).map((x) => ren(x.p, x.cantidad, x.unit))
  return { renglones, total: pesos(objetivo) }
}
