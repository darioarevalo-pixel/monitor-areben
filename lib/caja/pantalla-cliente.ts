/**
 * La pantalla de la clienta (rediseño de la Caja, fase 3 = V1 del plan v3): lo que ve del otro lado del
 * mostrador —su compra en vivo, el total y el mail para el ticket—.
 *
 * # 🔑 La tablet ⛔ calcula: MUESTRA lo que el POS ya calculó
 *
 * El POS arma la `VistaCliente` con SUS números —los `filas` de `renglones()` y el `cobro()` del
 * núcleo, los mismos que van a GN y al ticket— y la publica. Una tablet que recalcule es una tablet
 * que puede decir un total distinto del que se cobra.
 *
 * # Por dónde viaja: el `localStorage` del MISMO equipo
 *
 * El pedido en curso vive en el navegador del POS (`caja:borrador:zattia`), ⛔ en el servidor. Por eso
 * la pantalla de la clienta es otra ventana del MISMO equipo (un segundo monitor o una tablet espejada)
 * que escucha el evento `storage`. 🔴 Una tablet SUELTA, con su propio navegador, ⛔ ve nada: para eso
 * el pedido tiene que ir al servidor antes del cobro (pregunta abierta para Bruno).
 *
 * El mail viaja al revés: la clienta lo escribe y el POS lo pone en «Mail para el ticket», el mismo
 * campo que ya existe. ⛔ Cambia nada del envío.
 */

/** Lo que el POS publica para la clienta. */
export const CLAVE_VISTA = 'caja:cliente:zattia'
/** Lo que la clienta le devuelve al POS: su mail (o que no quiere ticket por mail). */
export const CLAVE_MAIL = 'caja:cliente-mail:zattia'

/** `color`: el de la variante en Tienda Nube («CHOCOLATE»), cruzado por SKU; ausente si el POS ⛔ lo mandó. */
export type RenglonCliente = { nombre: string; talle: string; color?: string | null; cantidad: number; lista: number; importe: number; foto: string | null }

export type VistaCliente =
  | { estado: 'vacio' }
  | {
      estado: 'compra'
      renglones: RenglonCliente[]
      prendas: number
      subtotal: number
      /** El descuento a mano a la VENTA, en pesos (0 si no hay). */
      descuentoVenta: number
      /** El descuento de la forma de pago y el redondeo: sólo cuando la cajera ya eligió cómo paga. */
      descuentoMedio: number
      redondeo: number
      /** «Efectivo», «Transferencia»…: con una sola forma de pago elegida; `null` si todavía no o son varias. */
      medio: string | null
      total: number
      /** El mail que está en el POS (lo escribió la cajera o la clienta). */
      email: string
    }
  | { estado: 'gracias'; numero: number | null; email: string | null }

/**
 * Lo que devuelve la clienta. `no` = no quiere el ticket por mail. `novedades` = tildó «Quiero recibir
 * novedades y promos» (ausente en lo que publicaba la pantalla vieja: el POS de hoy ⛔ lo lee).
 *
 * ⚠️ Hoy el consentimiento ⛔ llega a ningún lado: el POS se queda sólo con el mail, `caja_venta` ⛔
 * tiene columna para guardarlo y el mailer da de alta al contacto del POS con `tnAcceptsMkt: true`
 * SIEMPRE (`areben-mailer`, `app/api/externo/ticket/route.ts`). Viaja acá para que el resto lo tome.
 */
export type MailCliente = { email: string; no?: boolean; novedades?: boolean; en: number }

const centavos = (n: number) => Math.round(n * 100) / 100

/**
 * Arma la vista con los números del POS. `filas` son las de `renglones()` (en el mismo orden que el
 * carrito) y `cobro` el de `cobro()`; `aPagar` = subtotal − descuento a la venta.
 */
export function vistaParaCliente(a: {
  carrito: { nombre: string; talle: string; color?: string | null; cantidad: number; precio: number | null; foto: string | null }[]
  filas: { importe: number }[] | null
  aPagar: number | null
  cobro: { total: number; pagos: { descuento: number; redondeo: number }[] } | null
  medio: string | null
  email: string
  ultima: { numero: number | null; email: string | null } | null
}): VistaCliente {
  if (!a.carrito.length) return a.ultima ? { estado: 'gracias', numero: a.ultima.numero, email: a.ultima.email } : { estado: 'vacio' }
  const renglones = a.carrito.map((r, i) => {
    const lista = centavos(r.cantidad * (r.precio ?? 0))
    return { nombre: r.nombre, talle: r.talle, ...(r.color ? { color: r.color } : {}), cantidad: r.cantidad, lista, importe: a.filas?.[i]?.importe ?? lista, foto: r.foto }
  })
  const subtotal = centavos(renglones.reduce((s, r) => s + r.importe, 0))
  const aPagar = a.aPagar ?? subtotal
  return {
    estado: 'compra',
    renglones,
    prendas: renglones.reduce((s, r) => s + r.cantidad, 0),
    subtotal,
    descuentoVenta: centavos(subtotal - aPagar),
    descuentoMedio: a.cobro ? centavos(a.cobro.pagos.reduce((s, p) => s + p.descuento, 0)) : 0,
    redondeo: a.cobro ? centavos(a.cobro.pagos.reduce((s, p) => s + p.redondeo, 0)) : 0,
    medio: a.cobro ? a.medio : null,
    total: a.cobro ? a.cobro.total : aPagar,
    email: a.email,
  }
}

/**
 * Del audit de Tienda Nube (`traerAudit(..., { variantes: true })`), la foto y el color de cada variante
 * por SKU (TN y GN usan el mismo, en minúscula). Lo usan el tótem y, para mandarle el color a esta
 * pantalla, el POS (que ya arma la foto así).
 */
export function porSku(ps: { variantes?: { sku?: string | null; image_url?: string | null; color?: string | null }[] }[]): {
  foto: Record<string, string>
  color: Record<string, string>
} {
  const foto: Record<string, string> = {}
  const color: Record<string, string> = {}
  for (const p of ps)
    for (const v of p.variantes ?? []) {
      const k = v.sku?.toLowerCase().trim()
      if (!k) continue
      if (v.image_url) foto[k] = v.image_url
      if (v.color?.trim()) color[k] = v.color.trim()
    }
  return { foto, color }
}

/** «CHOCOLATE» ⇒ «Chocolate»: el color como lo lee la clienta. */
export const nombreDeColor = (c: string) => c.trim().toLowerCase().replace(/(^|[\s/-])\p{L}/gu, (x) => x.toUpperCase())

/** `juan••••@gmail.com`: el mail a la vista del mostrador, sin mostrarlo entero. */
export function enmascarar(mail: string): string {
  const [u, d] = mail.split('@')
  if (!d) return mail
  return `${u.slice(0, 4)}••••@${d}`
}

export const mailValido = (m: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.trim())

/** Lee lo publicado; cualquier cosa rara = vacío (⛔ revienta la pantalla de la clienta). */
export function leerVista(texto: string | null): VistaCliente {
  try {
    const v = JSON.parse(texto || 'null') as VistaCliente | null
    if (v && (v.estado === 'vacio' || v.estado === 'gracias' || (v.estado === 'compra' && Array.isArray(v.renglones)))) return v
  } catch {
    /* lo publicado no es JSON */
  }
  return { estado: 'vacio' }
}

export function leerMail(texto: string | null): MailCliente | null {
  try {
    const m = JSON.parse(texto || 'null') as MailCliente | null
    if (m && typeof m.email === 'string' && Number.isFinite(m.en)) return m
  } catch {
    /* lo devuelto no es JSON */
  }
  return null
}
