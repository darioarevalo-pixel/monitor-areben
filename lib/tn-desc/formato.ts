/**
 * El formato base de una descripción de Zattia, con tipos — y el HTML que se pega en la ficha.
 *
 * 🔑 **Las reglas no viven acá: viven en `formato.core.js`.** Este archivo es el re-export
 * tipado, el molde de `lib/permisos.ts` sobre `lib/permisos.core.js`. Bajaron a `.js` plano el
 * 19-ago-2026 porque el reintento del redactor las necesita, y ese camino termina en
 * `api/_tn-desc-ia.js` — un handler de `api/` corre en Node sin pasar por el compilador de
 * Next y **no puede importar TypeScript**.
 *
 * ⚠️ **Desde el 27-ago-2026 acá se valida SÓLO el párrafo.** Los bullets ya no se escriben: los
 * compone `lib/tn-desc/atributos.core.js` desde la ficha que carga el local, con lista cerrada.
 * Lo que antes eran reglas —etiqueta válida, sin repetir, 3 o 4, tela apoyada en el insumo— son
 * hoy casos imposibles. Ver el encabezado del `.core.js`.
 */

import {
  MAX_PARRAFO as MAX_PARRAFO_JS,
  PRIMEROS as PRIMEROS_JS,
  PROSA_INI as PROSA_INI_JS,
  PROSA_FIN as PROSA_FIN_JS,
  tipoDe as tipoDeJs,
  validarParrafo as validarParrafoJs,
  validarTip as validarTipJs,
  MAX_TIP as MAX_TIP_JS,
  generarHtml as generarHtmlJs,
} from './formato.core.js'

/** Un bullet ya compuesto. La etiqueta la decide `atributos.core.js`, no quien escribe. */
export type Bullet = { etiqueta: string; texto: string }

/**
 * Lo que se guarda y lo que se pinta: el párrafo escrito + los bullets compuestos.
 *
 * ⚠️ `tip` es OPCIONAL por decisión de Bruno (4-sep-2026): un tip flojo pesa más que la falta de
 * tip. `cuidados` ⛔ no se escribe ni se guarda — lo compone `cuidados.core.js` desde la tela al
 * momento de publicar, igual que los bullets.
 */
export type Borrador = { parrafo: string; bullets: Bullet[]; tip?: string; cuidados?: { grupo: string; lineas: string[] } | null; pie?: string | null }

export const MAX_PARRAFO: number = MAX_PARRAFO_JS

/** El techo del tip de look: es una línea, no un segundo párrafo. */
export const MAX_TIP: number = MAX_TIP_JS
export const PRIMEROS: number = PRIMEROS_JS

export const PROSA_INI: string = PROSA_INI_JS
export const PROSA_FIN: string = PROSA_FIN_JS

/** Lo que se sabe del producto y hace falta para juzgar el párrafo. */
export type Contexto = {
  /** Los valores de las variantes de TN (colores y talles). De acá sale lo que NO se nombra. */
  variantes: string[]
  /** El nombre del producto en TN. De acá sale el tipo de prenda que el párrafo tiene que decir. */
  nombre: string
  /** Los bullets ya compuestos: el párrafo no puede repetir lo que ellos dicen. */
  bullets?: Bullet[]
}

export type Problema = { campo: string; motivo: string }

/**
 * Los problemas del párrafo. Vacío = se puede aprobar. La implementación está en
 * `formato.core.js`; acá sólo se le pone el tipo.
 */
export function validarParrafo(parrafo: string, ctx: Contexto): Problema[] {
  return validarParrafoJs(parrafo, ctx) as Problema[]
}

/**
 * Los problemas del TIP DE LOOK. Vacío = se puede aprobar, y **vacío también es válido**: el tip
 * es opcional (decisión de Bruno, 4-sep-2026).
 */
export function validarTip(tip: string, ctx: Pick<Contexto, 'variantes'>): Problema[] {
  return validarTipJs(tip, ctx) as Problema[]
}

/** El tipo de prenda según el nombre del producto («TOP BLISS» → «TOP»). */
export function tipoDe(nombre: string): string {
  return tipoDeJs(nombre)
}

/**
 * El HTML autónomo que se pega en la descripción, envuelto en la firma AREBEN-PROSA. La
 * implementación está en `formato.core.js`, porque el que arma este HTML para escribirlo en la
 * tienda es un handler de `api/`.
 */
export function generarHtml(b: Borrador): string {
  return generarHtmlJs(b)
}
