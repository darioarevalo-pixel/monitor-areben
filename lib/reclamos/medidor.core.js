/**
 * **El medidor: cuántos reclamos se registraron por cada 100 ventas online, mes a mes.**
 *
 * # Por qué existe, y por qué NO se llama «la tasa de reclamos»
 *
 * 🔴 El 30-ago-2026 BDI tenía **2 reclamos registrados contra 283 ventas online de agosto**. Esa
 * distancia ⛔ no es una tasa baja: es que **el reclamo que se resuelve en un chat no deja fila**.
 * El cociente que sale de acá ⛔ **no mide cuánta gente reclama — mide cuánto se registró**, y el
 * día que el alta pública baje el costo de reclamar los dos lados se van a mover a la vez sin que
 * se pueda separar cuánto es más reclamos y cuánto es más registro.
 *
 * Existe igual porque **la válvula del §5 del plan no tiene manómetro**: los cuatro diales que se
 * mueven si el formulario multiplica los casos se mueven contra este número, y sin él la decisión
 * se toma de memoria. ⚠️ Lo que ⛔ no puede hacer es que el primer mes se lea como «subió»: por eso
 * salen **varios meses juntos** y ⛔ no un número solo. Con los meses de atrás en cero a la vista,
 * lo que se ve es que antes ⛔ no se registraba nada — que es el diagnóstico, ⛔ no la línea de base.
 * (Es [[feedback_areben_el_espejo_mide_hoy_no_la_espera]] por la otra punta.)
 *
 * # Las tres decisiones de qué se cuenta
 *
 * 1. **El numerador es el reclamo ABIERTO EN EL MES, ⛔ no el que hoy sigue abierto.** Un cociente
 *    pide que las dos puntas midan **el mismo período**: los reclamos vivos hoy son un stock y las
 *    ventas de agosto son un flujo, y dividir uno por el otro da un número que ⛔ no existe. Se
 *    cuenta por `created_at`.
 * 2. **`anulado` ⛔ no cuenta**, y ⛔ no es un criterio inventado acá: es lo que ya dice el confirm
 *    de la pantalla al anular —*«queda registrado pero deja de contar»*—. Un reclamo abierto por
 *    error o duplicado inflaría el numerador justo cuando el formulario público empiece a producir
 *    duplicados, que es el momento en que este número se va a mirar.
 * 3. **El denominador es el canal `online`, que hoy es EXACTAMENTE «Tienda Nube»** (medido el
 *    30-ago-2026 sobre las 4.694 ventas de BDI desde marzo: `Tienda Nube` es el único nombre que
 *    cae en `online`; Mercadolibre y Whatsapp caen en `otro`). Y tiene que ser ése y ⛔ no «todo lo
 *    online»: un reclamo cuelga de una **orden de Tienda Nube** (`orden_tn`), así que meter
 *    Mercadolibre en el denominador sería agrandar la población del divisor con ventas que ⛔ no
 *    pueden aparecer arriba. La clasificación se **importa** de `canalDe` y ⛔ no se copia: es la
 *    misma que parte los canales en toda la app.
 *
 * # Y el mes, en hora de Argentina
 *
 * `created_at` es `timestamptz` (UTC) y `date_sale` es una fecha ya local. Cortar los dos por
 * `slice(0,7)` mandaría al mes siguiente cada reclamo abierto **después de las 21:00 del último día
 * del mes**, contra ventas que se quedan donde estaban. Es el mismo borde que ya rompió el test de
 * la Agenda, así que el mes del reclamo sale de `diaArgentino`, **importada**.
 *
 * `.js` plano: lo importa `api/_reclamos.js`, que corre en Node sin pasar por el compilador de Next.
 */
import { canalDe } from '../liquidacion/canal.core.js'
import { diaArgentino } from '../envios/portal.core.js'

/** Cuántos meses mira el medidor. Seis: entra el año fiscal corto y sigue siendo una tabla que se lee de un vistazo. */
export const MESES_DEL_MEDIDOR = 6

/** El reclamo que ⛔ no cuenta. Ver la decisión 2 del encabezado. */
export const ESTADO_QUE_NO_CUENTA = 'anulado'

/** El mes (`YYYY-MM`) de un `timestamptz`, en hora de Argentina. `null` si no hay fecha. */
export function mesDelReclamo(createdAt) {
  if (!createdAt) return null
  const ms = Date.parse(createdAt)
  return Number.isFinite(ms) ? diaArgentino(ms).slice(0, 7) : null
}

