/**
 * El pedido de Tienda Nube ⇒ la venta propia del motor (paso 4, en PRUEBA: `prueba: true`, ⛔ mueve el libro). Puro.
 *
 * Copia lo que hace GN hoy, MEDIDO el 14-oct contra las ventas que GN creó de los pedidos pagados de 30 días
 * (BDI 47, Zattia 46, Stunned 3):
 *   - la venta nace cuando el pedido está PAGADO (GN la crea al pago; un pedido pendiente ⛔ tiene venta);
 *   - total = el de TN, con envío y descuento adentro (46/47 y 46/46 iguales); el envío y el descuento van aparte,
 *     acá en `detalle` (las líneas suman el subtotal: 243/243 y 189/189; total = subtotal − descuento + envío, 432/432);
 *   - sale de: BDI el Depósito Minorista, Zattia y Stunned el Local;
 *   - se cobra en la cuenta del medio de TN: Pago Nube ⇒ «Pago Nube», Mercado Pago ⇒ «Mercado Pago 2» (BDI) o
 *     «Mercado Pago», Transferencia ⇒ la de transferencia de la marca, Efectivo ⇒ la de efectivo (sql/008).
 * Un pedido cancelado, devuelto o anulado después de la venta ⇒ se anula.
 *
 * ⛔ se registra a medias: si una línea no tiene variante en GN o el medio no tiene cuenta, el pedido se SALTA y
 * se cuenta por qué (la próxima corrida lo vuelve a intentar: la clave es el pedido).
 */
import { PAGADA, DEVUELTA, varianteDeLineaTN } from './cruce.mjs'
import { TIENDAS } from './orden.mjs'

/** Medido el 14-oct (`ventas.store` de las ventas de GN con pedido de TN). */
export const DEPOSITO_ONLINE = { bdi: 'deposito_minorista', zattia: 'local', stunned: 'local' }

/** El nombre de la cuenta de cobro de cada medio de TN, por tienda (lo que GN pone en `account_display`). */
const CUENTA_DE_GATEWAY = [
  [/pago\s*nube/i, () => ({ nombre: 'Pago Nube' })],
  [/mercado\s*pago/i, (t) => ({ nombre: t === 'bdi' ? 'Mercado Pago 2' : 'Mercado Pago' })],
  [/transferencia/i, () => ({ medio: 'transferencia' })],
  [/efectivo/i, () => ({ medio: 'efectivo' })],
  // 🔑 Bruno (20-oct): «Pagos Personalizados» es la FERIA (Zattia #7011; GN: «Feria - Efectivo») · `multiple` = dos medios
  // en un pedido y TN ⛔ dice cuánto de cada uno ⇒ todo a Pago Nube («asignémoslo a cualquier cuenta, ¿qué cambiaría?»:
  // sólo dónde figura la plata al conciliar), con `detalle.tn.pago_multiple` para que la conciliación lo reconozca.
  [/pagos\s*personalizados/i, () => ({ nombre: 'Feria - Efectivo' })],
  [/^multiple$/i, () => ({ nombre: 'Pago Nube' })],
]

/**
 * 🔑 La llave de «el pedido de TN es venta REAL»: `VENTA_TN_REAL=stunned` (variable del repo `areben-motor` para el cron de
 * Actions Y variable de Vercel de `areben-erp` para el aviso al instante: ⛔ una sola no alcanza). Sin ella, todas en PRUEBA
 * (⛔ mueven el libro). Se prende con el corte de la marca, junto con el conteo inicial y `STOCK_TN_MANDA`. Un typo FALLA.
 * Las ventas que YA están (en prueba) ⛔ cambian: la clave es el pedido y se salta; lo anterior al corte está en el conteo.
 */
