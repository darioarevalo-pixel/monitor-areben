/**
 * Reposición de Zattia **según ventas**: cuánto tiene que haber de cada variante en el local, qué
 * llevar desde el depósito y qué devolver. Puro, sin DOM ni red. BDI no pasa por acá: sus fundas
 * siguen con el mínimo por modelo de `core.ts`.
 *
 * # Las reglas (Darío, 11-oct-2026 — la nota viva está en la memoria del proyecto)
 *
 * - **"Local" en Gestión Nube = lo colgado + el depósito del local.** Con 1 en Local, ese 1 es el
 *   exhibido, y descolgarlo cuesta (precio, alarma, lugar). Por eso nunca hay menos de 1 exhibida +
 *   1 de reserva. Si vende, la reserva cubre `coberturaDias` de venta.
 * - **Va y viene.** Lo que está por encima del objetivo vuelve al depósito: la falta de este camino
 *   es lo que llenó el local. Primero lo que no vendió nada; tope diario, porque armar el carro es
 *   lo lento (la limpieza grande inicial se hace aparte, con el escaneo).
 * - **Se repone todos los días, de a una si hace falta** (`loteMin` 1, decidido el 11-oct: «al ser
 *   una estructura chica sirve»). Con `loteMin` > 1, sólo se pide cuando faltan al menos esos, o
 *   cuando en el local quedó sólo la exhibida.
 * - **El mínimo depende de lo que vende**: 2 (1 exhibida + 1 de reserva) para lo que vende menos de
 *   1 por semana; 3 para lo que vende más; y lo que vende mucho, la reserva de `coberturaDias`.
 * - **Lo que va a un local en 0 sale marcado para exhibir**: la primera se prepara con alarma y las
 *   dos etiquetas (precio y formas de pago) antes de mandarla.
 * - **"Todo exhibido"** (OUTLET «SIN CAMBIO», ACCESORIOS) no entra en ninguna de las dos listas.
 * - **Lo nuevo no se juzga** hasta tener `diasNuevo` de vida: no se devuelve, y el ritmo se mide
 *   sobre los días que lleva vivo y no sobre toda la ventana.
 */

import { ubicCmp } from './core'
import type { RepoCfg, RepoItem } from './tipos'

export type Modo = 'ventas' | 'exhibido' | 'fija'

/** Una marca puesta a mano (por categoría o por producto). `hasta` vencido = no existe. */
export type MarcaModo = { modo: Modo; n?: number; hasta?: string; motivo?: string }

export type CfgVentas = {
  /** Piso por variante en el local (exhibida + reserva) para lo que vende `umbralSemana` o más. */
  minimo: number
  /** Piso para lo que vende menos de `umbralSemana` por semana (1 exhibida + 1 de reserva). */
  minimoBajo: number
  /** Unidades por semana desde las que una variante «vende» y lleva el `minimo` alto. */
  umbralSemana: number
  /** Días de venta que cubre la reserva. */
  coberturaDias: number
  /** Días de ventas que se miran. */
  ventanaDias: number
  /** No se pide al depósito menos que esto, salvo que en el local quede sólo la exhibida. */
  loteMin: number
  /** Prendas por día en la lista de devolución. */
  topeDevolucion: number
  /** Antes de esta edad (días) un producto no se devuelve. */
  diasNuevo: number
  modosCat: Record<string, MarcaModo>
  modosProd: Record<string, MarcaModo>
}

/**
 * Lo decidido con Darío y su socio el 11-oct-2026, medido con las ventas reales: mínimo 2 para lo
 * que vende menos de 1 por semana y 3 para lo que vende más (2.055 u en el local contra 2.507 con 3
 * parejo, y 29 variantes en riesgo contra 91 con 2 parejo); se repone todos los días, así que la
 * reserva cubre 2 días y se trae de a 1.
 */
