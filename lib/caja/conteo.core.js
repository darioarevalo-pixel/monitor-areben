// Caja — la CALCULADORA DE BILLETES (plan del 5-oct-2026, fase B): cantidad × billete ⇒ total. Se
// usa al abrir el turno (el fondo), en los conteos intermedios y al cerrarlo (el efectivo contado).
//
// 🔑 EL TOTAL SE CALCULA ACÁ, EN LAS DOS PUNTAS: la pantalla para mostrarlo y el servidor otra vez al
// guardar. Si el conteo ⛔ suma el fondo (o el contado) que mandó la pantalla, el servidor contesta
// 400: el turno ⛔ queda con un conteo que dice una cosa y un fondo que dice otra.
//
// Un conteo es `{ [valor del billete]: cantidad }`: `{ 20000: 3, 1000: 4, 500: 1 }` = $64.500.
// Los billetes son los de `caja_config.reglas.billetes` (los edita un admin); sin la lista, los de
// `BILLETES_INICIALES` (Bruno, 5-oct: sin monedas).

const exigir = (cond, msg) => { if (!cond) throw new Error(msg) }

export const BILLETES_INICIALES = Object.freeze([20000, 10000, 2000, 1000, 500, 200, 100])

/**
 * Los billetes de la Caja: los que circulan en Argentina, ⛔ se configuran (Bruno, 12-oct: «son los billetes
 * que corren en Argentina, no se configura»). Una `reglas.billetes` vieja guardada en la base ⛔ cuenta: la
 * pantalla y el servidor (que rearma el total del conteo) usan esta MISMA lista.
 * @param {unknown} [_reglas] se ignora; queda para no tocar a los que la llaman
 * @returns {number[]}
 */
export function billetesDe(_reglas) {
  return [...BILLETES_INICIALES]
}

/** Un conteo con cero de cada billete. */
export function conteoVacio(billetes) {
  exigir(Array.isArray(billetes), 'Faltan los billetes')
  return Object.fromEntries(billetes.map((v) => [String(v), 0]))
}

/**
 * El conteo limpio: sólo los billetes de la lista, cada uno con su cantidad. Lanza si una cantidad
 * es negativa o ⛔ entera. Un valor que ⛔ está en la lista se ignora (un billete que el admin sacó).
 * @param {Record<string, unknown>} conteo
 * @param {number[]} billetes
 * @returns {Record<string, number>}
 */
export function limpiarConteo(conteo, billetes) {
  exigir(conteo && typeof conteo === 'object' && !Array.isArray(conteo), 'Falta el conteo de billetes')
  exigir(Array.isArray(billetes), 'Faltan los billetes')
  const out = conteoVacio(billetes)
  for (const v of billetes) {
    const c = conteo[String(v)]
    if (c == null || c === '') continue
    const n = Number(c)
    exigir(Number.isInteger(n) && n >= 0, `La cantidad de billetes de $${v} tiene que ser un número entero (0 o más)`)
    out[String(v)] = n
  }
  return out
}

/** Cantidad × valor de cada billete de la lista. Lanza como `limpiarConteo`. */
export function totalDeConteo(conteo, billetes) {
  const limpio = limpiarConteo(conteo, billetes)
  return billetes.reduce((s, v) => s + v * limpio[String(v)], 0)
}

/**
 * 🔑 EL SOBRE (Bruno, 13-oct): al cerrar se cuenta TODO el efectivo, y a la cajera le cuesta decidir qué
 * billetes dejar de fondo. La prioridad es que la caja quede con CAMBIO ⇒ el fondo se arma con la MAYOR
 * cantidad de billetes que sume exactamente el fondo (eso agarra los chicos) y el resto va al sobre. El
 * fondo es el de la apertura de esa caja (Bruno: «el fondo inicial siempre es estático»).
 *
 * Si con lo contado ⛔ se llega exacto al fondo (sólo billetes grandes, o contó menos), queda lo más cerca
 * POR DEBAJO y `exacto: false`: la pantalla y el ticket dicen cuánto falta de fondo.
 * @param {Record<string, number>} conteo  el del cierre (`conteos.cierre.billetes`)
 * @param {number} fondo
 * @param {number[]} billetes
 * @returns {{ fondo: Record<string, number>, sobre: Record<string, number>, totalFondo: number, totalSobre: number, exacto: boolean }}
 */
