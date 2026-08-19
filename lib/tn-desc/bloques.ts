/**
 * Componer el campo `description` de un producto de TiendaNube sin romper lo que ya hay.
 *
 * 🔑 **Las reglas no viven acá: viven en `bloques.core.js`.** Este archivo es el re-export
 * tipado, el molde de `lib/permisos.ts` sobre `lib/permisos.core.js`. Bajaron a `.js` plano
 * el 19-ago-2026 porque el que compone el texto que sale a la tienda es `api/_tn-desc.js`, y
 * un handler de `api/` corre en Node sin pasar por el compilador de Next: **no puede importar
 * TypeScript**.
 */

import {
  partir as partirJs,
  componer as componerJs,
  tieneBloqueProsa as tieneBloqueProsaJs,
  conservaLaTabla as conservaLaTablaJs,
  PROSA_INI as PROSA_INI_JS,
  PROSA_FIN as PROSA_FIN_JS,
} from './bloques.core.js'

/** Las tres partes de una descripción, tal como está hoy en la tienda. */
export type Partes = {
  /** El bloque de prosa firmado, si ya lo pusimos alguna vez. */
  prosa: string
  /**
   * La tabla de talles, VERBATIM. Sale del bloque firmado (77 productos), o del wrapper del
   * generador viejo, o de la primera `<table>` suelta (149 productos con tabla de otra
   * fuente). Migrar esas 149 es trabajo de `gen-talles`, no de acá: se conservan tal cual.
   */
  talles: string
  /** Todo lo demás: la prosa vieja sin marcar y los `<img>`. Lo que hay que decidir. */
  residuo: string
}

export type OpcionesComponer = {
  /**
   * ¿Se conserva la prosa vieja sin marcar y lo que venga con ella (los `<img>`)?
   * 🔴 Arranca en `true` y no hay default destructivo: sólo se tira el residuo si quien
   * revisa lo vio en pantalla y lo tildó.
   */
  conservarResiduo?: boolean
}

/** Parte la descripción actual en sus tres pedazos, sin perder un carácter. */
export function partir(actual: string | null | undefined): Partes {
  return partirJs(actual) as Partes
}

/** La descripción nueva: prosa marcada → residuo → tabla. Idempotente. */
export function componer(actual: string | null | undefined, htmlProsa: string, op: OpcionesComponer = {}): string {
  return componerJs(actual, htmlProsa, op) as string
}

/** ¿La descripción ya tiene nuestro bloque de prosa? */
export function tieneBloqueProsa(actual: string | null | undefined): boolean {
  return tieneBloqueProsaJs(actual) as boolean
}

/** ¿La descripción nueva conserva, byte a byte, la tabla que tenía la anterior? */
export function conservaLaTabla(actual: string | null | undefined, nuevo: string): boolean {
  return conservaLaTablaJs(actual, nuevo) as boolean
}

export const PROSA_INI: string = PROSA_INI_JS
export const PROSA_FIN: string = PROSA_FIN_JS
