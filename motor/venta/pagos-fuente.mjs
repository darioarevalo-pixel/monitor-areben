/**
 * De dónde se leen los pagos de una venta: `venta_pago_vigente` (sql/042: el pago con su última corrección de medio) o, en
 * una base que ⛔ tiene la 042, `venta_pago` como siempre. Así el código se puede desplegar antes que la migración.
 */
export async function fuentePagos(db) {
  const { rows: [r] } = await db.query(`select to_regclass('venta_pago_vigente') is not null as hay`)
  return r.hay ? 'venta_pago_vigente' : 'venta_pago'
}
