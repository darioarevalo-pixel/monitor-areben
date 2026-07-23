/**
 * Tipos de Cambios (tabla `cambios`, ver sql/migrate-cambios.sql). Local inicia + Admin motor.
 * El reingreso del producto devuelto es MANUAL (GN no acepta venta negativa por API): se traza como
 * `reingreso_estado='pendiente'` hasta que el admin lo carga a mano en GN.
 */

import type { Marca } from '@/lib/nav.generated'

// El cambio nace como 'borrador' (solicitud incompleta) y se completa después. Al PROCESAR (pagado +
// envío confirmado) se genera la venta REAL en GN → 'confirmado' → 'en_transito' → 'recibido' → 'cerrado'.
export type CambioEstado = 'borrador' | 'iniciado' | 'confirmado' | 'en_transito' | 'recibido' | 'cerrado' | 'anulado'
// Cambios SOLO por envío (el físico se resuelve presencial sin tool). El quilombo es el envío.
export type CambioVia = 'andreani' | 'correo' | 'cadete'
export type DiferenciaEstado = 'parejo' | 'a_cobrar' | 'a_devolver' | 'saldado'
export type ReingresoEstado = 'pendiente' | 'hecho'
// Solo 2 formas (Bruno): tarjeta paga la diferencia completa; transferencia lleva 10% de descuento.
export type FormaPago = 'tarjeta' | 'transferencia'
export type EnvioPaga = 'nosotros' | 'cliente'
export type CobroEstado = 'no_aplica' | 'pendiente' | 'cobrado'

/** Una línea del cambio (producto devuelto o nuevo). */
export type CambioItem = {
  sku?: string | null
  product_id?: string | null
  size_id?: string | null
  producto: string
  variante?: string | null
  precio?: number | null
  cantidad: number
}

export type CambioEvento = { estado: CambioEstado; at: string; usuario?: string | null; nota?: string | null }

export type CambioRow = {
  id: number
  store: Marca
  orden_tn?: string | null
  cliente?: string | null
  via: CambioVia
  estado: CambioEstado
  items_devueltos: CambioItem[]
  items_nuevos: CambioItem[]
  diferencia?: number | null
  diferencia_estado?: DiferenciaEstado | null
  reingreso_estado: ReingresoEstado
  seguimiento?: string | null
  gn_venta_ida_id?: string | null
  gn_venta_ida_number?: string | null
  // Fase B.4 — envío + forma de pago + venta real
  envio_costo?: number | null
  envio_paga?: EnvioPaga | null
  forma_pago?: FormaPago | null
  descuento_forma?: number | null
  descuento_manual?: number | null
  pagado?: boolean | null
  cobro_estado?: CobroEstado | null
  total?: number | null
  // Tanda 2 — solicitud de etiqueta (EMXXXX) + tracking ida/vuelta (seguimiento = ida)
  solicitud_envio?: string | null
  seguimiento_vuelta?: string | null
  gn_venta_id?: string | null
  gn_venta_number?: string | null
  usuario?: string | null
  historial?: CambioEvento[]
  created_at?: string
  updated_at?: string
}

/** Lo que carga el Local al iniciar el cambio (borrador; todo lo de B.4 es opcional y se completa después). */
export type CambioInput = {
  orden_tn?: string | null
  cliente?: string | null
  via?: CambioVia
  seguimiento?: string | null
  items_devueltos: CambioItem[]
  items_nuevos: CambioItem[]
  envio_costo?: number | null
  envio_paga?: EnvioPaga | null
  forma_pago?: FormaPago | null
  descuento_manual?: number | null
  solicitud_envio?: string | null
  seguimiento_vuelta?: string | null
  pagado?: boolean | null
}

// ── Orden de Tienda Nube (la lee bdi-catalogo, ver lib/cambios/cliente.ts) ──────────────
export type OrdenTNLinea = {
  product_id?: number | string | null
  variant_id?: number | string | null
  name?: string | null
  sku?: string | null
  quantity?: number | null
  price?: number | string | null
}
export type OrdenTN = {
  id?: number | string
  number?: number | string
  cliente?: string | null
  total?: number | string | null
  envio?: string | null // shipping_option / método
  fecha?: string | null // created_at (para la ventana de 30 días)
  products: OrdenTNLinea[]
}

export const ESTADO_LABEL: Record<CambioEstado, string> = {
  borrador: 'Borrador',
  iniciado: 'Iniciado',
  confirmado: 'Confirmado',
  en_transito: 'En tránsito',
  recibido: 'Recibido',
  cerrado: 'Cerrado',
  anulado: 'Anulado',
}
export const VIA_LABEL: Record<CambioVia, string> = { andreani: 'Andreani', correo: 'Correo', cadete: 'Cadete' }

