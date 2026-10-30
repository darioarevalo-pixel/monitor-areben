/**
 * El ticket de la Caja, en el rollo de 80 mm de la térmica del local.
 *
 * # Igual al ticket de GN (Bruno, 5-oct: «igualala a la de GN, y de ahí metemos cambios»)
 *
 * Logo (o el nombre), «COMPROBANTE», «DOCUMENTO NO VÁLIDO COMO FACTURA», `Comprobante: #N` (el
 * número de la venta, se mantiene), `Fecha:` con el día, `Cliente:`, el encabezado `Cant. x Precio /
 * Descripción / Total`, los renglones y TOTAL —⛔ RECIBIMOS, SALDO ni vuelto: el ticket termina en el
 * total (Bruno, 13-oct)—, la política de cambio, «Gracias por tu compra!» y la fecha y hora de registro.
 * 🔑 El cliente es SIEMPRE «Consumidor Final» (Bruno, 13-oct): el mail sirve para mandarlo, ⛔ se imprime. ⛔ Las formas de pago abajo
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
import { armarSobre, billetesDe } from './conteo.core.js'
import { sobreEsperado } from './arqueo.core.js'
import { codigoCaja } from './core.core.js'
import { esStunned } from '../lineas.core.js'
import { numeroDeLaVenta, type Config, type Venta } from './cliente'

/** `importe` es lo que queda después del descuento a mano de esa prenda (si lo hubo). */
/** `promos`: las que le tocaron (W5): el descuento del renglón sale con su nombre, ⛔ «Descuento». */
/** `stunned`: la prenda es de Stunned (SKU `STU…`): el ticket lleva su logo (Bruno, 12-oct). */
export type RenglonTicket = { nombre: string; talle?: string | null; cantidad: number; precio: number; importe: number; promos?: string[] | null; stunned?: boolean }
/** `rebaja` = la parte de este pago del descuento a mano a la VENTA (0 o ausente si ⛔ hubo). */
export type PagoTicket = { cuenta: number; rebaja?: number; porcentaje: number; descuento: number; redondeo: number; monto: number }

export type DatosTicket = {
  /** El número de la venta en GN (o en el ERP, si es de Stunned); `null` si todavía ⛔ llegó. */
  numero: number | null
  /** La venta va al ERP, ⛔ a GN: si ⛔ llegó, el ticket dice «pendiente en el ERP». */
  enErp?: boolean
  /** Es el comprobante de un CAMBIO (Bruno, 28-oct: «LITERALMENTE el ticket de venta»): cada renglón con su rótulo DEVUELVE /
   *  SE LLEVA (⛔ «-1» ni montos en negativo) y el final como un ticket: «Subtotal» (la diferencia, a lista), los descuentos de
   *  la forma de pago sobre la diferencia y «TOTAL» —los dos, porque de ahí se ve si hay diferencia (23:15)—. */
  cambio?: { origen: string; aFavor: number; saldo: number | null; saldoUsado: number }
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
  /** El mail del ticket, si se cargó. ⛔ Se imprime (siempre «Consumidor Final»): lo usa el ticket por mail. */
  cliente?: string | null
  /** El nombre de la marca, si ⛔ hay logo (rediseño, fase 5); sin él, la marca activa de la Caja (V4). */
  marca?: string
}

export type LogoTicket = { src: string; ancho: number; alto: number }

/**
 * El ticket de una venta YA GUARDADA, de sus renglones y ⛔ del carrito. Lo usan el POS (la transferencia que
 * llega, reimprimir) y la pestaña Caja (el ticket de cambio desde «Ventas», 19-oct): la misma función, para
 * que el papel sea el mismo de los dos lados.
 */
export function ticketDeVenta(venta: Venta, config: Pick<Config, 'politica_cambio' | 'ticket_logo' | 'ticket_logo_stunned'> | null, nombreCuenta: (cuenta: number) => string): DatosTicket {
  return {
    numero: numeroDeLaVenta(venta),
    enErp: venta.destino === 'erp',
    id: venta.id,
    renglones: (venta.renglones ?? []).map((r) => ({
      nombre: r.nombre ?? `Producto ${r.product_id}`,
      talle: r.talle,
      cantidad: r.cantidad,
      precio: r.precio,
      importe: r.importe ?? Math.round(r.cantidad * r.precio * 100) / 100,
      promos: r.promos ?? null,
      stunned: esStunned(r.sku),
    })),
    subtotal: venta.subtotal,
    pagos: venta.pagos,
    total: venta.total,
    nombreCuenta,
    pagaCon: venta.paga_con,
    politica: config?.politica_cambio ?? null,
    logo: config?.ticket_logo ?? null,
    logoStunned: config?.ticket_logo_stunned ?? null,
    cliente: venta.email,
  }
}

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

