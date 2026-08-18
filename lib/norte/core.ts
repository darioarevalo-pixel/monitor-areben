/**
 * El motor de **Norte**: stock que entra contra el que sale, pagos que vienen, metas y su avance.
 *
 * Todo acá es **puro**: sin React, sin red, y sin `Date.now()` — la fecha de hoy entra siempre por
 * parámetro. No es purismo: es lo que permite que `tests/norte.test.ts` fije un día y compare
 * contra números medidos a mano. Una función que mira el reloj adentro no se puede testear contra
 * una medición del pasado.
 *
 * ## 🔑 El oráculo de este archivo
 *
 * Que los tests estén en verde **no alcanza**. La verificación real es que `entradaDiaria` y
 * `ritmoDeSalida` reproduzcan lo que se midió a mano el 17-ago-2026 sobre la ventana 6→16-ago:
 * **entran 479 fundas/día y salen 237,7**. Ese caso está clavado en el banco a propósito. Si
 * alguien cambia una fórmula y ese test se cae, la fórmula está mal — no el test.
 *
 * ## Lo que este archivo NO hace
 *
 * ⛔ No decide. Imprime la brecha y el semáforo; qué se hace con eso lo firma una persona. Es la
 * misma línea que `lib/meta-ads/rentabilidad.core.js`: el techo lo calcula el código, lo guarda
 * alguien.
 */

import { canalDe, type Canal } from '../liquidacion/resultado'
// La MISMA normalización que pinta el ✓ «ya está en GN» en Compras: dos pantallas que cruzan el
// mismo nombre no pueden hacerlo de dos maneras.
import { norm } from '../tncat/matching'
import type {
  AvanceMeta,
  BloqueImportacion,
  ContextoMedida,
  CostoBloque,
  EstadoCompra,
  ImportacionProyectada,
  Medicion,
  Meta,
  Pago,
  PuntoStock,
  RitmoCanal,
  Veredicto,
} from './tipos'

// ── Fechas ────────────────────────────────────────────────────────────────────
//
// Todo va en ISO `YYYY-MM-DD` y en UTC a propósito: una proyección a 90 días que cruza el cambio
// de hora se corre un día si se usa la zona local, y ese día se ve como un pago adelantado.

const DIA_MS = 86400000

/** `YYYY-MM-DD` → epoch ms (UTC). Devuelve `NaN` si la fecha no sirve. */
export function aMs(fecha: string): number {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NaN
  return Date.parse(fecha + 'T00:00:00Z')
}

/** epoch ms → `YYYY-MM-DD`. */
export function aISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Días enteros de `a` a `b`. Negativo si `b` es anterior. */
export function diasEntre(a: string, b: string): number {
  return Math.round((aMs(b) - aMs(a)) / DIA_MS)
}

/** `fecha` + `n` días, en ISO. */
export function sumarDias(fecha: string, n: number): string {
  return aISO(aMs(fecha) + n * DIA_MS)
}

/** ¿La fecha es un ISO usable? El KV guarda `''` cuando todavía no hay fecha estimada. */
export function fechaValida(fecha: string): boolean {
  return !Number.isNaN(aMs(fecha))
}

// ── El ritmo de salida ────────────────────────────────────────────────────────

/** Una venta, reducida a lo único que Norte necesita de ella. */
export type FilaVenta = { canal: string | null; unidades: number }

/**
 * Fundas por día que salen, abierto por canal.
 *
 * ⚠️ **`ventas.store` NO es la marca** («Local», «Depósito Minorista» son sucursales). La marca es
 * contra qué base se consultó, y por eso no aparece acá: quien llama ya eligió la base. Esta
 * trampa costó una conclusión errada el 17-ago.
 *
 * `contribPorCanal` viene de la economía unitaria (`meta_ads_rentabilidad` por línea). Un canal sin
 * contribución cargada suma unidades y aporta 0 — se ve en pantalla que falta el dato, en vez de
 * inventarle un margen.
 */
