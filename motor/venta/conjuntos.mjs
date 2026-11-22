/**
 * La bikini en UNA línea (Bruno 22-nov: «es un solo producto con dos partes adentro»; el ticket y la factura la muestran así). Puro.
 * Vive en `lib/venta` porque el monitor copia esta carpeta (`npm run traer-motor`): el ticket de la Caja, la factura y la pantalla
 * del cambio usan ESTA regla.
 *
 * La venta guarda un renglón por pieza (el libro y el costo son por prenda) y, en su detalle, qué renglones forman cada conjunto
 * (`detalle.tn.conjuntos` de la venta de TN, `detalle.conjuntos` de la Caja). Esto los vuelve a juntar: lo que suman sus piezas es
 * el precio de la bikini.
 */

const pesos = (x) => Math.round(Number(x) * 100) / 100
const clave = (pid, sid) => `${Number(pid)}:${Number(sid)}`

/** Los conjuntos de una venta, vengan de TN o de la Caja. */
export const conjuntosDe = (venta) => [...(venta?.detalle?.tn?.conjuntos ?? []), ...(venta?.detalle?.conjuntos ?? [])]

/**
 * Las líneas para MOSTRAR: cada conjunto en una, el resto como está.
 * @param {Array<{ product_id, size_id, cantidad, importe, nombre?, talle? }>} lineas  los renglones de la venta (en positivo o negativo)
 * @param {Array<{ nombre?: string, cantidad: number, piezas: Array<{ product_id, size_id, cantidad }> }>} conjuntos
 * @returns {Array<{ conjunto: boolean, nombre: string|null, cantidad: number, importe: number, unitario: number, partes?: any[], linea?: any }>}
 *   `partes` (del conjunto): las líneas de sus piezas, para el detalle «corpiño S / bombacha M».
 */
export function lineasParaMostrar(lineas, conjuntos) {
  const quedan = lineas.map((l) => ({ l, resto: Number(l.cantidad) }))
  const out = []
  for (const c of conjuntos) {
    const n = Number(c.cantidad) || 0
    if (!n || !(c.piezas || []).length) continue
    // Cada pieza: n × su cantidad, tomada de los renglones de esa prenda que todavía tienen unidades.
    const partes = []
    let ok = true
    for (const pz of c.piezas) {
      const quiere = n * (Number(pz.cantidad) || 1)
      const r = quedan.find((q) => clave(q.l.product_id, q.l.size_id) === clave(pz.product_id, pz.size_id) && Math.abs(q.resto) >= quiere)
      if (!r) { ok = false; break }
      partes.push({ r, quiere })
    }
    if (!ok) continue // ⛔ se inventa: si las piezas ⛔ están (cambio parcial, venta corregida), se muestran sueltas
    const signo = Math.sign(Number(partes[0].r.l.cantidad)) || 1
    let importe = 0
    for (const { r, quiere } of partes) {
      importe += (Number(r.l.importe) / Number(r.l.cantidad)) * quiere * signo
      r.resto -= quiere * signo
    }
    out.push({ conjunto: true, nombre: c.nombre ?? null, cantidad: n * signo, importe: pesos(importe), unitario: pesos(importe / (n * signo)), partes: partes.map((p) => p.r.l) })
  }
  for (const q of quedan) {
    if (!q.resto) continue
    const importe = pesos((Number(q.l.importe) / Number(q.l.cantidad)) * q.resto)
    out.push({ conjunto: false, nombre: q.l.nombre ?? null, cantidad: q.resto, importe, unitario: pesos(importe / q.resto), linea: q.l })
  }
  return out
}

/** «Bikini MADDIE · Camo — corpiño S / bombacha M»: el detalle de las partes, con el nombre de talle que traiga cada línea. */
export function textoDePartes(fila, nombreDeParte = (l) => [l.parte, l.talle].filter(Boolean).join(' ')) {
  if (!fila.conjunto) return fila.nombre
  const partes = fila.partes.map(nombreDeParte).filter(Boolean).join(' / ')
  return partes ? `${fila.nombre ?? 'Conjunto'} — ${partes}` : fila.nombre
}
