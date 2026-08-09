/**
 * Cotejar **lo que se le pidió a Meta contra lo que Meta guardó**.
 *
 * # Por qué esto no vive adentro del script que lo usa
 *
 * `scripts/crear-y-borrar-meta.mjs` crea un conjunto de verdad y después pregunta si quedó como se
 * pidió. La respuesta a esa pregunta la da este archivo — así que **si esto tiene un error, el
 * ensayo dice «✅ quedó todo» y el defecto pasa igual**. Es exactamente el caso de
 * `feedback_areben_ensayo_verde_con_defecto`: un verde no vale por sí mismo, vale si se probó que
 * también sabe dar rojo. Por eso es un módulo puro, aparte y con tests que lo mutan.
 *
 * # Las tres respuestas, que no valen lo mismo
 *
 * Comparar un POST con la relectura de Meta **no es comparar dos objetos**: Meta normaliza, completa
 * defaults y expande lo que recibe. Un `targeting` con `{geo_locations:{countries:['AR']}}` vuelve
 * con el país expandido y con media docena de campos que nadie mandó. Tratar eso como «diferencia»
 * sería ruido que tapa la única diferencia que importa. De ahí los tres baldes:
 *
 * - `falta`  — se pidió y no está. **Grave**: la receta prometió algo que no se cumplió.
 * - `cambio` — está, con otro valor. **Grave por lo mismo.**
 * - `agrega` — Meta lo puso por su cuenta. **Informativo**: pasa igual armando el conjunto a mano.
 */

/**
 * ¿Estos dos valores son el mismo?
 *
 * 🔑 **Los arrays de primitivas se comparan como conjunto.** Meta reordena `publisher_platforms` y
 * `instagram_positions` sin que eso quiera decir nada, y reportarlo como cambio enseñaría a ignorar
 * el reporte. Un array de objetos sí se compara en orden: ahí el orden puede tener sentido
 * (`attribution_spec`).
 *
 * ⚠️ **Los números se comparan como texto a propósito**: Meta devuelve `daily_budget` como
 * `"600000"` y lo recibe igual. No es laxitud, es la forma en que la Graph escribe los números.
 */
export function igual(a, b) {
  if (a === b) return true
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    const primitivas = [...a, ...b].every((x) => !x || typeof x !== 'object')
    if (primitivas) {
      const sa = a.map(String).sort(), sb = b.map(String).sort()
      return sa.every((x, i) => x === sb[i])
    }
    return a.every((x, i) => igual(x, b[i]))
  }
  const objA = a && typeof a === 'object', objB = b && typeof b === 'object'
  if (objA !== objB) return false
  if (objA) {
    const ka = Object.keys(a), kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && igual(a[k], b[k]))
  }
  if (a === null || a === undefined || b === null || b === undefined) return false
  return String(a) === String(b)
}

const esObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v)

const vacio = () => ({ falta: [], cambio: [], agrega: [] })

const sumar = (dest, otro) => {
  dest.falta.push(...otro.falta)
  dest.cambio.push(...otro.cambio)
  dest.agrega.push(...otro.agrega)
  return dest
}

/**
 * Las diferencias entre `pedido` y `quedo`, recorriendo los objetos anidados.
 *
 * ⛔ **Sólo se baja por las ramas que están de los dos lados.** Una clave que se pidió y no volvió es
 * `falta` entera, no la lista de sus hijos: decir «faltan `targeting.geo_locations.countries` y
 * `targeting.geo_locations.cities`» cuando lo que no está es `geo_locations` es más largo y menos
 * cierto.
 *
 * ⛔ **Y un array se compara y se reporta COMO UN TODO**, sin bajar por índice. Los de la pauta
 * tienen uno o dos elementos, así que ver los dos arrays enteros dice más que un índice — y ahorra
 * tener que decidir qué es «el mismo elemento» cuando Meta los devuelve en otro orden.
 */
export function cotejar(pedido, quedo, ruta = '') {
  const dif = vacio()

  if (esObjeto(pedido) && esObjeto(quedo)) {
    for (const k of Object.keys(pedido)) {
      const r = ruta ? `${ruta}.${k}` : k
      if (!Object.prototype.hasOwnProperty.call(quedo, k) || quedo[k] === null || quedo[k] === undefined) {
        dif.falta.push({ ruta: r, pedido: pedido[k] })
        continue
      }
      if (esObjeto(pedido[k]) && esObjeto(quedo[k])) { sumar(dif, cotejar(pedido[k], quedo[k], r)); continue }
      if (!igual(pedido[k], quedo[k])) dif.cambio.push({ ruta: r, pedido: pedido[k], quedo: quedo[k] })
    }
    for (const k of Object.keys(quedo)) {
      if (!Object.prototype.hasOwnProperty.call(pedido, k)) dif.agrega.push({ ruta: ruta ? `${ruta}.${k}` : k, quedo: quedo[k] })
    }
    return dif
  }

  if (!igual(pedido, quedo)) dif.cambio.push({ ruta: ruta || '(valor)', pedido, quedo })
  return dif
}

/**
 * Los campos del cuerpo del POST que viajan como **JSON adentro de un string**.
 *
 * Se mandan con `JSON.stringify` y vuelven como objeto en la relectura, así que compararlos crudos
 * daría «cambió» en todos, siempre — un rojo permanente es tan inútil como un verde permanente.
 */
export const CAMPOS_JSON = ['targeting', 'promoted_object', 'attribution_spec', 'pacing_type']

/** Un valor que puede venir como JSON en un string. Si no parsea, es el string y punto. */
export function quizasJson(v) {
  if (typeof v !== 'string') return v
  const t = v.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return v
  try { return JSON.parse(t) } catch { return v }
}

/**
 * El cuerpo del POST contra el objeto releído de Meta.
 *
 * 🔑 **Recorre las claves del cuerpo, no las del objeto.** Un conjunto releído trae decenas de campos
 * que nunca se pidieron (`created_time`, `learning_stage_info`, …) y ninguno es una diferencia: lo
 * que se está probando es si lo pedido llegó, no si Meta devuelve de más.
 */
export function cotejarCuerpo(cuerpo, leido) {
  const dif = vacio()
  const obj = leido || {}
  for (const [k, v] of Object.entries(cuerpo || {})) {
    const pedido = CAMPOS_JSON.includes(k) ? quizasJson(v) : v
    if (!Object.prototype.hasOwnProperty.call(obj, k) || obj[k] === null || obj[k] === undefined || obj[k] === '') {
      dif.falta.push({ ruta: k, pedido })
      continue
    }
    sumar(dif, cotejar(pedido, CAMPOS_JSON.includes(k) ? quizasJson(obj[k]) : obj[k], k))
  }
  return dif
}

/** ¿El cotejo salió limpio? Sólo `falta` y `cambio` cuentan: lo que Meta agrega no es un defecto. */
export const sinDiferencias = (dif) => !((dif.falta || []).length + (dif.cambio || []).length)