export function ritmoDeSalida(
  ventas: FilaVenta[],
  dias: number,
  contribPorCanal: Partial<Record<Canal, number>>,
): RitmoCanal[] {
  if (dias <= 0) return []
  // 🔑 Las unidades y las COMPRAS se cuentan en la misma pasada, sobre las mismas filas: una fila
  // es una venta. Contar las compras por otro lado daría dos poblaciones para la misma pantalla.
  // ⚠️ Una venta de 0 unidades (una devolución, o una que factura cero) igual es una fila: suma
  // como compra y no como funda. Es a propósito — son dos preguntas distintas.
  const acc = new Map<Canal, { unidades: number; ventas: number }>()
  for (const v of ventas) {
    const c = canalDe(v.canal)
    const a = acc.get(c) || { unidades: 0, ventas: 0 }
    a.unidades += Number(v.unidades) || 0
    a.ventas += 1
    acc.set(c, a)
  }
  return [...acc.entries()]
    .map(([canal, { unidades, ventas: cuantas }]) => {
      const unidadesDia = unidades / dias
      const contribUnidad = contribPorCanal[canal] ?? 0
      return { canal, unidadesDia, ventasDia: cuantas / dias, contribUnidad, contribDia: unidadesDia * contribUnidad }
    })
    .sort((a, b) => b.unidadesDia - a.unidadesDia)
}

/** El total de fundas por día que salen, sumando todos los canales. */
export function salidaDiaria(ritmo: RitmoCanal[]): number {
  return ritmo.reduce((a, r) => a + r.unidadesDia, 0)
}

/** El total de compras por día, sumando todos los canales. */
export function ventasDiarias(ritmo: RitmoCanal[]): number {
  return ritmo.reduce((a, r) => a + r.ventasDia, 0)
}

/** La contribución por día, sumando todos los canales. */
export function contribucionDiaria(ritmo: RitmoCanal[]): number {
  return ritmo.reduce((a, r) => a + r.contribDia, 0)
}

// ── El ritmo de entrada ───────────────────────────────────────────────────────

/**
 * Fundas por día que **entran** en una ventana.
 *
 * 🔑 Cuenta sólo lo que llega **dentro** de `[desde, hasta]` y que **todavía no arribó**: una
 * importación ya arribada no vuelve a entrar, su stock ya está contado en el depósito.
 *
 * Es la mitad que faltaba del análisis del 17-ago. Mirando de a un lote todo cerraba; el problema
 * apareció al sumar los tres que venían.
 */
export function entradaDiaria(imps: ImportacionProyectada[], desde: string, hasta: string): number {
  const dias = diasEntre(desde, hasta)
  if (dias <= 0) return 0
  const unidades = imps
    .filter((i) => !i.arribada && fechaValida(i.llega) && i.llega >= desde && i.llega <= hasta)
    .reduce((a, i) => a + i.unidades, 0)
  return unidades / dias
}

// ── La proyección de stock ────────────────────────────────────────────────────

/**
 * El stock día a día: arranca en `stockInicial`, suma cada importación el día que llega y resta
 * el ritmo de salida.
 *
 * ⚠️ **El stock nunca baja de cero**, y eso es a propósito: si se agota, lo que falta no se vende
 * (no hay mercadería), no se debe. Dejarlo negativo dibujaría una venta que no puede ocurrir.
 */
export function proyectarStock(args: {
  stockInicial: number
  desde: string
  hasta: string
  importaciones: ImportacionProyectada[]
  salidaDia: number
}): PuntoStock[] {
  const { stockInicial, desde, hasta, importaciones, salidaDia } = args
  const total = diasEntre(desde, hasta)
  if (total < 0) return []

  const entradas = new Map<string, number>()
  for (const i of importaciones) {
    if (i.arribada || !fechaValida(i.llega)) continue
    entradas.set(i.llega, (entradas.get(i.llega) || 0) + i.unidades)
  }

  const puntos: PuntoStock[] = []
  let stock = stockInicial
  for (let d = 0; d <= total; d++) {
    const fecha = sumarDias(desde, d)
    const entra = entradas.get(fecha) || 0
    stock += entra
    const sale = Math.min(stock, salidaDia)
    stock -= sale
    puntos.push({ fecha, entra, sale, stock })
  }
  return puntos
}

