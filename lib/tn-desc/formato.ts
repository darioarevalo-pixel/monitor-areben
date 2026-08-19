/**
 * El formato base de una descripción de Zattia, con tipos — y el HTML que se pega en la ficha.
 *
 * 🔑 **Las reglas no viven acá: viven en `formato.core.js`.** Este archivo es el re-export
 * tipado, el molde de `lib/permisos.ts` sobre `lib/permisos.core.js`. Bajaron a `.js` plano el
 * 19-ago-2026 porque el reintento del redactor las necesita, y ese camino termina en
 * `api/_tn-desc-ia.js` — un handler de `api/` corre en Node sin pasar por el compilador de
 * Next y **no puede importar TypeScript**.
 *
 * ⚠️ `generarHtml` TAMBIÉN bajó al `.js` (19-ago-2026): el HTML que sale a la tienda lo arma
 * `api/_tn-desc.js` a partir del borrador aprobado que está guardado, no el navegador.
 *
 * 🔑 El borrador es DATO (`{parrafo, bullets}`), no texto libre ni HTML. El HTML lo arma
 * `generarHtml`, igual que `lib/gen-talles/core.ts` arma la tabla: así el estilo vive en un
 * lugar solo y las reglas se prueban sin pintar nada.
 */

import {
  ETIQUETAS as ETIQUETAS_JS,
  MAX_PARRAFO as MAX_PARRAFO_JS,
  MAX_BULLET as MAX_BULLET_JS,
  MIN_BULLETS as MIN_BULLETS_JS,
  MAX_BULLETS as MAX_BULLETS_JS,
  PROSA_INI as PROSA_INI_JS,
  PROSA_FIN as PROSA_FIN_JS,
  validarBorrador as validarBorradorJs,
  generarHtml as generarHtmlJs,
} from './formato.core.js'

export type Bullet = { etiqueta: string; texto: string }
export type Borrador = { parrafo: string; bullets: Bullet[] }

/**
 * La lista cerrada de etiquetas. El valor sale del `.js`; la unión se declara acá porque
 * TypeScript infiere `string[]` de un archivo JS y perdería el chequeo en la pantalla.
 * ⚠️ Que las dos no se separen lo cuida `tests/tn-desc-formato.test.ts`, que compara
 * `ETIQUETAS` contra la unión escrita: sin eso, agregar una etiqueta en el `.js` la dejaría
 * andando en el validador y rechazada por el `<select>`.
 */
export type Etiqueta = 'Tela' | 'Calce' | 'Cuello' | 'Escote' | 'Detalle' | 'Largo' | 'Manga' | 'Espalda'
export const ETIQUETAS = ETIQUETAS_JS as readonly Etiqueta[]

export const MAX_PARRAFO: number = MAX_PARRAFO_JS
export const MAX_BULLET: number = MAX_BULLET_JS
export const MIN_BULLETS: number = MIN_BULLETS_JS
export const MAX_BULLETS: number = MAX_BULLETS_JS

export const PROSA_INI: string = PROSA_INI_JS
export const PROSA_FIN: string = PROSA_FIN_JS

/** Lo que se sabe del producto y hace falta para juzgar el borrador. */
export type Contexto = {
  /** Los valores de las variantes de TN (colores y talles). De acá sale lo que NO se nombra. */
  variantes: string[]
  /** Las 3-4 palabras que tipeó el local, o la prosa que ya había. La tela sale de acá. */
  insumo: string
  /** El nombre del producto en TN. También puede traer la tela («REMERA HONEST de jersey»). */
  nombre: string
}

export type Problema = { campo: string; motivo: string }

/**
 * Los problemas del borrador. Vacío = se puede publicar. La implementación está en
 * `formato.core.js`; acá sólo se le pone el tipo.
 */
export function validarBorrador(b: Borrador, ctx: Contexto): Problema[] {
  return validarBorradorJs(b, ctx) as Problema[]
}

/**
 * El HTML autónomo (estilos inline, como el de la tabla) que se pega en la descripción,
 * envuelto en la firma AREBEN-PROSA para poder reemplazarlo después sin tocar el resto.
 * La implementación está en `formato.core.js`, porque el que arma este HTML para escribirlo
 * en la tienda es un handler de `api/`.
 */
export function generarHtml(b: Borrador): string {
  return generarHtmlJs(b)
}
