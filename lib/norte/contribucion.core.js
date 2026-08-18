/**
 * La **contribución por canal**: cuánta plata deja de verdad cada unidad que sale.
 *
 * # De dónde sale esta cascada — y por qué no se inventó una
 *
 * El dashboard (`areben-dashboard`) ya tiene una, **verificada contra el P&L real de Gestión
 * Nube**, y está en `scripts/sync-ventas-gn.mjs`. Portarla es más barato y más honesto que escribir
 * la segunda versión de la misma pregunta, que es la forma conocida de tener dos números:
 *
 *     ventas (con IVA)
 *     − descuentos
 *     + envíos            lo COBRADO al cliente, que es un ingreso
 *     − IVA débito        21% (÷1,21) SÓLO si la cuenta de cobro es de Areben
 *     = ventas netas
 *     − CMV               `total_cost`
 *     − comisiones        % por medio de pago
 *     − costo de envíos   default = el envío cobrado (netea contra el ingreso de arriba)
 *     = contribución
 *
 * # 🔴 Las DOS mitades del dashboard no calculan igual, y acá se eligió una
 *
 * `sync-ventas-gn.mjs` (el P&L mensual) le saca el IVA **sólo a la mercadería** y suma el envío y
 * resta el descuento después. `sync-analitica-gn.mjs` (el que llena `ventas_gn_agg`, que es el que
 * tiene el canal) se lo saca a **mercadería − descuento + envío**. Con descuento y envío en cero
 * dan lo mismo; con la Tienda Nube de julio-2026 difieren **$4.426 sobre $243.650, un 2%**.
 *
 * Acá va la del analítico, por dos razones: es la que reproduce los datos que están guardados —y
 * por lo tanto la que se puede cotejar—, y es la que respeta que el envío facturado también paga
 * IVA y que el descuento baja la base imponible. ⚠️ **No se tocó el dashboard**: cuál de las dos
 * queda es una decisión de ese repo.
 *
 * # 🔑 El IVA no lo decide el canal ni el medio de pago: lo decide la CUENTA DE COBRO
 *
 * `account_display` dice por dónde entró la plata, y el dashboard clasifica cada cuenta en
 * `cuentas_cobro_gn` (`areben` = facturable; `propia` y `efectivo`, no). Medido el 18-ago-2026:
 * las ventas mayoristas de BDI entran por «Transferencia Mayorista» y «Sin cobro» ⇒ **no llevan
 * IVA**, y sus netas son iguales a las brutas. Deducir el IVA del canal —«mayorista factura»— daba
 * un número 21% más bajo con cara de estar bien.
 *
 * ⇒ Por eso una venta **cuya cuenta no se puede clasificar queda AFUERA del cálculo** y se cuenta
 * aparte. No hay default barato: asumirle "no facturable" sube la contribución 21%, y asumirle
 * "facturable" la baja. Las dos mienten hacia algún lado, y la pantalla no tendría cómo saberlo.
 *
 * # Por qué acá no hay que prorratear nada, y en el dashboard sí
 *
 * El dashboard reparte cada venta entre marcas (una venta de Zattia puede llevar una funda
 * Stunned), y por eso multiplica todo por el peso de cada línea. Acá el eje es el **canal**, que es
 * una propiedad de la venta entera: todas sus líneas caen en el mismo canal. `total_cost` viene por
 * venta y se suma tal cual — sin repartir, que es donde el dashboard tiene que tener cuidado.
 *
 * `.js` plano: lo importa `api/_norte.js`, que corre en Node sin pasar por el compilador de Next.
 * Puro y sin reloj: la ventana entra por parámetro.
 */

import { canalDe } from '../liquidacion/canal.core.js'

/** El tipo de cuenta de cobro que factura. El resto (`propia`, `efectivo`) no lleva IVA. */
export const TIPO_FACTURABLE = 'areben'

/** La alícuota, en el único lugar donde vive. */
export const IVA = 0.21

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const limpio = (s) => String(s ?? '').trim()

/**
 * La ventana de medición: los últimos `dias` días **terminando en el último día con venta**, no en
 * hoy.
 *
 * ⚠️ El día en curso está a medio hacer: meterlo baja el promedio sin que haya pasado nada. Es la
 * misma trampa que ya está documentada en `scripts/medir-economia-bdi.mjs`, y la razón de que esto
 * viva acá es que **la pantalla y el handler tienen que usar la MISMA ventana**: si el ritmo sale
 * de una y la contribución de otra, la multiplicación de las dos es un número que no existe.
 *
 * @returns `{ desde, hasta }` o `null` si no hay ni una fecha usable.
 */