/** El número provisorio: el código de la venta en la Caja, el mismo que va en el comentario de GN. */
export const numeroProvisorio = (id: string): string => codigoCaja(id)

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
  if (t.cambio) {
    l.escribir(`Comprobante: Cambio #${t.numero}`, 10, true)
    l.escribir(`De: ${t.cambio.origen}`, 10, false)
  } else if (t.numero != null) {
    l.escribir(`Comprobante: #${t.numero}`, 10, true)
  } else {
    l.escribir(`Comprobante: Provisorio ${numeroProvisorio(t.id)}`, 10, true)
    l.escribir(t.enErp ? 'Venta pendiente en el ERP' : 'Venta pendiente en Gestión Nube', 9, false, 'izq', 60)
  }
  l.escribir(`Fecha: ${fechaConDia(ahoraMs)}`, 10, false)
}

/** Dónde va cada cosa y cuánto mide el papel, sin tocar jsPDF. */
export function armarTicket(
  t: DatosTicket,
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
  escribir('Cliente: Consumidor Final', 10, false)
  regla()

  escribir('Cant. x Precio', 9, true)
  escribir('Descripción', 9, true)
  escribir('Total', 9, true)
  regla()
  for (const r of t.renglones) {
    const talle = talleVisible(r.talle)
    // En el cambio lo que vuelve viene con cantidad negativa: se imprime en positivo con su rótulo.
    const rotulo = t.cambio ? (r.cantidad < 0 ? 'DEVUELVE ' : 'SE LLEVA ') : ''
    const cantidad = t.cambio ? Math.abs(r.cantidad) : r.cantidad
    const lista = Math.round(cantidad * r.precio * 100) / 100
    const importe = t.cambio ? Math.abs(r.importe) : r.importe
    par(`${rotulo}${cantidad} x ${plata(r.precio)}`, `${lista < 0 ? '-' : ''}${plata(lista)}`, 9)
    escribir(talle ? `${r.nombre} - ${talle}` : r.nombre, 9, false)
    if (lista - importe > 0.004) par(r.promos?.length ? `Promo ${r.promos.join(' + ')}` : 'Descuento', `-${plata(lista - importe)}`, 9)
    l.y += 0.8
  }
  regla()

  par('Subtotal', `${t.subtotal < 0 ? '-' : ''}${plata(t.subtotal)}`, 10)
  const aVenta = Math.round(t.pagos.reduce((s, p) => s + (p.rebaja || 0), 0) * 100) / 100
  if (aVenta > 0) par('Descuento en la venta', `-${plata(aVenta)}`, 10)
  for (const p of t.pagos) {
    if (p.descuento > 0) par(`Descuento ${p.porcentaje}%`, `-${plata(p.descuento)}`, 10)
    if (p.redondeo > 0) par('Redondeo', `+${plata(p.redondeo)}`, 10)
    if (p.redondeo < 0) par('Redondeo', `-${plata(p.redondeo)}`, 10)
  }
  l.y += 1
  par('TOTAL', plata(Math.max(t.total, 0)), 12, true)
  if (t.cambio) {
    // Debajo del TOTAL, como el «Paga con» de una venta: con qué se pagó y lo que le queda a la clienta.
    if (t.cambio.saldoUsado > 0) par('Pagado con saldo a favor', plata(t.cambio.saldoUsado), 9)
    if (t.cambio.aFavor > 0) par('Queda a favor', plata(t.cambio.aFavor), 9)
    if (t.cambio.aFavor > 0 && t.cambio.saldo != null && Math.abs(t.cambio.saldo - t.cambio.aFavor) > 0.004) par('Saldo a favor total', plata(t.cambio.saldo), 9)
  }
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
  // El de un CAMBIO lleva sólo lo que se lleva (lo que volvió va en negativo en el comprobante).
  for (const r of t.renglones.filter((x) => x.cantidad > 0)) {
    const talle = talleVisible(r.talle)
    l.escribir(`${r.cantidad} x ${talle ? `${r.nombre} - ${talle}` : r.nombre}`, 9, false)
    l.y += 0.8
  }
  l.regla()
  if (t.politica) {
    l.escribir(t.politica, 9, false)
    l.y += 2
  }
  // Puede ser un regalo: ⛔ «Gracias por tu compra» (Bruno, 13-oct).
  l.escribir('¡Que lo disfrutes!', 10, false, 'centro')
  return l.pagina()
}

