/**
 * La PROSA de una ficha de TiendaNube: lo que la clienta lee como descripción,
 * separado de la tabla de talles que vive en el MISMO campo `description`.
 *
 * Por qué existe: `has_desc` del audit (`bdi-catalogo/api/tiendanube-audit.js`) mide
 * `desc.length > 10` sobre el HTML crudo con los tags pelados — y el TEXTO DE LA TABLA
 * (Talle, Cintura, Largo, los números) cuenta como descripción. Medido contra Zattia el
 * 19-ago-2026: el contador decía 39 publicados «sin descripción» y son 41. Los dos que
 * faltaban tienen la tabla puesta y ni una palabra de prosa.
 *
 * 🔑 **Es `.core.js` y ⛔ no `.ts`** desde el 8-sep-2026, por el mismo motivo que
 * `permisos.core.js` y `formato.core.js`: lo necesitan los handlers de `api/` y los scripts de
 * `scripts/`, que corren en Node sin pasar por el compilador de Next y ⛔ no pueden importar
 * TypeScript. El caso concreto fue `desc-borradores.mjs`, que tenía que listar las descripciones
 * CORTAS y ⛔ no podía preguntar cuál es corta sin copiarse esta lógica — que es la forma de que
 * dos medidas de lo mismo se separen sin que nadie lo note. `prosa.ts` quedó de re-export tipado.
 *
 * 🔑 Esto NO reemplaza a `has_desc`: lo leen Marketing y la cola de `gen-talles`, y ahí
 * la pregunta no es la misma («¿tiene algo?» vs «¿tiene prosa?»). Se migra un consumidor
 * por vez. Ver `lib/marketing/core.ts` y `lib/gen-talles/core.ts`.
 */

/** La firma del generador propio. Espejo de `MARK_INI/FIN` de `bdi-catalogo/api/_desc-talles.js`. */
const RE_BLOQUE_TALLES = /<!--AREBEN-TALLES-INI-->[\s\S]*?<!--AREBEN-TALLES-FIN-->/g

/**
 * El bloque de prosa marcado (todavía no existe en la tienda; nace con esta tanda).
 * Se conserva a propósito: ESO es prosa, y sacarlo mediría cero justo en los productos
 * que ya arreglamos.
 */
export const PROSA_INI = '<!--AREBEN-PROSA-INI-->'
export const PROSA_FIN = '<!--AREBEN-PROSA-FIN-->'

/** El bloque de prosa firmado, con su contenido en el grupo 1. */
const RE_BLOQUE_PROSA = /<!--AREBEN-PROSA-INI-->([\s\S]*?)<!--AREBEN-PROSA-FIN-->/g

/** Una `<table>` suelta: las 149 tablas legacy de Zattia que no tienen la firma. */
const RE_TABLA = /<table[\s\S]*?<\/table>/gi

// El balanceo de `<div>` vive en `bloques.core.js`: lo necesitan las dos preguntas (medir la
// prosa, y conservar la tabla vieja verbatim al componer). Una sola implementación.
import { ubicarWrapper } from './bloques.core.js'
export { ubicarWrapper }

/** Las entidades que TiendaNube devuelve en las descripciones de Zattia. */
const ENTIDADES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ordf: 'ª', ordm: 'º',
  iquest: '¿', iexcl: '¡', deg: '°', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
}

/** Desescapa entidades nombradas y numéricas. Sin esto `&aacute;` cuenta 8 caracteres. */
export function desescapar(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTIDADES[n] ?? m)
}

function sacarUnWrapper(html) {
  const w = ubicarWrapper(html)
  return w ? html.slice(0, w.ini) + html.slice(w.fin) : html
}

/** Saca todos los wrappers del generador viejo. */
export function sacarWrappers(html) {
  let out = html
  let prev
  do {
    prev = out
    out = sacarUnWrapper(out)
  } while (out !== prev)
  return out
}

/**
 * Saca del HTML todo lo que NO es prosa: el bloque firmado de talles, los wrappers del
 * generador viejo y las `<table>` sueltas.
 *
 * 🔴 El ORDEN es la regla: primero los bloques FIRMADOS, después los wrappers, y recién
 * al final los tags. Al revés, pelar los tags destruye el `<table>` y la prosa se traga
 * la tabla entera — que es exactamente el defecto que tiene hoy `has_desc`.
 *
 * 🔴 Y el bloque de PROSA sale del camino ANTES que los wrappers, no después. `generarHtml`
 * lo envuelve en un `<div style="…max-width:680px…">`, que es LA MISMA FIRMA con la que
 * `sacarWrappers` reconoce el envoltorio del generador viejo de talles. Sin sacarlo primero,
 * medir la prosa que nosotros mismos acabamos de publicar da CERO — o sea que el producto
 * recién arreglado seguiría contando como «sin descripción» en Marketing y en la propia
 * pantalla de Redacción. Medido el 19-ago-2026 sobre la salida real de `generarHtml`.
 */
export function sinTablas(raw) {
  const marcada = []
  const resto = String(raw || '').replace(RE_BLOQUE_PROSA, (_m, dentro) => {
    marcada.push(dentro)
    return ' '
  })
  // Lo que está adentro del bloque firmado es prosa POR DEFINICIÓN: lo escribimos nosotros
  // con el formato base. No pasa por `sacarWrappers` ni por `RE_TABLA`.
  const otra = sacarWrappers(resto.replace(RE_BLOQUE_TALLES, '')).replace(RE_TABLA, '')
  return [marcada.join(' '), otra].filter((x) => x.trim()).join(' ')
}

/** El corte entre «corta» y «ok». Medido: 237 publicados de Zattia caen debajo. */
export const LARGO_OK = 120

/**
 * La prosa de una ficha: el texto que la clienta lee como descripción, sin la tabla.
 * `raw` es `tn.raw_desc`, que YA viaja en el payload del audit (`:158`) — por eso esto
 * se computa acá y no necesita ningún deploy de `bdi-catalogo`.
 */
export function prosaDe(raw) {
  const texto = desescapar(sinTablas(String(raw || '')).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  const largo = texto.length
  return { texto, largo, banda: largo === 0 ? 'nada' : largo < LARGO_OK ? 'corta' : 'ok' }
}

/** ¿La ficha tiene prosa? El reemplazo honesto de `has_desc` para «¿tiene descripción?». */
export function tieneProsa(raw) {
  return prosaDe(raw).largo > 0
}