export function ventanaUltimos(fechas, dias = 30) {
  const validas = (fechas || []).map((f) => limpio(f).slice(0, 10)).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f))
  if (!validas.length) return null
  const hasta = validas.reduce((a, b) => (a > b ? a : b))
  const ms = Date.parse(hasta + 'T00:00:00Z') - (dias - 1) * 86400000
  return { desde: new Date(ms).toISOString().slice(0, 10), hasta, dias }
}

/**
 * Una fila vacía de la cascada. Los nombres son los del dashboard a propósito: cuando los dos
 * números no coincidan, que se pueda cotejar renglón contra renglón.
 */
function vacio(canal) {
  return {
    canal,
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
    contribucion: 0,
    contribUnidad: 0,
  }
}

/**
 * Las unidades y la mercadería de cada venta, sumadas de sus renglones.
 *
 * Se acumulan de una pasada para no recorrer los detalles una vez por venta.
 */
export function mercaderiaPorVenta(detalles) {
  const porVenta = new Map()
  for (const d of detalles || []) {
    const k = String(d.sale_id)
    const a = porVenta.get(k) || { unidades: 0, mercaderia: 0 }
    a.unidades += num(d.quantity)
    a.mercaderia += num(d.total)
    porVenta.set(k, a)
  }
  return porVenta
}

/**
 * **El filtro**: qué ventas de la ventana entran al cálculo y cuáles no, con el motivo contado.
 *
 * 🔑 Vive acá y no adentro de `contribucionPorCanal` porque **la regla es una sola y tiene que
 * seguir siendo una sola**. El día que se agregue un motivo de exclusión —o que cambie el criterio
 * de "sin CMV"—, un segundo recorrido escrito en otro archivo lo aplicaría distinto y las dos
 * pantallas dirían números que no se pueden cotejar. Es exactamente lo que ya pasó con `canalDe`,
 * que llegó a tener tres copias.
 *
 * @returns `{ usables, cobertura }` — `usables` trae la venta ya resuelta contra las reglas del
 *          dashboard (`tipo` de cuenta y `pct` de comisión), lista para la cascada.
 *
 * ⚠️ `cobertura.usadas` cuenta las que **pasaron el filtro**, que no es lo mismo que las que el
 * llamador pudo usar: quien agrupe por algo que una venta no tenga (una línea, por ejemplo) tiene
 * que descontarlas y decirlo con su propio contador.
 */
export function ventasUsables({ ventas, cuentas, comisiones, desde, hasta }) {
  const tipoDe = new Map(Object.entries(cuentas || {}).map(([k, v]) => [limpio(k), limpio(v)]))
  const pctDe = (medio) => num((comisiones || {})[limpio(medio)]) / 100

  const usables = []
  const cobertura = {
    ventas: 0,
    usadas: 0,
    sinCuenta: 0,
    sinCosto: 0,
    /** Cuentas de cobro que el dashboard no tiene clasificadas. Se nombran: es un dato que falta cargar. */
    cuentasDesconocidas: [],
    /** `false` cuando ninguna comisión tiene porcentaje cargado — la contribución no las descuenta. */
    comisionesCargadas: Object.values(comisiones || {}).some((p) => num(p) > 0),
  }
  const desconocidas = new Set()

  for (const v of ventas || []) {
    const fecha = limpio(v.date_sale).slice(0, 10)
    if (!fecha || fecha < desde || fecha > hasta) continue
    cobertura.ventas++

    const cuenta = limpio(v.account_display)
    const tipo = tipoDe.get(cuenta)
    if (!cuenta || !tipo) {
      cobertura.sinCuenta++
      if (cuenta) desconocidas.add(cuenta)
      continue
    }
    // 🔴 Sin CMV la contribución sale INFLADA, que es el lado caro: se ve un canal que deja más de
    // lo que deja. Queda afuera y se cuenta, igual que la cuenta sin clasificar.
    if (v.total_cost === null || v.total_cost === undefined || v.total_cost === '') {
      cobertura.sinCosto++
      continue
    }

    usables.push({ venta: v, tipo, pct: pctDe(v.payment_method) })
    cobertura.usadas++
  }

  cobertura.cuentasDesconocidas = [...desconocidas].sort()
  return { usables, cobertura }
}

/**
 * **La cascada de UNA venta**, en pesos y renglón por renglón.
 *
 * 🔑 **Es el único lugar donde está escrita la cascada**, y por eso la exporta: el P&L por línea
 * reparte estos mismos renglones entre las líneas de la venta en vez de calcular los suyos. Dos
 * implementaciones de esta cuenta es la forma conocida de tener dos números para la misma
 * pregunta — que es de lo que Norte salió a rescatar al negocio.
 *
 * @param mercaderia  el facturado de la venta (o de la parte que se está mirando), sin IVA sacado
 * @param tipo        el tipo de cuenta de cobro del dashboard: sólo `areben` factura
 * @param pct         la comisión del medio de pago, ya en tanto por uno
 */
