// Caja — la PRENDA REPETIDA (Bruno, 14-oct-2026).
//
// En GN una cajera escaneó DOS veces la prenda que la clienta devolvía: le descontó de más y el stock
// quedó con una unidad que ⛔ existe. Mismo riesgo en la venta: la Caja sumaba +1 CALLADA al escanear
// de nuevo una prenda que ya estaba en el pedido (el lector que dispara dos veces, o la prenda que
// quedó en la pila y se volvió a pasar minutos después — el peor, porque ⛔ es rápido).
//
// Las dos reglas viven acá para que la venta y el cambio pregunten lo MISMO:
//   - VENTA: escanear una prenda que ya está ⇒ se PREGUNTA (la clienta puede llevar dos iguales). La
//     confirma la cajera con un toque y queda registrado en el renglón (`registrarRespuesta`).
//     ⛔ Preguntan el «+» del renglón ni las prendas que vuelven solas al pedido: ésas son a propósito.
//   - CAMBIO CON TICKET: devolver más de las que esa venta vendió (contando los cambios anteriores)
//     ⇒ se BLOQUEA, ⛔ se confirma: esa prenda ⛔ viene de esa venta (Bruno, 14-oct). Sin ticket ⛔ hay
//     contra qué medir: se pregunta, con PIN de encargada.

const clave = (r) => `${Number(r && r.product_id)}|${Number(r && r.size_id)}`

/**
 * ¿La prenda que se acaba de escanear ya está en el pedido? `null` si es la primera.
 * @param {{ enPedido: number, local?: number | null }} x  cuántas hay ya en el pedido y el stock del local
 * @returns {null | { enPedido: number, quedaria: number, superaStock: boolean }}
 */
export function repetida({ enPedido, local = null }) {
  const n = Number(enPedido) || 0
  if (n <= 0) return null
  const quedaria = n + 1
  // Con el stock del local leído: la que se suma ⛔ está en el local ⇒ casi seguro es la misma.
  return { enPedido: n, quedaria, superaStock: Number.isFinite(local) && local != null ? quedaria > Number(local) : false }
}

/**
 * Anota en el renglón qué contestó la cajera: `si` = se lleva otra igual, `no` = era la misma (el error
 * que se evitó). Viaja con la venta y queda en `caja_venta.renglones`.
 * @param {{ si: number, no: number, en: string[] } | null | undefined} previo
 * @param {'si' | 'no'} respuesta
 * @param {Date} [ahora]
 */
export function registrarRespuesta(previo, respuesta, ahora = new Date()) {
  const r = { si: 0, no: 0, en: [], ...(previo || {}) }
  return { ...r, [respuesta]: r[respuesta] + 1, en: [...r.en, `${respuesta}@${ahora.toISOString()}`].slice(-20) }
}

/**
 * Lo que guarda el servidor de lo que mandó la pantalla: sólo números y fechas, con tope (⛔ texto libre).
 * @returns {{ si: number, no: number, en: string[] } | null}
 */
export function limpiarRepetida(x) {
  if (!x || typeof x !== 'object') return null
  const n = (v) => Math.max(0, Math.min(99, Math.trunc(Number(v)) || 0))
  const en = (Array.isArray(x.en) ? x.en : []).filter((s) => typeof s === 'string' && /^(si|no)@\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(s)).slice(-20)
  const r = { si: n(x.si), no: n(x.no), en }
  return r.si || r.no ? r : null
}

/**
 * CAMBIO CON TICKET: tira si se devuelve una prenda que esa venta ⛔ vendió, o más de las que vendió
 * contando lo ya devuelto en cambios anteriores. ⛔ Se confirma: se bloquea.
 * @param {{ vendidas: Array<{product_id:number,size_id:number,cantidad:number,nombre?:string,talle?:string}>,
 *   yaDevueltas?: Array<{product_id:number,size_id:number,cantidad:number}>,
 *   devuelve: Array<{product_id:number,size_id:number,cantidad:number,nombre?:string,talle?:string}> }} x
 */
export function exigirDevolucion({ vendidas, yaDevueltas = [], devuelve }) {
  const suma = (xs) => {
    const m = new Map()
    for (const r of xs || []) m.set(clave(r), (m.get(clave(r)) || 0) + (Number(r.cantidad) || 0))
    return m
  }
  const vend = suma(vendidas)
  const antes = suma(yaDevueltas)
  const ahora = suma(devuelve)
  for (const [k, n] of ahora) {
    const r = devuelve.find((x) => clave(x) === k) || vendidas.find((x) => clave(x) === k) || {}
    const cual = [r.nombre || 'Esta prenda', r.talle ? `talle ${r.talle}` : null].filter(Boolean).join(' ')
    const tope = (vend.get(k) || 0) - (antes.get(k) || 0)
    if (!vend.get(k)) throw new Error(`${cual} no está en esa venta: no se puede devolver con este ticket.`)
    if (n > tope) {
      const ya = antes.get(k) || 0
      throw new Error(`${cual}: la venta tiene ${vend.get(k)}${ya ? `, ya se devolvieron ${ya}` : ''} y se están devolviendo ${n}. ¿Se escaneó dos veces?`)
    }
  }
}
