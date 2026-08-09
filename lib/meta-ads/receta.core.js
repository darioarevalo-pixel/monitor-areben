/**
 * La **receta** de un conjunto: cómo leerlo de Meta y volver a armarlo desde cero.
 *
 * # Por qué existe: `/copies` anda 4 de cada 16 veces
 *
 * Duplicar un conjunto se pedía con `POST /<adset_id>/copies`. Meta revalida la copia **con las
 * reglas de hoy** aunque el original esté grandfathered y entregando, así que una configuración
 * armada hace meses reprueba el examen. Medido el 9-ago-2026 con `validate_only` sobre 16 conjuntos
 * activos reales de la cuenta `1145878766790149`: **`/copies` pasó 4**, y los 12 rechazos se
 * repartieron en tres motivos que no tienen nada que ver entre sí:
 *
 * | Motivo del rechazo | Cuántos |
 * |---|---|
 * | `targeting_optimization`: campo que Meta **eliminó** y la copia arrastra igual | 6 |
 * | «Para publicar en el inicio de Explorar, seleccioná también Explorar» | 3 |
 * | el diario del original ya no llega al mínimo que la cuenta acepta | 3 |
 *
 * 🔑 **Ninguno se puede arreglar del lado de `/copies`**: ese endpoint no recibe un `targeting`
 * corregido. La única salida es dejar de pedir la fotocopia — leer la configuración, corregirle lo
 * que quedó viejo y **crearla** con `POST act_<id>/adsets`. Con la receta, los mismos 16 dieron 7 (y
 * 10 de 10 si se excluyen las 6 publicaciones promocionadas de 2024, que no son duplicables por
 * ningún camino porque exigirían subirle el presupuesto a su campaña).
 *
 * # Este archivo es PURO
 *
 * No habla con Meta ni con la base: recibe el objeto que ya devolvió Graph y devuelve el cuerpo del
 * POST. Misma partición que `planes.core.js` / `reglas.core.js`, y por el mismo motivo: es la parte
 * que puede estar mal, así que es la que tiene tests. Es `.js` porque lo importa
 * `api/_meta-planes.js`, que corre en Node sin pasar por el compilador de Next.
 */

/**
 * Los campos que hay que leer del conjunto original para poder recrearlo.
 *
 * ⚠️ **Un solo campo inexistente o bloqueado anula la consulta ENTERA**, no ese campo: pedir
 * `contextual_bundling_spec` en esta cuenta devuelve `(#3) AdAccount must pass GK` y no vuelve nada.
 * Por eso la lista es corta y cada campo de acá se leyó de verdad contra la cuenta, no de la
 * documentación. Es la misma trampa que documenta `minimosDe()` en `graph.core.js`.
 */
export const CAMPOS_RECETA = [
  'id', 'name', 'campaign_id', 'account_id', 'status', 'effective_status',
  'daily_budget', 'lifetime_budget', 'billing_event', 'optimization_goal',
  'bid_strategy', 'bid_amount', 'promoted_object', 'attribution_spec',
  'destination_type', 'start_time', 'end_time', 'pacing_type', 'targeting',
].join(',')

/**
 * 🔑 **Meta contesta `UNDEFINED` y `NONE` para decir «no está puesto».**
 *
 * No son valores: son la ausencia de valor escrita como texto. Devolvérselos en el POST es pedirle
 * que ponga un valor llamado «indefinido», y ahí contesta que ese no es uno de los valores válidos
 * —un error que habla del campo y hace creer que el problema es el dato del original—.
 * `destination_type: 'UNDEFINED'` y `multi_optimization_goal_weight: 'UNDEFINED'` son los dos casos
 * que aparecieron en la pauta real.
 */
export const SENTINELAS = ['UNDEFINED', 'NONE']

/** ¿Este valor leído de Meta es un valor de verdad, o la forma en que Meta escribe «vacío»? */
export function tieneValor(v) {
  if (v === undefined || v === null || v === '') return false
  if (typeof v === 'string' && SENTINELAS.includes(v)) return false
  return true
}

