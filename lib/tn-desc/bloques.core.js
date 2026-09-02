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
 * 🔑 Toda la composición vive acá, en funciones puras, y se corre UNA vez: en
 * `api/_tn-desc.js`, con el borrador aprobado que está guardado en la tabla. Ni el navegador
 * ni `bdi-catalogo` recomponen — `bdi-catalogo` recibe el texto ya armado y sólo se hace las
 * preguntas que necesitan la tienda delante (¿es la misma versión?, ¿sobrevivió la tabla?,
 * ¿la escritura pasó?). Dos composiciones del mismo campo es lo que se desincroniza.
 *
 * 🔑 Es `.js` plano por el motivo de siempre: `api/` corre en Node sin pasar por el
 * compilador de Next y no puede importar TypeScript. `bloques.ts` es el re-export tipado.
 */

import { PROSA_INI, PROSA_FIN } from './formato.core.js'

const RE_PROSA = /<!--AREBEN-PROSA-INI-->[\s\S]*?<!--AREBEN-PROSA-FIN-->/
/** La firma de la tabla. Espejo de `MARK_INI/FIN` de `bdi-catalogo/api/_desc-talles.js`. */
const RE_TALLES = /<!--AREBEN-TALLES-INI-->[\s\S]*?<!--AREBEN-TALLES-FIN-->/
const RE_TABLA = /<table[\s\S]*?<\/table>/i

/**
 * Dónde empieza y termina UN wrapper del generador viejo (div con `max-width:680px`),
 * contando el balance de `<div>`. Port fiel de `removeOneWrapper` de
 * `bdi-catalogo/api/_desc-talles.js`: si el cierre no balancea devuelve `null` — un HTML roto
 * no se "arregla" adivinando.
 *
 * 🔑 Devuelve las POSICIONES y no el html recortado, porque hay dos preguntas distintas
 * sobre lo mismo: `sacarWrappers` (en `prosa.ts`) quiere lo de AFUERA para medir la prosa, y
 * `partir` quiere lo de ADENTRO para conservar la tabla vieja verbatim. Una sola
 * implementación del balanceo, dos lectores.
 */
export function ubicarWrapper(html) {
  const m = /<div[^>]*max-width:\s*680px[^>]*>/i.exec(html)
  if (!m) return null
  let depth = 1
  const re = /<\/?div\b[^>]*>/gi
  re.lastIndex = m.index + m[0].length
  let mm
  while ((mm = re.exec(html))) {
    if (mm[0].slice(0, 2).toLowerCase() === '</') depth--
    else depth++
    if (depth === 0) return { ini: m.index, fin: mm.index + mm[0].length }
  }
  return null
}

/** Parte la descripción actual en sus tres pedazos, sin perder un carácter. */
export function partir(actual) {
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

/**
 * La descripción nueva: prosa marcada → residuo → tabla. La clienta lee primero lo que
 * vende y la tabla queda abajo, que es como ya se ve hoy MONITO CAPRY en la tienda.
 *
 * Es idempotente: aplicarla dos veces da lo mismo que aplicarla una.
 */
export function componer(actual, htmlProsa, op = {}) {
  const { talles, residuo } = partir(actual)
  const conservar = op.conservarResiduo !== false
  // 🔴 `htmlTalles` REEMPLAZA la tabla que había, ⛔ no se suma. Usa la misma firma, así que dos
  // tablas en la misma ficha no pueden pasar. Cuando no viene —el caso de siempre— la vieja se
  // conserva tal cual, que es lo que hacía esta función desde el 19-ago-2026.
  //
  // ⚠️ Y una tabla NUEVA vacía ⛔ no borra la que había: `htmlDeMedidas` devuelve `''` tanto para
  // «esta prenda no lleva» como para «todavía nadie la midió», y las dos cosas no pueden costar la
  // única copia de la tabla que existe. Sacar una tabla es un verbo aparte, con su propio botón.
  const tabla = op.htmlTalles || talles
  return [htmlProsa, conservar && residuo ? residuo : '', tabla].filter(Boolean).join('\n')
}

/** ¿La descripción ya tiene nuestro bloque de prosa? */
export function tieneBloqueProsa(actual) {
  return RE_PROSA.test(String(actual || ''))
}

/**
 * El invariante que SÍ chequea el servidor antes de escribir: que la descripción nueva
 * conserve, byte a byte, la tabla que él acaba de leer. Son tres líneas y no es una segunda
 * implementación de `componer` — es la pregunta «¿esto se comió la tabla?».
 */
export function conservaLaTabla(actual, nuevo, htmlTalles) {
  const { talles } = partir(actual)
  if (!talles) return true
  if (nuevo.includes(talles)) return true
  // 🔑 Reemplazarla a propósito NO es comérsela — pero el guard sigue exigiendo que la nueva esté
  // ENTERA en el resultado. Aflojarlo a «si viene htmlTalles, todo bien» lo apagaría justo en el
  // único camino donde la tabla se toca.
  return !!htmlTalles && nuevo.includes(htmlTalles)
}

export { PROSA_INI, PROSA_FIN }
