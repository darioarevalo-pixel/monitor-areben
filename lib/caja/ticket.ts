/**
 * El ticket de la Caja, en el rollo de 80 mm de la térmica del local.
 *
 * # Qué copia del ticket de GN
 *
 * El del POS de GN: «COMPROBANTE», «DOCUMENTO NO VÁLIDO COMO FACTURA», el número de la venta, la
 * fecha, los renglones, subtotal, descuento, total, con qué pagó y el vuelto, la política de cambio
 * y «Gracias por tu compra». ⛔ Es factura: la Caja ⛔ factura en AFIP (la API de GN tampoco).
 *
 * # 🔑 Los números salen del MISMO cobro que vio la cajera
 *
 * El ticket ⛔ calcula: recibe el `cobro` de `lib/caja/core.core.js` —el que también rearmó el
 * servidor y mandó a GN— y lo escribe. Un ticket que recalcule es un ticket que puede decir un total
 * distinto del de GN.
 *
 * 🔴 **El redondeo para arriba se llama «Recargo por redondeo»** (Bruno, 4-oct): es como figura en los
 * tickets de GN. El que baja va como «Redondeo» con su menos.
 *
 * # 🔴 Sin número de GN el ticket sale IGUAL, y lo dice
 *
 * Si GN ⛔ contestó, la clienta se lleva la prenda igual: el ticket lleva el número provisorio de la
 * Caja y un renglón que dice que la venta está pendiente en Gestión Nube. ⛔ Se inventa un número
 * con forma de número de GN: después no se podría buscar.
 */

import { abrirRollo, COLA, M, MIN, type Medidor, type OpBase } from '../rollo80'
import { imprimirPdf } from '../etiquetas/pdf'
import { OFFSET_AR_MS } from '../envios/portal.core.js'

export type RenglonTicket = { nombre: string; talle?: string | null; cantidad: number; precio: number; importe: number }
export type PagoTicket = { cuenta: number; porcentaje: number; descuento: number; redondeo: number; monto: number }

export type DatosTicket = {
  /** El número de la venta en GN; `null` si todavía ⛔ llegó. */
  numero: number | null
  /** El id de la venta en la Caja (uuid): de ahí sale el número provisorio. */
  id: string
  renglones: RenglonTicket[]
  subtotal: number
  pagos: PagoTicket[]
  total: number
  /** El nombre de cada cuenta de cobro, como lo muestra GN. */
  nombreCuenta: (cuenta: number) => string
  /** Con cuánto pagó en efectivo; `null` si ⛔ se anotó. */
  pagaCon: number | null
  politica: string | null
}

/** Pesos argentinos; los centavos sólo si hay (GN escribe $748,50 y $4.200). */
export function plata(n: number): string {
  const r = Math.round(n * 100) / 100
  const conCentavos = Math.round(r * 100) % 100 !== 0
  return '$' + Math.abs(r).toLocaleString('es-AR', { minimumFractionDigits: conCentavos ? 2 : 0, maximumFractionDigits: 2 })
}

/** El número provisorio: las primeras 8 letras del id, para buscarla en Pendientes. */
export const numeroProvisorio = (id: string) => id.replace(/-/g, '').slice(0, 8).toUpperCase()

/** Fecha y hora de Argentina, como función pura del instante (mismo offset que el recibo del cadete). */
export function fechaTicket(ahoraMs: number): string {
  const ar = new Date(ahoraMs + OFFSET_AR_MS).toISOString()
  return `${ar.slice(8, 10)}/${ar.slice(5, 7)}/${ar.slice(0, 4)} ${ar.slice(11, 16)}`
}

/** El vuelto de lo que se pagó en efectivo. Sin `pagaCon`, o si ⛔ hay pago en efectivo, `null`. */
export function vueltoDelTicket(pagaCon: number | null, montoEfectivo: number): number | null {
  if (pagaCon == null || !(montoEfectivo > 0)) return null
  return Math.max(0, Math.round((pagaCon - montoEfectivo) * 100) / 100)
}