/**
 * **Lo que ya ingresó por importaciones**, que es con lo que arranca la proyección.
 *
 * ⛔ **No es el stock del depósito**, y es a propósito. Lo decidió Bruno: la sección contesta «de lo
 * que traje, ¿sale a tiempo para pagarlo?», así que el punto de partida es **la importación y su
 * éxito**, no cuánto inventario hay parado. El depósito tiene además mercadería vieja y productos
 * que no son fundas, y meterla acá contestaría otra pregunta con el mismo número.
 *
 * 🔴 Antes esto era un **`stockInicial: 0` escrito fijo en la pantalla**, y la proyección sólo
 * contaba lo que **todavía no había llegado**. Estuvo enmascarado mientras una importación ya
 * arribada seguía figurando «en tránsito» —le inyectaba sus unidades el primer día—; en cuanto se
 * la marcó, la pantalla pasó a decir que **el depósito quedaba vacío HOY**, con 35.157 unidades
 * adentro.
 *
 * 🔑 **Las unidades salen de `unidadesDe`**, la misma que usa el costeo: las **facturadas** cuando
 * están cargadas, las del pedido cuando no. Escribir acá una segunda regla haría que el stock y la
 * deuda cuenten distinto la misma importación.
 *
 * ⚠️ **Cuenta lo ingresado entero, sin descontar lo vendido desde que llegó.** Para una compra que
 * arribó hace semanas eso sobreestima el arranque, y ese descuento es una decisión aparte.
 */
export function stockArribado(imps: ImportacionProyectada[]): number {
  return imps
    .filter((i) => i.arribada)
    .reduce((a, i) => {
      const bloques = i.bloques ?? []
      if (!bloques.length) return a + (Number(i.unidades) || 0)
      const porBloque = new Map((i.condiciones?.costos ?? []).map((x) => [x.bloqueId, x]))
      return a + bloques.reduce((b, x) => b + unidadesDe(x, porBloque.get(x.id)), 0)
    }, 0)
}

/**
 * **Desde cuándo hay que contar lo vendido** para saber qué queda de lo importado: el ingreso **más
 * viejo** entre las importaciones que ya llegaron. `null` si todavía no llegó ninguna.
 *
 * 🔑 **Es UNA fecha para todas, y ésa es la razón de que exista esta función.** Lo arribado es un
 * pozo común: no se puede saber de qué importación salió cada funda. Restarle a cada una «lo
 * vendido desde SU llegada» contaría dos veces las ventas del período en que se solapan — con dos
 * compras arribadas, el descuento saldría casi el doble del real y el stock, de menos.
 *
 * Prefiere la **fecha de ingreso real** (la que se firma con el tilde) sobre `llega`, que es la
 * estimada: en la IMPORTACION 1 son el 3-ago y el 27-jul, y contar desde la estimada descontaría
 * una semana de ventas que todavía no tenían esa mercadería.
 */
export function desdeElPrimerIngreso(imps: ImportacionProyectada[]): string | null {
  const fechas = imps
    .filter((i) => i.arribada)
    .map((i) => {
      const real = i.condiciones?.fechaIngreso
      return real && fechaValida(real) ? real : i.llega
    })
    .filter((f) => fechaValida(f))
  if (!fechas.length) return null
  return fechas.reduce((a, f) => (f < a ? f : a))
}

/**
 * **Los nombres de los diseños que ya ingresaron**, sin repetidos y normalizados.
 *
 * 🔑 Es la lista contra la que se pregunta «¿esta venta salió de lo que importamos?». Sale de las
 * arribadas nomás: un diseño que todavía no llegó no pudo venderse de esta compra.
 */
export function disenosArribados(imps: ImportacionProyectada[]): string[] {
  const out = new Set<string>()
  for (const i of imps) {
    if (!i.arribada) continue
    for (const b of i.bloques ?? []) for (const d of b.disenos ?? []) {
      const k = norm(d)
      if (k) out.add(k)
    }
  }
  return [...out]
}

