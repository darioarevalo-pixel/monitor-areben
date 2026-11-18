/**
 * La cuenta de «Corregir productos» en la pantalla (motor sql/088): de «cuántas QUEDAN» por renglón y lo que se agrega, a lo que
 * se manda al motor (`sacar`) y el total nuevo que se muestra antes de guardar. Puro. El que decide es el motor (prorratea el
 * importe del renglón por unidad, igual que acá); esto sólo dibuja.
 * @param {{ total: number, lineas: Array<{ id: string, cantidad: number, cambiado: number, importe: number }>,
 *   quedan: Record<string, number>, agregadas: Array<{ cantidad: number, precio: number }> }} e
 */
export function cuentaDeCorreccion({ total, lineas, quedan, agregadas }) {
  const sacar = []
  let delta = 0
  for (const l of lineas || []) {
    const max = Number(l.cantidad) - Number(l.cambiado || 0)
    const queda = quedan?.[l.id] ?? max
    if (!(Number.isInteger(queda) && queda >= 0 && queda <= max)) return { error: 'Revisá las cantidades.', sacar: [], totalNuevo: total, hayCambio: false }
    if (queda < max) {
      sacar.push({ lineaId: l.id, cantidad: max - queda })
      delta -= Math.round((Number(l.importe) / Number(l.cantidad)) * 100) / 100 * (max - queda)
    }
  }
  for (const a of agregadas || []) {
    if (!(Number.isFinite(a.precio) && a.precio >= 0)) return { error: 'Falta el precio de lo que se agrega.', sacar: [], totalNuevo: total, hayCambio: false }
    delta += a.precio * a.cantidad
  }
  const totalNuevo = Math.round((Number(total) + delta) * 100) / 100
  if (totalNuevo < 0) return { error: 'El total no puede quedar en negativo.', sacar: [], totalNuevo, hayCambio: false }
  return { error: null, sacar, totalNuevo, hayCambio: sacar.length > 0 || (agregadas || []).length > 0 }
}
