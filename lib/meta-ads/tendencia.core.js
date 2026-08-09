/**
 * «Cómo viene» — la ventana actual contra la anterior, sacada de la foto diaria.
 *
 * # Qué problema resuelve
 *
 * El Panel contesta **qué está pasando** («al aire ahora», «qué hay que decidir») pero no contesta
 * **si eso es mejor o peor que antes**. Un gasto de $365.000 no dice nada solo: dice todo al lado de
 * los $287.000 del mes anterior — y más todavía cuando las compras bajaron de 68 a 40 al mismo
 * tiempo, que es un caso real de Zattia y el tipo de cosa que ninguna otra pantalla muestra.
 *
 * # 🔑 Sale de la FOTO, no de Meta en vivo, y por eso vive acá abajo
 *
 * El resto del Panel se arma con `?recurso=etapas`, que habla con Graph. Esto lee
 * `meta_ads_snapshot_dia`. Son dos fuentes distintas y **los números pueden diferir unos pesos**:
 * Meta reatribuye hacia atrás durante unos días (ver `DIAS_RELECTURA`) y la foto de un día viejo es
 * la que se leyó, no la de hoy. La pantalla lo dice; esconderlo haría que la diferencia se leyera
 * como un error.
 *
 * A cambio, esto **sobrevive sin token** —igual que los planes, las reglas y la Biblioteca— y es lo
 * único del Panel que sabe de historia: Graph no contesta «cómo venía».
 *
 * # 🔴 El período anterior puede NO EXISTIR, y eso no es un cero
 *
 * La foto arrancó el 11-may-2026. Con el selector en 90 días, los 90 días anteriores son
 * **0 días con foto**, no «gastamos $0»: dibujar ahí un −100% sería el mismo error que leer
 * «0 saltos en 90 días» como «esto no pasa nunca». Por eso `ventanasDe()` no compara contra una
 * ventana que no tiene: **recorta las dos al par más largo que la foto banca** y lo dice. Es la
 * diferencia entre «no bajó» y «todavía no se puede saber».
 *
 * Es `.js` plano porque lo importa `api/_meta-tendencia.js`, que corre en Node sin pasar por el
 * compilador de Next. `lib/meta-ads/tendencia.ts` es el re-export tipado.
 */

import { isoDia, NIVEL_TOTALES, soloNivel, sumarDias } from './snapshot.core.js'

/**
 * El piso para que una comparación signifique algo.
 *
 * Menos de una semana contra una semana es ruido de día de la semana: un martes contra un domingo
 * no compara pauta, compara calendario. Si la foto no da para dos ventanas de esto, no hay
 * comparación — y se dice, en vez de mostrar un porcentaje que nadie puede usar.
 */
export const MINIMO_COMPARABLE = 7

/** Un día ISO corrido `n` días. Trabaja en UTC a propósito: las fechas de la foto son `date`, sin hora. */
export function diaDesplazado(iso, n) {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t)) return null
  return new Date(t + n * 86400000).toISOString().slice(0, 10)
}

/** Cuántos días hay de `a` a `b`, contando los dos extremos. */
export function diasEntre(a, b) {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0
  return Math.floor((tb - ta) / 86400000) + 1
}

/** Todos los días ISO de una ventana, del más viejo al más nuevo. */
export function diasDe(ventana) {
  if (!ventana) return []
  const n = diasEntre(ventana.desde, ventana.hasta)
  return Array.from({ length: Math.max(0, n) }, (_, i) => diaDesplazado(ventana.desde, i))
}

/**
 * Las dos ventanas a comparar: la actual y la inmediatamente anterior, del mismo largo.
 *
 * ⚠️ **Ninguna incluye hoy**, por dos motivos que apuntan al mismo lado. Uno es de Meta: sus
 * `date_preset` relativos terminan ayer, y si esto incluyera hoy no cerraría con Rendimiento ni con
 * la Biblioteca. El otro es peor: la foto de hoy es **parcial** —el cron corre a las 06:30 UTC— así
 * que el último día siempre tendría menos gasto que los demás y la serie terminaría en un pozo que
 * no pasó.
 *
 * 🔴 **Si la foto no llega a cubrir el período anterior, se recortan las DOS ventanas** al par más
 * largo que sí banque, y vuelve `recortado: true` con el largo real. La alternativa —comparar 90
 * días contra los 45 que hay— produce una caída del 50% inventada por el calendario.
 */
export function ventanasDe(hoyIso, dias, primeraFoto) {
  const hasta = diaDesplazado(hoyIso, -1)
  const pedidos = Math.max(1, Math.floor(dias) || 0)
  const ventana = (n) => ({ desde: diaDesplazado(hasta, -(n - 1)), hasta })

  // Cuántos días de foto hay en total. Dos ventanas iguales entran en la mitad.
  const disponibles = primeraFoto ? diasEntre(primeraFoto, hasta) : 0
  const largo = Math.min(pedidos, Math.floor(disponibles / 2))

  if (largo < MINIMO_COMPARABLE) {
    // Sin par comparable la ventana actual sigue siendo la que pidió el Panel: los totales se
    // muestran igual, lo que falta es el «vs».
    return {
      actual: ventana(pedidos), anterior: null, dias: pedidos, pedidos,
      recortado: false, primeraFoto: primeraFoto || null, disponibles,
    }
  }

  const actual = ventana(largo)
  return {
    actual,
    anterior: { desde: diaDesplazado(actual.desde, -largo), hasta: diaDesplazado(actual.desde, -1) },
    dias: largo,
    pedidos,
    recortado: largo < pedidos,
    primeraFoto: primeraFoto || null,
    disponibles,
  }
}

