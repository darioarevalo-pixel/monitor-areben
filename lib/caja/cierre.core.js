// Caja — el TURNO PROPIO (plan v2, W3, 4-oct-2026): qué cobró la Caja en el turno, por cuenta, y
// cuánto efectivo tiene que haber en el cajón al cerrarlo.
//
// 🔑 EL TURNO VIVE EN LA CAJA (Bruno, 4-oct): la API de GN ⛔ tiene turnos, y si todos los cobros pasan
// por la Caja, la Caja ordena los pagos del turno. El turno de GN se deja de usar. Un día puede tener
// dos turnos. Una venta es del turno donde se COBRÓ (`caja_venta.turno_id`), ⛔ de cuando llegó a GN.
//
// 🔑 SE CUENTA SÓLO EL EFECTIVO (Bruno, 4-oct): `esperado = fondo + cobrado en efectivo − salidas`.
// Tarjeta y transferencia se muestran como total. Una cuenta es de efectivo si su regla dice
// `efectivo: true` (Efectivo 12921 y Feria - Efectivo 25867, `caja_config`).
//
// - `esperando_pago` (la transferencia todavía ⛔ llegó a MP) ⛔ suma: se lista aparte. Si llega,
//   suma al turno donde se cobró.
// - `cancelada` ⛔ se cobró nunca.
// - Las cobradas que todavía ⛔ están en GN (`borrador`, `enviando`, `error`) SÍ suman: la clienta
//   pagó. Se listan aparte porque GN las tiene que recibir igual.

const exigir = (cond, msg) => { if (!cond) throw new Error(msg) }
const centavos = (n) => Math.round(n * 100) / 100

const ESPERA = 'esperando_pago'
const SIN_GN = ['borrador', 'enviando', 'error']

/**
 * @param {{ turno: { fondo: number }, ventas: any[], salidas: { monto: number }[], reglas: { cuentas: Record<string, { nombre: string, efectivo?: boolean }> }, nombres: Record<string, string> }} args
 *   `ventas`: las filas de `caja_venta` DEL turno (estado, pagos, total, creada_en, id).
 *   `nombres`: id de cuenta ⇒ el nombre a mostrar. Obligatorio, puede venir vacío (cae al de la regla).
 */
export function resumenTurno({ turno, ventas, salidas, reglas, nombres }) {
  exigir(turno && Number.isFinite(Number(turno.fondo)), 'Falta el turno con su fondo')
  exigir(Array.isArray(ventas), 'Faltan las ventas del turno')
  exigir(Array.isArray(salidas), 'Faltan las salidas del turno')
  exigir(reglas && reglas.cuentas, 'Faltan las reglas de la caja')
  exigir(nombres && typeof nombres === 'object', 'Faltan los nombres de las cuentas')

  const por = new Map()
  let total = 0, n = 0, cobradoEfectivo = 0
  const esperando = [], sinGN = []
  for (const v of ventas) {
    if (v.estado === 'cancelada') continue
    const corto = { id: v.id, estado: v.estado, total: Number(v.total), creada_en: v.creada_en }
    if (v.estado === ESPERA) { esperando.push(corto); continue }
    if (SIN_GN.includes(v.estado)) sinGN.push(corto)
    n++
    for (const p of v.pagos || []) {
      const cuenta = Number(p.cuenta)
      const monto = Number(p.monto)
      if (!(cuenta > 0) || !Number.isFinite(monto)) continue
      const regla = reglas.cuentas[cuenta]
      const efectivo = !!(regla && regla.efectivo)
      const fila = por.get(cuenta) || { cuenta, nombre: nombres[cuenta] || (regla && regla.nombre) || `Cuenta ${cuenta}`, efectivo, monto: 0, cobros: 0 }
      fila.monto = centavos(fila.monto + monto)
      fila.cobros++
      por.set(cuenta, fila)
      total = centavos(total + monto)
      if (efectivo) cobradoEfectivo = centavos(cobradoEfectivo + monto)
    }
  }
  const fondo = centavos(Number(turno.fondo))
  const sal = centavos(salidas.reduce((s, m) => s + Number(m.monto), 0))
  const porCuenta = [...por.values()].sort((a, b) => Number(b.efectivo) - Number(a.efectivo) || b.monto - a.monto || a.cuenta - b.cuenta)
  const porHora = (a, b) => Date.parse(a.creada_en) - Date.parse(b.creada_en)
  return {
    porCuenta, total, ventas: n,
    efectivo: { fondo, cobrado: cobradoEfectivo, salidas: sal, esperado: centavos(fondo + cobradoEfectivo - sal) },
    esperando: esperando.sort(porHora),
    sinGN: sinGN.sort(porHora),
  }
}

/** La diferencia del cierre: positiva = sobra, negativa = falta. */
export function diferencia(contado, esperado) {
  exigir(Number.isFinite(contado) && contado >= 0, 'El efectivo contado tiene que ser un número (0 o más)')
  exigir(Number.isFinite(esperado), 'Falta el efectivo esperado')
  return centavos(contado - esperado)
}
