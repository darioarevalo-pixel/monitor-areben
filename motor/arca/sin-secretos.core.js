/**
 * ⛔ un secreto en la base ni en pantalla (higiene de tokens, paso 4). Puro.
 *
 * Todo texto que viene de AFUERA (ARCA, Tienda Nube, Mercado Libre, GN, Mercado Pago, Postgres) y que el motor
 * guarda en una tabla o imprime en un resumen pasa por acá. 🔴 Ya mordió en MAKETA: el error de Meta traía el
 * TOKEN adentro y quedó en la base, en pantalla. Un error de una API puede repetir la URL (con `access_token=`),
 * el header (`Bearer …`), el XML del pedido (`<token>`/`<sign>` del WSAA) o la cadena de conexión.
 *
 * Tapa en vez de borrar (`«oculto»`): el resto del mensaje sirve para entender qué pasó.
 * Vive en `lib/arca` para viajar con la copia del motor al monitor (`npm run traer-motor`).
 */

const OCULTO = '«oculto»'

const REGLAS = [
  // Bloques PEM (claves y certificados).
  [/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, OCULTO],
  // XML del WSAA: <token>…</token>, <sign>…</sign> (también escapado &lt;token&gt;).
  [/(<|&lt;)(token|sign)(>|&gt;)[\s\S]*?(<|&lt;)\/\2(>|&gt;)/gi, `$1$2$3${OCULTO}$4/$2$5`],
  // Cadena de conexión: proto://usuario:CLAVE@host
  [/([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s]+@/gi, `$1${OCULTO}@`],
  // Header de autorización.
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${OCULTO}`],
  // Parámetros y campos con nombre de secreto: access_token=…, "refresh_token":"…", client_secret: …
  [/\b((?:access|refresh)_token|client_secret|api[_-]?key|password|contrase(?:ñ|n)a|secret|token|sign|authorization)(["']?\s*[:=]\s*["']?)([^"'\s&,;}]{6,})/gi, `$1$2${OCULTO}`],
  // JWT suelto.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, OCULTO],
  // Token de Mercado Libre / Mercado Pago (APP_USR-…, TEST-…, TG-…).
  [/\b(APP_USR|TEST|TG)-[A-Za-z0-9-]{16,}/g, OCULTO],
  // Cualquier tira larga de base64/hex sin espacios (un token sin nombre): 40+ caracteres.
  [/[A-Za-z0-9+/_-]{40,}={0,2}/g, OCULTO],
]

/** El texto con los secretos tapados. Lo que no es texto, se devuelve igual. */
export function sinSecretosTexto(texto) {
  if (typeof texto !== 'string') return texto
  let t = texto
  for (const [re, por] of REGLAS) t = t.replace(re, por)
  return t
}

/**
 * Un texto, un Error, un array o un objeto (las `observaciones` de ARCA, `{ codigo, mensaje }`), con cada texto
 * tapado. ⛔ muta lo que recibe.
 */
export function sinSecretos(valor) {
  if (typeof valor === 'string') return sinSecretosTexto(valor)
  if (valor instanceof Error) return sinSecretosTexto(valor.message)
  if (Array.isArray(valor)) return valor.map(sinSecretos)
  if (valor && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, sinSecretos(v)]))
  return valor
}
