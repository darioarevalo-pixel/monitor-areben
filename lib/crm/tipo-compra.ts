/**
 * ¿Este cliente compra «tipo pack» o suelto? (Darío, 18-nov-2026)
 *
 * Las compras de Argentina se venden en pack (la proporción del proveedor), y Darío necesita saber a quién
 * ofrecérselos. Medido en el ERP el 18-nov (150 días, 297 clientes mayoristas): 88 clientes llevan casi
 * siempre 6+ modelos del mismo diseño y son el 54% de las fundas vendidas. Esos son los de «Compra pack».
 *
 * La regla: en cada compra mayorista, por diseño de funda, cuántos modelos se llevó. Se cuenta qué parte de
 * sus fundas fueron en diseños donde llevó 6 o más modelos.
 *   - 60% o más → «Compra pack»
 *   - 30% a 60% → «A veces pack»
 *   - menos     → «Compra suelto»
 * Solo los últimos 150 días: cómo compraba hace un año no sirve (con todo el historial, 11 de 41 clientes daban otro
 * resultado). Con menos de 20 fundas mayoristas no se dice nada: es poco para saber.
 */
import type { FilaDetalle, FilaVenta } from './tipos'

export type TipoCompra = {
  tipo: 'pack' | 'a-veces' | 'suelto'
  /** Parte de sus fundas que llevó en diseños con 6+ modelos (0-100). */
  pct: number
  fundas: number
  /** Diseños comprados (compra × diseño) y en cuántos llevó 6+ modelos. */
  disenos: number
  disenosCurva: number
}

/** Mayorista (10) y WhatsApp (8), los números de canal del CRM. */
const CANALES_MAYORISTA = new Set([10, 8])
const MODELOS_CURVA = 6
const MIN_FUNDAS = 20
const DIAS = 150

const esFunda = (nombre: string) => /(case|funda|iconic|clear)/i.test(nombre) && !/airtag/i.test(nombre)

export function tipoDeCompra(ventas: FilaVenta[], detalles: FilaDetalle[], today: Date): TipoCompra | null {
  const desde = new Date(today.getTime() - DIAS * 86_400_000).toISOString().slice(0, 10)
  const mayoristas = new Set(
    (ventas || [])
      .filter((v) => CANALES_MAYORISTA.has(Number(v.channel_id)) && String(v.date_sale || '').slice(0, 10) >= desde)
      .map((v) => String(v.id)),
  )
  if (!mayoristas.size) return null

  // compra × diseño → unidades y modelos distintos
  const grupos = new Map<string, { u: number; modelos: Set<string> }>()
  for (const d of detalles || []) {
    const sid = String(d.sale_id)
    const nombre = (d.product_name || '').trim()
    const q = Number(d.quantity) || 0
    if (!mayoristas.has(sid) || !nombre || q <= 0 || !esFunda(nombre)) continue
    const k = `${sid}|${nombre.toUpperCase()}`
    let g = grupos.get(k)
    if (!g) grupos.set(k, (g = { u: 0, modelos: new Set() }))
    g.u += q
    g.modelos.add((d.size || '').trim().toUpperCase())
  }

  let fundas = 0
  let enCurva = 0
  let disenosCurva = 0
  for (const g of grupos.values()) {
    fundas += g.u
    if (g.modelos.size >= MODELOS_CURVA) {
      enCurva += g.u
      disenosCurva++
    }
  }
  if (fundas < MIN_FUNDAS) return null

  const pct = Math.round((100 * enCurva) / fundas)
  return {
    tipo: pct >= 60 ? 'pack' : pct >= 30 ? 'a-veces' : 'suelto',
    pct,
    fundas,
    disenos: grupos.size,
    disenosCurva,
  }
}
