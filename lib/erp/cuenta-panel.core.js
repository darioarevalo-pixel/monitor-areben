/**
 * La cuenta corriente en el panel de WhatsApp (plan «BDI directo al ERP», 30-oct; maqueta aprobada por Bruno): la VISTA
 * PREVIA de un pago. El motor reparte el pago igual (`registrarPagoACuenta` sin `imputar`): primero la compra más VIEJA y
 * lo que sobra a la siguiente; sólo queda a favor si ⛔ debe nada (Bruno y Darío, 18-oct). Esto sólo lo DIBUJA antes de
 * confirmar: ⛔ decide nada, lo que vale es lo que contesta el motor.
 */

const pesos = (n) => Math.round(Number(n) * 100) / 100

/**
 * @param {Array<{ ref: string, fecha: string, pendiente: number }>} pendientes lo que debe cada compra (`estado.pendientes`)
 * @param {number} monto
 * @returns {{ partes: Array<{ ref: string, fecha: string, paga: number, queda: number }>, aFavor: number }}
 */
export function repartirPago(pendientes, monto) {
  let resto = pesos(monto)
  const partes = []
  if (!(resto > 0)) return { partes, aFavor: 0 }
  const orden = [...(pendientes ?? [])].filter((p) => p.pendiente > 0).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.ref.localeCompare(b.ref))
  for (const p of orden) {
    if (resto <= 0) break
    const paga = pesos(Math.min(p.pendiente, resto))
    resto = pesos(resto - paga)
    partes.push({ ref: p.ref, fecha: p.fecha, paga, queda: pesos(p.pendiente - paga) })
  }
  return { partes, aFavor: resto }
}

/** El saldo en palabras: `debe` > 0 debe, < 0 a favor. */
export function textoSaldo(saldo, plata) {
  if (saldo > 0) return plata(saldo)
  if (saldo < 0) return `${plata(-saldo)} a favor`
  return 'Al día'
}
