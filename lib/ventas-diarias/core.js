/**
 * **La venta de cada día**, por canal, en unidades y en plata. Puro y testeable.
 *
 * Es la pregunta que el monitor todavía no contestaba: *¿cómo viene la venta día a día?* Ventas
 * mensuales la contesta por mes —que es la forma de ver una tendencia y la peor de ver una
 * campaña—, Norte la contesta como promedio de 30 días, y Ventas de Marketing la contesta en
 * unidades y sin plata. Acá van los tres cortes juntos y por día.
 *
 * # Por qué esto no sale del ETL
 *
 * 🔑 **Porque el ETL no baja la plata, y no se lo va a hacer bajar.** Su `select` de
 * `venta_detalles` es `sale_id, product_id, size_id, size, quantity` — sin `unit_price` ni `total`.
 * El razonamiento completo está escrito en `lib/liquidacion/ventas.ts`: `venta_detalles` es la
 * tabla más grande, el payload de BDI ya pesa ~14,7 MB en IndexedDB, y dos columnas más las
 * pagarían las 42 secciones para que las use una. Va una consulta puntual del servidor, igual que
 * Liquidación y el memo.
 *
 * ⚠️ **`serieDiaria` de `lib/mkt-ventas/core.ts` NO es esta función y no hay que unificarlas.**
 * Aquélla corre en el navegador sobre el ETL, cuenta compras y unidades y **no puede** contar
 * plata; ésta corre sobre las filas que trae el servidor, con las dos columnas que el ETL no baja.
 * Unificarlas obligaría a que la del navegador devolviera plata en cero, y **un cero afirma**: se
 * leería «no se vendió nada» donde dice «esa columna no se bajó».
 *
 * # Por qué es `.js` plano
 *
 * Mismo motivo que `lib/memo/foto.core.js`: lo importan el handler de `api/_ventas-diarias.js` —que
 * corre en Node sin el compilador de Next— y la pantalla. `lib/ventas-diarias/index.ts` es el
 * re-export tipado.
 */

import { CANALES, canalDe } from '../liquidacion/canal.core.js'
import { esVentaTecnica } from '../etl/tecnica.core.js'
import { facturadoDeVenta } from '../norte/contribucion.core.js'
import { sumarDias } from '../fechas/dia.core.js'

/**
 * Cuántos días hacia atrás tiene sentido pedir. **No es una preferencia: es hasta dónde el espejo
 * se corrige solo.**
 *
 * Cada corrida del sync relee completos los últimos `DIAS_REPASO` = 90 días y purga lo que Gestión
 * Nube ya no tiene (`scripts/lib/purga-ventas.mjs`). Más atrás de eso, una venta quedó como estaba
 * el día que se cargó: si después se anuló o le cambiaron el importe, el espejo no se enteró. Una
 * serie diaria de 180 días dibujaría esa mitad vieja con la misma tinta que la de ayer.
 */
export const TOPE_DIAS = 90

/** @typedef {{ compras: number, unidades: number, plata: number }} Corte */
/** @typedef {{ fecha: string, completo: boolean | null, total: Corte, porCanal: Record<string, Corte> }} DiaVenta */

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** @returns {Corte} */
function vacio() {
  return { compras: 0, unidades: 0, plata: 0 }
}

function sumar(a, b) {
  a.compras += b.compras
  a.unidades += b.unidades
  a.plata += b.plata
}

