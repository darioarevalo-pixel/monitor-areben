/**
 * El **P&L «por arriba» por línea**: la misma cascada de plata, pero abierta por `bdi` · `zattia` ·
 * `stunned` en vez de por canal, y leída como un estado de resultados hasta la **contribución**.
 *
 * # Por qué existe, si ya está la contribución por canal
 *
 * Son dos preguntas distintas y las dos se hacen todas las semanas. **Por canal** contesta *por
 * dónde conviene sacar el stock* —mayorista deja $1.541 la funda y online $7.295—, que es una
 * decisión de venta. **Por línea** contesta *cuánto deja cada negocio*, que es la que hoy sólo se
 * puede mirar en el dashboard, y que es la que se cruza con `meta_ads_rentabilidad` (que ya guarda
 * la economía unitaria por línea) y con el memo (que ya reporta la venta por línea). El eje de
 * Norte es la línea: éste es el renglón de plata que le faltaba.
 *
 * ⛔ **Es «por arriba» y termina en la contribución.** No baja a los gastos fijos —$25-30M por mes
 * de estructura de las tres marcas— porque viven en el dashboard (`gastos`) y **no tienen
 * endpoint**. Un P&L que se corte donde se corta y lo diga es útil; uno que estime la estructura
 * para «completar» inventa el único número que decide si una línea da o no da.
 *
 * # 🔑 Acá SÍ hay que prorratear, y en la contribución por canal no
 *
 * El canal es una propiedad de la venta entera: todas las líneas de una venta caen en el mismo
 * canal y los renglones se suman tal cual. La **línea** no: una venta de Zattia puede llevar una
 * funda Stunned, y `venta_detalles` trae `quantity` y `total` **pero no trae costo por renglón**.
 * El CMV, el descuento, el envío y el IVA vienen por venta y hay que repartirlos.
 *
 * ⇒ Se reparte **por el peso de la mercadería de cada línea dentro de la venta**, que es el mismo
 * criterio con el que el dashboard reparte una venta entre marcas. La cascada **no se recalcula**:
 * se llama a `cascadaDeVenta` una vez por venta —el único lugar donde está escrita— y se parten sus
 * renglones. Que el peso sume 1 es lo que garantiza que el total por línea dé el mismo número que
 * el total por canal, y `tests/norte-pyl.test.ts` lo exige contra las cinco filas reales de julio.
 *
 * ⚠️ **Las `ventas` de una línea NO se pueden sumar entre líneas.** Una venta mixta es una venta
 * para cada una de las dos, igual que los tickets del memo: partir una venta en dos es inventar un
 * criterio. La plata sí se reparte bien, porque el peso suma 1. Por eso el total lo arma este
 * módulo y no la pantalla — sumar la columna daría más ventas de las que hubo.
 *
 * `.js` plano: lo importa `api/_norte.js`, que corre en Node sin pasar por el compilador de Next.
 * Puro y sin reloj: la ventana entra por parámetro.
 */

import { lineaDe } from '../memo/foto.core.js'
import { cascadaDeVenta, ventasUsables } from './contribucion.core.js'

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Una fila vacía del P&L. Los nombres son los de la cascada del dashboard, para poder cotejar. */
function vacio(linea) {
  return {
    linea,
    ventas: 0,
    unidades: 0,
    mercaderia: 0,
    iva: 0,
    envios: 0,
    descuentos: 0,
    netas: 0,
    cmv: 0,
    comisiones: 0,
    costoEnvios: 0,
  }
}

/**
 * Cómo se reparte una venta entre sus líneas.
 *
 * 🔑 **Son tres casos y ninguno es un default.** Lo normal es repartir por mercadería. Cuando la
 * venta facturó cero o negativo —pasa: un canje, una venta con 100% de descuento— dividir por ese
 * total daría pesos que no suman 1, o de signo cambiado, y el reparto saldría al revés con cara de
 * estar bien; ahí manda la **unidad**, que es un hecho por renglón. Y cuando no hay ni mercadería
 * ni unidades **no hay a qué línea atribuir la venta**: el llamador la deja afuera y la cuenta.
 *
 * @returns `'mercaderia' | 'unidades' | null`
 */
export function baseDeReparto({ mercaderia, unidades }) {
  if (mercaderia > 0) return 'mercaderia'
  if (unidades > 0) return 'unidades'
  return null
}

/**
 * El P&L por línea de una ventana.
 *
 * @param store     `'bdi' | 'zattia'` — de qué base salieron estas filas. Decide `lineaDe`.
 * @param ventas    filas de `ventas`, igual que la contribución por canal
 * @param detalles  filas de `venta_detalles`: `sale_id, product_id, quantity, total`
 * @param skuPor    Map `product_id` (string) → sku. Sólo hace falta en Zattia, que es donde vive
 *                  Stunned; en BDI va `null` y todo cae en `bdi`.
 * @param cuentas / comisiones  las reglas del dashboard, sin copiar
 * @param desde/hasta  ISO inclusive, contra la fecha REAL de cada venta
 *
 * @returns `{ lineas, total, cobertura }`
 */
