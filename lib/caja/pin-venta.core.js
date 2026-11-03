/**
 * **Vender lo que el ERP dice que no hay** (Bruno, regla b:1941; ventana pedida el 2-nov): la Caja ⛔ vende en silencio una prenda que
 * el libro da en 0: pide el PIN de la encargada y la venta queda en «A contar». Se prende solo con el corte de la línea
 * (`destino: 'erp'`). BDI también (Bruno, 3-nov; el 1-nov había quedado para más adelante).
 *
 * 🔑 Se pregunta ANTES de guardar, con la cajera delante: una venta por transferencia llega al ERP más tarde y ahí ⛔ hay a quién
 * pedirle nada. Por eso `VENTA_SIN_NEGATIVOS` del motor sigue sin cargar: frenaría esa venta sin que nadie la pueda destrabar.
 */
export const LINEAS_CON_PIN_DE_VENTA = ['stunned', 'zattia', 'bdi']

/** ¿Este ticket pide el PIN si falta stock? Sólo si va al ERP y su línea está en la lista. */
export function pidePinDeVenta(destino, linea) {
  return destino === 'erp' && LINEAS_CON_PIN_DE_VENTA.includes(linea)
}

/**
 * Las prendas del ticket que el libro ⛔ cubre. Suma por variante: dos renglones de la misma prenda piden las dos.
 * @param {Array<{ product_id: unknown, size_id: unknown, cantidad: unknown, nombre?: string | null, talle?: string | null }>} renglones
 * @param {(productId: number, sizeId: number) => number} nivelDe lo que hay en el depósito de la venta
 * @returns {Array<{ product_id: number, size_id: number, nombre: string | null, talle: string | null, hay: number, pide: number }>}
 */
export function prendasQueFaltan(renglones, nivelDe) {
  const porVariante = new Map()
  for (const r of renglones || []) {
    const clave = `${Number(r.product_id)}:${Number(r.size_id)}`
    const previa = porVariante.get(clave)
    if (previa) previa.pide += Number(r.cantidad)
    else porVariante.set(clave, { product_id: Number(r.product_id), size_id: Number(r.size_id), nombre: r.nombre ?? null, talle: r.talle ?? null, pide: Number(r.cantidad) })
  }
  const faltan = []
  for (const v of porVariante.values()) {
    const hay = nivelDe(v.product_id, v.size_id)
    if (hay < v.pide) faltan.push({ ...v, hay })
  }
  return faltan
}