/**
 * La serie día por día de un rango, con el corte por canal.
 *
 * 🔴 **Un día sin ventas sale con 0, y un día que todavía no se midió sale con `completo: false`.**
 * Son dos hechos que en un gráfico se dibujan idénticos y significan lo contrario: «el domingo no
 * vendimos» y «hoy son las 11 de la mañana y el espejo se llenó a las 4». El segundo lo decide
 * `medidoHasta`, que es el **día argentino** de la última lectura del espejo — no la hora de esta
 * consulta. `medidoHasta` en `null` deja `completo` en `null` en todos los días: no se sabe, y eso
 * también se dice.
 *
 * 🔴 **Las ventas técnicas se sacan acá** con `esVentaTecnica` —el mismo criterio que usan el ETL,
 * Norte y el CRM—, y se devuelve **cuántas fueron**. Sacarlas sin decirlo dejaría un hueco que en
 * el gráfico es indistinguible de un día flojo.
 *
 * ⚠️ **Las líneas negativas NO se descartan**: una devolución entra como `quantity: -1` y su plata
 * en negativo, y así tiene que entrar — el día que se devolvió una prenda se vendió una menos.
 * Filtrarlas dejaría una serie que sólo sube.
 *
 * @param ventas   filas de `ventas`: `id, date_sale, channel, discount, shipping_cost` (+
 *                 `channel_id` en BDI, que Zattia no tiene)
 * @param detalles filas de `venta_detalles`: `sale_id, quantity, total`
 * @param desde/hasta  YYYY-MM-DD inclusive
 * @param medidoHasta  día argentino de la última lectura del espejo, o `null`
 * @returns `{ dias, canales, nombresPorCanal, tecnicas, control }`
 */
export function serieDiaria({ ventas, detalles, desde, hasta, medidoHasta }) {
  /** @type {Map<string, DiaVenta>} */
  const porDia = new Map()
  // El tope no es decorativo: `f = sumarDias(f, 1)` sobre una fecha inválida devuelve `NaN-NaN-NaN`
  // y el `<=` nunca se cumple. Sin corte, la función de Vercel se cuelga hasta el timeout y el
  // error que llega es «la pantalla no carga». La puerta valida el rango; esto es el piso.
  for (let f = desde, n = 0; f <= hasta && n <= TOPE_DIAS + 7; f = sumarDias(f, 1), n++) {
    porDia.set(f, {
      fecha: f,
      // `medidoHasta` es el día de la lectura, así que ese mismo día está a medias: el sync corrió
      // a las 4 de la mañana y lo que se vendió después no está.
      completo: medidoHasta == null ? null : f < medidoHasta,
      total: vacio(),
      porCanal: Object.fromEntries(CANALES.map((c) => [c, vacio()])),
    })
  }

  // Primer paso: qué día y qué canal es cada venta de la ventana. La mercadería viene de los
  // renglones, así que la plata de la venta no se puede cerrar hasta la segunda pasada.
  const dePorVenta = new Map()
  const nombres = Object.fromEntries(CANALES.map((c) => [c, new Set()]))
  let tecnicas = 0

  for (const v of ventas || []) {
    const fecha = String(v.date_sale || '').slice(0, 10)
    if (!porDia.has(fecha)) continue
    if (esVentaTecnica(v)) {
      tecnicas++
      continue
    }
    const canal = canalDe(v.channel)
    nombres[canal].add(String(v.channel || '').trim() || '(sin canal)')
    dePorVenta.set(String(v.id), { fecha, canal, venta: v, mercaderia: 0, unidades: 0 })
  }

  // Segundo: las unidades y la mercadería, que viven en los renglones y se atan por `sale_id`.
  // `venta_detalles` no tiene fecha propia — el sale_id es el único puente, y por eso el corte por
  // fecha ya se hizo arriba sobre las ventas y no acá.
  for (const d of detalles || []) {
    const a = dePorVenta.get(String(d.sale_id))
    if (!a) continue
    a.unidades += num(d.quantity)
    a.mercaderia += num(d.total)
  }

  // Tercero: cerrar la plata de cada venta y volcarla a su día. El descuento y el envío son de la
  // venta entera, no del renglón, así que recién acá se puede sumar.
  let facturado = 0
  let totalPrice = 0
  for (const a of dePorVenta.values()) {
    totalPrice += num(a.venta.total_price)
    const corte = {
      compras: 1,
      unidades: a.unidades,
      plata: facturadoDeVenta(a.venta, a.mercaderia),
    }
    facturado += corte.plata
    const dia = porDia.get(a.fecha)
    sumar(dia.total, corte)
    sumar(dia.porCanal[a.canal], corte)
  }

  const dias = [...porDia.values()]
  const canales = CANALES.filter((c) => dias.some((d) => d.porCanal[c].compras !== 0))

  return {
    dias,
    canales,
    nombresPorCanal: Object.fromEntries(canales.map((c) => [c, [...nombres[c]].sort()])),
    tecnicas,
    // 🔑 **El oráculo, y viene por otro camino que el hecho.** `facturado` se arma de tres columnas
    // (los renglones, el descuento y el envío); `total_price` es el total que Gestión Nube ya
    // calculó y guardó en la venta. Medido el 23-ago-2026 sobre 37 días, coinciden al peso en
    // 1.006 de 1.016 ventas de BDI y 739 de 751 de Zattia, y las que no difieren por redondeo — $79
    // sobre $44,7 M y $170 sobre $25,2 M. Que la pantalla los coteje y lo diga es lo que convierte
    // «la plata del día» en un número que se puede creer: el día que el sync deje de traer una
    // columna, la diferencia se abre y se ve.
    control: { facturado, totalPrice, ventas: dePorVenta.size },
  }
}