export function pylPorLinea({ store, ventas, detalles, skuPor, cuentas, comisiones, desde, hasta }) {
  // Los renglones de cada venta, ya resueltos a línea. Una pasada sola por los detalles.
  const renglonesDe = new Map()
  for (const d of detalles || []) {
    const k = String(d.sale_id)
    const linea = lineaDe(store, skuPor && skuPor.get(String(d.product_id)))
    const porLinea = renglonesDe.get(k) || new Map()
    const a = porLinea.get(linea) || { linea, mercaderia: 0, unidades: 0 }
    a.mercaderia += num(d.total)
    a.unidades += num(d.quantity)
    porLinea.set(linea, a)
    renglonesDe.set(k, porLinea)
  }

  const { usables, cobertura: filtro } = ventasUsables({ ventas, cuentas, comisiones, desde, hasta })
  /**
   * La cobertura del filtro + las dos cifras propias de este corte.
   *
   * 🔑 **`sinRepartoContribucion` es lo que hace que las dos tablas se puedan atar.** Medido contra
   * producción el 18-ago-2026: en la ventana hay 6 ventas así en BDI y 8 en Zattia, y **no están
   * vacías** —cargan CMV negativo, o sea devoluciones—. La contribución por canal sí las cuenta.
   * Sin decir cuánta plata es, las dos tablas de la misma pantalla muestran totales distintos y no
   * hay con qué explicar la diferencia: un `6` no dice si son $5.000 o $5.000.000.
   */
  const cobertura = { ...filtro, sinReparto: 0, sinRepartoContribucion: 0 }

  const acc = new Map()
  let usadas = 0

  for (const { venta: v, tipo, pct } of usables) {
    const porLinea = [...(renglonesDe.get(String(v.id)) || new Map()).values()]
    const totales = porLinea.reduce(
      (t, r) => ({ mercaderia: t.mercaderia + r.mercaderia, unidades: t.unidades + r.unidades }),
      { mercaderia: 0, unidades: 0 },
    )
    const base = porLinea.length ? baseDeReparto(totales) : null
    // La cascada se calcula UNA vez, sobre la venta entera, con la mercadería de todos sus
    // renglones. Después se parte: los pesos suman 1, así que la suma de las líneas es la venta.
    const c = cascadaDeVenta({ venta: v, mercaderia: totales.mercaderia, tipo, pct })

    if (!base) {
      // 🔴 No se le inventa una línea ni se la manda a la más grande: eso movería plata real de un
      // negocio a otro. Queda afuera — pero se guarda **cuánta plata** era, porque el corte por
      // canal sí la cuenta y si no, los dos totales de la misma pantalla no cierran y nadie sabe
      // por qué.
      cobertura.sinReparto++
      cobertura.sinRepartoContribucion += c.netas - c.cmv - c.comisiones - c.costoEnvios
      continue
    }
    usadas++

    const divisor = base === 'mercaderia' ? totales.mercaderia : totales.unidades

    for (const r of porLinea) {
      const peso = (base === 'mercaderia' ? r.mercaderia : r.unidades) / divisor
      const a = acc.get(r.linea) || vacio(r.linea)
      a.ventas++
      a.unidades += r.unidades
      a.mercaderia += c.mercaderia * peso
      a.iva += c.iva * peso
      a.envios += c.envios * peso
      a.descuentos += c.descuentos * peso
      a.netas += c.netas * peso
      a.cmv += c.cmv * peso
      a.comisiones += c.comisiones * peso
      a.costoEnvios += c.costoEnvios * peso
      acc.set(r.linea, a)
    }
  }

  // ⚠️ `usadas` lo corrige este módulo: `ventasUsables` cuenta las que pasaron el filtro de cuenta
  // y costo, y acá se caen además las que no tienen línea. Dejar el número de arriba diría que se
  // calculó sobre ventas que no entraron.
  cobertura.usadas = usadas

  const lineas = [...acc.values()].map(cerrar)
  lineas.sort((x, y) => y.contribucion - x.contribucion)

  return { lineas, total: totalDe(lineas, usadas), cobertura }
}

/**
 * Los tres renglones que se derivan, y las dos divisiones que pueden no tener sentido.
 *
 * ⚠️ **Ni `contribUnidad` ni `pctContribucion` valen 0 cuando no se pueden calcular.** Sin unidades
 * no hay por qué dividir, y con netas en cero el porcentaje no existe: un `0%` se lee como «no deja
 * nada», que es una afirmación, y falsa.
 */
function cerrar(a) {
  const margenBruto = a.netas - a.cmv
  const contribucion = margenBruto - a.comisiones - a.costoEnvios
  return {
    ...a,
    margenBruto,
    contribucion,
    contribUnidad: a.unidades > 0 ? contribucion / a.unidades : null,
    pctContribucion: a.netas !== 0 ? contribucion / a.netas : null,
  }
}

/**
 * El total del P&L.
 *
 * 🔑 **Todo se suma menos `ventas`**, que viene contado aparte: una venta mixta está en dos líneas
 * y sumarlas daría más ventas de las que hubo. La plata sí se suma, porque los pesos del reparto
 * suman 1.
 */
function totalDe(lineas, usadas) {
  const t = vacio('total')
  for (const l of lineas) {
    t.unidades += l.unidades
    t.mercaderia += l.mercaderia
    t.iva += l.iva
    t.envios += l.envios
    t.descuentos += l.descuentos
    t.netas += l.netas
    t.cmv += l.cmv
    t.comisiones += l.comisiones
    t.costoEnvios += l.costoEnvios
  }
  t.ventas = usadas
  return cerrar(t)
}
