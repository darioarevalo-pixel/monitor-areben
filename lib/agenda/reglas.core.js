/**
 * Cuándo cae una cosa de la agenda: LA implementación, una sola, para los dos mundos.
 *
 * # Por qué este archivo es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js` y `lib/calendario/fechas.core.js`: `api/_agenda.js` corre
 * en Node sin pasar por el compilador de Next y **no puede importar TypeScript**. El handler tiene
 * que validar la regla *antes* de guardarla —una regla mal formada se guarda igual, no aparece
 * nunca, y nadie entiende por qué el pendiente no sale—, así que el motor vive acá y
 * `lib/agenda/index.ts` es el re-export tipado.
 *
 * # Qué problema resuelve
 *
 * **La regla se guarda, las ocurrencias se calculan.** Una rutina semanal NO genera una fila por
 * día: se guarda `{tipo:'semanal', dias:[2,5]}` y los martes y viernes salen de acá. Es el mismo
 * criterio que hizo que las fechas comerciales no estén en la base (`fechas.core.js`): el tercer
 * domingo de octubre es una regla, no un dato, y hardcodear el día funciona un año y miente los
 * otros. Acá el costo de no hacerlo sería peor: una fila por rutina por día, para siempre.
 *
 * # Lo mismo sirve para una promo bancaria y para un pendiente rutinario
 *
 * "Todos los martes de Banco Nación" y "todos los martes hay que reponer la vidriera" son la misma
 * pregunta. Por eso hay UN motor y no dos: `agenda_items.regla` y `agenda_promos.regla` guardan
 * exactamente la misma forma.
 *
 * ⚠️ Lo que la regla **no** sabe es hasta cuándo existe la cosa. La ventana de vigencia de una promo
 * va aparte, en sus columnas `desde`/`hasta`, y se cruza con la regla al consultar. Meter las dos
 * cosas en un solo objeto obligaría a escribir "todos los martes entre el 1 y el 31" y a mirarlo
 * entero para saber si una promo ya venció.
 */

import { diaDeSemanaDe, diasDelMes, diasEntre, sumarDias } from '../calendario/fechas.core.js'

/**
 * Las cinco formas, y nada más.
 *
 * La lista es corta a propósito. Un RRULE completo ("el segundo martes de cada dos meses") es una
 * pantalla de carga que nadie va a poder usar y un motor que nadie va a poder revisar; estas cinco
 * cubren todo lo que hoy se olvida en el local. Cuando falte una sexta, se suma acá y en
 * `motivoReglaInvalida`, que son los dos únicos lugares que enumeran los tipos.
 */
export const TIPOS_REGLA = [
  { key: 'unica', label: 'Un día puntual' },
  { key: 'rango', label: 'Todos los días, entre dos fechas' },
  { key: 'diaria', label: 'Todos los días' },
  { key: 'semanal', label: 'Ciertos días de la semana' },
  { key: 'mensual', label: 'Un día del mes' },
]

export const CLAVES_TIPO_REGLA = TIPOS_REGLA.map((t) => t.key)

/**
 * El día del mes más alto que se puede pedir por número.
 *
 * Del 29 en adelante no existe en todos los meses, y **qué hacer en febrero es una decisión de la
 * persona, no del motor**. Correrlo solo al 28 sería deducir; saltear el mes sería peor. Para eso
 * está `dia:'ultimo'`, que dice exactamente lo que se quiere decir. El mensaje de error lo explica.
 */
export const MAX_DIA_MES = 28

/**
 * Techo de la ventana que se puede pedir de una sola vez.
 *
 * `ocurrencias()` camina día por día —es la forma obviamente correcta y la ventana real es un mes o
 * un trimestre—, así que el tope existe sólo para que un `desde`/`hasta` mal armado no cuelgue la
 * pantalla. No es un límite de producto: nadie pide dos años de una rutina.
 */
export const MAX_VENTANA_DIAS = 400

const RE_ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * ¿Es un `YYYY-MM-DD` que existe de verdad?
 *
 * El formato solo no alcanza: `2026-02-31` pasa el regex y no es un día. Se valida contra
 * `diasDelMes`, que ya resuelve el bisiesto.
 */
export function esFechaIso(v) {
  if (typeof v !== 'string' || !RE_ISO.test(v)) return false
  const [a, m, d] = v.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1) return false
  return d <= diasDelMes(a, m)
}

/**
 * Por qué esta regla no sirve, en castellano, o `null` si está bien.
 *
 * Devuelve el motivo y no un booleano porque **lo consume el 400 del handler**: "regla inválida" no
 * le dice nada a quien está cargando, y el error se lee en la pantalla de alta.
 */
