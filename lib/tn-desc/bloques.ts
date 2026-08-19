/**
 * Componer el campo `description` de un producto de TiendaNube sin romper lo que ya hay.
 *
 * Ese campo tiene HOY tres cosas apelmazadas en un solo string de HTML: la prosa que
 * escribe el local, la tabla de talles que pega `gen-talles`, y —medido el 19-ago-2026—
 * un `<img>` suelto en 19 de los 369 publicados de Zattia.
 *
 * 🔴 Por esas 19 imágenes NO se puede «rearmar la descripción y tirar el resto»: se las
 * comería en silencio, y del lado de TiendaNube no hay historial para darse cuenta. Lo que
 * no es nuestro se conserva, y descartarlo es una decisión explícita de quien revisa.
 *
 * 🔑 Toda la composición vive acá, en una función pura. El servidor NO vuelve a componer:
 * recibe el resultado y hace compare-and-swap. Una segunda copia de esta regla del otro
 * lado sería media regla en cada lado, que es lo que se desincroniza.
 */

import { PROSA_INI, PROSA_FIN } from './formato'
import { ubicarWrapper } from './prosa'

const RE_PROSA = /<!--AREBEN-PROSA-INI-->[\s\S]*?<!--AREBEN-PROSA-FIN-->/
/** La firma de la tabla. Espejo de `MARK_INI/FIN` de `bdi-catalogo/api/tn-categorias.js:32`. */
const RE_TALLES = /<!--AREBEN-TALLES-INI-->[\s\S]*?<!--AREBEN-TALLES-FIN-->/
const RE_TABLA = /<table[\s\S]*?<\/table>/i

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

/** Parte la descripción actual en sus tres pedazos, sin perder un carácter. */
export function partir(actual: string | null | undefined): Partes {
  let resto = String(actual || '')

  const mProsa = RE_PROSA.exec(resto)
  const prosa = mProsa ? mProsa[0] : ''
  if (mProsa) resto = resto.slice(0, mProsa.index) + resto.slice(mProsa.index + mProsa[0].length)

  // El orden es el mismo que usa el servidor para encontrar «la tabla anterior»: la firma
  // primero, después el wrapper del generador viejo, y recién al final una <table> pelada.
  let talles = ''
  const mT = RE_TALLES.exec(resto)
  if (mT) {
    talles = mT[0]
    resto = resto.slice(0, mT.index) + resto.slice(mT.index + mT[0].length)
  } else {
    const w = ubicarWrapper(resto)
    if (w) {
      talles = resto.slice(w.ini, w.fin)
      resto = resto.slice(0, w.ini) + resto.slice(w.fin)
    } else {
      const mTab = RE_TABLA.exec(resto)
      if (mTab) {
        talles = mTab[0]
        resto = resto.slice(0, mTab.index) + resto.slice(mTab.index + mTab[0].length)
      }
    }
  }

  return { prosa, talles, residuo: resto.trim() }
}

export type OpcionesComponer = {
  /**
   * ¿Se conserva la prosa vieja sin marcar y lo que venga con ella (los `<img>`)?
   * 🔴 Arranca en `true` y no hay default destructivo: el servidor sólo tira el residuo si
   * quien revisa lo vio en pantalla y lo tildó.
   */
  conservarResiduo?: boolean
}

/**
 * La descripción nueva: prosa marcada → residuo → tabla. La clienta lee primero lo que
 * vende y la tabla queda abajo, que es como ya se ve hoy MONITO CAPRY en la tienda.
 *
 * Es idempotente: aplicarla dos veces da lo mismo que aplicarla una.
 */
export function componer(actual: string | null | undefined, htmlProsa: string, op: OpcionesComponer = {}): string {
  const { talles, residuo } = partir(actual)
  const conservar = op.conservarResiduo !== false
  return [htmlProsa, conservar && residuo ? residuo : '', talles].filter(Boolean).join('\n')
}

/** ¿La descripción ya tiene nuestro bloque de prosa? */
export function tieneBloqueProsa(actual: string | null | undefined): boolean {
  return RE_PROSA.test(String(actual || ''))
}

/**
 * El invariante que SÍ chequea el servidor antes de escribir: que la descripción nueva
 * conserve, byte a byte, la tabla que él acaba de leer. Son tres líneas y no es una segunda
 * implementación de `componer` — es la pregunta «¿esto se comió la tabla?».
 */
export function conservaLaTabla(actual: string | null | undefined, nuevo: string): boolean {
  const { talles } = partir(actual)
  return !talles || nuevo.includes(talles)
}

export { PROSA_INI, PROSA_FIN }
