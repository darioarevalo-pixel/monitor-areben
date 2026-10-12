/**
 * El ticket de la Caja, en el rollo de 80 mm de la térmica del local.
 *
 * # Igual al ticket de GN (Bruno, 5-oct: «igualala a la de GN, y de ahí metemos cambios»)
 *
 * Logo (o el nombre), «COMPROBANTE», «DOCUMENTO NO VÁLIDO COMO FACTURA», `Comprobante: #N` (el
 * número de la venta, se mantiene), `Fecha:` con el día, `Cliente:`, el encabezado `Cant. x Precio /
 * Descripción / Total`, los renglones, TOTAL, RECIBIMOS, SALDO (y el vuelto si hubo), la política
 * de cambio, «Gracias por tu compra!» y la fecha y hora de registro. ⛔ Las formas de pago abajo
 * (Bruno: «es raro»). ⛔ Es factura: la Caja ⛔ factura en AFIP (la API de GN tampoco).
 *
 * # 🔑 Los números salen del MISMO cobro que vio la cajera
 *
 * El ticket ⛔ calcula: recibe el `cobro` de `lib/caja/core.core.js` —el que también rearmó el
 * servidor y mandó a GN— y lo escribe. Un ticket que recalcule es un ticket que puede decir un total
 * distinto del de GN.
 *
 * 🔑 **Los descuentos en cascada, cada uno en su renglón** (Bruno, 4-oct): el de la prenda debajo de
 * la prenda, «Descuento en la venta» después del subtotal, y el de la forma de pago como «Descuento
 * 15%» — ⛔ «Descuento Transferencia CG»: la cuenta de GN ⛔ se le muestra al cliente. Sin ellos el
 * TOTAL ⛔ cierra con los renglones.
 *
 * 🔴 **El redondeo se llama «Redondeo», suba o baje** (Bruno, 13-oct: «que no se llame recargo»): el que
 * sube va con su más, el que baja con su menos. Antes el de arriba decía «Recargo por redondeo», como GN.
 *
 * # 🎁 Regalo: el ticket + el TICKET DE CAMBIO (Bruno, 13-oct)
 *
 * Con «Regalo» salen dos en el mismo PDF: el comprobante de siempre y el de cambio —las prendas con su
 * talle, la política de cambio, ⛔ un solo precio—, para que la clienta lo meta en la bolsa.
 *
 * # 🔴 Sin número de GN el ticket sale IGUAL, y lo dice
 *
 * Si GN ⛔ contestó, la clienta se lleva la prenda igual: el ticket lleva el número provisorio de la
 * Caja y un renglón que dice que la venta está pendiente en Gestión Nube. ⛔ Se inventa un número
 * con forma de número de GN: después no se podría buscar.
 */

import { abrirRollo, COLA, M, MIN, W, type Medidor, type OpBase } from '../rollo80'
import { imprimirPdf } from '../etiquetas/pdf'
import { OFFSET_AR_MS } from '../envios/portal.core.js'
import { talleVisible } from './ticket-mail.core.js'
import { MARCA_CAJA } from './marca'

/** `importe` es lo que queda después del descuento a mano de esa prenda (si lo hubo). */
/** `promos`: las que le tocaron (W5): el descuento del renglón sale con su nombre, ⛔ «Descuento». */
/** `stunned`: la prenda es de Stunned (SKU `STU…`): el ticket lleva su logo (Bruno, 12-oct). */
export type RenglonTicket = { nombre: string; talle?: string | null; cantidad: number; precio: number; importe: number; promos?: string[] | null; stunned?: boolean }
/** `rebaja` = la parte de este pago del descuento a mano a la VENTA (0 o ausente si ⛔ hubo). */
export type PagoTicket = { cuenta: number; rebaja?: number; porcentaje: number; descuento: number; redondeo: number; monto: number }