/**
 * Campos del `targeting` que Meta **eliminó** y sigue devolviendo al leer.
 *
 * Están en los conjuntos viejos porque cuando se armaron existían. Meta los devuelve en el `GET` y
 * los rechaza en el `POST`, que es exactamente lo que hace que `/copies` se caiga sin que nadie
 * pueda hacer nada: la copia arrastra lo que la lectura trae.
 */
export const CAMPOS_MUERTOS_TARGETING = ['targeting_optimization']

/**
 * Las claves del `promoted_object` que Meta acepta al ESCRIBIR.
 *
 * `smart_pse_enabled` viene en la lectura y no es escribible: mandarlo de vuelta es un rechazo. La
 * lista es blanca y no negra a propósito — un campo nuevo de lectura que aparezca mañana se ignora
 * solo, en vez de romper la creación el día que Meta lo agregue.
 */
export const CLAVES_PROMOTED = [
  'pixel_id', 'custom_event_type', 'custom_conversion_id', 'page_id', 'application_id',
  'object_store_url', 'product_catalog_id', 'product_set_id', 'offline_conversion_data_set_id',
]

/**
 * Corrige el `targeting` leído para que Meta lo acepte al escribir.
 *
 * 🔑 **Cada regla de acá nació de un rechazo MEDIDO contra la cuenta, no de la documentación.** Por
 * eso devuelve `notas`: lo que se tocó tiene que poder decirse en la pantalla. Una corrección
 * silenciosa sobre la segmentación de una campaña que gasta plata es exactamente lo que nadie
 * podría auditar después.
 */
export function corregirTargeting(targeting) {
  const t = JSON.parse(JSON.stringify(targeting || {}))
  const notas = []

  for (const k of CAMPOS_MUERTOS_TARGETING) {
    if (t[k] !== undefined) {
      delete t[k]
      notas.push(`Se saca «${k}», que Meta eliminó y ya no acepta.`)
    }
  }

  // 🔴 «Inicio de Explorar» exige «Explorar». Los conjuntos armados antes de esa regla tienen el
  // primero sin el segundo: siguen entregando porque Meta no revalida lo que existe, pero una copia
  // nace rechazada. Los dos emplazamientos conviven sin problema —hay conjuntos en la cuenta que
  // tienen los dos—, así que agregar el que falta es la corrección mínima.
  const ig = t.instagram_positions
  if (Array.isArray(ig) && ig.includes('explore_home') && !ig.includes('explore')) {
    t.instagram_positions = [...ig, 'explore']
    notas.push('Se agrega el emplazamiento «Explorar» de Instagram, que Meta exige cuando está «Inicio de Explorar».')
  }

  return { targeting: t, notas }
}

/**
 * El cuerpo del `POST act_<id>/adsets` que recrea a `orig`.
 *
 * ⛔ **`name`, `campaign_id` y `status` NO salen de acá.** Los pone el motor: el nombre lleva la
 * marca del paso (sin ella no se puede adoptar en vez de reintentar) y la campaña puede ser todavía
 * un `{{n}}` cuando se está duplicando la campaña entera. Y `status` es `PAUSED` siempre, que es una
 * invariante del motor y no un dato del original: si saliera de acá, duplicar un conjunto activo
 * crearía uno activo.
 *
 * `ahora` entra como parámetro para que la función siga siendo pura y testeable — mismo criterio que
 * `evaluarRegla(regla, umbrales, filas, hoy)`.
 */