export const CFG_VENTAS_DEFAULT: CfgVentas = {
  minimo: 3,
  minimoBajo: 2,
  umbralSemana: 1,
  coberturaDias: 2,
  ventanaDias: 60,
  loteMin: 1,
  topeDevolucion: 30,
  diasNuevo: 21,
  modosCat: {},
  modosProd: {},
}

/** Las dos líneas de Zattia: cada una con su config (`ventas` / `ventasStunned`). */
export type LineaZ = 'zattia' | 'stunned'
export const CAMPO_LINEA: Record<LineaZ, 'ventas' | 'ventasStunned'> = { zattia: 'ventas', stunned: 'ventasStunned' }

/** La config de ventas de una línea con los defaults rellenos (lo guardado puede ser de una versión anterior). */
export function cfgVentas(cfg: RepoCfg, linea: LineaZ = 'zattia'): CfgVentas {
  const v = cfg[CAMPO_LINEA[linea]] || {}
  return { ...CFG_VENTAS_DEFAULT, ...v, modosCat: { ...(v.modosCat || {}) }, modosProd: { ...(v.modosProd || {}) } }
}

/**
 * Reglas por nombre: el OUTLET y los accesorios no tienen categoría cargada en Gestión Nube, pero el
 * nombre los delata. Sirve para arrancar; una marca por producto le gana.
 */
export const REGLAS_NOMBRE: { re: RegExp; motivo: string }[] = [
  { re: /SIN CAMBIO/i, motivo: 'OUTLET (sin cambio)' },
  { re: /^\s*ACCESORIO/i, motivo: 'Accesorio' },
]

const vigente = (m: MarcaModo | undefined, hoy: string): m is MarcaModo => !!m && (!m.hasta || m.hasta >= hoy)

export type ModoResuelto = { modo: Modo; n?: number; origen: 'producto' | 'nombre' | 'categoría' | 'normal'; motivo: string }

/** Qué regla manda para esta variante: producto > nombre > categoría > según ventas. */
export function modoDe(it: Pick<RepoItem, 'pid' | 'name' | 'cat'>, cv: CfgVentas, hoy: string): ModoResuelto {
  const p = cv.modosProd[String(it.pid)]
  if (vigente(p, hoy)) return { modo: p.modo, n: p.n, origen: 'producto', motivo: p.motivo || 'marcado a mano' }
  const regla = REGLAS_NOMBRE.find((r) => r.re.test(it.name || ''))
  if (regla) return { modo: 'exhibido', origen: 'nombre', motivo: regla.motivo }
  const c = cv.modosCat[it.cat]
  if (vigente(c, hoy)) return { modo: c.modo, n: c.n, origen: 'categoría', motivo: c.motivo || it.cat }
  return { modo: 'ventas', origen: 'normal', motivo: 'según ventas' }
}

export type Decision = {
  modo: ModoResuelto
  /** Unidades vendidas en la ventana (local + Tienda Nube). */
  vendidas: number
  /** Días sobre los que se midió (la ventana, o menos si el producto es nuevo). */
  dias: number
  /** Venta por semana, redondeada a un decimal: la mayor entre la de 7 días y la de la ventana. */
  porSemana: number
  /** La venta por semana salió de los últimos 7 días (algo que se disparó), no de la ventana larga. */
  pico: boolean
  /** Va a un local en 0: la primera hay que dejarla lista para exhibir (alarma + precio + formas de pago). */
  exhibir: boolean
  nuevo: boolean
  /** Cuánto tiene que haber en el local. `null` = todo exhibido (no aplica). */
  objetivo: number | null
  llevar: number
  devolver: number
  /** En pocas palabras, por qué. Va a la pantalla y al papel. */
  porque: string
}

const r1 = (n: number) => Math.round(n * 10) / 10

/**
 * La decisión para una variante.
 *
 * `vendidas` = ventas de la variante en `cv.ventanaDias` (local + Tienda Nube). `diasVivo` del
 * producto, si se sabe, achica el denominador de lo nuevo.
 */