export type DatosTicket = {
  /** El número de la venta en GN; `null` si todavía ⛔ llegó. */
  numero: number | null
  /** El id de la venta en la Caja (uuid): de ahí sale el número provisorio. */
  id: string
  renglones: RenglonTicket[]
  subtotal: number
  pagos: PagoTicket[]
  total: number
  /** Lo que la gente lee de cada cuenta: la forma de pago («Tarjeta de crédito»), ⛔ el nombre de la
   *  cuenta de GN, que es interna (Bruno, 4-oct). Sale de `nombreParaTicket`. */
  nombreCuenta: (cuenta: number) => string
  /** Con cuánto pagó en efectivo; `null` si ⛔ se anotó. */
  pagaCon: number | null
  politica: string | null
  /** El logo del ticket (Configuración de la Caja): data URL y su tamaño en píxeles. Sin logo, el nombre. */
  logo?: LogoTicket | null
  /** El logo de Stunned: sale si alguna prenda es de Stunned; con prendas de las dos, salen los DOS. */
  logoStunned?: LogoTicket | null
  /** El mail del ticket, si se cargó; si no, «Consumidor Final». */
  cliente?: string | null
  /** El nombre de la marca, si ⛔ hay logo (rediseño, fase 5); sin él, la marca activa de la Caja (V4). */
  marca?: string
}

export type LogoTicket = { src: string; ancho: number; alto: number }

/** Las marcas del ticket, en orden: Zattia si hay alguna prenda que ⛔ es de Stunned (o ninguna prenda), Stunned si hay alguna. */
export function marcasDelTicket(t: Pick<DatosTicket, 'renglones' | 'logo' | 'logoStunned' | 'marca'>): Array<{ nombre: string; logo: LogoTicket | null }> {
  const hayStunned = t.renglones.some((r) => r.stunned)
  const hayOtra = t.renglones.some((r) => !r.stunned)
  return [
    ...(hayOtra || !hayStunned ? [{ nombre: t.marca ?? MARCA_CAJA.nombre, logo: t.logo ?? null }] : []),
    ...(hayStunned ? [{ nombre: 'Stunned', logo: t.logoStunned ?? null }] : []),
  ]
}
/** El logo, como lo dibuja jsPDF: `x`/`y`/`w`/`h` en mm. */
export type OpImagen = { k: 'img'; src: string; x: number; y: number; w: number; h: number }

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

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
/** La fecha con el día, de Argentina: «sábado 04/10/2026». */
export function fechaConDia(ahoraMs: number): string {
  const ar = new Date(ahoraMs + OFFSET_AR_MS)
  return `${DIAS[ar.getUTCDay()]} ${fechaTicket(ahoraMs).slice(0, 10)}`
}

/** El vuelto de lo que se pagó en efectivo. Sin `pagaCon`, o si ⛔ hay pago en efectivo, `null`. */
export function vueltoDelTicket(pagaCon: number | null, montoEfectivo: number): number | null {
  if (pagaCon == null || !(montoEfectivo > 0)) return null
  return Math.max(0, Math.round((pagaCon - montoEfectivo) * 100) / 100)
}

/** El papel que se va llenando de arriba abajo: lo comparten el ticket y el de cambio. */
function lienzo(partir: Medidor) {
  const ops: (OpBase | OpImagen)[] = []
  const l = {
    ops,
    y: M,
    escribir(txt: string, tam: number, bold: boolean, align: 'izq' | 'centro' = 'izq', gris?: number) {
      for (const linea of partir(txt, tam, bold)) {
        ops.push({ k: 'txt', txt: linea, y: l.y, tam, bold, align, gris })
        l.y += tam * 0.42
      }
    },
    /** Un renglón con el concepto a la izquierda y el monto a la derecha. */
    par(izq: string, der: string, tam: number, bold = false) {
      ops.push({ k: 'txt', txt: izq, y: l.y, tam, bold, align: 'izq' })
      ops.push({ k: 'txt', txt: der, y: l.y, tam, bold, align: 'der' })
      l.y += tam * 0.42 + 0.6
    },
    regla() {
      l.y += 1.5
      ops.push({ k: 'regla', y: l.y })
      l.y += 2.5
    },
    pagina: () => ({ ops, alto: Math.max(MIN, l.y + COLA) }),
  }
  return l
}

