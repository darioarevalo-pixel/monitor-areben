/**
 * Reposición durante una campaña: qué talle se está quedando sin nada en el LOCAL y todavía tiene
 * en el DEPÓSITO. Lo pidió Bruno el 14-sep-2026, el día que abrió la Feria de Zattia: *«ventas en
 * real time con reposición en real time, principalmente de artículos que quedan disponibles en
 * depósito — los que hay sólo en local está bien, se agota y muere ahí»*.
 *
 * # El stock «ahora» sin volver a leer Gestión Nube
 *
 * El inventario del espejo es una foto de la madrugada y leer GN en vivo tarda 20-60 s y gasta cupo.
 * Las ventas de hoy, en cambio, se traen en un segundo. ⇒ **stock ahora = una BASE − las ventas que
 * esa base todavía no descontó**.
 *
 * 🔑 **La base lleva el conjunto de `sale_id` que YA tiene adentro.** Con la base del espejo es
 * vacío (el sync corre antes de abrir). Con la base leída en vivo son todas las ventas conocidas en
 * el momento de leer — y eso es lo que permite que **lo que se bajó del depósito salga de la lista
 * apenas se relee**, sin descontar dos veces lo que ya se vendió. Restar «todo lo de hoy» sobre una
 * base en vivo contaría cada venta de la mañana dos veces y pediría reponer lo que ya se repuso.
 *
 * # Qué entra en la lista
 *
 * 🔴 🔑 **Sólo productos que YA ESTÁN en el local.** Medido en la Feria el 14-sep, antes de la
 * primera venta: con «local ≤ 1 y depósito con algo» salían **153 talles, y 138 eran de 48
 * productos que nunca estuvieron en el local** (la lencería, entera en depósito). Una lista así tapa
 * lo único que se quiere ver —lo que se está vendiendo y se acaba en la mesa— con una decisión que es
 * otra: bajar lo que nunca se exhibió. Esos van aparte, en `nuncaEnLocal`.
 * «Ya está en el local» es **por PRODUCTO**, ⛔ no por talle: al que se le vació el M en la mesa hay
 * que bajarle el M aunque ese talle esté en cero en la base.
 *
 * ⚠️ La clave es **`pid_sid`** (producto + variante de GN), la misma de la sección Reposición: la
 * venta trae `size_id`, y el nombre del talle no alcanza para cruzar.
 *
 * Puro: no lee la hora ni la red.
 */

import { canalDe } from './resultado'
import { tipoDePrenda } from './core'
import type { LiquidacionItem } from './tipos'

/** Una fila de inventario: la del espejo o la de GN en vivo, que tienen la misma forma. */
export interface FilaStock {
  product_id: number | string
  size_id: number | string
  size_name: string | null
  store_name: string | null
  available_quantity: number | null
}

/** Una línea de venta con la tienda de la que salió. */
export interface LineaReposicion {
  saleId: string
  pid: string
  sid: string
  /** `ventas.store`: de qué tienda descontó. En Zattia una venta de Tienda Nube sale del `Local`. */
  tienda: string | null
  canal: string
  fecha: string
  unidades: number
  plata: number
}

export interface VarianteAhora {
  pid: string
  sid: string
  talle: string
  local: number
  deposito: number
  /** Lo que tenía el local en la base, antes de restar ventas. Es lo que dice si se exhibía. */
  localBase: number
  /** Unidades vendidas desde la base, de cualquier tienda. */
  vendidas: number
}

export interface ParaReponer extends VarianteAhora {
  nombre: string
  imagen: string | null
  categoria: string
  sugerido: number
}

export interface NuncaEnLocal {
  pid: string
  nombre: string
  categoria: string
  deposito: number
}

/** ¿Es el local? El resto de las tiendas es depósito. ⚠️ Zattia escribe `Deposito ` con espacio. */
export function esLocal(tienda: string | null | undefined): boolean {
  return String(tienda || '').trim() === 'Local'
}

const vid = (pid: string | number, sid: string | number) => `${pid}_${sid}`

/**
 * El stock de cada variante ahora: la base menos las ventas que la base no vio.
 *
 * Una devolución (unidades negativas) **suma**: la prenda volvió a la tienda. Una venta de una
 * variante que la base no tiene igual se resta: queda en negativo y se ve, en vez de esconderse.
 */
