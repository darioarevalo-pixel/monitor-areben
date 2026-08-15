/**
 * «Vendido en sale», del lado de la pantalla.
 *
 * Análisis muestra ventas de 7, 30 y 90 días y una vida útil estimada que sale de las de 30. Un
 * producto que se movió porque estaba al 40% infla las cuatro cosas, y la de más abajo —la vida
 * útil corta— es justo la señal que dispara reponerlo. Esta marca dice **cuánto de ese número salió
 * con la oferta puesta**, para que un pico de liquidación no se lea como demanda.
 *
 * El cruce contra la bitácora lo hace el servidor (`api/_liquidacion.js?vendido=1`) con
 * `vendido.core.js`, y devuelve **las líneas con su fecha**, no los totales. El bucketing va acá,
 * con `cortesDeVentas` —el mismo corte que usó el ETL para dibujar la columna de al lado— por lo que
 * explica ese helper: dos definiciones de "los últimos 30 días" dan marcas de «9 de 8».
 *
 * 🔴 **Esta marca sólo conoce las ofertas que escribió el Monitor.** Medido en Zattia el
 * 15-ago-2026: Tienda Nube tenía **420 promos vivas** y la bitácora **262** — 173 productos con
 * oferta cargada a mano, el 9% de las unidades de 30 días. Para esos no hay historia posible (TN
 * dice cómo está hoy, no desde cuándo), y por eso va aparte la marca de presente `ofertaHoy`, que
 * sale del mismo payload del audit que ya baja la tabla para las fotos.
 */

import { apiFetch } from '@/lib/api-fetch'
import { cortesDeVentas } from '@/lib/etl/helpers'
import type { Producto } from '@/lib/etl/tipos'
import type { Marca } from '@/lib/nav.datos'
import { matchTn, type IndiceTn } from '@/lib/tn'

const API = '/api/datos?recurso=liquidacion'

/** Una venta hecha con la oferta puesta, agrupada por producto, variante y día. */
export interface LineaSale {
  pid: string
  sid: string
  /** `YYYY-MM-DD`. */
  fecha: string
  u: number
}

/** Lo vendido en sale de un producto (o de una variante), en las mismas ventanas que la tabla. */
export interface EnSale {
  s7: number
  s15: number
  s30: number
  s90: number
  /** Todo lo que la bitácora conoce, sin ventana. */
  total: number
  /** `YYYY-MM` → unidades. Lo consume Ventas mensuales. */
  meses: Record<string, number>
}

export interface VendidoSale {
  /** Por pid. Un producto sin ventas en sale **no está**: preguntar por él da `null`. */
  porPid: Map<string, EnSale>
  /** Por variante, con la clave `pid_sid` del ETL (`allVvar`). */
  porVar: Map<string, EnSale>
  /** El total de la marca por mes, para la tabla de Ventas mensuales. */
  meses: Record<string, number>
  /** Los productos que alguna vez tuvieron una oferta escrita por el Monitor. */
  conBitacora: Set<string>
}

const VACIO: VendidoSale = { porPid: new Map(), porVar: new Map(), meses: {}, conBitacora: new Set() }

function nuevo(): EnSale {
  return { s7: 0, s15: 0, s30: 0, s90: 0, total: 0, meses: {} }
}

function sumar(acc: EnSale, l: LineaSale, cortes: ReturnType<typeof cortesDeVentas>): void {
  const f = new Date(l.fecha)
  acc.total += l.u
  if (f >= cortes.c7) acc.s7 += l.u
  if (f >= cortes.c15) acc.s15 += l.u
  if (f >= cortes.c30) acc.s30 += l.u
  if (f >= cortes.c90) acc.s90 += l.u
  const mes = l.fecha.slice(0, 7)
  acc.meses[mes] = (acc.meses[mes] || 0) + l.u
}

/**
 * Arma la vista por producto, por variante y por mes.
 *
 * `hoy` entra por parámetro y no se lee acá adentro por lo mismo que en el ETL: una función que
 * mira el reloj no se puede testear, y las dos tienen que estar paradas en el mismo día.
 */
