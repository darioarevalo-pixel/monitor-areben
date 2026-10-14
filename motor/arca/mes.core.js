/**
 * La facturación de un mes: cuánto se facturó, cuánto falta y qué ventas se pueden facturar.
 * Puro: lo usan `api/_erp.js` (que lee las tablas) y la pantalla ERP › Facturación.
 *
 * El techo sale de `techo.core.js`. Mientras GN siga facturando, lo facturado del mes es lo de GN
 * (`ventas_factura_gn`) MÁS lo del monitor (`facturas`), y las notas de crédito del monitor restan.
 */
import { CBTE } from './arca.core.js'

const cent = (n) => Math.round((Number(n) || 0) * 100)
const ES_NC = new Set([CBTE.NC_A, CBTE.NC_B])
export const claveVenta = (marca, ventaId) => `${marca}:${ventaId}`

/**
 * @param {{ techo: number,
 *           facturasGN: Array<{ marca: string, venta_id: number|string, monto: number }>,
 *           facturasMonitor: Array<{ marca: string, venta_id: string, tipo: number, total: number, estado: string }> }} p
 */
export function resumenDelMes({ techo, facturasGN, facturasMonitor }) {
  const gn = facturasGN.reduce((a, f) => a + cent(f.monto), 0)
  const monitor = facturasMonitor.filter((f) => f.estado === 'autorizada')
    .reduce((a, f) => a + (ES_NC.has(f.tipo) ? -1 : 1) * cent(f.total), 0)
  const facturado = gn + monitor
  return {
    techo: cent(techo) / 100,
    facturadoGN: gn / 100,
    facturadoMonitor: monitor / 100,
    facturado: facturado / 100,
    // Negativo = se facturó de más: se muestra tal cual, ⛔ se corta en cero.
    pendiente: (cent(techo) - facturado) / 100,
  }
}

/**
 * Las ventas que se pueden facturar: las que cobraron en cuentas de Areben en el mes y ⛔ tienen
 * factura (ni de GN ni del monitor). El monto es lo que ENTRÓ a cuentas de Areben de esa venta en el
 * mes, ⛔ el total de la venta: es lo que pide el contador.
 *
 * @param {Array<{ marca: string, venta_id: number|string, fecha: string, cuenta: string, monto: number }>} cobros
 * @param {Map<string, string>} tipoDeCuenta
 * @param {string} mes 'YYYY-MM'
 * @param {Set<string>} yaFacturadas claves `claveVenta(marca, venta_id)`
 */
export function ventasParaFacturar(cobros, tipoDeCuenta, mes, yaFacturadas) {
  const porVenta = new Map()
  for (const c of cobros) {
    if (!String(c.fecha || '').startsWith(mes)) continue
    if (tipoDeCuenta.get(String(c.cuenta || '').trim()) !== 'areben') continue
    const k = claveVenta(c.marca, c.venta_id)
    if (yaFacturadas.has(k)) continue
    const v = porVenta.get(k) || { marca: c.marca, ventaId: String(c.venta_id), fecha: c.fecha, monto: 0, cuentas: new Set() }
    v.monto += cent(c.monto)
    if (String(c.fecha) > v.fecha) v.fecha = c.fecha // el último cobro del mes
    v.cuentas.add(String(c.cuenta).trim())
    porVenta.set(k, v)
  }
  return [...porVenta.values()]
    .filter((v) => v.monto > 0)
    .map((v) => ({ ...v, monto: v.monto / 100, cuentas: [...v.cuentas].sort() }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.marca.localeCompare(b.marca) || a.ventaId.localeCompare(b.ventaId))
}

/**
 * Propone un lote: las ventas más viejas primero, mientras la suma ⛔ pase lo pendiente. Una venta
 * que no entra se saltea y se sigue probando con las que vienen (una más chica puede entrar).
 */
export function proponerLote(ventas, pendiente) {
  let resta = cent(pendiente)
  const elegidas = []
  for (const v of ventas) {
    const m = cent(v.monto)
    if (m <= resta) { elegidas.push(v); resta -= m }
  }
  return elegidas
}