export function stockAhora(
  base: FilaStock[],
  incluidas: ReadonlySet<string>,
  lineas: LineaReposicion[],
  pids?: ReadonlySet<string>,
): Map<string, VarianteAhora> {
  const out = new Map<string, VarianteAhora>()
  const de = (pid: string, sid: string, talle: string) => {
    const k = vid(pid, sid)
    let v = out.get(k)
    if (!v) {
      v = { pid, sid, talle, local: 0, deposito: 0, localBase: 0, vendidas: 0 }
      out.set(k, v)
    }
    return v
  }

  for (const f of base) {
    const pid = String(f.product_id)
    if (pids && !pids.has(pid)) continue
    const v = de(pid, String(f.size_id), String(f.size_name || '').trim() || '—')
    const q = Number(f.available_quantity) || 0
    if (esLocal(f.store_name)) {
      v.local += q
      v.localBase += q
    } else v.deposito += q
  }

  for (const l of lineas) {
    if (incluidas.has(l.saleId)) continue
    if (pids && !pids.has(l.pid)) continue
    const v = de(l.pid, l.sid, '—')
    if (esLocal(l.tienda)) v.local -= l.unidades
    else v.deposito -= l.unidades
    v.vendidas += l.unidades
  }
  return out
}

/** Los productos que están en el local: algún talle tenía algo en la base, o se vendió desde entonces. */
function productosEnLocal(variantes: VarianteAhora[]): Set<string> {
  const out = new Set<string>()
  for (const v of variantes) if (v.localBase > 0 || v.vendidas > 0) out.add(v.pid)
  return out
}

function deLaCampania(items: LiquidacionItem[]): Map<string, LiquidacionItem> {
  return new Map(items.filter((i) => i.estado !== 'descartado').map((i) => [i.pid, i]))
}

/**
 * Lo que hay que bajar del depósito: **producto en el local, talle con local ≤ umbral y depósito
 * con algo**.
 *
 * 🔑 **Lo que no tiene depósito ⛔ no entra**: se agota en el local y ahí termina (Bruno). Va aparte
 * en `agotadosSinDeposito`, sólo para enterarse.
 *
 * El sugerido es `min(depósito, max(2, lo vendido))`: la unidad es el TALLE, y con piso 2 porque
 * bajar una sola prenda de un talle que se está vendiendo es volver a bajar a la hora.
 *
 * Orden: por CATEGORÍA —el depósito camina por perchero, ⛔ no por mesa ni por lista de riesgo— y
 * adentro, lo que más se vendió primero.
 */
export function aReponer(
  variantes: Iterable<VarianteAhora>,
  items: LiquidacionItem[],
  umbral: number,
): ParaReponer[] {
  const vs = [...variantes]
  const porPid = deLaCampania(items)
  const enLocal = productosEnLocal(vs)
  const out: ParaReponer[] = []
  for (const v of vs) {
    const it = porPid.get(v.pid)
    if (!it || !enLocal.has(v.pid)) continue
    if (v.local > umbral || v.deposito <= 0) continue
    out.push({
      ...v,
      nombre: it.foto.nombre,
      imagen: it.foto.imagen,
      categoria: tipoDePrenda(it.foto.nombre),
      sugerido: Math.min(v.deposito, Math.max(2, v.vendidas)),
    })
  }
  return out.sort((a, b) =>
    a.categoria.localeCompare(b.categoria) || b.vendidas - a.vendidas || a.nombre.localeCompare(b.nombre) || a.talle.localeCompare(b.talle))
}

export interface CercaDelLimite extends ParaReponer {
  /** Hoy vendió al menos lo que le queda en el local: a este ritmo cruza la línea antes de cerrar. */
  alRitmo: boolean
}