export function decidir(it: RepoItem, cfg: RepoCfg, cv: CfgVentas, hoy: string): Decision {
  const modo = modoDe(it, cv, hoy)
  const vendidas = it.vv || 0
  const vivo = it.diasVivo ?? null
  const dias = Math.max(1, vivo != null ? Math.min(cv.ventanaDias, vivo) : cv.ventanaDias)
  const nuevo = vivo != null && vivo < cv.diasNuevo
  // Sube rápido y baja despacio: manda la mayor entre la última semana y la ventana larga. Una
  // semana floja no devuelve al depósito lo que se vende; algo que se disparó recibe reserva ya.
  const porDiaLargo = vendidas / dias
  const porDiaCorto = (it.s7 || 0) / Math.min(7, dias)
  let pico = false
  const porDia = Math.max(porDiaLargo, porDiaCorto)
  const porSemana = r1(porDia * 7)
  const base = { modo, vendidas, dias, porSemana, nuevo, exhibir: false }

  if (modo.modo === 'exhibido') {
    return { ...base, pico, objetivo: null, llevar: 0, devolver: 0, porque: `Todo exhibido (${modo.motivo})` }
  }

  let objetivo: number
  let porque: string
  if (modo.modo === 'fija') {
    objetivo = Math.max(0, modo.n ?? cv.minimo)
    porque = 'Cantidad fija'
  } else {
    // Si «vende» o «vende poco» se decide con la ventana larga: una sola venta en la semana no
    // puede cambiarle el piso a una variante. La última semana sólo sube la reserva de lo que se
    // disparó (y ahí sí es `pico`).
    const piso = porDiaLargo * 7 >= cv.umbralSemana ? cv.minimo : cv.minimoBajo
    const resLargo = Math.ceil(porDiaLargo * cv.coberturaDias)
    const resCorto = Math.ceil(porDiaCorto * cv.coberturaDias)
    const reserva = Math.max(piso - 1, resLargo, resCorto)
    objetivo = 1 + reserva
    pico = resCorto > Math.max(piso - 1, resLargo)
    // El motivo dice sólo lo que las columnas no dicen (Darío, 12-oct: «muy repetitivo»): la venta
    // semanal y el stock ideal ya están al lado. El caso normal (el mínimo) va vacío.
    porque = vendidas === 0 ? `Sin ventas en ${dias} días` : pico ? `Pico de venta: ${it.s7} esta semana` : objetivo > piso ? 'Reserva por ventas' : ''
  }
  // ⛔ Los «topes por producto» de la pantalla vieja NO se aplican acá (Darío, 11-oct-2026: «con
  // estos cambios queda completamente anticuado»): se pusieron para el mínimo fijo por categoría y
  // pisaban a las ventas (las bikinis en 4 aunque vendieran 6 por semana). Siguen guardados porque
  // BDI los usa. Para un número a mano en Zattia está «cantidad fija». Los apagados sí se respetan.

  const apagado = cfg.apagados.map(String).includes(String(it.pid))
  const falta = objetivo - it.local
  let llevar = 0
  if (!apagado && falta > 0 && it.deposito > 0) {
    // Con `loteMin` > 1 no se camina el depósito por una sola, salvo que quede sólo la exhibida.
    if (falta >= cv.loteMin || it.local <= 1) llevar = Math.min(falta, it.deposito)
  }
  const devolver = !nuevo && it.local > objetivo ? it.local - objetivo : 0
  if (nuevo && it.local > objetivo) porque = [porque, 'Producto nuevo: no se devuelve'].filter(Boolean).join(' · ')
  // La columna «Vende x sem.» muestra el ritmo que decidió: el de la semana si se disparó, si no el largo.
  const ritmoSemana = r1((pico ? porDiaCorto : porDiaLargo) * 7)
  return { ...base, porSemana: ritmoSemana, pico, objetivo, llevar, devolver, porque, exhibir: llevar > 0 && it.local <= 0 }
}

