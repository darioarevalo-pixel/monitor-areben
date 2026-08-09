/**
 * El cotejo «lo pedido contra lo que quedó», del lado tipado.
 *
 * ⚠️ La lógica vive en `lib/meta-ads/cotejo.core.js`, en JS plano, porque el que la usa es un script
 * de `scripts/` y porque el día que el motor tenga que verificar sus propias escrituras la va a
 * necesitar `api/_meta-planes.js`, que no puede importar TypeScript. Acá viven los tipos y de acá
 * comen los tests.
 */

import {
  CAMPOS_JSON as CAMPOS_JSON_JS,
  cotejar as cotejarJs,
  cotejarCuerpo as cotejarCuerpoJs,
  igual as igualJs,
  quizasJson as quizasJsonJs,
  sinDiferencias as sinDiferenciasJs,
} from './cotejo.core.js'

/** Un campo que se pidió y no volvió. */
export interface Falta { ruta: string; pedido: unknown }
/** Un campo que volvió con otro valor. */
export interface Cambio { ruta: string; pedido: unknown; quedo: unknown }
/** Un campo que Meta puso por su cuenta. No es un defecto. */
export interface Agregado { ruta: string; quedo: unknown }

export interface Diferencias {
  falta: Falta[]
  cambio: Cambio[]
  agrega: Agregado[]
}

export const CAMPOS_JSON = CAMPOS_JSON_JS as string[]
export const igual = igualJs as (a: unknown, b: unknown) => boolean
export const quizasJson = quizasJsonJs as (v: unknown) => unknown
export const cotejar = cotejarJs as (pedido: unknown, quedo: unknown, ruta?: string) => Diferencias
export const cotejarCuerpo = cotejarCuerpoJs as (
  cuerpo: Record<string, string>,
  leido: Record<string, unknown> | null | undefined,
) => Diferencias
export const sinDiferencias = sinDiferenciasJs as (dif: Diferencias) => boolean