/**
 * El logo de la MARCA de lo que se vende (Bruno, 12-oct): Zattia, Stunned o los DOS lado a lado. Uno solo:
 * 44 mm de ancho como mucho y 22 de alto, centrado; dos: 34 × 18 cada uno. Si a alguno le falta el logo,
 * van los nombres.
 */
function logos(l: ReturnType<typeof lienzo>, t: Pick<DatosTicket, 'renglones' | 'logo' | 'logoStunned' | 'marca'>) {
  const marcas = marcasDelTicket(t)
  const conLogo = marcas.every((m) => m.logo && m.logo.ancho > 0 && m.logo.alto > 0)
  if (conLogo) {
    const [maxW, maxH, sep] = marcas.length > 1 ? [34, 18, 4] : [44, 22, 0]
    const tam = marcas.map(({ logo }) => {
      const lg = logo as LogoTicket
      const w = Math.min(maxW, (maxH * lg.ancho) / lg.alto)
      return { src: lg.src, w, h: (w * lg.alto) / lg.ancho }
    })
    let x = (W - tam.reduce((s, m) => s + m.w, 0) - sep * (tam.length - 1)) / 2
    const alto = Math.max(...tam.map((m) => m.h))
    for (const m of tam) {
      l.ops.push({ k: 'img', src: m.src, x, y: l.y + (alto - m.h) / 2, w: m.w, h: m.h })
      x += m.w + sep
    }
    l.y += alto + 2
  } else {
    l.escribir(marcas.map((m) => m.nombre.toUpperCase()).join(' · '), 16, true, 'centro')
    l.y += 1
  }
}

/** El número de la venta, como lo escriben los dos tickets. */
function numeroYFecha(l: ReturnType<typeof lienzo>, t: DatosTicket, ahoraMs: number) {
  if (t.numero != null) {
    l.escribir(`Comprobante: #${t.numero}`, 10, true)
  } else {
    l.escribir(`Comprobante: Provisorio ${numeroProvisorio(t.id)}`, 10, true)
    l.escribir('Venta pendiente en Gestión Nube', 9, false, 'izq', 60)
  }
  l.escribir(`Fecha: ${fechaConDia(ahoraMs)}`, 10, false)
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
): { ops: (OpBase | OpImagen)[]; alto: number } {
  const l = lienzo(partir)
  const { escribir, par, regla } = l
  logos(l, t)
  escribir('COMPROBANTE', 12, true, 'centro')
  regla()
  escribir('DOCUMENTO NO VÁLIDO COMO FACTURA', 8, false, 'centro', 60)
  regla()
  numeroYFecha(l, t, ahoraMs)
  escribir(`Cliente: ${t.cliente?.trim() || 'Consumidor Final'}`, 10, false)
  regla()

  escribir('Cant. x Precio', 9, true)
  escribir('Descripción', 9, true)
  escribir('Total', 9, true)
  regla()
  for (const r of t.renglones) {
    const talle = talleVisible(r.talle)
    const lista = Math.round(r.cantidad * r.precio * 100) / 100
    par(`${r.cantidad} x ${plata(r.precio)}`, plata(lista), 9)
    escribir(talle ? `${r.nombre} - ${talle}` : r.nombre, 9, false)
    if (lista - r.importe > 0.004) par(r.promos?.length ? `Promo ${r.promos.join(' + ')}` : 'Descuento', `-${plata(lista - r.importe)}`, 9)
    l.y += 0.8
  }
  regla()

  par('Subtotal', plata(t.subtotal), 10)
  const aVenta = Math.round(t.pagos.reduce((s, p) => s + (p.rebaja || 0), 0) * 100) / 100
  if (aVenta > 0) par('Descuento en la venta', `-${plata(aVenta)}`, 10)
  for (const p of t.pagos) {
    if (p.descuento > 0) par(`Descuento ${p.porcentaje}%`, `-${plata(p.descuento)}`, 10)
    if (p.redondeo > 0) par('Redondeo', `+${plata(p.redondeo)}`, 10)
    if (p.redondeo < 0) par('Redondeo', `-${plata(p.redondeo)}`, 10)
  }
  l.y += 1
  par('TOTAL', plata(t.total), 12, true)
  // RECIBIMOS: lo que entregó (con el efectivo, «paga con» + el resto); SALDO: lo que queda debiendo.
  const enEfectivo = t.pagos.filter((p) => efectivo(p.cuenta)).reduce((s, p) => s + p.monto, 0)
  const v = vueltoDelTicket(t.pagaCon, enEfectivo)
  const recibimos = v != null && t.pagaCon != null ? Math.round((t.total - enEfectivo + t.pagaCon) * 100) / 100 : t.total
  par('RECIBIMOS', plata(recibimos), 12, true)
  par('SALDO', plata(0), 12, true)
  if (v != null && v > 0) par('VUELTO', plata(v), 12, true)
  regla()

  if (t.politica) {
    escribir(t.politica, 9, false)
    l.y += 2
  }
  escribir('Gracias por tu compra!', 10, false, 'centro')
  regla()
  escribir('Fecha y hora de registro:', 8, false, 'centro', 60)
  escribir(fechaTicket(ahoraMs), 8, false, 'centro', 60)

  return l.pagina()
}

