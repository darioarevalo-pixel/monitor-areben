/**
 * Gift card de la Caja (W6, diseño del 11-oct-2026: `~/Documents/reunion-gerencia/2026-10-11-POS-auditoria-y-gift-card.md` § D).
 *
 * 🏁 **Es una TARJETA FÍSICA de PVC con código de barras** (Bruno, 11-oct). ⇒ Los códigos los genera
 * el MONITOR, se cargan como LOTE en `caja_gift_card` en estado `inactiva` (sin monto) y el CSV va a
 * la imprenta. **Vender = ACTIVAR**: la cajera escanea la tarjeta, pone el monto y cobra. Una tarjeta
 * robada del mostrador sin activar ⛔ vale nada.
 *
 * 🔴 **El código es PLATA ⇒ al azar, ⛔ correlativo**: `GC` + 10 símbolos al azar (50 bits) + 1
 * dígito verificador. Con el alfabeto de Crockford (sin I, L, O, U: ⛔ se confunden al tipearlo) y el
 * verificador de Luhn mod 32: un símbolo mal tipeado o dos vecinos cambiados ⇒ ⛔ es un código válido,
 * y la Caja lo dice antes de ir a la base.
 *
 * Es JS plano porque lo importa `api/_caja.js`, que corre en Node sin el compilador de Next.
 */

export const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const PREFIJO = 'GC'
/** Los símbolos al azar: 32^10 ≈ 10^15 ⇒ adivinar una tarjeta de un lote de 1.000 es 1 en 10^12. */
export const LARGO_AZAR = 10
/** Lo más que se genera de una vez (una tanda de imprenta). */
export const MAX_LOTE = 2000

/** El símbolo verificador (Luhn mod N, N = 32) de una tira del alfabeto. @param {string} s */
export function verificador(s) {
  const n = ALFABETO.length
  let suma = 0
  let doble = true // de derecha a izquierda, empezando por el último símbolo de la tira
  for (let i = s.length - 1; i >= 0; i--) {
    let v = ALFABETO.indexOf(s[i])
    if (v < 0) throw new Error(`Símbolo fuera del alfabeto: ${s[i]}`)
    if (doble) {
      v *= 2
      v = Math.floor(v / n) + (v % n)
    }
    suma += v
    doble = !doble
  }
  return ALFABETO[(n - (suma % n)) % n]
}

/**
 * Lo que llega del lector o del teclado, en la forma de la base: mayúsculas, sin espacios ni guiones, y
 * las letras que Crockford lee como número (O ⇒ 0, I/L ⇒ 1). ⛔ Dice si es válido: eso es `esCodigo`.
 * @param {unknown} x
 */
export function normalizarCodigo(x) {
  return String(x ?? '')
    .toUpperCase()
    .replace(/[\s\-_.·]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

/** ¿Es una gift card bien escrita? (prefijo, largo, alfabeto y verificador). @param {unknown} x */
export function esCodigo(x) {
  const c = normalizarCodigo(x)
  if (c.length !== PREFIJO.length + LARGO_AZAR + 1 || !c.startsWith(PREFIJO)) return false
  const cuerpo = c.slice(PREFIJO.length, -1)
  if ([...cuerpo].some((s) => !ALFABETO.includes(s))) return false
  return verificador(cuerpo) === c.slice(-1)
}

/**
 * ¿Lo escaneado PARECE una gift card (empieza con GC y tiene el largo), aunque esté mal leído? El
 * buscador del POS lo usa para avisar «usala en el cobro» en vez de buscarla como prenda.
 * @param {unknown} x
 */
export function pareceGift(x) {
  const c = normalizarCodigo(x)
  return c.startsWith(PREFIJO) && c.length === PREFIJO.length + LARGO_AZAR + 1
}

/**
 * Un código nuevo. `azar(n)` devuelve un entero en [0, n): en el servidor, `crypto.randomInt` —
 * 🔴 ⛔ `Math.random`, que es predecible.
 * @param {(n: number) => number} azar
 */
export function nuevoCodigo(azar) {
  let cuerpo = ''
  for (let i = 0; i < LARGO_AZAR; i++) cuerpo += ALFABETO[azar(ALFABETO.length)]
  return PREFIJO + cuerpo + verificador(cuerpo)
}

/**
 * `cantidad` códigos DISTINTOS, y distintos de `existentes` (los del lote anterior que chocaron en la
 * base, si pasó). @param {number} cantidad @param {(n: number) => number} azar @param {Iterable<string>} [existentes]
 */
export function generarCodigos(cantidad, azar, existentes = []) {
  const n = Number(cantidad)
  if (!Number.isInteger(n) || n < 1 || n > MAX_LOTE) throw new Error(`La cantidad va de 1 a ${MAX_LOTE}.`)
  const vistos = new Set(existentes)
  const out = []
  while (out.length < n) {
    const c = nuevoCodigo(azar)
    if (vistos.has(c)) continue
    vistos.add(c)
    out.push(c)
  }
  return out
}

/** El número impreso debajo de las barras: «GC 1234 5678 9AB» (las barras llevan el código pelado). @param {string} codigo */
export function codigoVisible(codigo) {
  const c = normalizarCodigo(codigo)
  const r = c.slice(PREFIJO.length)
  return [PREFIJO, r.slice(0, 4), r.slice(4, 8), r.slice(8)].filter(Boolean).join(' ')
}

/** Para el ticket y la pantalla: sólo los últimos 4 («····9ABC»). El código entero es la plata. @param {string} codigo */
export function enmascarado(codigo) {
  return `····${normalizarCodigo(codigo).slice(-4)}`
}

/**
 * El CSV para la imprenta: un renglón por tarjeta. `codigo` va en las barras (CODE128), `numero` impreso.
 * Separado por comas, sin comillas: ningún valor lleva comas.
 * @param {Array<{ codigo: string }>} filas
 */
export function csvDeLote(filas) {
  return ['n,codigo,numero', ...filas.map((f, i) => `${i + 1},${f.codigo},${codigoVisible(f.codigo)}`)].join('\n') + '\n'
}

/**
 * @typedef {'inactiva' | 'pendiente' | 'activa' | 'anulada'} EstadoGuardado
 * @typedef {EstadoGuardado | 'vencida' | 'agotada'} EstadoGift
 * @typedef {{ estado: EstadoGuardado, saldo: number | null, vence_en: string | null }} GiftCard
 */

/**
 * El estado que se MUESTRA. En la base van 4 (`inactiva` sin vender · `pendiente` vendida por
 * transferencia sin cruzar · `activa` · `anulada`); vencida y agotada SALEN de la fecha y el saldo.
 * Orden: anulada > inactiva > pendiente > vencida > agotada > activa.
 * @param {GiftCard} g @param {string} hoy `AAAA-MM-DD` (el día argentino)
 * @returns {EstadoGift}
 */
export function estadoGift(g, hoy) {
  if (g.estado === 'anulada' || g.estado === 'inactiva' || g.estado === 'pendiente') return g.estado
  if (g.vence_en && g.vence_en < hoy) return 'vencida'
  if (!(Number(g.saldo) > 0)) return 'agotada'
  return 'activa'
}
