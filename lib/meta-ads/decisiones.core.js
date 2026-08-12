/**
 * Las decisiones humanas sobre la pauta, y cómo callan una regla.
 *
 * # Qué problema resuelve
 *
 * Un aviso apagado a propósito porque **se acabó el stock** no es un error que haya que corregir,
 * pero ninguna métrica de Meta contiene esa razón. Sin un lugar donde escribirla, el radar de
 * atribución tardía propone reactivarlo —vio compras después del corte, y tiene razón en lo que
 * mide— y lo va a proponer otra vez mañana, y pasado. Ver el docblock de `sql/migrate-meta-decision.sql`.
 *
 * 🔴 **«Ignorar» un hallazgo NO alcanza**: el `unique` de `meta_ads_hallazgo` es
 * `(regla_id, fecha, objeto_id)`, así que resolver el de hoy no impide el de mañana, que es otra
 * fila con otra fecha. El silencio tiene que vivir en algo con vigencia propia, y eso es esto.
 *
 * # Lo que este archivo NO hace
 *
 * No habla con la base ni con Meta: recibe filas ya leídas y devuelve estructuras. Es `.core.js`
 * plano porque lo importan `api/_meta-reglas.js` y `scripts/evaluar-reglas-meta.mjs`, que corren en
 * Node sin pasar por el compilador de Next y no pueden importar TypeScript.
 *
 * # 🔑 Nada desaparece en silencio
 *
 * `partir()` devuelve las dos mitades, no la que sobrevive. Un filtro que sólo devolviera lo que
 * pasa convertiría cada decisión en un agujero negro: algo real dejaría de avisar y nadie tendría
 * cómo enterarse. El script lo loguea y la pantalla lo muestra colapsado.
 */

/** El comodín con el que se indexa una decisión que calla TODOS los presets de un objeto. */
export const TODOS_LOS_PRESETS = '*'

/** Las clases de decisión. Sólo `silencio` filtra; `nota` queda escrita y no toca ninguna regla. */
export const CLASES_DECISION = ['silencio', 'nota']

/** Los estados. Una revocada no calla, pero conserva su motivo: es la historia de por qué se decidió. */
export const ESTADOS_DECISION = ['vigente', 'revocada']

/**
 * ¿Sigue viva esta decisión al día `hasta`?
 *
 * Tres cosas la matan y son distintas entre sí: no ser un silencio (una `nota` nunca calló nada),
 * estar revocada (alguien cambió de opinión) o haber vencido (nadie la renovó). La tercera es la que
 * evita el silencio eterno por olvido.
 *
 * ⚠️ `vence` es el ÚLTIMO día en que la decisión vale, inclusive. Una decisión que vence el 14 sigue
 * callando el 14 y deja de callar el 15 — que es como se lee «control al 14-ago» en castellano.
 */
export function vigenteAl(d, hasta) {
  if (!d || d.clase !== 'silencio') return false
  if (d.estado !== 'vigente') return false
  if (d.vence && hasta && String(d.vence) < String(hasta)) return false
  return true
}

/**
 * Las decisiones agrupadas por objeto, para no recorrer la lista entera por cada hallazgo.
 *
 * La clave es el `objeto_id` y el valor es el array de sus decisiones (puede haber más de una: una
 * por preset). Las que no tienen `objeto_id` —las `nota`— quedan afuera del índice a propósito: no
 * filtran nada, y meterlas sería invitar a que algún día filtren.
 */
export function indexar(filas) {
  const mapa = new Map()
  for (const d of filas || []) {
    if (!d || !d.objeto_id || d.clase !== 'silencio') continue
    const k = String(d.objeto_id)
    const previas = mapa.get(k)
    if (previas) previas.push(d)
    else mapa.set(k, [d])
  }
  return mapa
}

/**
 * ¿Esta decisión calla a este hallazgo?
 *
 * 🔑 **`preset` en `null` calla todo; con valor calla sólo ese preset.** No es un detalle de
 * implementación: «no reactivar por falta de stock» tiene que callar el radar de atribución tardía y
 * el de «se quedó sin avisos», pero **no** el freno de emergencia — si mañana alguien lo prende y
 * empieza a quemar plata contra cero ventas, eso tiene que gritar igual. Por eso la pantalla propone
 * el preset concreto y «todas las reglas» es una elección explícita que se ve escrita en la lista.
 */
export function silenciaA(d, { objetoId, preset, hasta = null } = {}) {
  if (!vigenteAl(d, hasta)) return false
  if (!objetoId || String(d.objeto_id) !== String(objetoId)) return false
  if (d.preset && String(d.preset) !== String(preset)) return false
  return true
}

/**
 * La decisión que calla a este hallazgo, o `null`.
 *
 * Devuelve la decisión entera y no un booleano porque quien la llama necesita el motivo y la fecha
 * para poder decir *«callado por una decisión del 11-ago: sin stock»*. Un `true` obligaría a buscarla
 * de nuevo, y a que dos lugares eligieran distinto cuál mostrar.
 *
 * Ante más de una candidata gana **la más específica** (la que nombra el preset). Que existan dos
 * vigentes sobre el mismo alcance lo impide el índice único de la tabla, pero acá igual se elige de
 * una manera y no de la que salga del orden del `select`.
 */
export function decisionQueCalla(indice, { objetoId, preset, hasta = null } = {}) {
  if (!indice || !objetoId) return null
  const candidatas = indice.get(String(objetoId))
  if (!candidatas || !candidatas.length) return null
  let ancha = null
  for (const d of candidatas) {
    if (!silenciaA(d, { objetoId, preset, hasta })) continue
    if (d.preset) return d
    if (!ancha) ancha = d
  }
  return ancha
}

/**
 * Parte los hallazgos en los que siguen gritando y los que una decisión calló.
 *
 * 🔑 **Devuelve las dos mitades.** `hallazgos.length + silenciados.length` es siempre lo que entró:
 * es la invariante que impide que una decisión se coma algo real sin dejar rastro. Cada silenciado
 * viaja con su `decision` adentro para que se pueda leer el porqué sin otra consulta.
 */
export function partir(hallazgos, indice, { preset, hasta = null } = {}) {
  const vivos = []
  const silenciados = []
  for (const h of hallazgos || []) {
    const d = decisionQueCalla(indice, { objetoId: h.objeto_id, preset, hasta })
    if (d) silenciados.push({ ...h, decision: d })
    else vivos.push(h)
  }
  return { hallazgos: vivos, silenciados }
}

/**
 * El renglón que se lee cuando algo quedó callado.
 *
 * Se arma acá y no en la UI por lo mismo que el `motivo` de un hallazgo se guarda ya redactado: el
 * script lo loguea, la pantalla lo muestra, y dos redacciones distintas de la misma cosa terminan
 * siendo dos criterios distintos.
 */
export function porQueCallado(d) {
  if (!d) return ''
  const alcance = d.preset ? 'esta regla' : 'todas las reglas'
  const hasta = d.vence ? `, hasta el ${d.vence}` : ', sin vencimiento'
  return `Callado para ${alcance} por una decisión del ${d.fecha}${hasta}: ${d.motivo}`
}
