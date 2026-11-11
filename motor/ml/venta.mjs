/**
 * El pack de Mercado Libre ⇒ la venta propia del motor (paso 8, en PRUEBA: `prueba: true`, ⛔ mueve el libro). Puro.
 * El modelo es `lib/tn/venta.mjs`.
 *
 * Copia lo que hace GN hoy, MEDIDO el 30-oct contra las ventas de GN con `ml_pack` de 30 días (13 de 13):
 *   - UNA venta por PACK (`claveGN`: el pack o, sin carrito, la orden), y nace cuando todas sus órdenes vivas están PAGAS;
 *   - total = la suma de `total_amount` de esas órdenes (13/13 iguales; `paid_amount` trae el envío y ⛔ se usa);
 *   - sale del Depósito Minorista (`DEPOSITO_ONLINE.bdi`), canal Mercado Libre, cobra en la cuenta «Mercado Libre».
 * Un pack que se cae entero (todas sus órdenes canceladas) después de la venta ⇒ se anula.
 *
 * ⛔ se registra a medias: si una línea no tiene variante (seller_sku que ⛔ cruza) o falta la cuenta, el pack se SALTA y
 * se cuenta por qué (la próxima corrida lo vuelve a intentar: la clave es el pack).
 */
import { varianteDeLineaTN } from '../tn/cruce.mjs'
import { DEPOSITO_ONLINE } from '../tn/venta.mjs'
import { claveGN } from './orden.mjs'

export const CUENTA_ML = 'Mercado Libre'
const VIVA = (o) => o.status !== 'cancelled' && o.status !== 'invalid'
const PAGA = (o) => o.status === 'paid' || o.status === 'partially_refunded'

/**
 * La VARIABLE sola de «el pack de ML es venta REAL» — ⛔ se llama fuera de `lib/llave-corte.mjs` (`ventaMlReal`: el corte de
 * BDI la prende solo, Bruno 1-nov). `VENTA_ML_REAL=bdi` (variable del repo `areben-motor`). Sin ella, todas en
 * PRUEBA (⛔ mueven el libro). Se prende con el corte de BDI, junto con `STOCK_ML_MANDA`. Sólo BDI vende en ML: otra marca FALLA.
 */
export function ventaMLRealEn(marca, env = process.env) {
  const lista = String(env.VENTA_ML_REAL ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  for (const t of lista) if (t !== 'bdi') throw new Error(`VENTA_ML_REAL: sólo BDI vende en Mercado Libre, no «${t}»`)
  return lista.includes(marca)
}

export const origenRefML = (clave) => `ml:${clave}`
const pesos = (x) => Math.round(Number(x) * 100) / 100

/**
 * Qué hacer con cada pack.
 * @param {object} p
 * @param {Array} p.ordenes   filas de `ml_orden` con `lineas` (filas de `ml_orden_linea`); todas las órdenes de cada pack
 * @param {object} p.indice   indiceDeVariantes del inventario
 * @param {Array} p.cuentas   `cuenta_cobro` de BDI
 * @param {Map<string, { id: string, estado: string }>} p.ya  las ventas `ml` que ya están, por `origen_ref`
 * @param {boolean | ((instante: string) => boolean)} [p.real]  la venta mueve el libro (`prueba: false`); por defecto PRUEBA.
 *   🔴 Una FUNCIÓN del instante del pack (cierre o creación; sin fecha, ahora): pagado ANTES del corte ⛔ entra real aunque
 *   se registre después (GN ya lo descontó; revisión 10-nov). Ver `planVentasTN`.
 * @returns {{ registrar: any[], anular: Array<{ venta_id: string, motivo: string, numero: string }>, saltadas: Record<string, string[]>, ya: number }}
 */
export function planVentasML({ ordenes, indice, cuentas, ya, real = false }) {
  const variante = varianteDeLineaTN(indice)
  const cuenta = cuentas.find((c) => c.nombre === CUENTA_ML && c.activa !== false) ?? null
  const registrar = []
  const anular = []
  const saltadas = {}
  let yaEstan = 0
  const saltar = (motivo, clave) => (saltadas[motivo] = saltadas[motivo] || []).push(clave)

  const packs = new Map()
  for (const o of ordenes) {
    const k = claveGN(o)
    if (!packs.has(k)) packs.set(k, [])
    packs.get(k).push(o)
  }

  for (const [clave, os] of packs) {
    const ref = origenRefML(clave)
    const existente = ya.get(ref)
    const vivas = os.filter(VIVA)
    if (!vivas.length) {
      if (existente && existente.estado !== 'anulada') anular.push({ venta_id: existente.id, numero: clave, motivo: `Mercado Libre: pack ${clave} cancelado` })
      continue
    }
    if (!vivas.every(PAGA)) continue // sin pagar ⇒ todavía ⛔ es venta
    if (existente) { yaEstan++; continue }

    const lineas = []
    let falta = false
    for (const o of vivas) {
      for (const l of o.lineas || []) {
        const v = variante({ sku: l.seller_sku, barcode: null })
        if (!v) { falta = true; break }
        const cantidad = Number(l.cantidad)
        lineas.push({ product_id: Number(v.product_id), size_id: Number(v.size_id), sku: v.sku ?? l.seller_sku ?? null, barcode: v.barcode ?? null,
          cantidad, precio: pesos(l.precio), descuento: 0, rebaja: 0, importe: pesos(Number(l.precio) * cantidad) })
      }
      if (falta) break
    }
    if (falta) { saltar('sin_variante', clave); continue }
    if (!lineas.length) { saltar('sin_lineas', clave); continue }
    const subtotal = pesos(lineas.reduce((s, l) => s + l.importe, 0))
    const total = pesos(vivas.reduce((s, o) => s + Number(o.total), 0))
    if (Math.abs(subtotal - total) > 0.01) { saltar('total_distinto', clave); continue }
    if (!cuenta) { saltar('cuenta_desconocida', clave); continue }
    const fecha = vivas.map((o) => o.cerrada_en || o.creada_en).filter(Boolean).map((d) => new Date(d).toISOString()).sort().at(-1)

    registrar.push({
      origen: 'ml', origen_ref: ref, marca: 'bdi', canal: 'ml', deposito: DEPOSITO_ONLINE.bdi,
      usuario: 'mercado-libre', prueba: !(typeof real === 'function' ? real(fecha ?? new Date().toISOString()) : real), ...(fecha ? { ocurrida_en: fecha } : {}),
      lineas, subtotal, total, pagos: [{ cuenta: cuenta.id, monto: total }],
      detalle: { ml: { pack: clave, ordenes: vivas.map((o) => String(o.orden_id)), medio: vivas[0].medio ?? null } },
    })
  }
  return { registrar, anular, saltadas, ya: yaEstan }
}