export function cascadaDeVenta({ venta, mercaderia, tipo, pct }) {
  const descuento = num(venta.discount)
  const envio = num(venta.shipping_cost)
  // La base imponible es lo que se facturó: mercadería, menos el descuento, más el envío.
  const base = mercaderia - descuento + envio
  const iva = tipo === TIPO_FACTURABLE ? (base * IVA) / (1 + IVA) : 0
  // La comisión se cobra sobre lo que el cliente pagó de verdad —con IVA, con el envío adentro y
  // ya descontado el descuento—, igual que en el dashboard.
  const comision = base * pct
  return {
    mercaderia,
    iva,
    envios: envio,
    descuentos: descuento,
    netas: base - iva,
    cmv: num(venta.total_cost),
    comisiones: comision,
    // El costo real del envío no lo expone GN por API. El dashboard usa por default lo cobrado —o
    // sea, netea a cero— y deja pisarlo a mano por mes. Acá se usa el mismo default y NO el
    // override, que es mensual y esta ventana es móvil.
    costoEnvios: envio,
  }
}

/**
 * La contribución de cada canal en una ventana.
 *
 * @param ventas    filas de `ventas`: `id, date_sale, channel, payment_method, account_display,
 *                  discount, shipping_cost, total_cost`
 * @param detalles  filas de `venta_detalles`: `sale_id, quantity, total`
 * @param cuentas   `{ [nombre de la cuenta de cobro]: 'areben' | 'propia' | 'efectivo' }` — del
 *                  dashboard, NO de una copia local
 * @param comisiones `{ [medio de pago]: porcentaje }` sobre el total cobrado con IVA
 * @param desde/hasta  ISO inclusive, contra la fecha REAL de cada venta
 *
 * @returns `{ canales, cobertura }` — `cobertura` es la mitad que hace que el número se pueda
 *          creer: dice cuántas ventas quedaron afuera y por qué.
 */
export function contribucionPorCanal({ ventas, detalles, cuentas, comisiones, desde, hasta }) {
  const porVenta = mercaderiaPorVenta(detalles)
  const { usables, cobertura } = ventasUsables({ ventas, cuentas, comisiones, desde, hasta })

  const acc = new Map()

  for (const { venta: v, tipo, pct } of usables) {
    // 🔑 El canal es una propiedad de la venta ENTERA: todas sus líneas caen en el mismo canal, y
    // por eso acá no hay nada que prorratear. El P&L por línea sí tiene que hacerlo.
    const canal = canalDe(v.channel)
    const a = acc.get(canal) || vacio(canal)
    const linea = porVenta.get(String(v.id)) || { unidades: 0, mercaderia: 0 }
    const c = cascadaDeVenta({ venta: v, mercaderia: linea.mercaderia, tipo, pct })

    a.ventas++
    a.unidades += linea.unidades
    a.mercaderia += c.mercaderia
    a.iva += c.iva
    a.envios += c.envios
    a.descuentos += c.descuentos
    a.netas += c.netas
    a.cmv += c.cmv
    a.comisiones += c.comisiones
    a.costoEnvios += c.costoEnvios

    acc.set(canal, a)
  }

  const canales = [...acc.values()].map((a) => ({
    ...a,
    contribucion: a.netas - a.cmv - a.comisiones - a.costoEnvios,
    // Sin unidades no es cero: es que no se puede dividir. El 0 se leería como "no deja nada".
    contribUnidad: a.unidades > 0 ? (a.netas - a.cmv - a.comisiones - a.costoEnvios) / a.unidades : null,
  }))
  canales.sort((x, y) => y.contribucion - x.contribucion)

  return { canales, cobertura }
}

/**
 * La contribución por unidad de cada canal, en la forma que pide `ritmoDeSalida` de `core.ts`.
 *
 * ⚠️ Un canal sin unidades queda **afuera del mapa** en vez de entrar con 0: `ritmoDeSalida` hace
 * `contribPorCanal[canal] ?? 0`, y ahí un 0 explícito y un dato que falta se ven igual. La
 * diferencia importa: uno dice "no deja plata" y el otro "no lo sabemos".
 */
export function porUnidad(canales) {
  const out = {}
  for (const c of canales || []) {
    if (c && c.contribUnidad !== null && c.contribUnidad !== undefined) out[c.canal] = c.contribUnidad
  }
  return out
}
