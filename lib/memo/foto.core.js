/**
 * La foto del memo: los números de la semana, calculados. Puro y testeable.
 *
 * Dos bloques viven acá porque **dan la misma respuesta se pregunten cuando se pregunten** — son un
 * rango de fechas cerrado:
 *   - venta por línea (facturado, unidades, ticket) contra la semana anterior;
 *   - pauta por línea (gasto y costo por compra) contra el techo de rentabilidad.
 *
 * Los otros dos bloques del memo (capital parado y pendientes) NO están acá y no es un olvido: son
 * señales "al momento" que se mueven solas, las calcula el panel Gerencial con el ETL del navegador
 * y el memo las guarda rotuladas con la fecha en que se tomaron. Ver el encabezado de
 * `api/_memo.js`.
 *
 * `.js` plano: lo importan el handler de `api/` y la pantalla.
 */

/**
 * @typedef {{ facturado: number, unidades: number, tickets: number }} VentaLinea
 * @typedef {{ gasto: number, compras: number, revenue: number }} PautaLinea
 */

/** Las tres líneas del negocio. Stunned NO es una marca del monitor: es una línea de Zattia. */
export const LINEAS_MEMO = ['bdi', 'zattia', 'stunned']

export const LABEL_LINEA = { bdi: 'BDI', zattia: 'Zattia', stunned: 'Stunned' }

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Stunned se reconoce por el prefijo de SKU, que es como ya lo hace `computarFilas` en
 * `lib/margenes.ts` (port de `index.html:8535-8552`). No hay otra marca: está cargada dentro del
 * Gestión Nube de Zattia.
 */
export function esStunned(sku) {
  return !!sku && /^stu/i.test(String(sku))
}

/** La línea de un producto, según de qué base salió y qué SKU tiene. */
export function lineaDe(store, sku) {
  if (store === 'zattia') return esStunned(sku) ? 'stunned' : 'zattia'
  return 'bdi'
}

/** @returns {VentaLinea} */
function vacio() {
  return { facturado: 0, unidades: 0, tickets: 0 }
}

/**
 * La venta de un rango, agrupada por línea.
 *
 * 🔑 **La fecha sale del mapa de ventas, NUNCA del rango de `sale_id`.** Los detalles se piden
 * `sale_id` entre el mínimo y el máximo del rango porque `venta_detalles` no tiene fecha propia —
 * el sale_id es el único puente—, y ese rango arrastra ventas de otras fechas. Filtrar por el
 * rango de ids en vez de por la fecha real es la forma de inflar la semana sin que se note. Mismo
 * cruce que `ventas-campania` en `api/_liquidacion.js`.
 *
 * ⚠️ **Los tickets de una venta mixta cuentan en las dos líneas.** Una venta de Zattia que lleva
 * una funda Stunned es un ticket para cada una: no hay forma de partir un ticket en dos sin
 * inventar un criterio. El facturado y las unidades sí se reparten bien, porque son por línea de
 * detalle. La pantalla lo aclara al pie.
 *
 * @param store   'bdi' | 'zattia' — de qué base salieron estas filas
 * @param ventas  filas de `ventas` (`id`, `date_sale`)
 * @param detalles filas de `venta_detalles` (`sale_id`, `product_id`, `quantity`, `total`)
 * @param skuPor  Map product_id (string) → sku
 * @param desde   YYYY-MM-DD inclusive
 * @param hasta   YYYY-MM-DD inclusive
 * @returns {Record<string, VentaLinea>}
 */