/**
 * El COMPROBANTE DEL CAMBIO, como dato (prueba del corte, 28-oct): lo arma `useCambio` al registrarlo y sale con el MISMO
 * molde del ticket de venta (`ticketDeCambio` ⇒ `armarTicket`). Lo que vuelve va en renglones NEGATIVOS.
 */
export type ComprobanteCambio = {
  /** El número del cambio en el ERP. */
  numero: number
  /** De qué venta sale lo que vuelve: «Venta #25», «Venta #30930 de Gestión Nube» o «Sin ticket». */
  origen: string
  renglones: RenglonTicket[]
  /** Lo que se lleva menos lo que vuelve, a lista (Bruno, 28-oct). */
  subtotal: number
  /** El cobro de la diferencia, con el descuento de la forma de pago (⛔ el saldo: va aparte). */
  pagos: PagoTicket[]
  saldoUsado: number
  /** Lo cobrado (saldo incluido). */
  total: number
  aFavor: number
  /** El saldo a favor de la clienta después del cambio (`null` si ⛔ se leyó). */
  saldo: number | null
}

/** El comprobante del cambio con los datos de la Caja (logo, política…), listo para `armarTicket`. */
export function ticketDeCambio(c: ComprobanteCambio, extra: Pick<DatosTicket, 'nombreCuenta' | 'politica' | 'logo' | 'logoStunned' | 'marca'>): DatosTicket {
  return {
    ...extra, numero: c.numero, id: `cambio-${c.numero}`, renglones: c.renglones, subtotal: c.subtotal, pagos: c.pagos, total: c.total, pagaCon: null,
    cambio: { origen: c.origen, aFavor: c.aFavor, saldo: c.saldo, saldoUsado: c.saldoUsado },
  }
}

/**
 * Arma el PDF y lo manda a la térmica (con `--kiosk-printing`, sin diálogo). `que`: el ticket solo, el
 * ticket + el de cambio (regalo) o sólo el de cambio.
 * 🔴 **El regalo son DOS órdenes de impresión** (Bruno, 13-oct): como dos páginas de un PDF salían en el
 * MISMO papel, y el de cambio va en la bolsa. Cada uno en su iframe, el de cambio un poco después para
 * que salgan en orden.
 */
export async function imprimirTicket(t: DatosTicket, ahoraMs: number, que: 'ticket' | 'regalo' | 'cambio' = 'ticket') {
  const rollo = await abrirRollo()
  const mandar = (pagina: { ops: (OpBase | OpImagen)[]; alto: number }, marco?: string) => imprimirPdf(
    rollo.documento<OpImagen>([pagina], (pdf, op) => {
      if (op.k !== 'img') return false
      const tipo = /^data:image\/jpe?g/i.test(op.src) ? 'JPEG' : 'PNG'
      pdf.addImage(op.src, tipo, op.x, op.y, op.w, op.h)
      return true
    }),
    marco,
  )
  if (que !== 'cambio') mandar(armarTicket(t, ahoraMs, rollo.medir))
  if (que === 'cambio') mandar(armarTicketCambio(t, ahoraMs, rollo.medir))
  if (que === 'regalo') {
    const cambio = armarTicketCambio(t, ahoraMs, rollo.medir)
    void finDeImpresion(() => document.hasFocus()).then(() => mandar(cambio, 'caja-print-cambio'))
  }
}

/**
 * 🔴 El de cambio del regalo sale cuando TERMINA la impresión del primero (Bruno, 19-oct: «en GN se imprimía
 * uno, con Enter se generaba la segunda impresión»). La PC del local imprime con el cuadro de diálogo, y una
 * impresión pedida con el cuadro abierto el navegador la descarta callado: a 1,5 s fijos salía sólo el de
 * precios (reportes del 14 y 19-oct).
 * Mientras el cuadro está abierto la página ⛔ tiene el foco ⇒ se espera a que lo pierda y lo recupere (la
 * cajera apretó Enter o Cancelar). Si en `SIN_DIALOGO_MS` ⛔ lo perdió, no hubo cuadro (`--kiosk-printing`) y
 * sale igual. Con el cuadro abierto más de `TECHO_MS`, sale igual: ⛔ queda colgado para la venta que sigue.
 */