/** El mes (`YYYY-MM`) de una venta. `date_sale` ya viene como fecha local de Gestión Nube. */
export function mesDeLaVenta(dateSale) {
  const m = String(dateSale || '').slice(0, 7)
  return /^\d{4}-\d{2}$/.test(m) ? m : null
}

/**
 * Los `cuantos` meses que terminan en `mesFinal`, del más viejo al más nuevo.
 * @param {string} mesFinal `YYYY-MM` — el mes en curso. **Obligatorio**: quién es «hoy» lo decide
 *   el llamador, porque en el servidor `new Date()` está en UTC.
 */
export function mesesHasta(mesFinal, cuantos = MESES_DEL_MEDIDOR) {
  const [a, m] = String(mesFinal).split('-').map(Number)
  if (!a || !m) return []
  const out = []
  for (let i = cuantos - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

/** El primer día del primer mes de la lista, para el `gte` de la consulta. */
export function desdeDeLosMeses(meses) {
  return meses.length ? `${meses[0]}-01` : null
}

/**
 * El medidor, mes a mes.
 *
 * @param {object[]} reclamos filas de `devoluciones` con `estado` y `created_at`
 * @param {object[]} ventas   filas de `ventas` con `channel` y `date_sale`
 * @param {string[]} meses    los meses a dibujar, del más viejo al más nuevo. **Obligatorio.**
 * @param {string|null} desdeQueSeRegistra mes (`YYYY-MM`) del PRIMER reclamo que registró la base,
 *   mirando la tabla entera y ⛔ no la ventana. **Obligatorio** — ver el 🔴 de abajo.
 * @returns {{mes, ventas, reclamos, cada100:number|null, sinNumero:string|null, enCurso:boolean}[]}
 *
 * 🔴 **Los meses de antes del primer reclamo registrado ⛔ NO valen cero.** Marzo a julio de 2026
 * dan `0 / 173` y `0 / 124`, y dibujar ahí un «0,0 cada 100» **afirma que nadie reclamó** en meses
 * en los que lo que pasaba es que ⛔ **nadie registraba** — el módulo entró en agosto. Ese cero es
 * el que convierte el primer mes con formulario en «subió muchísimo». Por eso la fila trae
 * `sinNumero: 'sin-registro'` y el cociente sale `null`: **el instrumento dice desde cuándo mide.**
 *
 * 🔴 **Y `cada100` es `null` —⛔ nunca 0— si ⛔ no hubo ventas online.** Sin denominador ⛔ no hay
 * cociente, y un 0 ahí afirma sobre un mes en el que ⛔ no se vendió nada.
 *
 * ⚠️ **Lo que un cero legítimo sigue sin poder decir**: que en un mes con registro andando ⛔ no se
 * haya anotado ningún reclamo ⛔ no quiere decir que no los hubo — el que se resuelve en un chat ⛔
 * no deja fila. Eso ⛔ no lo arregla ningún cálculo: lo dice la pantalla, al lado del número.
 */
export function medirPorMes({ reclamos = [], ventas = [], meses, desdeQueSeRegistra }) {
  if (!Array.isArray(meses) || !meses.length) return []
  const enCurso = meses[meses.length - 1]
  const registrando = (mes) => !!desdeQueSeRegistra && mes >= desdeQueSeRegistra
  const fila = new Map(meses
    .map((mes) => ({ mes, ventas: 0, reclamos: 0, cada100: null, sinNumero: null, enCurso: mes === enCurso }))
    .map((f) => [f.mes, f]))

  for (const r of reclamos) {
    if (!r || r.estado === ESTADO_QUE_NO_CUENTA) continue
    const f = fila.get(mesDelReclamo(r.created_at))
    if (f) f.reclamos++
  }
  for (const v of ventas) {
    if (!v || canalDe(v.channel) !== 'online') continue
    const f = fila.get(mesDeLaVenta(v.date_sale))
    if (f) f.ventas++
  }
  for (const f of fila.values()) {
    f.sinNumero = !registrando(f.mes) ? 'sin-registro' : f.ventas === 0 ? 'sin-ventas' : null
    f.cada100 = f.sinNumero ? null : (f.reclamos * 100) / f.ventas
  }
  return meses.map((m) => fila.get(m))
}

/** Por qué un mes ⛔ no tiene número, en criollo. **El texto vive acá**, así lo dicen igual la pantalla y cualquier otro que lo lea. */
export const SIN_NUMERO_LABEL = {
  'sin-registro': 'todavía no se registraban reclamos',
  'sin-ventas': 'no hubo ventas online',
}