/**
 * Dónde va cada cosa y cuánto mide el papel, sin tocar jsPDF. `efectivo` dice qué cuentas son de
 * efectivo (para el vuelto): sale de las reglas de la Caja.
 */
export function armarTicket(
  t: DatosTicket,
  efectivo: (cuenta: number) => boolean,
  ahoraMs: number,
  partir: Medidor,
): { ops: OpBase[]; alto: number } {
  const ops: OpBase[] = []
  let y = M

  const escribir = (txt: string, tam: number, bold: boolean, align: 'izq' | 'centro' = 'izq', gris?: number) => {
    for (const linea of partir(txt, tam, bold)) {
      ops.push({ k: 'txt', txt: linea, y, tam, bold, align, gris })
      y += tam * 0.42
    }
  }
  /** Un renglón con el concepto a la izquierda y el monto a la derecha. */
  const par = (izq: string, der: string, tam: number, bold = false) => {
    ops.push({ k: 'txt', txt: izq, y, tam, bold, align: 'izq' })
    ops.push({ k: 'txt', txt: der, y, tam, bold, align: 'der' })
    y += tam * 0.42 + 0.6
  }
  const regla = () => {
    y += 1.5
    ops.push({ k: 'regla', y })
    y += 2.5
  }

  escribir('ZATTIA', 16, true, 'centro')
  y += 1
  escribir('COMPROBANTE', 11, true, 'centro')
  escribir('DOCUMENTO NO VÁLIDO COMO FACTURA', 8, false, 'centro', 80)
  y += 1.5
  if (t.numero != null) {
    escribir(`#${t.numero}`, 13, true, 'centro')
  } else {
    escribir(`Provisorio ${numeroProvisorio(t.id)}`, 12, true, 'centro')
    escribir('Venta pendiente en Gestión Nube', 9, false, 'centro', 60)
  }
  escribir(fechaTicket(ahoraMs), 9, false, 'centro', 60)
  regla()

  for (const r of t.renglones) {
    escribir(r.talle ? `${r.nombre} · ${r.talle}` : r.nombre, 9, false)
    par(`${r.cantidad} × ${plata(r.precio)}`, plata(r.importe), 9)
    y += 0.8
  }
  regla()

  par('Subtotal', plata(t.subtotal), 10)
  for (const p of t.pagos) {
    if (p.descuento > 0) par(`Descuento ${t.nombreCuenta(p.cuenta)} ${p.porcentaje}%`, `-${plata(p.descuento)}`, 10)
    if (p.redondeo > 0) par('Recargo por redondeo', `+${plata(p.redondeo)}`, 10)
    if (p.redondeo < 0) par('Redondeo', `-${plata(p.redondeo)}`, 10)
  }
  y += 1
  par('TOTAL', plata(t.total), 14, true)
  regla()

  for (const p of t.pagos) par(t.nombreCuenta(p.cuenta), plata(p.monto), 10)
  const enEfectivo = t.pagos.filter((p) => efectivo(p.cuenta)).reduce((s, p) => s + p.monto, 0)
  const v = vueltoDelTicket(t.pagaCon, enEfectivo)
  if (v != null && t.pagaCon != null) {
    par('Paga con', plata(t.pagaCon), 10)
    par('Vuelto', plata(v), 11, true)
  }

  if (t.politica) {
    regla()
    escribir(t.politica, 8, false, 'izq', 60)
  }
  y += 3
  escribir('Gracias por tu compra', 10, true, 'centro')

  return { ops, alto: Math.max(MIN, y + COLA) }
}

/** Arma el PDF y lo manda a la térmica (con `--kiosk-printing`, sin diálogo). */
export async function imprimirTicket(t: DatosTicket, efectivo: (cuenta: number) => boolean, ahoraMs: number) {
  const rollo = await abrirRollo()
  const pagina = armarTicket(t, efectivo, ahoraMs, rollo.medir)
  imprimirPdf(rollo.documento([pagina]))
}