export function motivoReglaInvalida(regla) {
  if (!regla || typeof regla !== 'object' || Array.isArray(regla)) return 'Falta la regla.'
  const tipo = regla.tipo
  if (!CLAVES_TIPO_REGLA.includes(tipo)) {
    return `Tipo de regla desconocido (usá ${CLAVES_TIPO_REGLA.join(', ')}).`
  }

  if (tipo === 'diaria') return null

  if (tipo === 'unica') {
    return esFechaIso(regla.fecha) ? null : 'La fecha tiene que ser un día real, con formato AAAA-MM-DD.'
  }

  if (tipo === 'rango') {
    if (!esFechaIso(regla.desde)) return 'El "desde" tiene que ser un día real, con formato AAAA-MM-DD.'
    if (!esFechaIso(regla.hasta)) return 'El "hasta" tiene que ser un día real, con formato AAAA-MM-DD.'
    // Un rango al revés no es un rango vacío: es un error de carga que dejaría la cosa invisible
    // para siempre. Un rango de un solo día sí es válido — es lo mismo que `unica` y no molesta.
    if (diasEntre(regla.desde, regla.hasta) < 0) return 'El "hasta" no puede ser anterior al "desde".'
    return null
  }

  if (tipo === 'semanal') {
    const dias = regla.dias
    if (!Array.isArray(dias) || dias.length === 0) return 'Elegí por lo menos un día de la semana.'
    if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return 'Los días de la semana van de 0 (domingo) a 6 (sábado).'
    }
    if (new Set(dias).size !== dias.length) return 'Hay un día de la semana repetido.'
    return null
  }

  // mensual
  const dia = regla.dia
  if (dia === 'ultimo') return null
  if (!Number.isInteger(dia) || dia < 1 || dia > MAX_DIA_MES) {
    return `Del ${MAX_DIA_MES + 1} en adelante no existe en todos los meses: elegí "el último día del mes".`
  }
  return null
}

/** ¿La regla está bien formada? El motivo, si no lo está, lo da `motivoReglaInvalida`. */
export function reglaValida(regla) {
  return motivoReglaInvalida(regla) === null
}

/**
 * ¿Esta regla cae este día?
 *
 * 🔴 **`dias` se indexa con `getDay()`: 0 es domingo.** No se reordena para que arranque en lunes.
 * Que la grilla del mes empiece el lunes es otra cosa y se resuelve en `lib/fechas/semana.ts` con
 * `columnaDe()`. Ya se cometió el error una vez en el calendario editorial: dar vuelta el array de
 * los días corrió todas las etiquetas un día **sin que fallara nada**.
 *
 * Una regla inválida devuelve `false` en vez de explotar: la validación es del handler al guardar, y
 * una fila vieja o rota tiene que hacer desaparecer la cosa, no tumbar la pantalla del local.
 */
export function aplicaEn(regla, fecha) {
  if (!esFechaIso(fecha) || !reglaValida(regla)) return false

  switch (regla.tipo) {
    case 'diaria':
      return true
    case 'unica':
      return regla.fecha === fecha
    case 'rango':
      return diasEntre(regla.desde, fecha) >= 0 && diasEntre(fecha, regla.hasta) >= 0
    case 'semanal':
      return regla.dias.includes(diaDeSemanaDe(fecha))
    case 'mensual': {
      const [anio, mes, dia] = fecha.split('-').map(Number)
      if (regla.dia === 'ultimo') return dia === diasDelMes(anio, mes)
      return dia === regla.dia
    }
    default:
      return false
  }
}

/**
 * Las fechas en que la regla cae, dentro de la ventana `[desde, hasta]` (los dos extremos incluidos).
 *
 * Es lo que pinta la grilla del mes. Camina día por día porque la ventana siempre es chica y porque
 * un salto "inteligente" por tipo de regla es cuatro caminos distintos que se pueden equivocar cada
 * uno por su lado; acá hay uno solo y es el mismo que contesta `aplicaEn`, así que la lista y el día
 * de hoy **no pueden discrepar**.
 */
export function ocurrencias(regla, desde, hasta) {
  if (!esFechaIso(desde) || !esFechaIso(hasta) || !reglaValida(regla)) return []
  const largo = diasEntre(desde, hasta)
  if (largo < 0 || largo > MAX_VENTANA_DIAS) return []

  const out = []
  let f = desde
  for (let i = 0; i <= largo; i++) {
    if (aplicaEn(regla, f)) out.push(f)
    f = sumarDias(f, 1)
  }
  return out
}
