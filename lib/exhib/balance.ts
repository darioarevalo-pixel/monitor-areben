/**
 * **El balance del sector: qué hay que ir a buscar al depósito del local.**
 *
 * 🔑 **Por qué existe** (20-sep-2026, pedido de Bruno). El recorrido libre contesta *«esto pasó por
 * el lector»*, y `colgar.ts` agrega *«y estos hermanos de lo que tocaste ⛔ no aparecieron»* — que
 * es una lista **siempre verdadera pero corta**: ⛔ no puede hablar de una prenda cuyo producto
 * nadie escaneó. Lo que falta es el otro lado: *«caminé el sector ENTERO, decime todo lo que
 * debería estar colgado acá y ⛔ no está»*.
 *
 * 🔴 **Eso ⛔ no lo puede decidir la app, y por eso el balance lo hace una PERSONA, después.** Que
 * un recorrido haya cubierto un sector entero es un hecho del salón: la app ve 94 escaneos y ⛔ no
 * sabe si el sector tenía 94 prendas o 400. Afirmarlo por su cuenta es lo que produjo los **20
 * corsets faltantes falsos** del 19-sep, de un mueble que nadie había caminado. Acá la app **pone el
 * número** —«tocaste 94 de 400 de esta categoría, el 24 %»— y **la decisión la toma quien mira**.
 * Un 24 % grita «caminó un perchero»; un 95 % dice «caminó el sector».
 *
 * 🔑 **Y «lo que falta» tiene una dirección concreta: el DEPÓSITO DEL LOCAL.** En Gestión Nube el
 * Local es **una sola ubicación** que junta lo colgado en el salón y lo guardado en el depósito del
 * local — por eso el conteo del local se hace *exhibido + depósito* (ver la sección Conteo
 * estándar). ⇒ **stock en Local − lo que pasó por el lector = lo que tiene que estar en el depósito
 * del local**, y si tampoco está ahí, lo que hay es un problema de stock. La lista ⛔ no es un
 * reproche: es un mandado con dirección.
 *
 * ⚠️ **Lo que ⛔ no puede juzgar se dice aparte y ⛔ no se calla**: una prenda sin categoría en
 * Tienda Nube ⛔ no entra en ningún universo —ni como presente ni como faltante—, así que se cuenta
 * por separado. Medido el 20-sep-2026: **297 variantes (95 productos) del Local sin categoría**, de
 * las cuales 36 productos son de **Stunned**, que tiene su propia tienda y nunca va a cruzar.
 *
 * Todo puro: la misma función alimenta la pantalla y el Excel del mandado.
 */

import type { Filas } from '../excel'
import { catsDeItem, exhibId, normCat, perteneceA } from './core'
import { catsVisibles, pasoPorElLector, type EscaneoLibre } from './libre'
import { SIN_CATEGORIA, type ExhibItem } from './tipos'

/** Las variantes de un recorrido que **pasaron por el lector**, en cualquiera de sus lugares. */
export function vistasDelRecorrido(escaneos: EscaneoLibre[]): Set<string> {
  const out = new Set<string>()
  for (const e of escaneos) if (pasoPorElLector(e)) out.add(e.variante_id)
  return out
}

/**
 * Una categoría que el recorrido tocó, con **cuánto de ella cubrió**.
 *
 * 🔴 `cubierto` es el número con el que se decide, y por eso se calcula sobre el **universo entero
 * de la categoría en el Local**, ⛔ no sobre lo escaneado: «94 escaneos» ⛔ no dice nada solo, «94
 * de 400» dice todo.
 */
export type CoberturaCat = {
  cat: string
  /** Variantes con stock en el Local que son de esta categoría. */
  universo: number
  /** De ésas, cuántas pasaron por el lector en este recorrido. */
  vistas: number
  /** `vistas / universo`, de 0 a 1. */
  cubierto: number
  /** Unidades que el sistema tiene en Local para las que ⛔ no se vieron. */
  unidadesSinVer: number
}

/**
 * Las categorías que el recorrido tocó, de la más cubierta a la menos.
 *
 * 🔑 **Se proponen las que tocó y ⛔ no las 21 del catálogo**: quien mira esto acaba de recibir un
 * aviso de que el sector está listo, y elegir entre las tres que aparecieron es una decisión de
 * diez segundos. ⚠️ «(Sin categoría)» ⛔ nunca se propone: ⛔ no es un sector del salón.
 */