/**
 * La variación de `b` a `a`, como proporción (0,164 = +16,4%).
 *
 * `null` cuando la base es 0: **de la nada no se crece un porcentaje**. Es la misma decisión que
 * `lib/crm/metricas.ts` y que `lib/meta-ads/auditoria.ts`, y la pantalla la dibuja como «no había
 * con qué comparar», nunca como un +∞ ni como un 0%.
 */
export function variacion(a, b) {
  if (a == null || b == null || !b) return null
  return (a - b) / b
}

/** Los totales de un puñado de filas, con el CPA que `sumarDias()` no calcula. */
function totalesDe(filas) {
  const t = sumarDias(filas)
  return {
    gasto: t.spend,
    compras: t.compras,
    revenue: t.revenue,
    impresiones: t.impresiones,
    clicks: t.clicks,
    ctr: t.ctr,
    roas: t.roas,
    // Sin compras el CPA no existe. `null` y no 0: un 0 se lee «gratis» y lo que pasó es que no
    // hubo ninguna — el mismo criterio que la Biblioteca.
    cpa: t.compras ? t.spend / t.compras : null,
    // Cuántos días de la ventana entregaron de verdad. Es lo que dice si el ROAS de al lado se
    // puede creer, y lo que delata una ventana a medio cubrir.
    diasConGasto: new Set(filas.filter((f) => Number(f.spend) > 0).map((f) => f.fecha)).size,
  }
}

/**
 * La comparación completa: totales de cada ventana, el reparto por marca y la serie diaria.
 *
 * 🔴 **Sólo mira el nivel `campania`.** La misma plata está en los cuatro niveles de la tabla y
 * sumarlos todos triplica el gasto — ver `NIVEL_TOTALES`.
 *
 * Las filas sin línea se cuentan aparte en vez de descartarse en silencio: su plata no entra en
 * ningún total y el Panel ya tiene un renglón para mandarlas a asignar, pero un gasto que
 * desaparece sin dejar rastro deja a la comparación mintiendo por omisión.
 */
export function comparar(filas, { ventanas, visibles }) {
  const ve = new Set(Array.isArray(visibles) ? visibles : [])
  const campanias = soloNivel(filas, NIVEL_TOTALES)

  const dentro = (f, v) => v && f.fecha >= v.desde && f.fecha <= v.hasta
  const deVentana = (v) => campanias.filter((f) => dentro(f, v))

  const mias = (fs) => fs.filter((f) => ve.has(f.linea))
  const huerfanas = (fs) => fs.filter((f) => !f.linea)

  const filasActual = deVentana(ventanas.actual)
  const filasAnterior = ventanas.anterior ? deVentana(ventanas.anterior) : []

  const lineas = [...ve].filter((l) => [...filasActual, ...filasAnterior].some((f) => f.linea === l))

  return {
    total: {
      actual: totalesDe(mias(filasActual)),
      anterior: ventanas.anterior ? totalesDe(mias(filasAnterior)) : null,
    },
    porLinea: Object.fromEntries(lineas.map((l) => [l, {
      actual: totalesDe(filasActual.filter((f) => f.linea === l)),
      anterior: ventanas.anterior ? totalesDe(filasAnterior.filter((f) => f.linea === l)) : null,
    }])),
    // El gasto que no entra en ningún total porque su campaña no tiene marca asignada.
    sinLinea: {
      actual: totalesDe(huerfanas(filasActual)).gasto,
      anterior: ventanas.anterior ? totalesDe(huerfanas(filasAnterior)).gasto : null,
    },
    serie: serieDe(mias(campanias), ventanas),
  }
}

/**
 * Un punto por día, de la ventana anterior a la actual, sin agujeros.
 *
 * Los días sin ninguna fila entran igual en cero: si se saltearan, dos días separados por una
 * semana muerta quedarían pegados y la línea dibujaría una continuidad que no existió.
 *
 * ⛔ **No lleva ratios.** Un ROAS de un día con dos compras es ruido, y una línea de ruido al lado
 * de un número serio invita a leer una tendencia donde no hay ninguna. Es la misma razón por la que
 * `sumarDias()` recalcula los ratios en vez de promediarlos.
 */
export function serieDe(filas, ventanas) {
  const fechas = [...diasDe(ventanas.anterior), ...diasDe(ventanas.actual)]
  const corte = ventanas.actual ? ventanas.actual.desde : null
  const porFecha = new Map(fechas.map((f) => [f, { fecha: f, gasto: 0, revenue: 0, compras: 0, tramo: corte && f >= corte ? 'actual' : 'anterior' }]))
  for (const f of filas) {
    const p = porFecha.get(f.fecha)
    if (!p) continue
    p.gasto += Number(f.spend) || 0
    p.revenue += Number(f.revenue) || 0
    p.compras += Number(f.compras) || 0
  }
  return [...porFecha.values()]
}

/** Hoy, en día local. La foto se escribe con el mismo criterio. */
export function hoyIso() {
  return isoDia(new Date())
}