export function ventaRealEn(tienda, env = process.env) {
  const lista = String(env.VENTA_TN_REAL ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  for (const t of lista) if (!TIENDAS[t]) throw new Error(`VENTA_TN_REAL: tienda desconocida «${t}»`)
  return lista.includes(tienda)
}

export const origenRef = (tienda, tnId) => `${tienda}:${tnId}`
const pesos = (x) => Math.round(Number(x) * 100) / 100

/**
 * La cuenta de cobro del pedido, de las de la marca. Por nombre exacto o, para transferencia y efectivo, la ÚNICA
 * cuenta de ese medio que se llama así a secas («Transferencia», «Efectivo»); ⛔ se elige entre varias.
 * @param {string} tienda @param {string|null} gateway @param {Array<{ id: string, nombre: string, medio: string, activa?: boolean }>} cuentas
 */
export function cuentaDeGateway(tienda, gateway, cuentas) {
  const regla = CUENTA_DE_GATEWAY.find(([re]) => re.test(gateway || ''))
  if (!regla) return null
  const quiere = regla[1](tienda)
  const activas = cuentas.filter((c) => c.activa !== false)
  if (quiere.nombre) return activas.find((c) => c.nombre === quiere.nombre) ?? null
  const delMedio = activas.filter((c) => c.medio === quiere.medio && c.nombre.trim().toLowerCase() === quiere.medio)
  return delMedio.length === 1 ? delMedio[0] : null
}

/**
 * Qué hacer con cada pedido.
 * @param {object} p
 * @param {'bdi'|'zattia'|'stunned'} p.tienda
 * @param {Array} p.ordenes   filas de `tn_orden` con `lineas` (filas de `tn_orden_linea`)
 * @param {object} p.indice   indiceDeVariantes del inventario
 * @param {Array} p.cuentas   `cuenta_cobro` de la marca
 * @param {Map<string, { id: string, estado: string }>} p.ya  las ventas `tn` que ya están, por `origen_ref`
 * @param {boolean} [p.real]  `ventaRealEn`: la venta mueve el libro (`prueba: false`); por defecto PRUEBA
 * @returns {{ registrar: any[], anular: Array<{ venta_id: string, motivo: string, numero: number }>, saltadas: Record<string, number[]>, ya: number }}
 */
export function planVentasTN({ tienda, ordenes, indice, cuentas, ya, real = false }) {
  if (!TIENDAS[tienda]) throw new Error(`tienda desconocida: ${tienda}`)
  const variante = varianteDeLineaTN(indice)
  const registrar = []
  const anular = []
  const saltadas = {}
  let yaEstan = 0
  const saltar = (motivo, o) => (saltadas[motivo] = saltadas[motivo] || []).push(Number(o.numero))

  for (const o of ordenes) {
    const ref = origenRef(tienda, o.tn_id)
    const existente = ya.get(ref)
    const caida = o.status === 'cancelled' || DEVUELTA.has(o.payment_status)
    if (caida) {
      if (existente && existente.estado !== 'anulada') anular.push({ venta_id: existente.id, numero: Number(o.numero), motivo: `Tienda Nube: pedido #${o.numero} ${o.status}/${o.payment_status}` })
      continue
    }
    if (!PAGADA.has(o.payment_status) || !o.pagada_en) continue // sin pagar ⇒ todavía ⛔ es venta
    if (existente) { yaEstan++; continue }

    const cuenta = cuentaDeGateway(tienda, o.gateway, cuentas)
    if (!cuenta) { saltar('cuenta_desconocida', o); continue }
    const lineas = []
    let falta = false
    for (const l of o.lineas || []) {
      const v = variante(l)
      if (!v) { falta = true; break }
      const cantidad = Number(l.cantidad)
      lineas.push({ product_id: Number(v.product_id), size_id: Number(v.size_id), sku: v.sku ?? l.sku ?? null, barcode: v.barcode ?? l.barcode ?? null,
        cantidad, precio: pesos(l.precio), descuento: 0, rebaja: 0, importe: pesos(Number(l.precio) * cantidad) })
    }
    if (falta) { saltar('sin_variante', o); continue }
    if (!lineas.length) { saltar('sin_lineas', o); continue }
    const subtotal = pesos(lineas.reduce((s, l) => s + l.importe, 0))
    const total = pesos(o.total)
    if (Math.abs(subtotal - pesos(o.subtotal)) > 0.01) { saltar('subtotal_distinto', o); continue }

    registrar.push({
      origen: 'tn', origen_ref: ref, marca: tienda, canal: 'online', deposito: DEPOSITO_ONLINE[tienda],
      usuario: 'tienda-nube', prueba: !real, ocurrida_en: new Date(o.pagada_en).toISOString(),
      // La ficha del comprador (sql/059), si la orden ya la tiene.
      ...(o.cliente_id ? { cliente_id: String(o.cliente_id) } : {}),
      lineas, subtotal, total, pagos: [{ cuenta: cuenta.id, monto: total }],
      detalle: { tn: { numero: Number(o.numero), tn_id: Number(o.tn_id), gateway: o.gateway, medio: o.medio, ...(/^multiple$/i.test(o.gateway || '') ? { pago_multiple: true } : {}), envio: pesos(o.envio || 0), descuento: pesos(o.descuento || 0) } },
    })
  }
  return { registrar, anular, saltadas, ya: yaEstan }
}
