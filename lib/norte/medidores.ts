/**
 * La cara TypeScript de `medidores.core.js`.
 *
 * El core es `.js` plano porque lo importa `api/_norte.js`, que corre en Node sin pasar por el
 * compilador de Next. Acá se le pone el tipo una sola vez — mismo patrón que `contribucion.ts` y
 * `lib/liquidacion/resultado.ts`.
 */

import {
  MEDIDORES as MEDIDORES_JS,
  canalDeMeta as canalDeMetaJs,
  esMedidor as esMedidorJs,
  medidorDe as medidorDeJs,
} from './medidores.core.js'
import type { Canal } from '../liquidacion/resultado'

/** Qué cuenta una meta. La unidad viene con el medidor: no se escribe a mano. */
export type Medidor = 'unidades-dia' | 'ventas-dia' | 'contrib-unidad' | 'contrib-dia'

export type FichaMedidor = {
  key: Medidor
  label: string
  unidad: string
  /** `true` si depende de la contribución, o sea del dashboard. Sin él el medido es `null`. */
  necesitaPlata: boolean
  hint: string
}

export const MEDIDORES = MEDIDORES_JS as readonly FichaMedidor[]
export const esMedidor: (key: unknown) => boolean = esMedidorJs
export const medidorDe = medidorDeJs as (key: string) => FichaMedidor | null
/** `null` = todos los canales. `undefined` = no es un canal y no se guarda. */
export const canalDeMeta = canalDeMetaJs as (valor: unknown) => Canal | null | undefined

/** La unidad de un medidor, para pegarle al número. Vacía si el medidor no existe. */
export function unidadDe(key: string): string {
  return medidorDe(key)?.unidad || ''
}