export function finDeImpresion(tieneFoco: () => boolean, { cadaMs = 250, sinDialogoMs = SIN_DIALOGO_MS, techoMs = TECHO_MS, despuesMs = 400 } = {}): Promise<void> {
  return new Promise((listo) => {
    const desde = Date.now()
    let perdio = false
    const t = setInterval(() => {
      const pasado = Date.now() - desde
      if (!tieneFoco()) perdio = true
      const termino = perdio ? tieneFoco() : pasado >= sinDialogoMs
      if (!termino && pasado < techoMs) return
      clearInterval(t)
      // Un respiro para que el cuadro termine de cerrarse antes de abrir el segundo.
      setTimeout(listo, despuesMs)
    }, cadaMs)
  })
}
const SIN_DIALOGO_MS = 3000
const TECHO_MS = 3 * 60_000

/**
 * El TICKET DEL CIERRE (Bruno, 13-oct): lo cobrado POR FORMA DE PAGO (crédito es crédito, como el cierre de
 * lote del posnet), la cuenta del efectivo (fondo + ventas + Gestión Nube + ingresos − salidas = esperado,
 * contado, sobra/falta), las salidas e ingresos, y **el SOBRE**: cada billete con su cantidad y el total, para
 * que el sobre que arman coincida con el papel. ⛔ Los billetes contados ni lo que queda de fondo (2ª vuelta:
 * «los 3 conteos no servían»): quedan guardados en la caja. ⛔ Calcula: escribe la foto del cierre.
 */
export type DatosCierre = {
  marca: string
  abierto_en: string
  abierto_por: string | null
  cerrado_en: string | null
  cerrado_por: string | null
  fondo: number
  contado: number | null
  esperado: number | null
  nota: string | null
  /** Lo cobrado por forma de pago (`porFormaDePago`, ya sumado). */
  formas: { nombre: string; monto: number; cobros: number }[] | null
  resumen?: {
    total: number
    ventas: number
    efectivo: { fondo: number; cobrado: number; deEspera?: number; cobradoGN: number; cobradoERP?: number; aportes?: number; salidas: number; esperado: number }
    diferencia?: number
  } | null
  conteos?: { cierre?: { billetes: Record<string, number>; total: number } | null } | null
  /** Las salidas e ingresos con su motivo (sólo al cerrar: la lista de cajas anteriores ⛔ los trae). */
  movimientos?: { tipo?: 'salida' | 'aporte'; monto: number; motivo: string; anulado_en?: string | null }[] | null
  /** El código del sobre (`codigoArqueo`, 30-oct): va arriba grande y abajo en barras para el ARQUEO. Sin número, ⛔ sale. */
  codigo?: string | null
  /** El código de barras del sobre ya dibujado (data URL PNG): lo arma `imprimirCierre`, la función del papel es pura. */
  barras?: string | null
}