/**
 * **Cuántas de las unidades vendidas salieron de lo importado**, y con qué cobertura se midió.
 *
 * 🔴 **El defecto que esto corrige llegó a producción el 18-ago-2026**: se descontaba *toda* la
 * venta de la marca. Sobre la IMPORTACION 1 eso daba **4.914** unidades cuando las de esa compra
 * eran **2.873** — el resto era mayorista de stock viejo, otros diseños y productos que ni son
 * fundas. El stock remanente salía 2.041 unidades **más bajo** que el real, o sea hacia el lado que
 * tranquiliza.
 *
 * 🔑 **`cruzados` viaja con el número y la pantalla lo dice.** Lo que no esté cargado en la grilla
 * del ingreso no se puede contar, y ese faltante **descuenta de menos en silencio**: el mismo día
 * se midió que Sam Case y Velvet Case no estaban en el KV y eran 352 de esas 2.873.
 */
export function vendidoDeLoImportado(args: {
  disenos: readonly string[]
  /** Los productos del espejo de GN: `{id, name}` alcanza. */
  productos: readonly { id: string; name: string }[]
  /** Un renglón por línea de venta, ya filtrado por fecha. */
  detalles: readonly { product_id: number | string | null; quantity: number | null }[]
}): { unidades: number; cruzados: number } {
  const buscados = new Set(args.disenos.map((d) => norm(d)).filter(Boolean))
  if (!buscados.size) return { unidades: 0, cruzados: 0 }

  // ⛔ El cruce es EXACTO normalizado, no «contiene»: con `like '%lucky case%'` entra también
  // «LUCKY CASE MAYORISTA», que es un producto viejo y de otra compra. Mismo criterio que el ✓ de
  // Compras → Ingresos proyectados, y por eso comparten `norm`.
  const ids = new Set<string>()
  const vistos = new Set<string>()
  for (const p of args.productos) {
    const k = norm(p.name)
    if (!buscados.has(k)) continue
    // 🔑 TODOS los productos con ese nombre, no el primero: en GN el mismo diseño puede tener dos
    // fichas —una vieja y una nueva— y quedarse con una sola perdería sus ventas enteras.
    ids.add(String(p.id))
    vistos.add(k)
  }
  const unidades = args.detalles.reduce(
    (a, d) => a + (ids.has(String(d.product_id)) ? Number(d.quantity) || 0 : 0),
    0,
  )
  return { unidades, cruzados: vistos.size }
}

/**
 * **Lo que queda de lo importado**: lo que entró, menos lo que se vendió desde que empezó a entrar.
 *
 * ⚠️ **Nunca negativo.** Si se vendió más de lo que trajeron las importaciones cargadas, lo que
 * sobra salió de mercadería anterior que esta sección no conoce: el remanente de lo importado es
 * **cero**, no un número en rojo que se restaría de lo que está por llegar.
 */
export function stockDeLoImportado(imps: ImportacionProyectada[], vendidasDesdeElPrimerIngreso: number): number {
  return Math.max(0, stockArribado(imps) - Math.max(0, vendidasDesdeElPrimerIngreso))
}

/** El primer día en que el stock queda en cero. `null` si no se agota en la ventana. */
export function diaDeAgotamiento(puntos: PuntoStock[]): string | null {
  const p = puntos.find((x) => x.stock <= 0)
  return p ? p.fecha : null
}

// ── La economía de una compra ─────────────────────────────────────────────────
//
// 🔑 **Una compra sube de peldaño con cada dato que se carga, y el número no empeora al subir.**
// Ésa es toda la idea de esta parte: mientras falta el costo de un material no se totaliza nada
// (un total sobre los bloques cargados sería una deuda MÁS CHICA que la real, con cara de
// completa); con todo costeado se proyecta contra la llegada estimada; con el ingreso confirmado
// se proyecta contra su fecha real; y recién con la factura el vencimiento es deuda.

/** Las unidades que se le facturan a un bloque: las suyas, salvo que la factura diga otra cosa. */
function unidadesDe(bloque: BloqueImportacion, costo: CostoBloque | undefined): number {
  return costo && costo.unidades !== null && costo.unidades !== undefined ? costo.unidades : bloque.unidades
}

/** Nombra bloques para un mensaje, sin dejar el caso del bloque sin nombre en blanco. */
function nombrar(bs: { nombre: string }[]): string {
  return bs.map((b) => b.nombre.trim() || 'sin nombre').join(', ')
}

