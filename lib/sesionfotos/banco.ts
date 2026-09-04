/**
 * El BANCO de productos de la sesión — la Fase 3 del octavo (4-sep-2026).
 *
 * Lo pidió Bruno el 3-sep: *«eso tiene que generar un banco de productos de la sesión, donde se
 * realiza una clasificación rápida y se generan outfits digitales con distintos productos de
 * arriba y abajo. Si el producto de la OC que ingresó no alcanza para armar outfits, se procede a
 * pedir una solicitud a local, es decir, el armado de outfits se realiza desde ahí, entonces va
 * más ordenado»*.
 *
 * 🔑 **El banco es el paso que faltaba entre elegir y pedir.** Hasta la Fase 2 el orden era
 * «busco → pido → después veo cómo lo agrupo». Ahora es **candidatos → outfits → pido**, y el
 * pedido sale ya repartido: cada pieza viaja con su número de outfit puesto.
 *
 * ## 🔑 El outfit se numera por EVENTO, y al pedir viaja a `item.bolsa`
 *
 * Con eso la etiqueta «BOLSA n/N» y el reporte A4 de armado **siguen andando sin tocarlos**, y
 * —esto es lo que el pedido de Bruno necesitaba— **un outfit puede cruzar dos solicitudes**: el
 * top que sale del depósito y el jean que sale del local son el **mismo outfit 3**.
 *
 * ## ⛔ Sin migración y sin copiar las reglas
 *
 * El banco vive adentro del evento (`SesionEvento.banco`), que es jsonb. Y la clasificación
 * arriba/abajo/entero ⛔ **no se reescribe acá**: es la misma de `outfits.ts`, que desde esta fase
 * habla `PrendaClasificable` — el banco sólo mapea su `outfit` al `bolsa` que esa forma espera.
 * Escribirlas dos veces sería lo que haría que un día el aviso del banco y el de la solicitud
 * dijeran cosas distintas del mismo outfit.
 */

import { draftVacio, expandirProductos, procesarDraft, tildarVariantes, vidsAusentes, type MetaSolicitud } from './draft'
import { alertasDe, aplicaOutfits, sinZona, zonasDe, type PrendaClasificable, type ZonaPrenda } from './outfits'
import type { Disparador } from '../solicitudes/disparador'
import type { Producto, Variante } from '../etl/tipos'
import type { Origen, Solicitud, TipoSol } from './tipos'

/** De dónde salió el candidato: del stock de hoy o de una orden de compra ya recibida. */
export type CandidatoBanco = 'stock' | 'oc'

/**
 * Un candidato del banco. **Todavía ⛔ no se pidió nada**: es una prenda que alguien puso sobre la
 * mesa para armar los looks.
 */
export type ItemBanco = {
  /** El mismo `vid` que usa la solicitud, para que pedir sea un mapeo y ⛔ no una traducción. */
  vid: string
  pid: string | null
  sid: string | null
  nombre: string
  variante: string
  sku: string
  /** Stock de sistema al momento de sumarlo (informativo, igual que en la solicitud). */
  stockDep?: number
  stockLoc?: number
  candidato: CandidatoBanco
  /**
   * El **id** de la orden de compra de la que salió, cuando `candidato` es `oc` (`<marca>:<oc>`).
   * Es la clave con la que se vuelve a abrir la orden, y por eso ⛔ no se guarda el rótulo acá.
   */
  ocRef?: string
  /**
   * El rótulo de esa orden («OC-0469»), que es lo que lee una persona.
   *
   * 🔑 Va guardado y ⛔ no se deriva de `ocRef`: el id ⛔ no lo contiene, y el banco se abre meses
   * después, cuando la pantalla ya ⛔ no tiene la lista de órdenes cargada.
   */
  ocLabel?: string
  /**
   * La zona CORREGIDA a mano. Ausente = vale la que propone el nombre.
   * 🔑 Misma regla que `Solicitud.clasifOutfits`: se guarda la corrección, ⛔ nunca la propuesta.
   */
  zona?: ZonaPrenda
  /** El número de outfit. Ausente = todavía no lo repartió nadie. */
  outfit?: number
  /**
   * En qué solicitud terminó. Ausente = **todavía no se pidió**.
   *
   * 🔴 Es lo que impide pedir dos veces la misma pieza — que en el depósito significa **dos
   * ventas en Gestión Nube por una prenda sola**.
   */
  pedidoEn?: string
}

