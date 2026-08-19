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
 * 🔑 Esto NO reemplaza a `has_desc`: lo leen Marketing y la cola de `gen-talles`, y ahí
 * la pregunta no es la misma («¿tiene algo?» vs «¿tiene prosa?»). Se migra un consumidor
 * por vez. Ver `lib/marketing/core.ts` y `lib/gen-talles/core.ts`.
 */

/** La firma del generador propio. Espejo de `MARK_INI/FIN` de `api/tn-categorias.js:32`. */
const RE_BLOQUE_TALLES = /<!--AREBEN-TALLES-INI-->[\s\S]*?<!--AREBEN-TALLES-FIN-->/g

/**
 * El bloque de prosa marcado (todavía no existe en la tienda; nace con esta tanda).
 * Se conserva a propósito: ESO es prosa, y sacarlo mediría cero justo en los productos
 * que ya arreglamos.
 */
export const PROSA_INI = '<!--AREBEN-PROSA-INI-->'
export const PROSA_FIN = '<!--AREBEN-PROSA-FIN-->'

/** Una `<table>` suelta: las 149 tablas legacy de Zattia que no tienen la firma. */
const RE_TABLA = /<table[\s\S]*?<\/table>/gi

/** Las entidades que TiendaNube devuelve en las descripciones de Zattia. */
const ENTIDADES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ordf: 'ª', ordm: 'º',
  iquest: '¿', iexcl: '¡', deg: '°', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
}

/** Desescapa entidades nombradas y numéricas. Sin esto `&aacute;` cuenta 8 caracteres. */
export function desescapar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTIDADES[n] ?? m)
}

/**
 * Dónde empieza y termina UN wrapper del generador viejo (div con `max-width:680px`),
 * contando el balance de `<div>`. Port fiel de `removeOneWrapper` de
 * `api/tn-categorias.js:35-47`: si el cierre no balancea devuelve `null` — un HTML roto no
 * se "arregla" adivinando.
 *
 * 🔑 Devuelve las POSICIONES y no el html recortado, porque hay dos preguntas distintas
 * sobre lo mismo: `sacarWrappers` quiere lo de AFUERA (para medir la prosa) y
 * `lib/tn-desc/bloques.ts` quiere lo de ADENTRO (para conservar la tabla vieja verbatim).
 * Una sola implementación del balanceo, dos lectores.
 */
export function ubicarWrapper(html: string): { ini: number; fin: number } | null {
  const m = /<div[^>]*max-width:\s*680px[^>]*>/i.exec(html)
  if (!m) return null
  let depth = 1
  const re = /<\/?div\b[^>]*>/gi
  re.lastIndex = m.index + m[0].length
  let mm: RegExpExecArray | null
  while ((mm = re.exec(html))) {
    if (mm[0].slice(0, 2).toLowerCase() === '</') depth--
    else depth++
    if (depth === 0) return { ini: m.index, fin: mm.index + mm[0].length }
  }
  return null
}

function sacarUnWrapper(html: string): string {
  const w = ubicarWrapper(html)
  return w ? html.slice(0, w.ini) + html.slice(w.fin) : html
}

/** Saca todos los wrappers del generador viejo. */
export function sacarWrappers(html: string): string {
  let out = html
  let prev: string
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
 * 🔴 El ORDEN es la regla: primero los bloques, después los tags. Al revés, pelar los
 * tags destruye el `<table>` y la prosa se traga la tabla entera — que es exactamente
 * el defecto que tiene hoy `has_desc`.
 */
export function sinTablas(raw: string): string {
  return sacarWrappers(String(raw || '').replace(RE_BLOQUE_TALLES, '')).replace(RE_TABLA, '')
}

/** En qué banda cae una ficha. `corta` son las «6 o 7 palabras» que escribe el local. */
export type BandaProsa = 'nada' | 'corta' | 'ok'

/** El corte entre «corta» y «ok». Medido: 237 publicados de Zattia caen debajo. */
export const LARGO_OK = 120

export type Prosa = { texto: string; largo: number; banda: BandaProsa }

/**
 * La prosa de una ficha: el texto que la clienta lee como descripción, sin la tabla.
 * `raw` es `tn.raw_desc`, que YA viaja en el payload del audit (`:158`) — por eso esto
 * se computa acá y no necesita ningún deploy de `bdi-catalogo`.
 */
export function prosaDe(raw: string | null | undefined): Prosa {
  const texto = desescapar(sinTablas(String(raw || '')).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  const largo = texto.length
  return { texto, largo, banda: largo === 0 ? 'nada' : largo < LARGO_OK ? 'corta' : 'ok' }
}

/** ¿La ficha tiene prosa? El reemplazo honesto de `has_desc` para «¿tiene descripción?». */
export function tieneProsa(raw: string | null | undefined): boolean {
  return prosaDe(raw).largo > 0
}
