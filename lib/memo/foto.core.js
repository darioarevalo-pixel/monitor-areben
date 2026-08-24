/**
 * La foto del memo: los números de la semana, calculados. Puro y testeable.
 *
 * Dos bloques viven acá porque **dan la misma respuesta se pregunten cuando se pregunten** — son un
 * rango de fechas cerrado:
 *   - venta por línea (facturado, unidades, ticket) contra la semana anterior;
 *   - venta por canal (mayorista contra el resto);
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

/**
 * 📌 **Las líneas se mudaron a `lib/lineas.core.js`** el 22-ago-2026 y acá quedan re-exportadas para
 * no tocar a quien ya importa de este camino (`lib/norte/pyl.core.js`, `api/_memo.js` y la pantalla).
 *
 * No eran del memo: `esStunned` estaba escrita **tres veces y hacía tres cosas distintas** —acá
 * clasificaba, en `lib/conteo-estandar/core.ts` clasificaba sobre variantes, y en `lib/margenes.ts`
 * **excluía**—. Tres copias de una regla son tres respuestas la primera vez que una cambia.
 */
import { LINEAS, ETIQUETA_LINEA, esStunned, lineaDe } from '../lineas.core.js'

/**
 * ⛔ **El canal NO se clasifica acá.** `canalDe` es **LA** implementación y vive en
 * `lib/liquidacion/canal.core.js` — la misma que usan `api/_norte.js` y la pestaña «Día a día» de
 * Ventas mensuales. Escribir un segundo criterio acá haría que el memo y esa pestaña contesten
 * distinto sobre la misma semana, que es justo el contraste con el que se verifica este bloque.
 */
import { CANALES_MINORISTA, canalDe } from '../liquidacion/canal.core.js'
/**
 * 🔑 **La misma cuenta de «lo facturado» que usan Norte y la pestaña «Día a día».** Mercadería menos
 * el descuento más el envío. Escribirla de nuevo acá haría que dos pantallas del mismo monitor
 * contesten distinto sobre la misma semana — medido el 24-ago-2026 sobre la semana del 10 al 16:
 * $15.776.896 de mercadería contra $14.694.969 facturado, **$1.081.927 (6,9 %) de diferencia**.
 */
import { facturadoDeVenta } from '../norte/contribucion.core.js'

export { esStunned, lineaDe }
/** Re-exportado para que la pantalla del memo no tenga que saber de dónde sale el agrupado. */
export { CANALES_MINORISTA }
export const LINEAS_MEMO = LINEAS
export const LABEL_LINEA = ETIQUETA_LINEA

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
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
 * 🔴 **Acá hubo una excepción por NOMBRE DE LÍNEA y se sacó el 18-ago-2026.** Decía
 * `if (linea === 'stunned') return 'sin-dato'`, con este motivo: su píxel nunca había registrado
 * una compra, así que el costo por compra suyo era un invento con cara de medición. La premisa
 * dejó de ser cierta —la semana del 10 al 16 Stunned trajo **1 compra y $38.241**— y la excepción
 * pasó a tapar un número real. Por eso ahora **la mudez sale del DATO**: sin compras no hay costo
 * por compra, se llame como se llame la línea. Con eso se fue también el parámetro `linea`, que ya
 * no decidía nada. ⚠️ Ojo con leer un costo por compra de UNA sola observación.
 */
export function semaforoPauta(p, techo) {
  const c = costoPorCompra(p)
  if (c === null || !techo || techo <= 0) return 'sin-dato'
  if (c > techo) return 'rojo'
  if (c > techo * 0.8) return 'amarillo'
  return 'verde'
}

/**
 * La venta de un rango, agrupada por CANAL.
 *
 * Hermana de `ventaPorLinea` y con la misma disciplina de fechas: 🔑 **la fecha sale del mapa de
 * ventas, NUNCA del rango de `sale_id`** — los detalles se piden por rango de id porque
 * `venta_detalles` no tiene fecha propia, y ese rango arrastra ventas de otras fechas.
 *
 * 🔴 **El ticket mixto se comporta al REVÉS que por línea, y las dos tablas se leen una al lado de
 * la otra.** Una venta que mezcla Zattia y Stunned cuenta un ticket en cada línea, así que los
 * tickets por línea **no** suman al total. Una venta tiene **un** canal ⇒ acá los tickets **sí**
 * suman. La pantalla lo dice al pie: sin eso el lector suma mal y nada falla.
 *
 * ⚠️ **`tecnica` no es una venta** (sesión de fotos, fallas y canjes crean una venta en Gestión Nube
 * para descontar stock) y por eso queda fuera del total de `resumirCanales` — pero **con nombre**:
 * evaporarla es el defecto, y un canal vacío también cae ahí.
 *
 * 🔴 🔑 **Acá `facturado` es LO FACTURADO DE VERDAD, y en `ventaPorLinea` es sólo la mercadería.**
 * No es una inconsistencia: es que el descuento y el envío son **de la venta**, y una venta tiene un
 * solo canal ⇒ acá se pueden atribuir, y en una venta mixta por línea no hay forma de partirlos sin
 * inventar un criterio. La diferencia es grande —la semana del 10 al 16 fueron **$1.081.927, un
 * 6,9 %**— así que las dos tablas **no pueden llamar igual a sus columnas**: la de línea dice
 * «Mercadería» y ésta dice «Facturado». Con el mismo rótulo, el lector cita el número que le tocó.
 *
 * Los tickets se cuentan sólo sobre las ventas que tuvieron renglones: una venta sin detalles no
 * movió plata y contarla bajaría el ticket promedio con un ticket que no facturó nada.
 *
 * @param ventas   filas de `ventas` (`id`, `date_sale`, `channel`, `discount`, `shipping_cost`)
 * @param detalles filas de `venta_detalles` (`sale_id`, `quantity`, `total`)
 * @param desde    YYYY-MM-DD inclusive
 * @param hasta    YYYY-MM-DD inclusive
 * @returns {{ canales: Record<string, VentaLinea>, nombres: Record<string, string[]> }}
 */
