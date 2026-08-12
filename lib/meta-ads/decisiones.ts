/**
 * Las decisiones humanas sobre la pauta, del lado tipado.
 *
 * ⚠️ La lógica —qué calla a qué, cuándo vence, cómo se parten los hallazgos— **no vive acá**: vive
 * en `lib/meta-ads/decisiones.core.js`, en JS plano, porque la necesitan `api/_meta-reglas.js` y
 * `scripts/evaluar-reglas-meta.mjs` y ninguno de los dos puede importar TypeScript. Este archivo
 * aporta los tipos. Mismo reparto que `reglas.ts` / `reglas.core.js`.
 */

import type { ClavePreset } from './reglas'
import type { LineaPauta } from './tipos'
import {
  CLASES_DECISION as CLASES_DECISION_JS,
  decisionQueCalla as decisionQueCallaJs,
  ESTADOS_DECISION as ESTADOS_DECISION_JS,
  indexar as indexarJs,
  partir as partirJs,
  porQueCallado as porQueCalladoJs,
  silenciaA as silenciaAJs,
  TODOS_LOS_PRESETS as TODOS_LOS_PRESETS_JS,
  vigenteAl as vigenteAlJs,
} from './decisiones.core.js'

/** `silencio` calla reglas y necesita objeto. `nota` queda escrita y no filtra nada. */
export type ClaseDecision = 'silencio' | 'nota'

export type EstadoDecision = 'vigente' | 'revocada'

/** De dónde salió la fila: cargada a mano, importada del CSV viejo, o nacida de ignorar un hallazgo. */
export type OrigenDecision = 'manual' | 'csv' | 'hallazgo'

export type AccionDecision = 'apagado' | 'pausado' | 'duplicado' | 'presupuesto' | 'otra'

export type Decision = {
  id: number
  creada: string
  quien: string
  clase: ClaseDecision
  /** El día en que se DECIDIÓ, no el día en que se cargó la fila. */
  fecha: string
  linea: LineaPauta
  nivel: 'campania' | 'conjunto' | 'aviso' | 'cuenta'
  /** `null` sólo en `clase: 'nota'`. El id, nunca el nombre: los nombres se editan. */
  objeto_id: string | null
  objeto_nombre: string | null
  cuenta_id: string | null
  accion: AccionDecision
  /** 🔑 El campo por el que existe la tabla. */
  motivo: string
  /** `null` = calla todos los presets sobre ese objeto. Con valor, sólo ése. */
  preset: ClavePreset | null
  /** Último día en que vale, inclusive. `null` = no vence. */
  vence: string | null
  estado: EstadoDecision
  revocada_por: string | null
  revocada_en: string | null
  origen: OrigenDecision
  hallazgo_id: number | null
}

/** Un hallazgo que una decisión calló, con la decisión adentro para poder decir por qué. */
export type Silenciado<T> = T & { decision: Decision }

/**
 * La misma decisión, en la grafía de la app.
 *
 * 🔑 **No es un descuido que `Decision` sea snake y ésta camel**, y es el mismo reparto que
 * `HallazgoNuevo` / `Hallazgo`: el core y el cron trabajan con la fila tal cual sale de la base —si
 * hubiera que mapear en el camino del script, un campo olvidado se guardaría en `null` sin romper
 * nada— y el mapeo a camel lo hace el handler, una sola vez, en el camino que sirve la pantalla.
 */
export type DecisionVista = {
  id: number
  creada: string
  quien: string
  clase: ClaseDecision
  fecha: string
  linea: LineaPauta
  nivel: 'campania' | 'conjunto' | 'aviso' | 'cuenta'
  objetoId: string | null
  objetoNombre: string | null
  cuentaId: string | null
  accion: AccionDecision
  motivo: string
  preset: ClavePreset | null
  vence: string | null
  estado: EstadoDecision
  revocadaPor: string | null
  revocadaEn: string | null
  origen: OrigenDecision
  hallazgoId: number | null
}

/**
 * Lo mínimo que mira `vigenteAl`. Existe para que la pantalla pueda preguntarlo sobre una
 * `DecisionVista` sin convertirla: los tres campos que decidien la vigencia se llaman igual en las
 * dos grafías, así que la conversión sería puro ritual.
 */
export type Vigenciable = { clase: ClaseDecision; estado: EstadoDecision; vence: string | null }

/** Un objeto de Meta contra el que se puede anotar una decisión, sacado de la foto de los últimos días. */
export type ObjetoDecidible = {
  objetoId: string
  objetoNombre: string | null
  nivel: 'campania' | 'conjunto' | 'aviso'
  linea: LineaPauta
  cuentaId: string | null
}

export type RespuestaDecisiones = {
  /** Todas, vigentes y revocadas: la pantalla es un registro para leer, no sólo el filtro del motor. */
  decisiones: DecisionVista[]
  objetos: ObjetoDecidible[]
  /** Qué líneas puede EDITAR, que no es lo mismo que cuáles ve. */
  puedeEditar: string[]
  presets: Array<{ clave: ClavePreset; rotulo: string }>
  /** La foto alimenta sólo el selector: si falló, se avisa y la lista de decisiones igual se lee. */
  problemaFoto: string | null
}

/**
 * Los `as` son los mismos que usa `reglas.ts` y por el mismo motivo: el core es JS plano, así que
 * TypeScript infiere de un `hasta = null` que el parámetro es de tipo `null` y no `string | null`.
 * El tipo verdadero es el que está escrito acá.
 */
export const TODOS_LOS_PRESETS = TODOS_LOS_PRESETS_JS as string
export const CLASES_DECISION = CLASES_DECISION_JS as ClaseDecision[]
export const ESTADOS_DECISION = ESTADOS_DECISION_JS as EstadoDecision[]

export const vigenteAl = vigenteAlJs as (d: Vigenciable | null, hasta: string | null) => boolean

export const indexar = indexarJs as (filas: Decision[]) => Map<string, Decision[]>

export const silenciaA = silenciaAJs as (
  d: Decision,
  opciones: { objetoId: string; preset?: string | null; hasta?: string | null },
) => boolean

export const decisionQueCalla = decisionQueCallaJs as (
  indice: Map<string, Decision[]> | null,
  opciones: { objetoId: string; preset?: string | null; hasta?: string | null },
) => Decision | null

/**
 * 🔑 Devuelve las DOS mitades: `hallazgos.length + silenciados.length` es lo que entró. Es la
 * invariante que impide que una decisión se coma algo real sin dejar rastro.
 */
export const partir = partirJs as <T extends { objeto_id: string }>(
  hallazgos: T[],
  indice: Map<string, Decision[]> | null,
  opciones: { preset?: string | null; hasta?: string | null },
) => { hallazgos: T[]; silenciados: Silenciado<T>[] }

export const porQueCallado = porQueCalladoJs as (d: Decision | null) => string