/**
 * El banco, como lo ve `outfits.ts`: su `outfit` es el `bolsa` de aquella forma.
 *
 * 🔑 **Este mapeo es el adaptador entero.** Tres campos y una línea, contra copiar el vocabulario
 * de prendas y las reglas del aviso.
 */
export function comoPrendas(banco: ItemBanco[]): PrendaClasificable[] {
  return (banco || []).map((i) => ({ vid: i.vid, nombre: i.nombre, pid: i.pid, bolsa: i.outfit }))
}

/** Las correcciones de zona del banco, en la forma que `outfits.ts` espera. */
export function clasifDe(banco: ItemBanco[]): Record<string, ZonaPrenda> {
  const out: Record<string, ZonaPrenda> = {}
  for (const i of banco || []) if (i.zona) out[i.vid] = i.zona
  return out
}

/** La zona que vale para cada candidato (propuesta por el nombre + corrección a mano). */
export function zonasDelBanco(banco: ItemBanco[]) {
  return zonasDe(comoPrendas(banco), clasifDe(banco))
}

/** Los avisos «al outfit 3 le falta el abajo», sobre el banco. La misma función que la solicitud. */
export function alertasDelBanco(banco: ItemBanco[]) {
  return alertasDe(comoPrendas(banco), clasifDe(banco))
}

/** ¿Este banco es de ropa? En BDI da falso y el bloque de outfits se calla, igual que en la solicitud. */
export function aplicaOutfitsBanco(banco: ItemBanco[]): boolean {
  return aplicaOutfits(comoPrendas(banco), clasifDe(banco))
}

/** Los candidatos que hay que clasificar a mano: sin zona y que son prenda de outfit. */
export function sinZonaBanco(banco: ItemBanco[]): ItemBanco[] {
  const pendientes = new Set(sinZona(comoPrendas(banco), clasifDe(banco)).map((p) => p.vid))
  return (banco || []).filter((i) => pendientes.has(i.vid))
}

/* ------------------------------------------------------------------ mutaciones */

/**
 * Suma candidatos al banco. **⛔ No duplica**: un `vid` que ya está se ignora, y eso ⛔ no es un
 * error — es que alguien volvió a traer la misma prenda desde el buscador.
 */
export function agregarAlBanco(banco: ItemBanco[], nuevos: ItemBanco[]): ItemBanco[] {
  const hay = new Set((banco || []).map((i) => i.vid))
  const suma = (nuevos || []).filter((i) => {
    if (hay.has(i.vid)) return false
    hay.add(i.vid)
    return true
  })
  return suma.length ? [...(banco || []), ...suma] : banco || []
}

/**
 * Por qué ⛔ NO se puede sacar un candidato del banco, o `null` si se puede.
 *
 * 🔴 **Lo ya pedido ⛔ no se saca.** Esa pieza está adentro de una solicitud real, con su venta en
 * Gestión Nube: sacarla del banco ⛔ no la devuelve, sólo borra el único rastro de que salió por
 * esta sesión. Primero se resuelve la solicitud.
 */
export function bloqueoSacarDelBanco(banco: ItemBanco[], vid: string): string | null {
  const it = (banco || []).find((i) => i.vid === vid)
  if (!it || !it.pedidoEn) return null
  return 'Esta prenda ya se pidió: está en una solicitud, con su venta en Gestión Nube. Sacala desde la solicitud, no desde el banco.'
}

/** Saca un candidato. El guard de arriba se pregunta ANTES, en la pantalla. */
export function sacarDelBanco(banco: ItemBanco[], vid: string): ItemBanco[] {
  return (banco || []).filter((i) => i.vid !== vid)
}

/**
 * Asigna (o suelta, con `null`) el outfit de un candidato. Mismo molde que `asignarBolsa`.
 *
 * 🔑 **Soltar BORRA la clave**, ⛔ no la deja en `null`: «sin outfit» es un estado —todavía no lo
 * repartió nadie—, ⛔ no un outfit que se llama nada.
 */