export function armarSobre(conteo, fondo, billetes) {
  exigir(Number.isFinite(fondo) && fondo >= 0, 'Falta el fondo de la caja')
  const limpio = limpiarConteo(conteo || {}, billetes)
  const UNIDAD = 100
  const meta = Math.floor(fondo / UNIDAD)
  const valores = billetes.filter((v) => v % UNIDAD === 0 && limpio[String(v)] > 0)
  // Mochila acotada: mejor[s] = la mayor cantidad de billetes que suma s (−1 = ⛔ se llega).
  let mejor = new Array(meta + 1).fill(-1)
  mejor[0] = 0
  const eleccion = []
  for (const v of valores) {
    const u = v / UNIDAD, max = limpio[String(v)]
    const nuevo = new Array(meta + 1).fill(-1)
    const cuantos = new Array(meta + 1).fill(0)
    for (let s = 0; s <= meta; s++) {
      for (let k = 0; k <= max && k * u <= s; k++) {
        const antes = mejor[s - k * u]
        if (antes >= 0 && antes + k > nuevo[s]) { nuevo[s] = antes + k; cuantos[s] = k }
      }
    }
    eleccion.push({ v, cuantos })
    mejor = nuevo
  }
  let s = meta
  while (s > 0 && mejor[s] < 0) s--
  const enFondo = conteoVacio(billetes)
  for (let i = eleccion.length - 1; i >= 0; i--) {
    const { v, cuantos } = eleccion[i]
    const k = cuantos[s]
    enFondo[String(v)] = k
    s -= k * (v / UNIDAD)
  }
  const sobre = Object.fromEntries(billetes.map((v) => [String(v), (limpio[String(v)] || 0) - (enFondo[String(v)] || 0)]))
  const totalFondo = totalDeConteo(enFondo, billetes)
  return { fondo: enFondo, sobre, totalFondo, totalSobre: totalDeConteo(sobre, billetes), exacto: totalFondo === fondo }
}

/**
 * 🔑 EL CAMBIO DE LA CAJA (Bruno, 22-oct): las cajeras ⛔ avisan cuando se quedan sin cambio. «Cambio» = billetes
 * de $1.000 o menos («hay cantidad»), y la caja tiene que quedar con LA MITAD DEL FONDO en cambio («tienen 50mil y
 * 25mil en cambio chico»). Lo medido (Zattia, 5 al 22-oct): lo peor que se comió un turno fue −$25.300 de cambio.
 * Los de $2.000 suman con menos peso: alcanzan para que ⛔ sea «falta», ⛔ para que sea «bien».
 *  - `bien`  → los de $1.000 o menos llegan solos a la mitad del fondo;
 *  - `ojo`   → llegan sumando los de $2.000 (la cajera arma cambio cuando pueda);
 *  - `falta` → ⛔ llegan ni así: se avisa a los admins.
 * Se mide sobre lo que QUEDA en la caja (el `fondo` de `armarSobre`), ⛔ sobre todo lo contado: el sobre se va.
 * @param {Record<string, number>} conteo  lo que queda en la caja
 * @param {number} fondo
 * @param {number[]} billetes
 * @returns {{ nivel: 'bien' | 'ojo' | 'falta', chicos: number, dosMil: number, umbral: number }}
 */
export function cambioDeLaCaja(conteo, fondo, billetes) {
  exigir(Number.isFinite(fondo) && fondo >= 0, 'Falta el fondo de la caja')
  const limpio = limpiarConteo(conteo || {}, billetes)
  const suma = (pasa) => billetes.filter(pasa).reduce((s, v) => s + v * limpio[String(v)], 0)
  const chicos = suma((v) => v <= CAMBIO_HASTA)
  const dosMil = suma((v) => v > CAMBIO_HASTA && v <= CAMBIO_CON_MENOS_PESO_HASTA)
  const umbral = Math.round(fondo * PARTE_DEL_FONDO_EN_CAMBIO)
  const nivel = chicos >= umbral ? 'bien' : chicos + dosMil >= umbral ? 'ojo' : 'falta'
  return { nivel, chicos, dosMil, umbral }
}

/** El billete más grande que cuenta como cambio, y hasta cuál suma con menos peso (Bruno, 22-oct). */
export const CAMBIO_HASTA = 1000
export const CAMBIO_CON_MENOS_PESO_HASTA = 2000
/** La parte del fondo que tiene que quedar en cambio (Bruno, 22-oct: «es el 50% en cambio»). */
export const PARTE_DEL_FONDO_EN_CAMBIO = 0.5