export function ventaPorLinea({ store, ventas, detalles, skuPor, desde, hasta }) {
  const fechaDe = new Map((ventas || []).map((v) => [String(v.id), String(v.date_sale || '').slice(0, 10)]))
  const acc = new Map()
  const ticketsDe = new Map()

  for (const d of detalles || []) {
    const sid = String(d.sale_id)
    const fecha = fechaDe.get(sid)
    if (!fecha || fecha < desde || fecha > hasta) continue

    const linea = lineaDe(store, skuPor && skuPor.get(String(d.product_id)))
    if (!acc.has(linea)) {
      acc.set(linea, vacio())
      ticketsDe.set(linea, new Set())
    }
    const a = acc.get(linea)
    a.facturado += num(d.total)
    a.unidades += num(d.quantity)
    ticketsDe.get(linea).add(sid)
  }

  /** @type {Record<string, VentaLinea>} */
  const out = {}
  for (const [linea, a] of acc) {
    out[linea] = { ...a, tickets: ticketsDe.get(linea).size }
  }
  return out
}

/**
 * Junta la venta de las dos bases en un solo objeto por línea.
 * @returns {Record<string, VentaLinea>}
 */
export function fusionarVenta(...partes) {
  /** @type {Record<string, VentaLinea>} */
  const out = {}
  for (const p of partes) {
    for (const [linea, v] of Object.entries(p || {})) {
      const a = out[linea] || vacio()
      out[linea] = {
        facturado: a.facturado + v.facturado,
        unidades: a.unidades + v.unidades,
        tickets: a.tickets + v.tickets,
      }
    }
  }
  return out
}

/** Ticket promedio de una línea. `null` cuando no hubo ventas — dividir por cero no es cero. */
export function ticketPromedio(v) {
  return v && v.tickets > 0 ? v.facturado / v.tickets : null
}

/**
 * La variación contra la semana anterior.
 *
 * 🔴 **`pct` es `null` cuando la semana anterior fue 0, no `Infinity` ni `100`.** Pasar de cero a
 * algo no es "subió 100%": es que antes no había con qué comparar, y un cartel de "+∞%" en el memo
 * de una marca nueva es exactamente el número que después alguien cita en una reunión.
 */
export function delta(actual, previo) {
  const a = num(actual)
  const p = num(previo)
  return { abs: a - p, pct: p === 0 ? null : ((a - p) / p) * 100 }
}

/**
 * La pauta de la semana por línea, a partir de las filas de `meta_ads_snapshot_dia` a nivel
 * campaña.
 *
 * Nivel campaña y no cuenta: BDI, Zattia y Stunned se pautean desde la misma cuenta publicitaria,
 * así que sumar por cuenta mezcla las tres. La línea vive en la fila (`meta_ads_campania_linea` es
 * lo que la escribe), que es la única atribución que no miente.
 *
 * ⚠️ `alcance` y `frecuencia` no se suman entre días y por eso no están: son dedup del período.
 * @returns {Record<string, PautaLinea>}
 */
export function pautaPorLinea(filas) {
  /** @type {Record<string, PautaLinea>} */
  const out = {}
  for (const f of filas || []) {
    const linea = f && f.linea
    if (!linea) continue
    const a = out[linea] || { gasto: 0, compras: 0, revenue: 0 }
    a.gasto += num(f.spend)
    a.compras += num(f.compras)
    a.revenue += num(f.revenue)
    out[linea] = a
  }
  return out
}

/** Costo por compra. `null` sin compras: no es "gratis", es que no se puede calcular. */
export function costoPorCompra(p) {
  return p && p.compras > 0 ? p.gasto / p.compras : null
}

/**
 * Cómo se lee el costo por compra contra su techo de rentabilidad.
 *
 * 🔴 **Stunned nunca devuelve semáforo, aunque tenga techo cargado.** Su píxel nunca registró una
 * compra, así que `compras` es 0 o basura y el costo por compra sería un número inventado con cara
 * de medición. Se muestra el gasto y nada más. El día que el píxel registre compras de verdad,
 * esta excepción se saca de acá y de ningún otro lado.
 */
export function semaforoPauta(linea, p, techo) {
  if (linea === 'stunned') return 'sin-dato'
  const c = costoPorCompra(p)
  if (c === null || !techo || techo <= 0) return 'sin-dato'
  if (c > techo) return 'rojo'
  if (c > techo * 0.8) return 'amarillo'
  return 'verde'
}
