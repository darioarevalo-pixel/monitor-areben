/**
 * ERP › Ventas › Gastos, con el molde del diseño (v8 `VentasMas.dc.html`, pestaña «Gastos»): los gastos COMERCIALES —lo que
 * cuesta vender: comisiones de plataformas, impuestos y otros— para sacar el resultado ANTES de gastos operativos.
 * Núcleo puro; el servidor es `api/_erp-gastos.js` (`vista=gastos`, `registrar-gasto`).
 *
 * 🔑 Medido (motor `lib/gasto/gasto.mjs`): la COMISIÓN de cada cobro se calcula sola (tasa de la forma de pago × monto) y llega SUMADA,
 *    ⛔ renglón por renglón ⇒ en la lista es UNA fila «Comisiones de plataformas» por período; lo demás son los gastos cargados a mano.
 * 🔑 `cobrosSinComision` = cobros con tarjeta o Mercado Pago cuya ruta ⛔ tiene tasa: esa comisión NO está en el total, y se dice.
 * 🔑 Un gasto es inmutable: corregir uno de más es cargar otro con el monto en NEGATIVO.
 */

import { rangoCaja } from './cajas.core.js'

const centavos = (n) => Math.round(n * 100) / 100

/** Los períodos: [clave, nombre]. */
export const PERIODOS_GASTO = [['mes', 'Este mes'], ['pasado', 'El mes pasado'], ['7', 'Últimos 7 días']]
export const rangoGasto = rangoCaja

/** clave → nombre en pantalla. */
export const TIPO_GASTO = { comision: 'Comisión de plataforma', impuesto: 'Impuesto', otro: 'Otro gasto' }
export const TIPOS_A_MANO = [['impuesto', 'Impuesto'], ['envio_devolucion', 'Envío de una devolución'], ['otro', 'Otro gasto'], ['comision', 'Comisión (a mano)']]
/** El envío de vuelta de una devolución lo paga el vendedor (por ley): es un gasto de vender, tipo «otro» con su rótulo en el detalle. */
export const ROTULO_ENVIO_DEVOLUCION = 'Envío de devolución'

/**
 * @typedef {{ id: string, fecha: string, tipo: 'comision' | 'impuesto' | 'otro', detalle: string, cuenta: string | null,
 *   ventaId: string | null, carga: 'automatica' | 'manual', quien: string | null, monto: number, linea: string | null }} FilaGasto
 */

/**
 * Una fila por gasto cargado a mano (o automático ya guardado) + UNA fila con la comisión que sale sola de los cobros.
 * @param {{ hasta: string, comisionAutomatica: number, gastos: Array<Record<string, any>> }} d  (lo que devuelve `leerGastos`)
 * @returns {FilaGasto[]}
 */
export function armarFilasGastos(d) {
  /** @type {FilaGasto[]} */
  const filas = (d.gastos ?? []).map((g) => ({
    id: String(g.id), fecha: g.fecha, tipo: g.tipo, detalle: g.detalle, cuenta: g.cuenta ?? null, ventaId: g.venta_id ?? null,
    carga: g.origen === 'automatico' ? 'automatica' : 'manual', quien: g.origen === 'automatico' ? null : (g.usuario ?? null), monto: Number(g.monto), linea: g.linea ?? null,
  }))
  const auto = Number(d.comisionAutomatica ?? 0)
  if (auto) {
    filas.push({ id: 'comisiones-automaticas', fecha: d.hasta, tipo: 'comision', detalle: 'Comisiones de plataformas de todos los cobros del período (tasa de la forma de pago × monto)', cuenta: null, ventaId: null, carga: 'automatica', quien: null, monto: centavos(auto), linea: null })
  }
  return filas.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0) || (a.id < b.id ? 1 : -1))
}

/** @type {Array<[string, string, (f: FilaGasto) => boolean]>} */
export const VISTAS_GASTO = [
  ['todos', 'Todos', () => true],
  ['automaticos', 'Automáticos', (f) => f.carga === 'automatica'],
  ['a_mano', 'A mano', (f) => f.carga === 'manual'],
]

/** @param {FilaGasto[]} filas */
export const contarVistasGasto = (filas) => Object.fromEntries(VISTAS_GASTO.map(([k, , entra]) => [k, filas.filter(entra).length]))

/** @param {FilaGasto[]} filas */
export function filtrarGasto(filas, vista = 'todos') {
  const entra = VISTAS_GASTO.find(([k]) => k === vista)?.[2] ?? (() => true)
  return filas.filter(entra)
}

/**
 * Los números de arriba. Sale del total que cuenta el motor (⛔ se vuelve a sumar la lista).
 * @param {{ total: number, por_tipo: Record<string, number>, comisionAutomatica: number, cobrosSinComision: number }} d
 */
export function resumenGastos(d) {
  const comision = Number(d.por_tipo?.comision ?? 0)
  const automatica = Number(d.comisionAutomatica ?? 0)
  return {
    total: Number(d.total ?? 0),
    comision, comisionAutomatica: automatica, comisionAMano: centavos(comision - automatica),
    impuesto: Number(d.por_tipo?.impuesto ?? 0), otro: Number(d.por_tipo?.otro ?? 0),
    sinComision: Number(d.cobrosSinComision ?? 0),
  }
}

/** «1.234,50», «-500» o «1234.5» ⇒ número; lo que no se entiende ⇒ null. @param {string} t */
export function leerMonto(t) {
  const x = String(t ?? '').replace(/[\s$−]/g, (c) => (c === '−' ? '-' : '')).trim()
  if (!/^-?[\d.,]+$/.test(x)) return null
  const n = x.includes(',') ? Number(x.replace(/\./g, '').replace(',', '.')) : /^-?\d{1,3}(\.\d{3})+$/.test(x) ? Number(x.replace(/\./g, '')) : Number(x)
  return Number.isFinite(n) ? n : null
}

/**
 * Lo que se escribió en «Nuevo gasto» ⇒ lo que se manda, o el error en palabras. El motor vuelve a validar.
 * @param {{ fecha: string, tipo: string, monto: string, detalle: string, cuenta: string, linea: string }} f
 */
export function validarGasto(f) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha) || Number.isNaN(Date.parse(f.fecha))) return { error: 'Falta la fecha.' }
  if (!TIPOS_A_MANO.some(([k]) => k === f.tipo)) return { error: 'Elegí el tipo de gasto.' }
  const monto = leerMonto(f.monto)
  if (monto == null || centavos(monto) === 0) return { error: 'El monto es distinto de cero (con signo menos corrige uno cargado de más).' }
  const detalle = f.detalle.trim()
  if (!detalle) return { error: 'Escribí de qué es el gasto.' }
  const envio = f.tipo === 'envio_devolucion'
  return { gasto: { linea: f.linea || undefined, fecha: f.fecha, tipo: envio ? 'otro' : f.tipo, monto: centavos(monto), detalle: envio && !detalle.toLowerCase().startsWith(ROTULO_ENVIO_DEVOLUCION.toLowerCase()) ? `${ROTULO_ENVIO_DEVOLUCION} · ${detalle}` : detalle, cuenta: f.cuenta.trim() || undefined } }
}
