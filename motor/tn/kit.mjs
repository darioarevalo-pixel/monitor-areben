/**
 * LOS CONJUNTOS (sql/092): una variante de Tienda Nube que son varias prendas del ERP — la bikini 2027 de Zattia = corpiño +
 * bombacha, cada uno con su talle (Bruno, 21-nov). Puro.
 *
 * 🔑 Qué es un conjunto para cada parte del sistema:
 *   - STOCK a TN: el mínimo de lo disponible de sus piezas (`stockDeConjunto`). Una venta S/M cambia las 5 combinaciones que
 *     comparten corpiño S o bombacha M: el envío puntual las encuentra con `indice.conjuntosDe` y las recalcula.
 *   - PEDIDO (reserva y armado) y VENTA: cada pieza es su renglón (`piezasDeLineaTN` de `cruce.mjs`).
 *   - PRECIO de la venta: el del conjunto, repartido entre las piezas según su COSTO de producción (`repartirPrecio`). Sin costo
 *     de alguna pieza, en partes iguales (y se marca `reparto: 'iguales'`).
 *   - CAMBIOS: de la bikini COMPLETA, ⛔ de una pieza (Bruno 21-nov): vuelven las dos y salen las dos.
 *   - El PRECIO que se manda a TN ⛔ sale de las piezas: el conjunto tiene el suyo (`varianteDeLineaTN` da null ⇒ el empuje de
 *     precio lo cuenta «sin variante» y ⛔ lo toca).
 */

const centavos = (x) => Math.round(Number(x) * 100)

/**
 * Reparte el precio de UN conjunto entre sus piezas, en centavos exactos (lo que sobra del redondeo va a la última).
 * @param {number} precio  el de un conjunto
 * @param {Array<{ product_id: number, cantidad: number }>} piezas  las de UN conjunto (`cantidad` por conjunto)
 * @param {(product_id: number) => number | null | undefined} costoDe  el costo de producción vigente de la prenda
 * @returns {{ partes: number[], reparto: 'costo' | 'iguales' }}  `partes[i]` = lo que vale la pieza i (todas sus unidades) en un conjunto
 */
export function repartirPrecio(precio, piezas, costoDe) {
  const total = centavos(precio)
  const costos = piezas.map((p) => Number(costoDe?.(p.product_id)) * p.cantidad)
  const porCosto = costos.every((c) => c > 0)
  const pesos = porCosto ? costos : piezas.map((p) => p.cantidad)
  const suma = pesos.reduce((s, x) => s + x, 0)
  const partes = []
  let resto = total
  pesos.forEach((w, i) => {
    const c = i === pesos.length - 1 ? resto : Math.round((total * w) / suma)
    partes.push(c / 100)
    resto -= c
  })
  return { partes, reparto: porCosto ? 'costo' : 'iguales' }
}

/**
 * El stock de un conjunto: cuántos conjuntos enteros salen de lo disponible de sus piezas.
 * @param {Array<{ cantidad: number }>} piezas  las de UN conjunto
 * @param {(pieza) => number} disponible  de esa prenda, ya con reservas y bolsas
 */
export function stockDeConjunto(piezas, disponible) {
  return Math.max(0, Math.min(...piezas.map((p) => Math.floor(Math.max(0, disponible(p)) / p.cantidad))))
}