/**
 * En qué peldaño está la economía de una compra, qué le falta para subir, y cuánto suma.
 *
 * 🔑 **El costo va por bloque —por material— y no se promedia.** Una importación trae IMD,
 * encapsuladas y transparentes juntas, con precios distintos. Un promedio ponderado da el mismo
 * total y miente en cada línea.
 *
 * ⚠️ **Los huérfanos no se descuentan en silencio**: un costo cuyo bloque ya no está en el ingreso
 * no tiene unidades con qué multiplicarse. Se nombra y se deja afuera del total, porque el caso
 * real es que alguien borró un bloque en Ingresos y esa plata quedó sin material.
 */
export function estadoDeCompra(imp: ImportacionProyectada): EstadoCompra {
  const c = imp.condiciones
  const costos = c?.costos ?? []
  const porBloque = new Map(costos.map((x) => [x.bloqueId, x]))
  const bloques = imp.bloques ?? []

  const conCosto = (b: BloqueImportacion) => {
    const x = porBloque.get(b.id)
    return x && x.costo > 0 ? x : undefined
  }
  const sinCosto = bloques.filter((b) => !conCosto(b))
  const huerfanos = costos.filter((x) => !bloques.some((b) => b.id === x.bloqueId))

  let total = 0
  let unidades = 0
  for (const b of bloques) {
    const x = conCosto(b)
    if (!x) continue
    const u = unidadesDe(b, x)
    unidades += u
    total += u * x.costo
  }

  const base = {
    total,
    moneda: c?.moneda ?? ('USD' as const),
    unidades,
    sinCosto,
    huerfanos,
  }
  const incompleta = (falta: string): EstadoCompra => ({
    ...base,
    peldano: 'incompleta',
    falta,
    total: 0,
    desde: '',
    base: 'llegada',
  })

  if (!bloques.length) return incompleta('los materiales de la importación, que se cargan en Ingresos proyectados')
  if (!c) return incompleta('el costo de cada material')
  if (sinCosto.length) {
    return incompleta(
      sinCosto.length === bloques.length
        ? 'el costo de cada material'
        : `el costo de ${nombrar(sinCosto)}`,
    )
  }
  if (!c.cuotas?.length) return incompleta('las cuotas del proveedor')

  // De acá para abajo la plata está completa: lo único que decide el peldaño es CONTRA QUÉ FECHA
  // se cuentan los plazos. Cada rama nombra su fecha; ninguna cae por descarte.
  if (c.confirmado && fechaValida(c.fechaIngreso)) {
    if (fechaValida(c.fechaFactura)) {
      return { ...base, peldano: 'firme', falta: null, desde: c.fechaFactura, base: 'factura' }
    }
    return {
      ...base,
      peldano: 'confirmada',
      falta: 'la fecha de la factura, que es desde donde cuentan los plazos de verdad',
      desde: c.fechaIngreso,
      base: 'ingreso',
    }
  }
  if (!fechaValida(imp.llega)) {
    return incompleta('una fecha de llegada en Ingresos proyectados, o el ingreso confirmado con su fecha')
  }
  return {
    ...base,
    peldano: 'estimada',
    falta: c.confirmado ? 'la fecha de ingreso real' : 'confirmar el ingreso y su fecha',
    desde: imp.llega,
    base: 'llegada',
  }
}

// ── El calendario de pagos ────────────────────────────────────────────────────

/**
 * Los vencimientos de **una** compra, firmes o estimados, con la fecha de cada cuota resuelta.
 *
 * 🔑 **La cuenta se escribe UNA vez para los dos.** El estimativo y la deuda son el mismo reparto
 * sobre la misma fecha base; lo único que cambia es de dónde sale esa fecha. Escribir el
 * estimativo aparte sería dos cuentas del mismo pago, y se separan el día que alguien toca una.
 *
 * 🔑 **Los plazos cuentan desde la FACTURA, no desde la llegada.** El 17-ago se leyó «30 y 60»
 * contra la fecha de arribo y dio una cuota vencida que no existía; con la fecha de factura
 * correcta la misma compra estaba al día. Un mes de diferencia da vuelta la conclusión.
 */