export function recetaDeConjunto(orig, ahora = Date.now()) {
  const o = orig || {}
  const notas = []

  const fix = corregirTargeting(o.targeting)
  notas.push(...fix.notas)

  const cuerpo = { targeting: JSON.stringify(fix.targeting) }

  // Los escalares que se copian tal cual, saltando los sentinelas de «no está puesto».
  for (const k of ['billing_event', 'optimization_goal', 'bid_strategy', 'destination_type']) {
    if (tieneValor(o[k])) cuerpo[k] = String(o[k])
  }
  if (Number(o.bid_amount) > 0) cuerpo.bid_amount = String(Math.round(Number(o.bid_amount)))
  if (Array.isArray(o.pacing_type) && o.pacing_type.length) cuerpo.pacing_type = JSON.stringify(o.pacing_type)

  const promoted = {}
  for (const k of CLAVES_PROMOTED) {
    if (o.promoted_object && tieneValor(o.promoted_object[k])) promoted[k] = o.promoted_object[k]
  }
  if (Object.keys(promoted).length) cuerpo.promoted_object = JSON.stringify(promoted)

  if (Array.isArray(o.attribution_spec) && o.attribution_spec.length) {
    cuerpo.attribution_spec = JSON.stringify(o.attribution_spec)
  }

  // ⛔ `start_time` NO se copia: el del original está en el pasado y una copia que arranca ayer no
  // existe. Sin él, Meta la arranca cuando se la prende, que es lo que se quiere — y como nace
  // pausada, «cuando se la prende» es una decisión de una persona.
  const presupuesto = repartoDePresupuesto(o, ahora)
  if (!presupuesto.ok) return presupuesto
  Object.assign(cuerpo, presupuesto.campos)
  notas.push(...presupuesto.notas)

  return { ok: true, cuerpo, notas }
}

/**
 * El presupuesto de la copia: diario o total, y con qué fecha de fin.
 *
 * 🔴 **Un conjunto de presupuesto TOTAL exige `end_time`**, y el del original ya pasó. Copiarlo
 * crearía algo vencido y Meta lo rechaza igual («ingresá una fecha 24 h después del inicio»), así
 * que se pide una nueva en vez de inventarla: elegir por su cuenta cuándo termina de gastar una
 * campaña es una decisión de pauta, no un arreglo técnico.
 */
export function repartoDePresupuesto(o, ahora) {
  const diario = Math.round(Number(o.daily_budget) || 0)
  const total = Math.round(Number(o.lifetime_budget) || 0)

  if (diario > 0) return { ok: true, campos: { daily_budget: String(diario) }, notas: [] }

  if (total > 0) {
    const fin = o.end_time ? new Date(o.end_time).getTime() : 0
    // 24 h de margen es lo que pide Meta; sin eso el rechazo llega igual, más tarde y peor contado.
    if (!fin || fin <= Number(ahora) + 864e5) {
      return {
        ok: false, status: 409,
        error: 'Ese conjunto gasta por presupuesto TOTAL y su fecha de fin ya pasó. Para recrearlo hay que decidir hasta cuándo tiene que gastar la copia, y eso no se puede deducir del original.',
      }
    }
    return {
      ok: true,
      campos: { lifetime_budget: String(total), end_time: String(o.end_time) },
      notas: [],
    }
  }

  // Sin presupuesto propio: la campaña es CBO y la plata vive arriba. Es válido y no se toca.
  return { ok: true, campos: {}, notas: [] }
}

/**
 * El subcódigo con el que Meta dice «ese presupuesto es muy bajo».
 *
 * 🔑 **Se mira el subcódigo y el campo culpable, nunca el texto**, porque el idioma del mensaje
 * depende del token y no lo controlamos: un `includes('presupuesto')` deja de funcionar el día que
 * Meta conteste en inglés, y lo hace en silencio.
 */
export const SUBCODIGO_PRESUPUESTO_BAJO = 1885272

/** ¿Este rechazo de Meta es por el presupuesto? */
export function esRechazoDePresupuesto(error) {
  const e = error || {}
  if (Number(e.error_subcode) === SUBCODIGO_PRESUPUESTO_BAJO) return true
  try {
    const d = typeof e.error_data === 'string' ? JSON.parse(e.error_data) : e.error_data
    const campos = [].concat(...(((d || {}).blame_field_specs) || []))
    return campos.includes('daily_budget') || campos.includes('lifetime_budget')
  } catch {
    return false
  }
}

/** Un importe escrito por Meta, en la unidad menor de la moneda. */
function aUnidadMenor(texto) {
  const t = String(texto)
  // El último separador seguido de EXACTAMENTE dos dígitos hasta el final es el decimal, y todo lo
  // demás son miles. Así sale igual «1.500,38» (es-AR) que «1,500.38» (en-US) — y cuál de los dos
  // llega depende del idioma del token.
  const m = t.match(/^(.*)[.,](\d{2})$/)
  if (m) return Number(String(m[1]).replace(/[.,]/g, '')) * 100 + Number(m[2])
  return Number(t.replace(/[.,]/g, '')) * 100
}

