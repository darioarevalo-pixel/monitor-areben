// El cruce de la transferencia con Mercado Pago: cuántos días se leen, cuánto antes se ofrece un pago y
// cuántos se muestran. Lo usan la Caja (`api/_caja.js`) y el cambio del ERP (`api/_erp.js`) ⇒ vive acá y
// ⛔ en un handler (el ERP importaba el handler de la Caja entero para leer tres constantes).
import { diaArgentino } from '../envios/portal.core.js'

const DIA_MS = 86_400_000

/** Hasta cuánto atrás otra venta esperando el mismo monto obliga a elegir el pago a mano. */
export const COMPETIDORAS_MS = 12 * 3600 * 1000
/** Cuántos pagos recientes se muestran al confirmar una transferencia (los del monto, siempre). */
export const RECIENTES_CAJA = 5
/** Y cuántos cuando la cajera está sumando cobros (Bruno, 12-oct: «13.300 + 100»). */
export const RECIENTES_SUMAR = 20
/** Cuántos días de Mercado Pago lee el cruce, desde el de la venta (A4). */
export const DIAS_CRUCE = 3
/**
 * Hasta cuánto ANTES de la venta un pago se OFRECE para elegir (A4): la venta que se canceló y se volvió
 * a escanear nace después del pago. Como se lee desde el día de la venta, en la práctica es desde su
 * medianoche. ⛔ Entra solo nunca: lo elige la cajera.
 */
export const ANTES_MANUAL_MS = 24 * 3600 * 1000
/**
 * Los días argentinos desde el de la venta hasta hoy. Con más de `DIAS_CRUCE`: el de la venta y los
 * últimos (el pago que llega tarde llega HOY).
 */
export function diasDelCruce(creada, ahora) {
  const hoy = diaArgentino(ahora)
  const dias = []
  for (let t = creada; t <= ahora + DIA_MS; t += DIA_MS) {
    const d = diaArgentino(t)
    if (!dias.includes(d)) dias.push(d)
    if (d === hoy) break
  }
  return dias.length <= DIAS_CRUCE ? dias : [dias[0], ...dias.slice(-(DIAS_CRUCE - 1))]
}
