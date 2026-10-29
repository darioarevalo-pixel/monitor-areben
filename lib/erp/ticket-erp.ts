/**
 * REIMPRIMIR el ticket de una venta desde ERP › Ventas, IDÉNTICO al del POS (Bruno, 29-oct: «ese ticket tiene que ser idéntico al
 * del POS»). Se imprime con las MISMAS piezas de `lib/caja/ticket.ts`:
 *   - venta de la Caja ⇒ su fila de `caja_venta` por `ticketDeVenta` (es literalmente el ticket de la Caja);
 *   - cambio ⇒ `ticketDeCambio`, con los renglones de la ficha (lo que vuelve en negativo ⇒ «DEVUELVE», como en `useCambio`);
 *   - el resto (Tienda Nube, cargada a mano) ⇒ el mismo molde con las prendas y los cobros de la ficha.
 * La fecha es la de ahora, como «Reimprimir» del POS.
 */
import { leerConfig } from '@/lib/caja/cliente'
import { nombreParaTicket } from '@/lib/caja/core.core.js'
import { imprimirTicket, ticketDeCambio, ticketDeVenta, type DatosTicket, type PagoTicket, type RenglonTicket } from '@/lib/caja/ticket'
import { leerFichaDeVenta, leerTicketDeVenta, type FichaDeVenta, type MarcaErp, type TicketDeVentaErp } from './cliente'

/** La prenda es de Stunned (el logo del ticket): por la venta (`venta.marca`) o por el SKU, como en la Caja. */
const esStunned = (sku: string | null | undefined, deStunned: boolean) => deStunned || /^STU/i.test(String(sku || ''))
const NO_ES_PLATA = ['cuenta', 'saldo']

/** De qué venta sale un cambio, como lo escribe el POS (`useCambio.comprobanteDe`). */
export function origenDelCambio(c: TicketDeVentaErp['cambioDe'], original: FichaDeVenta['original']): string {
  if (original) return `Venta #${original.numero}`
  if (!c || c.sin_ticket) return 'Sin ticket'
  return c.gn_venta ? `Venta #${c.numero} de Gestión Nube` : `Venta #${c.numero}`
}

/**
 * Los renglones y los cobros de la ficha con la forma del ticket. Los pagos van numerados 1, 2… y `nombre(n)` dice su nombre
 * (la cuenta del ERP: «Efectivo», «Pago Nube»), porque el ticket de la Caja numera por cuenta de GN.
 */
export function piezasDeFicha(f: FichaDeVenta): { renglones: RenglonTicket[]; pagos: PagoTicket[]; nombre: (n: number) => string; saldoUsado: number } {
  const renglones = f.lineas.map((l) => ({
    nombre: l.nombre ?? `Producto ${l.producto}`, talle: l.talleNombre ?? l.talle, cantidad: l.cantidad, precio: l.precio, importe: l.importe, stunned: esStunned(l.sku, f.venta.marca === 'stunned'),
  }))
  const plata = f.pagos.filter((p) => !NO_ES_PLATA.includes(String(p.medio)))
  const pagos = plata.map((p, i) => ({ cuenta: i + 1, porcentaje: 0, descuento: 0, redondeo: 0, monto: p.monto }))
  const nombre = (n: number) => plata[n - 1]?.cuenta ?? plata[n - 1]?.medio ?? 'Pago'
  const saldoUsado = Math.round(f.pagos.filter((p) => p.medio === 'saldo').reduce((s, p) => s + p.monto, 0) * 100) / 100
  return { renglones, pagos, nombre, saldoUsado }
}

/** Imprime el ticket de la venta `id` (de la lista del ERP). Tira el error para que la pantalla lo muestre. */
export async function imprimirVentaErp(marca: MarcaErp, id: string, tipo: 'venta' | 'cambio') {
  const [config, t] = await Promise.all([leerConfig(), leerTicketDeVenta(marca, id)])
  const extra = { politica: config.politica_cambio ?? null, logo: config.ticket_logo ?? null, logoStunned: config.ticket_logo_stunned ?? null }
  if (t.cajaVenta) return imprimirTicket(ticketDeVenta(t.cajaVenta, config, (c) => nombreParaTicket(c, config.reglas ?? null)), Date.now())
  const f = await leerFichaDeVenta(marca, id)
  const { renglones, pagos, nombre, saldoUsado } = piezasDeFicha(f)
  const total = f.venta.total
  if (tipo === 'cambio') {
    const c = ticketDeCambio({
      numero: f.venta.numero, origen: origenDelCambio(t.cambioDe, f.original), renglones,
      subtotal: Math.round(renglones.reduce((s, r) => s + r.importe, 0) * 100) / 100, pagos, saldoUsado, total,
      aFavor: total < 0 ? -total : 0, saldo: null,
    }, { ...extra, nombreCuenta: nombre })
    return imprimirTicket(c, Date.now())
  }
  const datos: DatosTicket = {
    ...extra, numero: f.venta.numero, enErp: true, id, renglones, subtotal: f.venta.subtotal, pagos, total, nombreCuenta: nombre, pagaCon: null, cliente: null,
  }
  return imprimirTicket(datos, Date.now())
}