/**
 * El mínimo que Meta nombró en su mensaje de rechazo.
 *
 * 🔴 **El número exacto sólo viene en el texto**, y el texto es lo único de un error que no es
 * contrato. Por eso esta función existe pero **su resultado no se usa nunca sin volver a
 * preguntárselo a Meta con `validate_only`**: si el parseo se equivoca, la validación lo caza y se
 * pasa al siguiente escalón. Leer y verificar es barato; leer y creer, no.
 *
 * Importa porque la diferencia es enorme: la cuenta `1145878766790149` **declara** un mínimo diario
 * de `3000755` ($30.007,55) y el que **aplica** a un conjunto de `PROFILE_VISIT` es `150038`
 * ($1.500,38) — medido el 9-ago-2026. Subir al declarado multiplicaría el presupuesto por veinte.
 */
export function minimoDeMensaje(mensaje) {
  const crudos = String(mensaje || '').match(/\d[\d.,]*\d|\d/g) || []
  let mayor = 0
  for (const c of crudos) {
    const v = aUnidadMenor(c)
    if (Number.isFinite(v) && v > mayor) mayor = v
  }
  return mayor || null
}

/**
 * Los diarios a probar, en orden, cuando Meta rechazó el del original por bajo.
 *
 * Del más barato al más caro: primero el que Meta nombró, después el mínimo para eventos frecuentes
 * y por último el declarado por la cuenta. **El primero que valide gana**, así que la copia nace con
 * el presupuesto más cercano posible al del original.
 */
export function escalonesDeDiario(mensaje, minimos) {
  const m = minimos || {}
  const cand = [minimoDeMensaje(mensaje), Number(m.minDiarioAlto) || 0, Number(m.minDiarioCrudo) || 0]
  const vistos = new Set()
  return cand
    .map((v) => Math.round(Number(v) || 0))
    .filter((v) => v > 0 && !vistos.has(v) && vistos.add(v))
    .sort((a, b) => a - b)
}

/**
 * La receta con otro diario, para probar un escalón.
 *
 * 🔑 **El diario que va acá no se calcula: se prueba.** El mínimo que declara el edge
 * `minimum_budgets` NO es el que Meta aplica — medido el 9-ago, la cuenta declara `3000755`
 * ($30.007,55) y acepta un conjunto de `600000` ($6.000) sin chistar, y para uno de `PROFILE_VISIT`
 * el piso real resultó `150038` ($1.500,38). Subir todo lo que esté por debajo del declarado
 * multiplicaría por veinte presupuestos que no hacía falta tocar.
 *
 * Por eso el orden es: se le pregunta a Meta con el diario del original y **sólo si lo rechaza** se
 * suben los escalones de `escalonesDeDiario()`, de menor a mayor, hasta que uno valide. Preguntar
 * sale gratis (`validate_only` no escribe) y no hay ningún umbral que adivinar. Es
 * `feedback_bruno_medir_no_estimar` aplicado a un número que no se puede deducir.
 */
export function conDiario(cuerpo, valor) {
  const v = Math.round(Number(valor) || 0)
  const antes = Math.round(Number((cuerpo || {}).daily_budget) || 0)
  if (!v || !antes || antes >= v) return { ok: false }
  return {
    ok: true, antes, ahora: v,
    cuerpo: { ...cuerpo, daily_budget: String(v) },
    nota: `El diario sube de ${antes} a ${v} (en la unidad menor de la moneda) porque Meta ya no acepta el del original. La copia nace PAUSADA: no gasta hasta que alguien la prenda.`,
  }
}

/**
 * El parámetro que convierte un POST en una pregunta: Meta valida todo y **no crea nada**.
 *
 * Es lo que permite que armar un plan deje de ser una promesa. Antes, `crear` sólo leía el censo y
 * escribía los pasos, así que un plan podía nacer «listo» y morir en el paso 1 contra un rechazo que
 * se podría haber sabido de entrada. Verificado contra Meta: la respuesta es `{"success":true}` sin
 * un id, y el conjunto no aparece en la cuenta.
 */
export const VALIDAR_SOLO = { execution_options: JSON.stringify(['validate_only']) }