export function armarTicketCierre(t: DatosCierre, ahoraMs: number, partir: Medidor): { ops: (OpBase | OpImagen)[]; alto: number } {
  const l = lienzo(partir)
  const { escribir, par, regla } = l
  const cuando = (iso: string | null) => (iso ? fechaTicket(Date.parse(iso)) : '—')
  escribir(t.marca.toUpperCase(), 16, true, 'centro')
  l.y += 1
  escribir('CIERRE DE CAJA', 12, true, 'centro')
  // 🧾 El código del sobre (arqueo, 30-oct): la cajera lo ve sin buscarlo y lo copia en el sobre.
  if (t.codigo) {
    l.y += 1
    escribir(`SOBRE ${t.codigo}`, 16, true, 'centro')
  }
  regla()
  escribir(`Abrió: ${t.abierto_por ?? '—'} · ${cuando(t.abierto_en)}`, 9, false)
  escribir(`Cerró: ${t.cerrado_por ?? '—'} · ${cuando(t.cerrado_en)}`, 9, false)
  regla()

  const r = t.resumen
  if (r) {
    escribir(`VENTAS (${r.ventas})`, 10, true)
    l.y += 0.6
    for (const f of t.formas ?? []) par(`${f.nombre} (${f.cobros})`, plata(f.monto), 9)
    par('Total vendido', plata(r.total), 10, true)
    regla()

    const e = r.efectivo
    escribir('EFECTIVO', 10, true)
    l.y += 0.6
    par('Fondo inicial', plata(e.fondo), 9)
    par('+ Ventas en efectivo', plata(e.cobrado), 9)
    if (e.deEspera) par('+ Transferencias en espera (efectivo)', plata(e.deEspera), 9)
    if (e.cobradoGN) par('+ Cobrado en Gestión Nube', plata(e.cobradoGN), 9)
    if (e.cobradoERP) par('+ Pedidos web Stunned (ERP)', plata(e.cobradoERP), 9)
    if (e.aportes) par('+ Ingresos', plata(e.aportes), 9)
    if (e.salidas) par('- Salidas', `-${plata(e.salidas)}`, 9)
    l.y += 0.6
    par('ESPERADO', plata(Number(t.esperado ?? e.esperado)), 11, true)
  }
  if (t.contado != null) par('CONTADO', plata(Number(t.contado)), 11, true)
  const dif = r?.diferencia ?? (t.contado != null && t.esperado != null ? Number(t.contado) - Number(t.esperado) : null)
  if (dif != null) par(Math.abs(dif) < 0.005 ? 'DIFERENCIA' : dif > 0 ? 'SOBRA' : 'FALTA', plata(Math.abs(dif) < 0.005 ? 0 : Math.abs(dif)), 11, true)

  const movs = (t.movimientos ?? []).filter((m) => !m.anulado_en)
  if (movs.length) {
    regla()
    escribir('SALIDAS E INGRESOS', 10, true)
    l.y += 0.6
    for (const m of movs) par(m.motivo, `${(m.tipo ?? 'salida') === 'salida' ? '-' : '+'}${plata(m.monto)}`, 9)
  }

  // 🔑 El sobre: el fondo de la apertura queda con los billetes chicos (`armarSobre`), el resto va acá.
  regla()
  const billetes = t.conteos?.cierre?.billetes
  const sb = billetes && Object.values(billetes).some((n) => Number(n) > 0) ? armarSobre(billetes, Number(t.fondo), billetesDe()) : null
  escribir('SOBRE', 12, true)
  l.y += 0.6
  if (sb) {
    const filas = Object.entries(sb.sobre).map(([v, n]) => [Number(v), Number(n)] as const).filter(([, n]) => n > 0).sort((a, b) => b[0] - a[0])
    for (const [v, n] of filas) par(`${n} x ${plata(v)}`, plata(n * v), 10)
    l.y += 0.6
    par('TOTAL SOBRE', plata(sb.totalSobre), 12, true)
    if (!sb.exacto) {
      l.y += 1
      escribir(`Faltan ${plata(Number(t.fondo) - sb.totalFondo)} de fondo: completalo con cambio.`, 9, true)
    }
  } else {
    // La MISMA cuenta que se arquea después (`sobreEsperado`): lo contado menos el fondo.
    par('TOTAL SOBRE', plata(sobreEsperado({ fondo: t.fondo, contado: t.contado ?? 0 }) ?? 0), 12, true)
  }
  if (t.codigo) {
    // Las barras del sobre: en el ERP se escanea y abre esta caja para el arqueo. Sin dibujo, el código en letras.
    l.y += 2
    if (t.barras) {
      l.ops.push({ k: 'img', src: t.barras, x: (W - 56) / 2, y: l.y, w: 56, h: 14 })
      l.y += 16
    }
    escribir(t.codigo, 12, true, 'centro')
    escribir('Abrochá este ticket al sobre.', 8, false, 'centro', 60)
  }
  if (t.nota?.trim()) {
    regla()
    escribir(`Nota: ${t.nota.trim()}`, 9, false)
  }
  regla()
  l.y += 6
  escribir('Firma: ______________________', 9, false)
  l.y += 4
  escribir('Recibe: _____________________', 9, false)
  l.y += 2
  regla()
  escribir(`Impreso: ${fechaTicket(ahoraMs)}`, 8, false, 'centro', 60)
  return l.pagina()
}

/** Las barras CODE128 del código del sobre, como PNG. ⛔ Frena el ticket: sin dibujo sale el código en letras. */
async function barrasDe(codigo: string): Promise<string | null> {
  try {
    const JsBarcode = (await import('jsbarcode')).default
    const canvas = document.createElement('canvas')
    JsBarcode(canvas, codigo, { format: 'CODE128', displayValue: false, width: 3, height: 70, margin: 0 })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/** El ticket del cierre a la térmica. */
export async function imprimirCierre(t: DatosCierre, ahoraMs: number) {
  const [rollo, barras] = await Promise.all([abrirRollo(), t.codigo ? barrasDe(t.codigo) : Promise.resolve(null)])
  imprimirPdf(rollo.documento<OpImagen>([armarTicketCierre({ ...t, barras }, ahoraMs, rollo.medir)], (pdf, op) => {
    if (op.k !== 'img') return false
    pdf.addImage(op.src, 'PNG', op.x, op.y, op.w, op.h)
    return true
  }))
}