export function coberturaPorCat(escaneos: EscaneoLibre[], conStock: ExhibItem[]): CoberturaCat[] {
  const vistas = vistasDelRecorrido(escaneos)
  const tocadas = new Map<string, string>()
  for (const it of conStock) {
    if (!vistas.has(exhibId(it))) continue
    for (const c of catsDeItem(it)) {
      if (c === SIN_CATEGORIA) continue
      if (!tocadas.has(normCat(c))) tocadas.set(normCat(c), c)
    }
  }

  return [...tocadas.values()]
    .map((cat) => {
      const universo = conStock.filter((it) => perteneceA(it, cat))
      const sinVer = universo.filter((it) => !vistas.has(exhibId(it)))
      return {
        cat,
        universo: universo.length,
        vistas: universo.length - sinVer.length,
        cubierto: universo.length ? (universo.length - sinVer.length) / universo.length : 0,
        unidadesSinVer: sinVer.reduce((n, it) => n + it.qty, 0),
      }
    })
    .sort((a, b) => b.cubierto - a.cubierto || b.universo - a.universo || a.cat.localeCompare(b.cat, 'es'))
}

/** Una prenda a buscar en el depósito del local. */
export type Buscar = {
  it: ExhibItem
  /**
   * Las **otras** categorías de la prenda, cuando las tiene.
   *
   * 🔑 **Es la explicación de por qué aparece una prenda que ⛔ no parece del sector.** «TOPS Y
   * BODIES» es un bolsón que se come **5 corsets y un saquito** (medido el 20-sep-2026), y sin esta
   * columna el corset en la lista se lee como un error de la app — y una línea que parece un error
   * le quita autoridad a las otras cincuenta, que están bien.
   */
  tambienEn: string[]
}

/**
 * **El mandado**: lo que tiene stock en el Local en las categorías declaradas y ⛔ no pasó por el
 * lector en todo el recorrido.
 *
 * ⚠️ Las vistas se miran del **recorrido entero** y ⛔ no de un lugar: si el sector se caminó en
 * tres muebles —o si un top apareció en la vidriera y también se escaneó—, esa prenda **está
 * colgada** y ⛔ no se va a buscar al depósito.
 */
export function buscarEnDeposito(escaneos: EscaneoLibre[], conStock: ExhibItem[], cats: string[]): Buscar[] {
  if (!cats.length) return []
  const vistas = vistasDelRecorrido(escaneos)
  const declaradas = cats.map(normCat)
  return conStock
    .filter((it) => !vistas.has(exhibId(it)) && cats.some((c) => perteneceA(it, c)))
    // ⚠️ `catsVisibles` porque en el catálogo vive **la misma categoría dos veces** (mismo nombre,
    // distinto ID en TN): sin esto la explicación dice «CORSETS, CORSETS», que en la columna que
    // justifica por qué aparece una prenda ajena se lee como un error nuestro. Visto en los datos
    // reales del 20-sep-2026.
    .map((it) => ({ it, tambienEn: catsVisibles(catsDeItem(it).filter((c) => c !== SIN_CATEGORIA && !declaradas.includes(normCat(c)))) }))
    .sort((a, b) => b.it.qty - a.it.qty || a.it.name.localeCompare(b.it.name, 'es') || a.it.size.localeCompare(b.it.size, 'es'))
}

export type ResumenBalance = { variantes: number; unidades: number; productos: number }

export function resumenBuscar(lista: Buscar[]): ResumenBalance {
  return {
    variantes: lista.length,
    unidades: lista.reduce((n, b) => n + b.it.qty, 0),
    productos: new Set(lista.map((b) => b.it.productId)).size,
  }
}

/**
 * Lo que el balance **⛔ no puede juzgar**: las prendas del Local sin categoría en Tienda Nube.
 *
 * 🔴 **Se cuenta y se muestra, siempre.** Son invisibles para cualquier universo por categoría: ni
 * aparecen como faltantes ni como presentes. Callarlas haría que el mandado se lea como completo
 * cuando ⛔ no lo es, que es la peor forma de equivocarse acá — nadie va a ir a buscar algo que la
 * lista ⛔ no nombró. Se listan sólo las que **⛔ no se vieron**: la que pasó por el lector está
 * colgada y ⛔ no le hace falta categoría para saberlo.
 */
export function sinCategoriaSinVer(escaneos: EscaneoLibre[], conStock: ExhibItem[]): ExhibItem[] {
  const vistas = vistasDelRecorrido(escaneos)
  return conStock
    .filter((it) => catsDeItem(it)[0] === SIN_CATEGORIA && catsDeItem(it).length === 1 && !vistas.has(exhibId(it)))
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'es'))
}

export const HEADER_BUSCAR = ['Producto', 'Color / Talle', 'SKU', 'Código de barras', 'Unidades en el local', 'También está en']

/** El Excel del mandado, para el que va al depósito del local con el teléfono o el papel. */
export function filasBuscar(lista: Buscar[]): Filas {
  const filas: Filas = [[...HEADER_BUSCAR]]
  for (const b of lista) {
    filas.push([b.it.name, b.it.size, b.it.sku || '', b.it.barcode || '', b.it.qty, b.tambienEn.join(' / ')])
  }
  return filas
}