// Formas de pago: solo 2 (Bruno). El descuento aplica SOLO sobre la diferencia de productos, NO sobre el envío.
export const FORMA_PAGO_DEF: Record<FormaPago, { label: string; descuento: number }> = {
  tarjeta: { label: 'Tarjeta', descuento: 0 },
  transferencia: { label: 'Transferencia', descuento: 10 },
}

/** Días que el cliente tiene para cambiar desde la compra (regla del negocio). */
export const DIAS_CAMBIO = 30

/** Suma de una lista de ítems (precio × cantidad). */
export function sumarItems(its: CambioItem[]): number {
  return its.reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 1), 0)
}

/** Diferencia = Σ(nuevos) − Σ(devueltos). Positiva = el cliente paga; negativa = se le devuelve. */
export function calcularDiferencia(devueltos: CambioItem[], nuevos: CambioItem[]): { diferencia: number; estado: DiferenciaEstado; totalDevueltos: number; totalNuevos: number } {
  const totalDevueltos = sumarItems(devueltos)
  const totalNuevos = sumarItems(nuevos)
  const diferencia = totalNuevos - totalDevueltos
  const estado: DiferenciaEstado = diferencia === 0 ? 'parejo' : diferencia > 0 ? 'a_cobrar' : 'a_devolver'
  return { diferencia, estado, totalDevueltos, totalNuevos }
}

/**
 * Total del cambio, desglosado. El "subtotal" del POS es la diferencia (Σnuevos − Σdevueltos). Los descuentos
 * aplican SOLO sobre un subtotal a cobrar (>0): primero el descuento manual en $, luego el % por forma de pago
 * sobre lo que queda. El envío se suma solo si lo paga el cliente.
 *   descuento = descuentoManual + round(pct × max(subtotal − descuentoManual, 0))
 *   total = subtotal − descuento + envío_a_cobrar
 */
export function calcularTotalCambio(input: {
  devueltos: CambioItem[]
  nuevos: CambioItem[]
  forma?: FormaPago | null
  envioCosto?: number | null
  envioPaga?: EnvioPaga | null
  descuentoManual?: number | null
}): { diferencia: number; estado: DiferenciaEstado; descuentoManual: number; descuentoForma: number; descuento: number; envioACobrar: number; total: number } {
  const { diferencia, estado } = calcularDiferencia(input.devueltos, input.nuevos)
  const pct = input.forma ? FORMA_PAGO_DEF[input.forma].descuento : 0
  // Solo descontamos sobre un subtotal a cobrar (positivo); si al cliente se le devuelve, no hay descuento.
  const descuentoManual = diferencia > 0 ? Math.min(Math.max(Number(input.descuentoManual) || 0, 0), diferencia) : 0
  const base = Math.max(diferencia - descuentoManual, 0)
  const descuentoForma = diferencia > 0 ? Math.round((base * pct) / 100) : 0
  const descuento = descuentoManual + descuentoForma
  const envioACobrar = input.envioPaga === 'cliente' ? Number(input.envioCosto) || 0 : 0
  const total = diferencia - descuento + envioACobrar
  return { diferencia, estado, descuentoManual, descuentoForma, descuento, envioACobrar, total }
}

/** Nº de reclamo del cambio: correlativo legible derivado del id (patrón generarBarcodeFalla). Ej. C-0045. */
export function numeroReclamo(id: number | null | undefined): string {
  return id ? `C-${String(id).padStart(4, '0')}` : 'nuevo'
}

/** Estados del cambio → tono semántico del kit (para StatusPill). */
export const ESTADO_TONE: Record<CambioEstado, 'neutral' | 'brand' | 'action' | 'success' | 'warning' | 'danger'> = {
  borrador: 'warning',
  iniciado: 'warning',
  confirmado: 'action',
  en_transito: 'action',
  recibido: 'brand',
  cerrado: 'success',
  anulado: 'neutral',
}

/**
 * Campos obligatorios que faltan para poder GENERAR la venta (gate del botón "Marcar como pagado").
 * Devuelve la lista de faltantes en texto; vacía = listo para generar. NO exige nada para guardar borrador.
 */
export function faltantesParaVenta(c: {
  cliente?: string | null
  orden_tn?: string | null
  items_devueltos?: CambioItem[]
  items_nuevos?: CambioItem[]
  forma_pago?: FormaPago | null
  via?: CambioVia | null
  envio_paga?: EnvioPaga | null
  solicitud_envio?: string | null
}): string[] {
  const faltan: string[] = []
  const devueltos = c.items_devueltos || []
  const nuevos = c.items_nuevos || []
  if (!devueltos.length) faltan.push('producto que devuelve')
  if (!nuevos.some((i) => i.product_id && i.size_id)) faltan.push('producto que se lleva (de GN)')
  if (!c.forma_pago) faltan.push('forma de pago')
  if (!c.via) faltan.push('vía de envío')
  if (!c.envio_paga) faltan.push('quién paga el envío')
  if (!c.solicitud_envio) faltan.push('solicitud de envío (EMXXXX)')
  if (!c.cliente && !c.orden_tn) faltan.push('cliente u orden')
  return faltan
}