export function ventaPorCanal({ ventas, detalles, desde, hasta }) {
  const de = new Map()
  for (const v of ventas || []) {
    const fecha = String(v.date_sale || '').slice(0, 10)
    if (!fecha || fecha < desde || fecha > hasta) continue
    de.set(String(v.id), {
      venta: v,
      canal: canalDe(v.channel),
      crudo: String(v.channel || '').trim() || 'Sin canal',
      mercaderia: 0,
      unidades: 0,
      renglones: 0,
    })
  }

  // Primero la mercadería POR VENTA, y recién después el descuento y el envío: son de la venta, no
  // del renglón. Aplicarlos adentro del bucle de detalles los restaría una vez por producto.
  for (const d of detalles || []) {
    const info = de.get(String(d.sale_id))
    if (!info) continue
    info.mercaderia += num(d.total)
    info.unidades += num(d.quantity)
    info.renglones += 1
  }

  const acc = new Map()
  const nombresDe = new Map()
  for (const info of de.values()) {
    // 🔴 Lo que descarta un ticket es **no tener ni un renglón**, ⛔ nunca que sus renglones sumen
    // cero. Una venta de $0 igual la registró alguien y sigue siendo un ticket: descartarla hacía
    // que los tickets por canal ya no sumaran la cantidad real de ventas, y eso se midió — la
    // semana del 10 al 16 daba 257 «Local» contra las 259 que cuenta la base.
    if (info.renglones === 0) continue
    if (!acc.has(info.canal)) {
      acc.set(info.canal, vacio())
      nombresDe.set(info.canal, new Set())
    }
    const a = acc.get(info.canal)
    a.facturado += facturadoDeVenta(info.venta, info.mercaderia)
    a.unidades += info.unidades
    a.tickets += 1
    nombresDe.get(info.canal).add(info.crudo)
  }

  /** @type {Record<string, VentaLinea>} */
  const canales = {}
  /** @type {Record<string, string[]>} */
  const nombres = {}
  for (const [canal, a] of acc) {
    canales[canal] = a
    nombres[canal] = [...nombresDe.get(canal)].sort()
  }
  return { canales, nombres }
}

/** Junta la venta por canal de las dos bases: los números con `fusionarVenta`, los nombres en unión. */
export function fusionarPorCanal(...partes) {
  const canales = fusionarVenta(...partes.map((p) => (p && p.canales) || {}))
  /** @type {Record<string, string[]>} */
  const nombres = {}
  for (const p of partes) {
    for (const [canal, lista] of Object.entries((p && p.nombres) || {})) {
      nombres[canal] = [...new Set([...(nombres[canal] || []), ...lista])].sort()
    }
  }
  return { canales, nombres }
}

/**
 * El corte que pidió Bruno: **mayorista contra todo lo que no es mayorista**, con el resto
 * desglosado para ver el avance semana a semana.
 *
 * 🔴 **`tecnica` queda fuera del total a propósito y con nombre.** No es una venta: la crea el
 * monitor para descontar stock. Sumarla al total inflaría la venta de la semana con movimientos que
 * nadie cobró; esconderla haría desaparecer del informe el día que Gestión Nube deje de mandar el
 * campo `channel` y **todas** las ventas caigan ahí.
 *
 * ⇒ `mayorista + minorista = total`, y `tecnica` viaja aparte.
 */
export function resumirCanales(porCanal) {
  const p = porCanal || {}
  const sumar = (canales) => canales.reduce((a, c) => {
    const v = p[c]
    if (!v) return a
    return {
      facturado: a.facturado + num(v.facturado),
      unidades: a.unidades + num(v.unidades),
      tickets: a.tickets + num(v.tickets),
    }
  }, vacio())

  return {
    mayorista: sumar(['mayorista']),
    minorista: sumar(CANALES_MINORISTA),
    desglose: CANALES_MINORISTA.map((canal) => ({ canal, venta: p[canal] || vacio() })),
    tecnica: sumar(['tecnica']),
    total: sumar(['mayorista', ...CANALES_MINORISTA]),
  }
}