export function conOutfit(banco: ItemBanco[], vid: string, n: number | null): ItemBanco[] {
  return (banco || []).map((i) => {
    if (i.vid !== vid) return i
    if (n == null) {
      if (i.outfit == null) return i
      const { outfit: _fuera, ...resto } = i
      return resto
    }
    return { ...i, outfit: Math.max(1, Math.floor(n)) }
  })
}

/** Corrige (o suelta) la zona de un candidato. Mismo molde que `conZona` de la solicitud. */
export function conZonaBanco(banco: ItemBanco[], vid: string, zona: ZonaPrenda | null): ItemBanco[] {
  return (banco || []).map((i) => {
    if (i.vid !== vid) return i
    if (zona == null) {
      if (i.zona == null) return i
      const { zona: _fuera, ...resto } = i
      return resto
    }
    return { ...i, zona }
  })
}

/** Un outfit del banco: su número, sus candidatos y si ya se pidió entero. */
export type GrupoOutfit = { n: number | null; items: ItemBanco[]; pedidos: number }

/**
 * Agrupa el banco por outfit, ascendente; el grupo `n: null` (sin repartir) va al final.
 * Mismo molde que `bolsasDe`.
 */
export function outfitsDe(banco: ItemBanco[]): GrupoOutfit[] {
  const mapa = new Map<number | null, ItemBanco[]>()
  for (const i of banco || []) {
    const k = typeof i.outfit === 'number' ? i.outfit : null
    const arr = mapa.get(k)
    if (arr) arr.push(i)
    else mapa.set(k, [i])
  }
  const nums = [...mapa.keys()].filter((k): k is number => k != null).sort((a, b) => a - b)
  const orden: (number | null)[] = mapa.has(null) ? [...nums, null] : nums
  return orden.map((n) => {
    const items = mapa.get(n) || []
    return { n, items, pedidos: items.filter((i) => i.pedidoEn).length }
  })
}

/** El próximo número de outfit libre. */
export function proximoOutfit(banco: ItemBanco[]): number {
  return (banco || []).reduce((m, i) => (typeof i.outfit === 'number' && i.outfit > m ? i.outfit : m), 0) + 1
}

/* ---------------------------------------------------------------------- pedir */

/**
 * Lo que hay que pasarle a `expandirProductos` + `tildarVariantes` para pedir estos candidatos.
 *
 * 🔑 **Se reusa el armado del borrador que ya existe y ⛔ no se construye una solicitud a mano.**
 * Eso importa por una razón concreta: `expandirProductos` **deja afuera las variantes sin stock**,
 * así que una prenda que se agotó entre que entró al banco y que se pidió ⛔ no entra — y
 * `vidsAusentes` la nombra. Armar los ítems acá saltearía ese control y la solicitud saldría
 * pidiendo algo que ⛔ no existe.
 */
export function paraPedir(banco: ItemBanco[], vids: string[]): { pids: string[]; vids: string[] } {
  const pedidos = new Set((vids || []).map(String))
  const elegidos = (banco || []).filter((i) => pedidos.has(i.vid) && !i.pedidoEn)
  return {
    pids: [...new Set(elegidos.map((i) => String(i.pid)).filter((p) => p && p !== 'null'))],
    vids: elegidos.map((i) => i.vid),
  }
}

/**
 * Copia el número de outfit del banco al `bolsa` de cada ítem de la solicitud recién creada.
 *
 * 🔴 **Es el puente entero de la Fase 3, y por eso ⛔ no inventa nada**: un candidato sin outfit
 * deja el ítem sin bolsa, como si lo hubiera pedido alguien a mano. Numerarlo acá le pondría un
 * número que nadie eligió, y el reporte de armado imprimiría una bolsa que ⛔ no existe.
 */
export function conOutfitsDelBanco(sol: Solicitud, banco: ItemBanco[]): Solicitud {
  const porVid = new Map((banco || []).map((i) => [i.vid, i.outfit]))
  let toco = false
  const items = (sol.items || []).map((i) => {
    const n = porVid.get(i.vid)
    if (typeof n !== 'number' || i.bolsa === n) return i
    toco = true
    return { ...i, bolsa: n }
  })
  return toco ? { ...sol, items } : sol
}

