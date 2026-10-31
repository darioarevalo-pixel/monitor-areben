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

/**
 * «Enviar saldo» (pedido de Darío 30-oct §6): un mensaje CORTO para pegar en WhatsApp con los pedidos sin pagar y su monto
 * (el más viejo primero), el total que debe y el saldo a favor si tiene. ⛔ inventa plazos ni a dónde transferir (como
 * `mensajeDeCuenta` de ERP › Clientes). `null` si no hay nada que decir.
 * @param {{ nombre: string, saldo: number, pendientes: Array<{ fecha: string, pendiente: number, nombre?: string|null }> }} c
 * @param {(n: number) => string} plata
 */
export function mensajeDeSaldo({ nombre, saldo, pendientes }, plata) {
  const hola = `Hola ${String(nombre ?? '').trim().split(/\s+/)[0] || ''}`.trim()
  const debe = [...(pendientes ?? [])].filter((p) => p.pendiente > 0.5).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const dm = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
  if (saldo > 0.5 && debe.length) {
    const lineas = debe.map((p) => `• ${p.nombre || 'Pedido'} del ${dm(p.fecha)}: ${plata(p.pendiente)}`)
    return [`${hola}, te paso el saldo de tu cuenta en BDI:`, ...lineas, `Total: ${plata(saldo)}`, '¡Gracias!'].join('\n')
  }
  if (saldo < -0.5) return `${hola}, te paso el saldo de tu cuenta en BDI: tenés ${plata(-saldo)} a favor, que se descuentan en tu próximo pedido. ¡Gracias!`
  return null
}
