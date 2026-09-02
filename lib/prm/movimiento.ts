/**
 * **Lo que le compramos a un proveedor, y cómo se vendió eso.** Funciones puras.
 *
 * El servidor (`api/_prm.js`, acción `movimiento`) baja tres cosas crudas —las órdenes, los
 * productos que trajeron y los renglones de venta de esos productos— y todo el agregado se hace
 * acá. ⛔ Ninguna de estas cuentas se vuelve a escribir en el JSX.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 QUÉ MIDE, Y QUÉ ⛔ NO MIDE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **El puente es el PRODUCTO, ⛔ no la unidad.** Se cuentan las ventas de los productos que este
 * proveedor nos trajo en sus órdenes. Eso ⛔ NO es «cuánto de lo que él trajo se vendió»: el mismo
 * producto pudo entrar por otra orden, de otro proveedor, o ya estar en el depósito.
 * **Medido el 2-sep-2026: `CaseMe&Co` compró 793 unidades y sus productos vendieron 968.**
 *
 * Por eso `curva()` devuelve `antes` —lo vendido ANTES de la primera llegada— en vez de tirarlo:
 * es la prueba a la vista de que el producto no es sólo suyo, y sin ese número el 968 parece un
 * agujero de inventario.
 */

export type OcMovimiento = {
  id: string
  store: string
  oc_label: string | null
  confirmada_at: string | null
  fecha_ingreso?: string | null
  recibido_en?: string | null
  unidades_pedidas: number | null
  unidades_contadas: number | null
}

export type ProductoMovimiento = {
  clave: string
  store: string
  producto_id: string
  nombre: string | null
  sku: string | null
  /** Unidades CONTADAS que trajo este proveedor, sumando todas sus órdenes. */
  unidades: number
  /** El instante de la PRIMERA orden suya que lo trajo. `null` si ninguna traía fecha. */
  desde: string | null
}

export type VentaMovimiento = { store: string; producto_id: string; fecha: string; unidades: number }

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Fechas
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * 🔑 **Las fechas se parten a mano y se rearman en UTC.** `new Date('2026-08-25')` es medianoche
 * UTC, o sea el 24 a las 21:00 en Argentina: cualquier cuenta que pase por ahí y después formatee
 * en local corre todas las fechas un día para atrás. Acá se entra y se sale en `YYYY-MM-DD`, y el
 * `Date` intermedio nunca se formatea.
 */
function utcDe(dia: string): number | null {
  const [a, m, d] = dia.slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return null
  const t = Date.UTC(a, m - 1, d)
  return Number.isNaN(t) ? null : t
}

const diaDe = (t: number): string => new Date(t).toISOString().slice(0, 10)

const DIA = 24 * 60 * 60 * 1000

/** El lunes de la semana de `dia`. La semana argentina arranca el lunes, no el domingo. */
export function lunesDe(dia: string): string | null {
  const t = utcDe(dia)
  if (t == null) return null
  const dow = new Date(t).getUTCDay() // 0 domingo … 6 sábado
  return diaDe(t - ((dow + 6) % 7) * DIA)
}