/**
 * El TICKET DE CAMBIO (Bruno, 13-oct): el logo, el número y la fecha de la venta —para encontrarla al
 * cambiar—, las prendas con su talle y la política de cambio. ⛔ Precios, descuentos ni forma de pago: va
 * de regalo.
 */
export function armarTicketCambio(t: DatosTicket, ahoraMs: number, partir: Medidor): { ops: (OpBase | OpImagen)[]; alto: number } {
  const l = lienzo(partir)
  logos(l, t)
  l.escribir('TICKET DE CAMBIO', 12, true, 'centro')
  l.regla()
  numeroYFecha(l, t, ahoraMs)
  l.regla()
  l.escribir('Cant. · Descripción', 9, true)
  l.regla()
  for (const r of t.renglones) {
    const talle = talleVisible(r.talle)
    l.escribir(`${r.cantidad} x ${talle ? `${r.nombre} - ${talle}` : r.nombre}`, 9, false)
    l.y += 0.8
  }
  l.regla()
  if (t.politica) {
    l.escribir(t.politica, 9, false)
    l.y += 2
  }
  l.escribir('Gracias por tu compra!', 10, false, 'centro')
  return l.pagina()
}

/**
 * Arma el PDF y lo manda a la térmica (con `--kiosk-printing`, sin diálogo). `que`: el ticket solo, el
 * ticket + el de cambio (regalo, dos páginas en el mismo PDF) o sólo el de cambio.
 */
export async function imprimirTicket(t: DatosTicket, efectivo: (cuenta: number) => boolean, ahoraMs: number, que: 'ticket' | 'regalo' | 'cambio' = 'ticket') {
  const rollo = await abrirRollo()
  const paginas = [
    ...(que !== 'cambio' ? [armarTicket(t, efectivo, ahoraMs, rollo.medir)] : []),
    ...(que !== 'ticket' ? [armarTicketCambio(t, ahoraMs, rollo.medir)] : []),
  ]
  imprimirPdf(
    rollo.documento<OpImagen>(paginas, (pdf, op) => {
      if (op.k !== 'img') return false
      const tipo = /^data:image\/jpe?g/i.test(op.src) ? 'JPEG' : 'PNG'
      pdf.addImage(op.src, tipo, op.x, op.y, op.w, op.h)
      return true
    }),
  )
}
