/**
 * **El análisis del final del recorrido: lo que se vio contra lo que el sistema dice que hay.**
 *
 * 🔑 **Por qué existe.** Lo pidió Bruno el 19-sep-2026: *«la idea es escanear todo tops, y que te
 * permita escanear todo aunque vaya repetido, y luego al final, que vaya el análisis con lo que
 * pueda faltar y además que se pueda anotar que hay dos repetidos, pero te deje»*. Hasta esa tarde
 * el repetido **rebotaba** —el único de la base es (recorrido, lugar, variante)— así que dos
 * prendas iguales colgadas contaban como una: el recorrido contestaba **«apareció / ⛔ no
 * apareció»** y ⛔ nunca **cuántas**.
 *
 * 🔴 **Son DOS preguntas distintas y ⛔ no una, y mezclarlas rompe la útil:**
 * - **Qué falta colgar** (`lib/exhib/colgar.ts`) = variantes de las que ⛔ no se vio **ninguna**.
 *   Es un **mandado**: alguien va al guardado con esa lista. Meter acá un «vi 1 y el sistema dice
 *   5» haría que el local vaya a buscar algo **que ya está colgado**, y una sola línea así quema
 *   la lista entera (medido el 19-sep: 8 de 58 renglones alcanzaron para eso).
 * - **Lo que acá se responde** = el **conteo**: de cada variante que sí se vio, cuántas unidades
 *   hay colgadas contra las que el sistema tiene. Es un **dato**, ⛔ no un mandado: las que faltan
 *   pueden estar dobladas en la mesa, y está bien que lo estén.
 *
 * ⚠️ **Sólo habla de lo que el recorrido TOCÓ.** Todo lo de acá sale de escaneos: una variante que
 * nadie caminó ⛔ no aparece en ninguna lista, ni como faltante ni como sobrante. ⛔ No se afirma
 * nada sobre lo que nadie miró — es la misma regla que el reporte por categoría rompió el 19-sep a
 * la mañana, cuando dio **20 corsets faltantes falsos** de un mueble que nadie había caminado.
 *
 * Todo puro: la misma función alimenta la pantalla del teléfono, el PDF y lo que se mira después.
 */

import { exhibId } from './core'
import { unidadesVistas, type EscaneoLibre } from './libre'
import type { ExhibItem } from './tipos'

/** Una variante contada: cuántas se vieron colgadas contra las que el sistema dice que hay. */
export type LineaUnidades = {
  it: ExhibItem
  /** Unidades que pasaron por el lector, en todo el recorrido. */
  vistas: number
  /** Lo que el sistema tiene en el Local para esa variante. */
  stock: number
  /** `vistas − stock`: negativo = pueden faltar en el salón; positivo = hay de más. */
  dif: number
  /** El mueble donde se la vio la primera vez: es a dónde ir a mirar. */
  lugar: string
}

export type AnalisisUnidades = {
  /**
   * **Vistas MENOS de las que el sistema dice.** Es «lo que puede faltar»: o están dobladas, o
   * están en otro mueble que ⛔ no se caminó, o el stock está mal. ⚠️ **Puede** y ⛔ no «falta».
   */
  puedenFaltar: LineaUnidades[]
  /** **Vistas MÁS de las que el sistema dice** ⇒ o el stock está mal, o hay mercadería sin ingresar. */
  hayDeMas: LineaUnidades[]
  /** Las que dan exacto. El número solo: si cuadra, ⛔ no hay nada que ir a mirar. */
  cuadran: number
  /** Las que se vieron **más de una vez** — los repetidos, que son la novedad del conteo. */
  repetidas: LineaUnidades[]
  /** Unidades que pasaron por el lector (con los repetidos adentro). */
  unidadesVistas: number
  /** Lo que el sistema dice que hay, **de las variantes que el recorrido vio**. */
  unidadesEnSistema: number
}

export function analisisUnidades(escaneos: EscaneoLibre[], conStock: ExhibItem[]): AnalisisUnidades {
  const vistas = unidadesVistas(escaneos)
  // El primer lugar donde apareció cada variante, por el RELOJ del escaneo y ⛔ no por el orden del
  // array: la lista puede venir de la base o de una cola que subió toda junta.
  const primerLugar = new Map<string, string>()
  for (const e of [...escaneos].sort((a, b) => a.escaneado_en.localeCompare(b.escaneado_en))) {
    if (!primerLugar.has(e.variante_id)) primerLugar.set(e.variante_id, e.lugar)
  }

  const lineas: LineaUnidades[] = []
  for (const it of conStock) {
    const id = exhibId(it)
    const v = vistas.get(id)
    // ⛔ La que ⛔ no se vio ninguna vez ⛔ no es de acá: ésa es la lista de «para colgar», que
    // además sabe si el recorrido tocó su prenda. Decirla en los dos lados es pedir dos veces lo
    // mismo con dos nombres distintos.
    if (!v) continue
    lineas.push({ it, vistas: v, stock: it.qty, dif: v - it.qty, lugar: primerLugar.get(id) || '' })
  }

  // Lo más gordo primero, en los dos lados: una diferencia de 8 unidades ⛔ no es lo mismo que una
  // de 1, y es la que decide si alguien va a mirar.
  const porTamaño = (a: LineaUnidades, b: LineaUnidades) =>
    Math.abs(b.dif) - Math.abs(a.dif) || a.it.name.localeCompare(b.it.name, 'es')

  return {
    puedenFaltar: lineas.filter((l) => l.dif < 0).sort(porTamaño),
    hayDeMas: lineas.filter((l) => l.dif > 0).sort(porTamaño),
    cuadran: lineas.filter((l) => l.dif === 0).length,
    repetidas: lineas.filter((l) => l.vistas > 1).sort((a, b) => b.vistas - a.vistas || a.it.name.localeCompare(b.it.name, 'es')),
    unidadesVistas: lineas.reduce((n, l) => n + l.vistas, 0),
    unidadesEnSistema: lineas.reduce((n, l) => n + l.stock, 0),
  }
}