export function pagosDe(imp: ImportacionProyectada): Pago[] {
  const estado = estadoDeCompra(imp)
  if (estado.peldano === 'incompleta') return []
  const cuotas = imp.condiciones?.cuotas ?? []
  // ⛔ La cotización es de ESTA compra y no un parámetro global: los cheques de cada importación se
  // emiten un día distinto y a un cambio distinto. Pasarla desde afuera pesificaría todas igual.
  const cotizacion = imp.condiciones?.cotizacion ?? null
  return cuotas.map((cuota, i) => {
    const monto = estado.total * (cuota.pct / 100)
    // La fecha pactada gana; `dias` es el default. Ver el docblock de `Cuota`.
    // 🔑 Y se dice CUÁL de las dos fue: una calculada se va a mover, una pactada no, y la pantalla
    // no lo puede deducir de `base` —que existe igual, pero para la pactada no se usó—.
    const fechaPactada = cuota.fecha && fechaValida(cuota.fecha) ? cuota.fecha : null
    return {
      fecha: fechaPactada ?? sumarDias(estado.desde, cuota.dias),
      pactada: fechaPactada !== null,
      importacionId: imp.id,
      etiqueta: `${imp.desc || 'Importación'} · cuota ${i + 1} de ${cuotas.length}`,
      monto,
      moneda: estado.moneda,
      // 🔑 En USD el peso sale del cambio al que se emitieron los cheques, no de una simulación:
      // sin ese dato queda `null` y la pantalla lo dice. Si ya es ARS, el monto ES el peso.
      montoPesos: estado.moneda === 'USD' ? (cotizacion === null ? null : monto * cotizacion) : monto,
      firme: estado.peldano === 'firme',
      base: estado.base,
    }
  })
}

/**
 * **La deuda**: las cuotas de las compras firmes —costeadas, con el ingreso confirmado y con
 * factura—, ordenadas por fecha.
 *
 * ⚠️ **Lo que no está firme NO aparece acá**, y quien dibuja tiene que decirlo. Una proyección
 * mezclada con la deuda se lee como deuda: el total del mes diría que hay que pagar plata que
 * todavía nadie facturó.
 */