/**
 * Los días visibles, cada uno con **el mismo día de la semana anterior** al lado.
 *
 * 🔑 **Se compara contra el mismo día de la semana, no contra el día anterior.** La venta tiene
 * semana: el domingo de BDI hizo 4 ventas y el viernes 58 (7 y 14 de agosto de 2026). Contra ayer,
 * cada lunes es un derrumbe y cada viernes una hazaña; contra el lunes pasado, es una comparación.
 *
 * 🔴 **`previo` es `null`, no cero, cuando el día −7 no entró en la consulta.** Un cero ahí diría
 * «la semana pasada no se vendió nada» y lo que pasa es que no se preguntó. Por eso el llamador
 * pide `desde` siete días antes de lo que va a mostrar: los siete primeros existen sólo para ser
 * el término de comparación de los que se ven.
 *
 * ⚠️ **Un día `completo: false` se compara igual pero no se puede leer como caída**: la mitad de
 * hoy contra el día entero de la semana pasada siempre da para abajo. La pantalla lo dice; acá el
 * dato viaja tal cual, con su `completo` al lado.
 *
 * @param serie   la salida de `serieDiaria`
 * @param visible YYYY-MM-DD: el primer día que se muestra
 */
export function conSemanaAnterior(serie, visible) {
  const porFecha = new Map(serie.dias.map((d) => [d.fecha, d]))
  return serie.dias
    .filter((d) => d.fecha >= visible)
    .map((d) => {
      const antes = porFecha.get(sumarDias(d.fecha, -7))
      return { ...d, previo: antes ? antes.total : null }
    })
}

/**
 * El total de un tramo de la serie, y el mismo tramo de la semana anterior.
 *
 * ⚠️ **Los días incompletos se cuentan igual y se dicen aparte** (`incompletos`). Sacarlos daría un
 * total más honesto y una serie que no cierra contra su propio gráfico: el que suma las barras a
 * ojo tiene que llegar a este número.
 */
export function totalDelTramo(filas) {
  const total = vacio()
  const previo = vacio()
  let conPrevio = 0
  let incompletos = 0
  for (const f of filas) {
    sumar(total, f.total)
    if (f.completo === false) incompletos++
    if (f.previo) {
      sumar(previo, f.previo)
      conPrevio++
    }
  }
  // Sin ningún día comparable no hay comparación: `null` y no un cero, que se leería como «la
  // semana pasada no se vendió».
  return { total, previo: conPrevio ? previo : null, conPrevio, incompletos }
}