/** Sólo correo/andreani tienen tracking online. Cadete no. */
export const VIA_CON_TRACKING: CambioVia[] = ['andreani', 'correo']

/** Link al buscador de seguimiento del correo. Correo acepta el código en la URL; Andreani es un portal. */
export function trackingUrl(via: CambioVia | null | undefined, codigo: string): string | null {
  const c = (codigo || '').trim()
  if (!c) return null
  if (via === 'andreani') return 'https://www.andreani.com/?tab=seguir-envio' // el portal no toma el code en la URL
  if (via === 'correo') return `https://www.correoargentino.com.ar/formularios/e-commerce?id=${encodeURIComponent(c)}`
  return null
}

/** Link al buscador/portal de seguimiento del correo (sin código — para el form). */
export function trackingPortalUrl(via: CambioVia | null | undefined): string | null {
  if (via === 'andreani') return 'https://www.andreani.com/?tab=seguir-envio'
  if (via === 'correo') return 'https://www.correoargentino.com.ar/formularios/e-commerce?id='
  return null
}

/**
 * Reparte lo que se carga en el input de seguimiento en ida/vuelta (Bruno):
 * 1 código → ida; 2 códigos → 1º ida, 2º vuelta; mismo código repetido → ambos iguales.
 */
export function repartirSeguimiento(entrada: string): { ida: string | null; vuelta: string | null } {
  const parts = (entrada || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return { ida: null, vuelta: null }
  if (parts.length === 1) return { ida: parts[0], vuelta: null }
  return { ida: parts[0], vuelta: parts[1] }
}

/**
 * Detalle del cambio para pasarle al cliente (WhatsApp): la CUENTA itemizada — cada concepto con su
 * suma, subtotal de productos, descuentos con su MONTO (forma de pago y manual si aplica), total de
 * productos, envío y total a pagar. Formato pedido por Bruno.
 */
export function detalleCambioTexto(c: {
  id?: number | null
  cliente?: string | null
  items_devueltos?: CambioItem[]
  items_nuevos?: CambioItem[]
  forma_pago?: FormaPago | null
  via?: CambioVia | null
  envio_costo?: number | null
  envio_paga?: EnvioPaga | null
  descuento_manual?: number | null
  seguimiento?: string | null
  seguimiento_vuelta?: string | null
}): string {
  const money = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
  const sub = (i: CambioItem) => (Number(i.precio) || 0) * (Number(i.cantidad) || 1)
  const linea = (i: CambioItem) => `• ${i.cantidad}× ${i.producto}${i.variante ? ` (${i.variante})` : ''} — ${money(sub(i))}`
  const devueltos = c.items_devueltos || []
  const nuevos = c.items_nuevos || []
  const t = calcularTotalCambio({ devueltos, nuevos, forma: c.forma_pago || null, envioCosto: c.envio_costo, envioPaga: c.envio_paga, descuentoManual: c.descuento_manual })
  const out: string[] = [`*CAMBIO ${numeroReclamo(c.id)}*${c.cliente ? ` · ${c.cliente}` : ''}`]
  if (devueltos.length) { out.push('Devolvés:'); devueltos.forEach((i) => out.push(linea(i))) }
  if (nuevos.length) { out.push('Te llevás:'); nuevos.forEach((i) => out.push(linea(i))) }
  out.push('———')
  out.push(`Subtotal productos: ${money(t.diferencia)}`)
  if (c.forma_pago && t.descuentoForma > 0) out.push(`Descuento ${FORMA_PAGO_DEF[c.forma_pago].label} (−${FORMA_PAGO_DEF[c.forma_pago].descuento}%): −${money(t.descuentoForma)}`)
  if (t.descuentoManual > 0) out.push(`Descuento: −${money(t.descuentoManual)}`)
  out.push(`Total productos: ${money(t.diferencia - t.descuento)}`)
  if (t.envioACobrar > 0) out.push(`Envío${c.via ? ` (${VIA_LABEL[c.via]})` : ''}: ${money(t.envioACobrar)}`)
  out.push(`*Total a pagar: ${money(t.total)}*`)
  if (c.seguimiento) out.push(`Seguimiento ida: ${c.seguimiento}`)
  if (c.seguimiento_vuelta) out.push(`Seguimiento vuelta: ${c.seguimiento_vuelta}`)
  return out.join('\n')
}