export function calendarioDePagos(imps: ImportacionProyectada[]): Pago[] {
  return imps
    .flatMap((imp) => pagosDe(imp))
    .filter((p) => p.firme)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/**
 * **El estimativo**: las mismas cuotas, de las compras que todavía no son deuda.
 *
 * Cada pago dice contra qué fecha se estimó (`base`), porque un vencimiento sin eso se lee igual
 * que uno pactado.
 */
export function pagosEstimados(imps: ImportacionProyectada[]): Pago[] {
  return imps
    .flatMap((imp) => pagosDe(imp))
    .filter((p) => !p.firme)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Las compras que no se pueden ni estimar, con lo que le falta a cada una. */
export function sinCondiciones(imps: ImportacionProyectada[]): { imp: ImportacionProyectada; falta: string }[] {
  return imps
    .map((imp) => ({ imp, estado: estadoDeCompra(imp) }))
    .filter(({ estado }) => estado.peldano === 'incompleta')
    .map(({ imp, estado }) => ({ imp, falta: estado.falta || 'datos' }))
}

/**
 * Para cada pago, cuánta contribución acumuló el negocio hasta esa fecha.
 *
 * ⚠️ **Cobertura no es caja disponible.** Esa contribución es la misma con la que se paga la
 * estructura: que un pago esté «cubierto 1,8×» dice que el negocio genera lo suficiente, no que la
 * plata esté en la cuenta. La pantalla tiene que decirlo — si no, el número se lee como un permiso.
 */
export function coberturaDePagos(
  pagos: Pago[],
  desde: string,
  contribDia: number,
): { pago: Pago; contribAcumulada: number; cobertura: number | null }[] {
  let acumDeuda = 0
  // 🔑 Un solo pago sin pesificar **rompe la cuenta de ahí en adelante**, no sólo la suya: la
  // cobertura es acumulada, y saltearlo daría una deuda MÁS CHICA que la real con cara de completa.
  // Se corta y se dice, en vez de mostrar un número que tranquiliza de más.
  let hayHueco = false
  return pagos.map((pago) => {
    if (pago.montoPesos === null) hayHueco = true
    else acumDeuda += pago.montoPesos
    const dias = Math.max(0, diasEntre(desde, pago.fecha))
    const contribAcumulada = dias * contribDia
    if (hayHueco) return { pago, contribAcumulada, cobertura: null }
    return { pago, contribAcumulada, cobertura: acumDeuda > 0 ? contribAcumulada / acumDeuda : Infinity }
  })
}

// ── El veredicto ──────────────────────────────────────────────────────────────

/** Debajo de esto la brecha se considera empate: entra y sale lo mismo, sin margen. */
const MARGEN_AJUSTADO = 0.1

/**
 * El semáforo y la frase de arriba de todo.
 *
 * El titular se arma acá y no en el componente **a propósito**: es el resultado del cálculo, y así
 * el test puede fijarlo. Una frase armada en el JSX se cambia sin que nada se ponga en rojo.
 */
export function veredicto(entranDia: number, salenDia: number): Veredicto {
  const brechaDia = entranDia - salenDia
  const n = (x: number) => Math.round(x).toLocaleString('es-AR')

  if (entranDia <= 0 || salenDia <= 0) {
    return {
      estado: 'sin-datos',
      entranDia,
      salenDia,
      brechaDia,
      titular: entranDia <= 0 ? 'No hay importaciones con fecha en la ventana' : 'No hay ventas para medir el ritmo',
    }
  }
  if (brechaDia > entranDia * MARGEN_AJUSTADO) {
    return {
      estado: 'no-llega',
      entranDia,
      salenDia,
      brechaDia,
      titular: `Entran ${n(entranDia)} fundas por día y salen ${n(salenDia)}: faltan vender ${n(brechaDia)} por día`,
    }
  }
  if (brechaDia > -entranDia * MARGEN_AJUSTADO) {
    return {
      estado: 'ajustado',
      entranDia,
      salenDia,
      brechaDia,
      titular: `Entran ${n(entranDia)} fundas por día y salen ${n(salenDia)}: empata, sin margen`,
    }
  }
  return {
    estado: 'holgado',
    entranDia,
    salenDia,
    brechaDia,
    titular: `Salen ${n(salenDia)} fundas por día contra ${n(entranDia)} que entran: el stock baja`,
  }
}

// ── Las metas ─────────────────────────────────────────────────────────────────

/**
 * La clave de una meta nueva, a partir de su nombre.
 *
 * 🔑 **Existe para que nadie tenga que escribir una clave.** `key` es la PK compuesta con `store` y
 * el guardado es un `upsert`: dos metas con la misma clave **no dan error, se pisan**. Pedirle una
 * clave a quien carga una meta es pedirle que entienda eso; generarla y desambiguarla acá es el
 * paso anterior que vuelve innecesaria la pregunta.
 */
export function claveDeMeta(label: string, usadas: readonly string[] = []): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'meta'
  if (!usadas.includes(base)) return base
  let n = 2
  while (usadas.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/**
 * **Cuánto va de una meta hoy**, medido contra lo que la pantalla ya tiene arriba.
 *
 * 🔑 **Mide contra `ritmo`, que es el mismo que se muestra en el veredicto y en los pagos.** No
 * vuelve a calcular nada por su cuenta: si lo hiciera —sobre la ventana del servidor en vez de la
 * del ETL— la misma pantalla tendría dos números distintos para «la contribución por día» y no
 * habría forma de saber cuál mirar.
 *
 * ## Cuándo devuelve `null`, que es la mitad del trabajo
 *
 * - **Sin venta en la ventana** no hay ritmo, y no hay nada que medir.
 * - **Sin el dashboard conectado** la contribución no existe: `ritmoDeSalida` pone `contribUnidad`
 *   en 0 para lo que no sabe, así que medir igual daría `$0/día` — que afirma «no deja nada», y es
 *   otra cosa. Por eso `hayPlata` entra por parámetro y no se deduce de que el número sea cero.
 * - **Un canal que no vendió** es un `0` real para unidades (vendió cero) pero `null` para plata:
 *   sin unidades no hay por qué dividir, y un `$0/funda` se leería como «no deja margen».
 */
export function medirMeta(meta: Meta, ctx: ContextoMedida): Medicion {
  const { ritmo, hayPlata } = ctx
  // `string` y no `Medidor` a propósito: el valor viene de la base, donde no hay tipos. El día que
  // el catálogo crezca y esta función no, el medidor nuevo llega acá igual.
  const medidor: string = meta.medidor

  if (!ritmo.length) return { valor: null, motivo: 'todavía no hay venta medida en la ventana' }

  const fila = meta.canal ? ritmo.find((r) => r.canal === meta.canal) : undefined
  if (meta.canal && !fila) {
    // Un canal que no vendió hizo 0 fundas y 0 compras: eso es un DATO. En plata, en cambio, no hay
    // sobre qué dividir, y un «$0» afirmaría «no deja nada», que es otra cosa.
    return medidor === 'unidades-dia' || medidor === 'ventas-dia'
      ? { valor: 0, motivo: null }
      : { valor: null, motivo: `${meta.canal} no vendió nada en la ventana` }
  }

  if (medidor === 'unidades-dia') {
    return { valor: fila ? fila.unidadesDia : salidaDiaria(ritmo), motivo: null }
  }

  // 🔑 Compras, no fundas. Sale del mismo `ritmo`, así que es el mismo lote que la columna de
  // unidades: un objetivo de «100 por día» contra el otro medidor daría un avance plausible y falso.
  if (medidor === 'ventas-dia') {
    return { valor: fila ? fila.ventasDia : ventasDiarias(ritmo), motivo: null }
  }

  // 🔑 **El descarte se rechaza, no se asume.** Antes esto no estaba y un medidor desconocido caía
  // por defecto en `contrib-unidad`: devolvía un número —bien formateado, con su unidad— que no
  // era lo que la meta decía medir. Lo cazó un mutante que agregó un medidor al catálogo sin
  // enseñárselo a esta función: el banco quedó en verde.
  if (medidor !== 'contrib-dia' && medidor !== 'contrib-unidad') {
    return { valor: null, motivo: `medidor desconocido: ${medidor}` }
  }

  if (!hayPlata) {
    return { valor: null, motivo: 'falta la contribución: el dashboard no está conectado' }
  }
  if (medidor === 'contrib-dia') {
    return { valor: fila ? fila.contribDia : contribucionDiaria(ritmo), motivo: null }
  }

  // `contrib-unidad` de todos los canales es **ponderado por unidades**, no el promedio de los
  // promedios: mayorista deja $1.541 y online $7.295, pero mayorista es el 88% de las unidades.
  // Promediar los canales parejo daría más del triple de lo que deja el negocio.
  if (fila) return { valor: fila.contribUnidad, motivo: null }
  const unidades = salidaDiaria(ritmo)
  if (unidades <= 0) return { valor: null, motivo: 'no hay unidades para dividir' }
  return { valor: contribucionDiaria(ritmo) / unidades, motivo: null }
}

/**
 * El avance de una meta, con el ritmo que haría falta para llegar a la fecha.
 *
 * 🔑 **`veces` es el número que ordena la conversación**, más que el porcentaje: «estamos al 9%» se
 * escucha parecido a «estamos al 30%», pero «hay que multiplicar por 11» no.
 *
 * ⚠️ **Sin medido no calcula nada**: ni 0%, ni «faltan todas». Un avance en cero se lee como «no
 * avanzamos», que es una afirmación sobre el negocio; «no se pudo medir» es una sobre el dato.
 */
export function avanceDeMeta(meta: Meta, medicion: Medicion, hoy: string): AvanceMeta {
  const medido = medicion.valor
  const vacio = { meta, medido: null, motivo: medicion.motivo, pct: null, falta: null, veces: null, porSemana: null }
  if (medido === null) return vacio

  const { objetivo } = meta
  const falta = Math.max(0, objetivo - medido)
  const pct = objetivo > 0 ? Math.min(100, Math.max(0, (medido / objetivo) * 100)) : 0
  const veces = medido > 0 ? objetivo / medido : Infinity

  let porSemana: number | null = null
  if (meta.fechaObjetivo && fechaValida(meta.fechaObjetivo) && fechaValida(hoy)) {
    const dias = diasEntre(hoy, meta.fechaObjetivo)
    porSemana = dias > 0 ? falta / (dias / 7) : falta
  }
  return { meta, medido, motivo: null, pct, falta, veces, porSemana }
}