export type FilaVentas = { it: RepoItem; d: Decision }

/** Todas las decisiones, una por variante con stock, con la config de la línea. */
export function decidirTodo(inv: RepoItem[], cfg: RepoCfg, hoy: string, linea: LineaZ = 'zattia'): FilaVentas[] {
  const cv = cfgVentas(cfg, linea)
  return inv.filter((it) => it.local > 0 || it.deposito > 0).map((it) => ({ it, d: decidir(it, cfg, cv, hoy) }))
}

/**
 * Lo que va del depósito al local (lista de Lorena): por la ubicación en el depósito (la
 * observación de GN, cuando esté cargada) y, sin ubicación, por SKU.
 */
export function listaLlevar(filas: FilaVentas[]): FilaVentas[] {
  return filas.filter((f) => f.d.llevar > 0).sort((a, b) => ubicCmp(a.it.ubic, b.it.ubic) || porSku(a, b))
}

/**
 * Lo que vuelve al depósito (lista de Camila).
 *
 * Primero lo que no vendió nada, después lo que más sobra. Con `tope`, corta ahí (puede partir la
 * última variante: lo que no entra hoy sale mañana). Sin tope = la lista entera, para la limpieza.
 * Devuelve las filas con `devolverHoy` y cuánto queda pendiente para otros días.
 */
export function listaDevolver(filas: FilaVentas[], tope: number | null): { filas: (FilaVentas & { devolverHoy: number })[]; pendiente: number; total: number } {
  const cand = filas
    .filter((f) => f.d.devolver > 0)
    .sort((a, b) => (a.d.vendidas === 0 ? 0 : 1) - (b.d.vendidas === 0 ? 0 : 1) || b.d.devolver - a.d.devolver || porProductoYTalle(a, b))
  const total = cand.reduce((s, f) => s + f.d.devolver, 0)
  const out: (FilaVentas & { devolverHoy: number })[] = []
  let resto = tope == null ? Infinity : tope
  for (const f of cand) {
    if (resto <= 0) break
    const n = Math.min(f.d.devolver, resto)
    out.push({ ...f, devolverHoy: n })
    resto -= n
  }
  // En el local se recorre por SKU (RTO-0065-BE, RTO-0065-BL, RTO-0066-NG…): así lo conocen las chicas.
  out.sort(porSku)
  const hoy = out.reduce((s, f) => s + f.devolverHoy, 0)
  return { filas: out, pendiente: total - hoy, total }
}

const ORDEN_TALLE = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
function talleRank(size: string): number {
  const m = String(size || '').toUpperCase().match(/\b(XXXL|XXL|XXS|XL|XS|S|M|L)\b/)
  return m ? ORDEN_TALLE.indexOf(m[1]) : 99
}

/**
 * Por SKU, con los números en orden de número (RTO-0100 después de RTO-0099). Lo que no tiene SKU va
 * al final, por nombre y talle.
 */
export function porSku(a: FilaVentas, b: FilaVentas): number {
  const sa = a.it.sku || ''
  const sb = b.it.sku || ''
  if (!sa !== !sb) return sa ? -1 : 1
  return sa.localeCompare(sb, 'es', { numeric: true, sensitivity: 'base' }) || porProductoYTalle(a, b)
}

/** Por nombre de producto y, adentro, por talle de chico a grande (no alfabético). */
export function porProductoYTalle(a: FilaVentas, b: FilaVentas): number {
  return (
    (a.it.name || '').localeCompare(b.it.name || '', 'es') ||
    talleRank(a.it.size) - talleRank(b.it.size) ||
    (a.it.size || '').localeCompare(b.it.size || '', 'es', { numeric: true })
  )
}

/** Fecha de hoy en Argentina, `YYYY-MM-DD` (para vencer las marcas con `hasta`). */
export function hoyAR(ahoraMs = Date.now()): string {
  return new Date(ahoraMs - 3 * 3600_000).toISOString().slice(0, 10)
}