/** Días entre dos fechas sueltas. Positivo si `b` es posterior. */
export function diasEntre(a: string, b: string): number | null {
  const ta = utcDe(a)
  const tb = utcDe(b)
  if (ta == null || tb == null) return null
  return Math.round((tb - ta) / DIA)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// La serie semanal: compras y ventas en la MISMA escala
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type SemanaMovimiento = { lunes: string; compradas: number; ocs: number; vendidas: number }

/**
 * Compras y ventas por semana calendario, en una serie **contigua**.
 *
 * 🔑 **Las semanas sin nada van con cero y ⛔ no se saltean.** Una serie con huecos dibuja las tres
 * compras del proveedor pegadas una al lado de la otra y se lee como si comprara todas las semanas.
 * El cero acá es un dato: esa semana no entró nada.
 *
 * ⚠️ **La ventana de ventas la fija el servidor** (`dias`), así que las semanas anteriores a
 * `desdeVentas` tienen compras y no pueden tener ventas. Por eso la serie arranca en el lunes de
 * `desdeVentas` cuando se lo pasan: mostrar una compra de junio con 0 ventas al lado sería una
 * afirmación falsa sobre un pedazo que no se preguntó.
 */
export function semanas(
  ocs: OcMovimiento[],
  ventas: VentaMovimiento[],
  hoy: string,
  desdeVentas?: string | null,
  diaDeLaOc: (o: OcMovimiento) => string | null = (o) => (o.confirmada_at ? o.confirmada_at.slice(0, 10) : null),
): SemanaMovimiento[] {
  const acc = new Map<string, SemanaMovimiento>()
  const tocar = (lunes: string) => {
    if (!acc.has(lunes)) acc.set(lunes, { lunes, compradas: 0, ocs: 0, vendidas: 0 })
    return acc.get(lunes)!
  }

  const piso = desdeVentas ? lunesDe(desdeVentas) : null

  for (const o of ocs) {
    const dia = diaDeLaOc(o)
    const l = dia ? lunesDe(dia) : null
    if (!l || (piso && l < piso)) continue
    const s = tocar(l)
    s.ocs += 1
    s.compradas += Number(o.unidades_contadas) || 0
  }
  for (const v of ventas) {
    const l = lunesDe(v.fecha)
    if (!l || (piso && l < piso)) continue
    tocar(l).vendidas += Number(v.unidades) || 0
  }
  if (!acc.size) return []

  const lunesHoy = lunesDe(hoy)
  const claves = [...acc.keys()].sort()
  const primero = piso && piso < claves[0] ? piso : claves[0]
  const ultimo = lunesHoy && lunesHoy > claves[claves.length - 1] ? lunesHoy : claves[claves.length - 1]

  const out: SemanaMovimiento[] = []
  for (let t = utcDe(primero)!; t <= utcDe(ultimo)!; t += 7 * DIA) {
    const l = diaDe(t)
    out.push(acc.get(l) || { lunes: l, compradas: 0, ocs: 0, vendidas: 0 })
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// El ritmo de los últimos días
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type Ritmo = {
  d7: number
  d30: number
  porDia7: number
  porDia30: number
  /** La última fecha con una venta. ⚠️ El día de hoy casi siempre está a medias: el espejo se sincroniza una vez por día. */
  ultima: string | null
}

export function ritmo(ventas: VentaMovimiento[], hoy: string): Ritmo {
  const t = utcDe(hoy)
  if (t == null) return { d7: 0, d30: 0, porDia7: 0, porDia30: 0, ultima: null }
  const corte7 = diaDe(t - 6 * DIA)
  const corte30 = diaDe(t - 29 * DIA)
  let d7 = 0
  let d30 = 0
  let ultima: string | null = null
  for (const v of ventas) {
    const u = Number(v.unidades) || 0
    if (v.fecha >= corte7) d7 += u
    if (v.fecha >= corte30) d30 += u
    if (!ultima || v.fecha > ultima) ultima = v.fecha
  }
  return { d7, d30, porDia7: d7 / 7, porDia30: d30 / 30, ultima }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// La curva: cómo se vende un producto suyo semana a semana DESDE QUE ENTRA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type PuntoCurva = {
  /** 0 = la semana en que llegó. */
  semana: number
  unidades: number
  /** Cuántos de sus productos llevan **al menos** esta cantidad de semanas en la calle. */
  maduros: number
  /** unidades / maduros. `null` si ningún producto llegó tan lejos: ⛔ no es cero. */
  promedio: number | null
}

export type Curva = {
  puntos: PuntoCurva[]
  /** Unidades vendidas ANTES de la primera llegada. ⛔ No se tiran: prueban que el producto no es sólo suyo. */
  antes: number
  /** Productos que no pudieron entrar a la curva porque ninguna orden suya traía fecha. */
  sinFecha: number
}

/**
 * 🔴 **Cada producto entra UNA vez, desde su PRIMERA llegada.** Hacer la curva por orden contaría
 * dos veces el solape de un producto traído dos veces —«casi el doble con dos compras», que es
 * exactamente lo que ya mordió en Norte con el stock arribado—.
 *
 * 🔴 **El denominador de cada semana son los productos MADUROS, ⛔ no todos.** Un producto que
 * llegó hace dos semanas no tiene semana 5, y meterlo igual en el divisor hunde la cola de la
 * curva hasta que la forma dice «se deja de vender» cuando lo que pasa es que todavía no llegó.
 */
export function curva(productos: ProductoMovimiento[], ventas: VentaMovimiento[], hoy: string): Curva {
  const desde = new Map<string, string>()
  let sinFecha = 0
  for (const p of productos) {
    if (!p.desde) {
      sinFecha += 1
      continue
    }
    desde.set(p.clave, p.desde.slice(0, 10))
  }

  const unidades = new Map<number, number>()
  let antes = 0
  for (const v of ventas) {
    const d = desde.get(`${v.store}:${v.producto_id}`)
    if (!d) continue
    const dias = diasEntre(d, v.fecha)
    if (dias == null) continue
    const u = Number(v.unidades) || 0
    if (dias < 0) {
      antes += u
      continue
    }
    const sem = Math.floor(dias / 7)
    unidades.set(sem, (unidades.get(sem) || 0) + u)
  }

  // La edad de cada producto en semanas: hasta ahí llega su dato, y ni una semana más.
  const edades: number[] = []
  for (const d of desde.values()) {
    const dias = diasEntre(d, hoy)
    if (dias != null && dias >= 0) edades.push(Math.floor(dias / 7))
  }
  if (!edades.length) return { puntos: [], antes, sinFecha }

  const tope = Math.max(...edades)
  const puntos: PuntoCurva[] = []
  for (let sem = 0; sem <= tope; sem++) {
    const maduros = edades.filter((e) => e >= sem).length
    const u = unidades.get(sem) || 0
    puntos.push({ semana: sem, unidades: u, maduros, promedio: maduros ? u / maduros : null })
  }
  return { puntos, antes, sinFecha }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Sus productos, uno por uno
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type FilaProducto = ProductoMovimiento & {
  vendidas: number
  /** Semanas que lleva en la calle desde la primera llegada. `null` si no hay fecha. */
  semanasEnCalle: number | null
  /** vendidas / semanas. `null` si todavía no cumplió una semana: dividir por cero infla al recién llegado. */
  porSemana: number | null
}

/**
 * 🔴 **`vendidas = 0` y «no lo pude cruzar» son cosas distintas, y acá sólo aparece la primera.**
 * Los renglones que no cruzaron con el espejo ⛔ no tienen producto, así que no están en esta lista:
 * el que los cuenta es `sinCruce`, que el servidor devuelve aparte y la pantalla dice en voz alta.
 * Sin él, un proveedor con todos sus renglones sin cruzar se ve como uno que no vendió nada.
 */
export function productosOrdenados(
  productos: ProductoMovimiento[],
  ventas: VentaMovimiento[],
  hoy: string,
): FilaProducto[] {
  const vendidas = new Map<string, number>()
  for (const v of ventas) {
    const k = `${v.store}:${v.producto_id}`
    vendidas.set(k, (vendidas.get(k) || 0) + (Number(v.unidades) || 0))
  }
  return productos
    .map((p) => {
      const dias = p.desde ? diasEntre(p.desde.slice(0, 10), hoy) : null
      const semanasEnCalle = dias == null || dias < 0 ? null : Math.floor(dias / 7)
      const v = vendidas.get(p.clave) || 0
      return {
        ...p,
        vendidas: v,
        semanasEnCalle,
        porSemana: semanasEnCalle && semanasEnCalle > 0 ? v / semanasEnCalle : null,
      }
    })
    .sort((a, b) => b.vendidas - a.vendidas || b.unidades - a.unidades)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Los proveedores comparados entre sí — las columnas medidas de la lista
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export type LocalComparativa = { id: string; nombre: string; proveedor_id_ingresos: number | null }
export type LineaComparativa = { oc_ref: string; store: string; producto_id: string | null; cantidad_contada: number | null }
export type VentaProducto = { store: string; producto_id: string; unidades: number }

export type FilaComparativa = {
  localId: string
  nombre: string
  proveedorId: number
  ocs: number
  /** Unidades CONTADAS de todas sus órdenes, incluidas las que no cruzaron. */
  comprado: number
  /** El día de su última orden, o `null`. */
  ultima: string | null
  productos: number
  /**
   * Las marcas de sus órdenes. 🔴 Es lo que deja que la pantalla NO dibuje un cero cuando la base
   * de esa marca no contestó: sin esto, 28 de 34 proveedores mostrarían «vendió 0» el día que
   * falta una credencial, y ese cero afirma.
   */
  stores: string[]
  /** Cuántos de sus productos los trajo TAMBIÉN otro proveedor. Esas ventas cuentan en los dos. */
  compartidos: number
  /** Unidades vendidas de sus productos en la ventana. */
  vendidas: number
  porDia: number
  sinCruce: { lineas: number; unidades: number }
}

/**
 * 🔴 **La columna «vendidas» ⛔ NO SE PUEDE SUMAR, y por eso `compartidos` viaja al lado.**
 * Un producto que trajeron dos proveedores cuenta entero en los dos: repartir la venta sería
 * inventar de quién se vendió cada unidad, y dársela a uno solo sería mentirle al otro. Medido el
 * 2-sep-2026: pasa en **2 de 349** productos. La pantalla dice cuántos son en cada fila.
 *
 * 🔑 **`comprado` incluye los renglones que ⛔ no cruzaron** —son unidades que entraron igual— y
 * `sinCruce` dice cuántas. Sacarlas del total haría que un proveedor entregara menos de lo que
 * entregó; callarlas haría que un proveedor sin cruce parezca uno que no vende.
 */
export function comparativa(
  locales: LocalComparativa[],
  ocs: (OcMovimiento & { proveedor_id: number | null })[],
  lineas: LineaComparativa[],
  ventasPorProducto: VentaProducto[],
  dias: number,
  diaDeLaOc: (o: OcMovimiento) => string | null = (o) => (o.confirmada_at ? o.confirmada_at.slice(0, 10) : null),
): FilaComparativa[] {
  const vendidas = new Map<string, number>()
  for (const v of ventasPorProducto) vendidas.set(`${v.store}:${v.producto_id}`, Number(v.unidades) || 0)

  const ocDe = new Map<string, { proveedor: number | null; dia: string | null }>()
  for (const o of ocs) ocDe.set(o.id, { proveedor: o.proveedor_id, dia: diaDeLaOc(o) })

  // Qué proveedores trajeron cada producto. Es lo que deja ver el solape en vez de esconderlo.
  const duenos = new Map<string, Set<number>>()
  for (const l of lineas) {
    if (!l.producto_id) continue
    const o = ocDe.get(l.oc_ref)
    if (!o || o.proveedor == null) continue
    const k = `${l.store}:${l.producto_id}`
    if (!duenos.has(k)) duenos.set(k, new Set())
    duenos.get(k)!.add(o.proveedor)
  }

  const porProveedor = new Map<
    number,
    { productos: Set<string>; stores: Set<string>; comprado: number; sinCruce: { lineas: number; unidades: number } }
  >()
  const tocar = (id: number) => {
    if (!porProveedor.has(id))
      porProveedor.set(id, { productos: new Set(), stores: new Set(), comprado: 0, sinCruce: { lineas: 0, unidades: 0 } })
    return porProveedor.get(id)!
  }
  for (const l of lineas) {
    const o = ocDe.get(l.oc_ref)
    if (!o || o.proveedor == null) continue
    const p = tocar(o.proveedor)
    p.stores.add(l.store)
    const u = Number(l.cantidad_contada) || 0
    p.comprado += u
    if (!l.producto_id) {
      p.sinCruce.lineas += 1
      p.sinCruce.unidades += u
      continue
    }
    p.productos.add(`${l.store}:${l.producto_id}`)
  }

  const cuenta = new Map<number, { ocs: number; ultima: string | null }>()
  for (const o of ocs) {
    if (o.proveedor_id == null) continue
    const c = cuenta.get(o.proveedor_id) || { ocs: 0, ultima: null }
    c.ocs += 1
    const dia = diaDeLaOc(o)
    if (dia && (!c.ultima || dia > c.ultima)) c.ultima = dia
    cuenta.set(o.proveedor_id, c)
  }

  return locales
    .filter((l) => l.proveedor_id_ingresos != null)
    .map((l) => {
      const id = l.proveedor_id_ingresos as number
      const p = porProveedor.get(id)
      const c = cuenta.get(id) || { ocs: 0, ultima: null }
      let u = 0
      let compartidos = 0
      for (const k of p?.productos ?? []) {
        u += vendidas.get(k) || 0
        if ((duenos.get(k)?.size ?? 1) > 1) compartidos += 1
      }
      return {
        localId: l.id,
        nombre: l.nombre,
        proveedorId: id,
        ocs: c.ocs,
        comprado: p?.comprado ?? 0,
        ultima: c.ultima,
        productos: p?.productos.size ?? 0,
        stores: [...(p?.stores ?? [])],
        compartidos,
        vendidas: u,
        porDia: dias > 0 ? u / dias : 0,
        sinCruce: p?.sinCruce ?? { lineas: 0, unidades: 0 },
      }
    })
    .sort((a, b) => b.vendidas - a.vendidas || b.comprado - a.comprado)
}

/**
 * ¿Este local entra en la sección de esta marca?
 *
 * 🔴 **La marca se MIDE de las órdenes, ⛔ no se tilda.** Un campo tipeado al lado de un dato que el
 * sistema ya sabe envejece: el proveedor que mañana le venda a la otra marca queda mal clasificado
 * y nadie lo va a ir a corregir. Medido el 2-sep-2026: 28 de Zattia, 6 de BDI, **ninguno en las
 * dos** — y el día que uno lo esté, aparece en las dos sin que nadie toque nada.
 *
 * ⛔ **Sin órdenes ⛔ NO es «de ninguna marca»: es «todavía no le compramos»** ⇒ entra en las dos.
 * Un local de Flores cargado a mano antes de la primera compra sirve para la marca que sea, y
 * esconderlo lo perdería justo cuando hay que ir a verlo.
 */
export function esDeLaMarca(local: { marcas?: string[] | null }, marca: string): boolean {
  const m = local.marcas
  if (!m || !m.length) return true
  return m.includes(marca)
}