/** Marca los candidatos como ya pedidos, con el id de la solicitud en la que salieron. */
export function marcarPedidos(banco: ItemBanco[], vids: string[], solicitudId: string): ItemBanco[] {
  const pedidos = new Set((vids || []).map(String))
  return (banco || []).map((i) => (pedidos.has(i.vid) && !i.pedidoEn ? { ...i, pedidoEn: solicitudId } : i))
}

/** Los candidatos que todavía ⛔ no se pidieron. Es lo que el botón «Pedir» puede mandar. */
export function sinPedir(banco: ItemBanco[]): ItemBanco[] {
  return (banco || []).filter((i) => !i.pedidoEn)
}

/**
 * Un resumen del banco, para que la pantalla ⛔ no cuente a mano.
 *
 * ⚠️ `outfitsCompletos` cuenta los que ⛔ **no tienen aviso** entre los que tienen alguna prenda
 * clasificada. 🔴 Y por eso ⛔ no se dibuja como un logro cuando el banco está vacío: **hoy
 * diría 0 para todas las sesiones**, que es lo que dice un banco que nadie llenó, ⛔ no un
 * problema.
 */
export function resumenBanco(banco: ItemBanco[]): { total: number; pedidos: number; outfits: number; outfitsCompletos: number; sinOutfit: number } {
  const grupos = outfitsDe(banco)
  const conAviso = new Set(alertasDelBanco(banco).map((a) => a.n))
  const zonas = zonasDelBanco(banco)
  const numerados = grupos.filter((g) => g.n != null)
  return {
    total: (banco || []).length,
    pedidos: (banco || []).filter((i) => i.pedidoEn).length,
    outfits: numerados.length,
    outfitsCompletos: numerados.filter((g) => !conAviso.has(g.n as number) && g.items.some((i) => zonas[i.vid])).length,
    sinOutfit: (banco || []).filter((i) => typeof i.outfit !== 'number').length,
  }
}

/** Lo que sale de pedir: la solicitud (o `null` si ⛔ no quedó nada) y lo que ⛔ no entró. */
export type Pedido = {
  sol: Solicitud | null
  /**
   * Los `vid` que se pidieron y ⛔ **NO entraron**, con nombre y todo del lado de la pantalla.
   * 🔴 Se devuelven y ⛔ no se descartan: una prenda que se agotó entre que entró al banco y que se
   * pidió haría que la sesión saliera corta **sin que nadie se entere**.
   */
  ausentes: string[]
}

/**
 * **Pedir del banco: la cadena entera, escrita UNA vez.**
 *
 * Vive en el núcleo y ⛔ no en la pantalla porque es lo único que este módulo de verdad hace, y
 * porque escrita en la pantalla el test tendría que **copiar la secuencia** para probarla — y un
 * test que prueba una copia deja de vigilar el día que la pantalla cambia.
 *
 * 🔑 **Reusa el armado del borrador que ya existía** (`expandirProductos` + `tildarVariantes` +
 * `procesarDraft`) en vez de construir ítems a mano. Eso ⛔ no es prolijidad: `expandirProductos`
 * **deja afuera las variantes sin stock**, así que ese control se hereda gratis, y el origen de
 * cada pieza lo decide `procesarDraft` con la prioridad + el fallback por stock de siempre.
 */
export function pedidoDesdeBanco(
  banco: ItemBanco[],
  vids: string[],
  destino: Origen,
  catalogo: { variantes: Variante[]; productos: Producto[] },
  meta: MetaSolicitud & { descripcion?: string; motivo?: string; tipo?: TipoSol; disparador?: Disparador | null },
): Pedido {
  const { pids, vids: pedidos } = paraPedir(banco, vids)
  if (!pedidos.length) return { sol: null, ausentes: [] }
  let d = draftVacio(meta.motivo, meta.tipo, meta.disparador ?? null)
  d = expandirProductos(d, pids, catalogo.variantes, catalogo.productos)
  d = tildarVariantes(d, pedidos)
  const ausentes = vidsAusentes(d, pedidos)
  const sol = procesarDraft({ ...d, desc: meta.descripcion || '' }, destino, meta)
  return { sol: sol ? conOutfitsDelBanco(sol, banco) : null, ausentes }
}