/**
 * Lo que está **cerca de cruzar la línea**: producto en el local, depósito con algo, y el local
 * apenas por encima del umbral (`umbral < local ≤ umbral + margen`).
 *
 * Lo pidió Bruno el 14-sep-2026 mirando la pestaña: *«me aparece sólo lo que hay para reponer, pero
 * también estaría bueno lo que está más al límite»*. Es lo que conviene bajar **de paso**, en el
 * mismo viaje al depósito, antes de que se vacíe.
 *
 * 🔑 **El que no entra acá está en `aReponer`**: las dos listas no se pisan (`local ≤ umbral` es de
 * la otra), así que un talle ⛔ nunca aparece dos veces.
 *
 * Orden: primero los que **a este ritmo se acaban hoy** (vendieron hoy ≥ lo que queda en el local),
 * después el que menos tiene, después el que más vendió. ⛔ No por categoría: acá la pregunta es
 * cuál va a cruzar primero, no por dónde se camina.
 */
export function cercaDelLimite(
  variantes: Iterable<VarianteAhora>,
  items: LiquidacionItem[],
  umbral: number,
  margen = 2,
): CercaDelLimite[] {
  const vs = [...variantes]
  const porPid = deLaCampania(items)
  const enLocal = productosEnLocal(vs)
  const out: CercaDelLimite[] = []
  for (const v of vs) {
    const it = porPid.get(v.pid)
    if (!it || !enLocal.has(v.pid)) continue
    if (v.local <= umbral || v.local > umbral + margen || v.deposito <= 0) continue
    out.push({
      ...v,
      nombre: it.foto.nombre,
      imagen: it.foto.imagen,
      categoria: tipoDePrenda(it.foto.nombre),
      sugerido: Math.min(v.deposito, Math.max(2, v.vendidas)),
      alRitmo: v.vendidas > 0 && v.vendidas >= v.local,
    })
  }
  return out.sort((a, b) =>
    Number(b.alRitmo) - Number(a.alRitmo) || a.local - b.local || b.vendidas - a.vendidas || a.nombre.localeCompare(b.nombre))
}

/** Lo que se vendió y quedó en cero en el local sin nada en el depósito: murió ahí. */
export function agotadosSinDeposito(variantes: Iterable<VarianteAhora>, items: LiquidacionItem[]): ParaReponer[] {
  const porPid = deLaCampania(items)
  const out: ParaReponer[] = []
  for (const v of variantes) {
    const it = porPid.get(v.pid)
    if (!it || v.vendidas <= 0 || v.local > 0 || v.deposito > 0) continue
    out.push({ ...v, nombre: it.foto.nombre, imagen: it.foto.imagen, categoria: tipoDePrenda(it.foto.nombre), sugerido: 0 })
  }
  return out.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre))
}

/**
 * Los productos de la campaña que están **enteros en el depósito**: nada en el local en la base y
 * nada vendido. ⛔ No es reposición —no se acaba nada en la mesa—: es la decisión de bajarlos, y por
 * eso va aparte y plegado. Uno por PRODUCTO, con el total del depósito.
 */
export function nuncaEnLocal(variantes: Iterable<VarianteAhora>, items: LiquidacionItem[]): NuncaEnLocal[] {
  const vs = [...variantes]
  const porPid = deLaCampania(items)
  const enLocal = productosEnLocal(vs)
  const deposito = new Map<string, number>()
  for (const v of vs) {
    if (enLocal.has(v.pid) || !porPid.has(v.pid)) continue
    deposito.set(v.pid, (deposito.get(v.pid) || 0) + v.deposito)
  }
  const out: NuncaEnLocal[] = []
  for (const [pid, dep] of deposito) {
    if (dep <= 0) continue
    const it = porPid.get(pid)!
    out.push({ pid, nombre: it.foto.nombre, categoria: tipoDePrenda(it.foto.nombre), deposito: dep })
  }
  return out.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre))
}

export interface VentasDelDia {
  unidades: number
  plata: number
  productos: number
}

/**
 * Lo vendido en un día, **sólo minorista** (local y online). Mayorista y las técnicas del Monitor
 * descuentan stock —por eso `stockAhora` las cuenta— pero ⛔ no son venta de la feria.
 */
export function ventasDelDia(lineas: LineaReposicion[], fecha: string): VentasDelDia {
  let unidades = 0
  let plata = 0
  const pids = new Set<string>()
  for (const l of lineas) {
    if (l.fecha !== fecha) continue
    const c = canalDe(l.canal)
    if (c !== 'local' && c !== 'online') continue
    unidades += l.unidades
    plata += l.plata
    if (l.unidades > 0) pids.add(l.pid)
  }
  return { unidades, plata, productos: pids.size }
}