export function resumirSale(lineas: LineaSale[], pidsConBitacora: string[], hoy: Date): VendidoSale {
  const cortes = cortesDeVentas(hoy)
  const porPid = new Map<string, EnSale>()
  const porVar = new Map<string, EnSale>()
  const meses: Record<string, number> = {}

  for (const l of lineas || []) {
    if (!l || !l.fecha || !(l.u > 0)) continue
    const p = porPid.get(l.pid) || nuevo()
    sumar(p, l, cortes)
    porPid.set(l.pid, p)

    const vid = `${l.pid}_${l.sid}`
    const v = porVar.get(vid) || nuevo()
    sumar(v, l, cortes)
    porVar.set(vid, v)

    const mes = l.fecha.slice(0, 7)
    meses[mes] = (meses[mes] || 0) + l.u
  }

  return { porPid, porVar, meses, conBitacora: new Set((pidsConBitacora || []).map(String)) }
}

/**
 * Las unidades vendidas en sale de un mes, contra el total de items que muestra ese mes.
 *
 * 🔑 **Va topeado al total, y el tope no es paranoia.** Los dos números salen de fuentes distintas:
 * el total de Ventas mensuales viene de la vista materializada (`allMonthlyStats`) y esto de las
 * líneas de `venta_detalles` cruzadas contra la bitácora. Si un mes quedara con «80 de 75», el
 * renglón se leería como un error de la pantalla y arrastraría la desconfianza al resto de la tabla.
 * Se prefiere empatar antes que pasarse.
 */
export function enSaleDelMes(meses: Record<string, number>, mes: string, items: number): { u: number; pct: number } {
  const u = Math.min(meses[mes] || 0, Math.max(items, 0))
  return { u, pct: items > 0 ? Math.round((u / items) * 100) : 0 }
}

/**
 * ¿El producto tiene una oferta puesta **hoy** en Tienda Nube?
 *
 * Es la mitad de presente de la marca, la que cubre los 173 con promo cargada a mano. Misma regla
 * que el chequeo de exhibición (`precioDeGondola`): una promo que **no es menor** que el precio de
 * lista no es una oferta — pasa cuando sube la lista y queda la promo vieja arriba, y tratarla como
 * oferta pondría un descuento negativo en pantalla.
 */
export function ofertaHoy(p: Producto, promoIdx: IndiceTn | null): boolean {
  if (!promoIdx) return false
  const tn = matchTn(p, promoIdx)
  if (!tn) return false
  const promo = Number(tn.promo_price ?? 0)
  const lista = Number(tn.price ?? 0)
  return promo > 0 && lista > 0 && promo < lista
}

// ── El cliente ────────────────────────────────────────────────────────────────────────────────
//
// Se baja **una vez por marca mientras vive la pestaña**, igual que el catálogo de TN: son las
// mismas líneas para las tres pantallas de Análisis y no cambian en el medio de una sesión —
// la bitácora crece cuando alguien aplica un sale, no mientras se mira una tabla.

const cache = new Map<Marca, VendidoSale>()
const enVuelo = new Map<Marca, Promise<VendidoSale>>()

async function bajar(marca: Marca, hoy: Date): Promise<VendidoSale> {
  const r = await apiFetch(`${API}&store=${marca}&vendido=1`)
  const d = (await r.json().catch(() => ({}))) as { ok?: boolean; lineas?: LineaSale[]; pids?: string[]; error?: string }
  if (!r.ok || !d.ok) throw new Error(d.error || `Error ${r.status} leyendo lo vendido en sale.`)
  return resumirSale(d.lineas || [], d.pids || [], hoy)
}

/**
 * Lo vendido en sale de la marca. **Si el servidor falla devuelve el vacío, no rompe**: la tabla
 * tiene que dibujarse igual — la marca es un dato de más, no la razón por la que se abre Análisis.
 */
export async function traerVendidoSale(marca: Marca, hoy: Date = new Date()): Promise<VendidoSale> {
  const ya = cache.get(marca)
  if (ya) return ya
  const yendo = enVuelo.get(marca)
  if (yendo) return yendo

  const p = bajar(marca, hoy)
    .then((v) => {
      cache.set(marca, v)
      return v
    })
    .catch(() => VACIO)
    .finally(() => {
      if (enVuelo.get(marca) === p) enVuelo.delete(marca)
    })
  enVuelo.set(marca, p)
  return p
}

/** Lo de la marca si ya está bajado; `null` si todavía no. Síncrono, para leerlo EN el render. */
export function vendidoSaleCacheado(marca: Marca): VendidoSale | null {
  return cache.get(marca) ?? null
}

/** Tira lo cacheado de la marca. Lo llama quien acaba de escribir precios en Gestión Nube. */
export function invalidarVendidoSale(marca: Marca): void {
  cache.delete(marca)
}
