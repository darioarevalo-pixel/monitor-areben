/**
 * El techo de facturación del mes: lo que ENTRÓ a cuentas de Areben ese mes.
 *
 * Es la regla del contador («se factura lo que entra a la cuenta, no lo que se vendió»), copiada del
 * dashboard (`areben-dashboard/app/actions/gestion-nube.ts`, `sincronizarFacturacionGN`), que la
 * calculaba hasta el 12-oct-2026. Desde ese día la calcula el monitor (Bruno).
 *
 * 🔑 **Va cobro por cobro, no venta por venta.** Una venta puede cobrarse en dos cuentas y en otro mes
 * que el de la venta: se imputa cada cobro por SU fecha y SU cuenta. Con `account_display` de la venta
 * daría otro número.
 *
 * Oráculo: los meses que el dashboard CERRÓ (`facturacion_periodo.cobrado_congelado`): ago-2026
 * $28.748.175,85 · sep-2026 $29.903.066,32.
 */

export const TIPO_FACTURABLE = 'areben'

/** ¿La venta cuenta? Las anuladas (`active` false), archivadas y presupuestos, ⛔. */
export const ventaCuenta = (v) => !!v && v.active !== false && !v.archived && !v.budget

/**
 * @param {Array<{ marca: string, fecha: string, cuenta: string, monto: number }>} cobros
 *   cobros de ventas que cuentan (ver `ventaCuenta`); `fecha` 'YYYY-MM-DD…'
 * @param {Map<string, string>} tipoDeCuenta nombre de la cuenta de cobro → 'areben' | 'propia' | 'efectivo'
 * @param {string} mes 'YYYY-MM'
 */
export function techoDelMes(cobros, tipoDeCuenta, mes) {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error(`Mes inválido: ${mes}`)
  if (![...tipoDeCuenta.values()].includes(TIPO_FACTURABLE)) throw new Error('No hay cuentas de cobro de Areben clasificadas')
  const porCuenta = new Map(), sinClasificar = new Map()
  let centavos = 0
  for (const c of cobros) {
    if (!String(c.fecha || '').startsWith(mes)) continue
    // GN devuelve cobros sin cuenta: se avisan igual que una cuenta desconocida.
    const cuenta = String(c.cuenta || '').trim() || '(cobro sin cuenta)'
    const monto = Math.round((Number(c.monto) || 0) * 100)
    const tipo = tipoDeCuenta.get(cuenta)
    if (!tipo) {
      const s = sinClasificar.get(cuenta) || { cuenta, monto: 0, n: 0 }
      s.monto += monto; s.n++
      sinClasificar.set(cuenta, s)
      continue
    }
    if (tipo !== TIPO_FACTURABLE) continue
    const k = `${c.marca}::${cuenta}`
    const a = porCuenta.get(k) || { marca: c.marca, cuenta, monto: 0, n: 0 }
    a.monto += monto; a.n++
    porCuenta.set(k, a)
    centavos += monto
  }
  const enPesos = (x) => ({ ...x, monto: x.monto / 100 })
  return {
    total: centavos / 100,
    porCuenta: [...porCuenta.values()].map(enPesos),
    // ⚠️ Una cuenta sin clasificar ⛔ suma: cae como no facturable sin que nadie lo decida. Se muestra.
    sinClasificar: [...sinClasificar.values()].map(enPesos),
  }
}

/** Los cobros de una venta cruda de GN (`include_payments=1`), con la forma que pide `techoDelMes`. */
export function cobrosDeVentaGN(v, marca) {
  if (!ventaCuenta(v)) return []
  return (v.payments || []).map((p) => ({
    marca, venta_id: v.id, fecha: p.date_payment || null, cuenta: p.account_name || null, monto: Number(p.amount) || 0,
  }))
}
