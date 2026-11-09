/**
 * A qué cuenta REAL entró un cobro cuando la ruta de gerencia la deja abierta («Se elige en cada cobro»: el mayorista de BDI, 8-nov).
 * Es la misma condición que aplica el motor en `cobroReal`: la pantalla pregunta sólo cuando el motor va a aceptar la respuesta,
 * porque con una ruta que ya tiene cuenta contesta CUENTA_REAL_NO_SE_ELIGE.
 */
import { medioDeCuenta, rutaVigente } from '../../motor/cuentas/cuentas.mjs'

/** @param {{ titular?: string|null, nombre?: string|null, banco?: string|null }} c */
export function nombreCuentaReal(c) {
  return [c.banco, c.nombre, c.titular && c.titular !== 'areben' ? `de ${c.titular}` : null].filter(Boolean).join(' · ')
}

/**
 * ¿Hay que preguntar a qué cuenta entró?
 * @param {{ cuenta?: { medio: string, nombre?: string }|null, rutas?: any[], cuentasReales?: any[], marca: string, canal?: string|null, fecha: string }} p
 * `fecha` = AAAA-MM-DD del cobro: la ruta vigente es la de ese día, como la lee el motor.
 */
export function pideCuentaReal({ cuenta, rutas = [], cuentasReales = [], marca, canal, fecha }) {
  if (!cuenta || !cuentasReales.length || !fecha) return false
  const medio = medioDeCuenta(cuenta)
  if (!medio) return false
  const ruta = rutaVigente(rutas, { marca, canal: canal || 'mayorista', medio, en: `${fecha}T15:00:00.000Z` })
  return !!ruta && ruta.cuenta_real_id == null
}
