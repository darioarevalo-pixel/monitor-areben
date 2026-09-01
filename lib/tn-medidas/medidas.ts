/**
 * El diccionario de medidas, con tipos.
 *
 * 🔑 **Las listas y las reglas no viven acá: viven en `medidas.core.js`.** Este archivo es el
 * re-export tipado, el mismo molde que `lib/tn-desc/atributos.ts` sobre `atributos.core.js`. El
 * `.js` plano existe porque el que compone el HTML que sale a la tienda es un handler de `api/`,
 * que corre en Node sin pasar por el compilador de Next y ⛔ no puede importar TypeScript.
 *
 * ⚠️ Los tipos se declaran a mano —TS infiere `string` de un `.js`— y que no se separen de la
 * implementación lo cuida `tests/tn-medidas-core.test.ts`, que recorre el diccionario real.
 */

import {
  ESTIRA as ESTIRA_JS,
  MEDIDAS as MEDIDAS_JS,
  MEDIDAS_POR_FAMILIA as MEDIDAS_POR_FAMILIA_JS,
  MEDIDAS_QUE_ESTIRAN as MEDIDAS_QUE_ESTIRAN_JS,
  TELAS_QUE_ESTIRAN as TELAS_QUE_ESTIRAN_JS,
  contestadasDe as contestadasDeJs,
  esMedida as esMedidaJs,
  esValorDeMedida as esValorDeMedidaJs,
  filasDe as filasDeJs,
  medidasDe as medidasDeJs,
  paraPublicar as paraPublicarJs,
} from './medidas.core.js'
import type { Cargados, Familia } from '@/lib/tn-desc/atributos'

/** Las claves de medida, en su orden canónico. */
export type Medida = 'ancho' | 'anchoBajoBusto' | 'contornoCintura' | 'anchoPierna' | 'largo' | 'largoManga'

export type FichaMedida = {
  label: string
  orden: number
  /** El texto de la guía. Va al lado del dibujo, así que ⛔ no se "mejora". */
  comoMedir: string
  /** ¿Se puede marcar «estira»? `largo` ⛔ nunca. */
  estira: boolean
  /** Sólo la cintura: se carga la mitad y se publica el doble. */
  duplicar: boolean
}

/** Una medida ya resuelta para un producto: lista para dibujar el casillero. */
export type MedidaDeFamilia = FichaMedida & { key: Medida }

/** Lo que se cargó: `{ [talle]: { [medida]: valor } }`. Sin talles, la clave es `''`. */
export type Medidas = Record<string, Partial<Record<Medida, string>>>

/** Una fila de la tabla publicada: un valor por talle, `null` donde no hay número. */
export type FilaMedida = { key: Medida; label: string; comoMedir: string; valores: (string | null)[] }

export const ESTIRA: string = ESTIRA_JS
export const MEDIDAS = MEDIDAS_JS as Record<Medida, FichaMedida>
export const MEDIDAS_QUE_ESTIRAN = MEDIDAS_QUE_ESTIRAN_JS as Medida[]
export const MEDIDAS_POR_FAMILIA = MEDIDAS_POR_FAMILIA_JS as Record<Familia, Medida[]>
/** Las telas con las que la pantalla avisa sobre el ancho, sin que nadie lo pregunte. */
export const TELAS_QUE_ESTIRAN = TELAS_QUE_ESTIRAN_JS as string[]

/** Las medidas que se le piden a un producto. La ficha decide si hay manga que medir. */
export function medidasDe(familia: Familia | null, ficha: Cargados): MedidaDeFamilia[] {
  return medidasDeJs(familia, ficha) as MedidaDeFamilia[]
}

export function esMedida(familia: Familia, medida: Medida, ficha: Cargados): boolean {
  return esMedidaJs(familia, medida, ficha)
}

export function esValorDeMedida(medida: Medida, valor: string): boolean {
  return esValorDeMedidaJs(medida, valor)
}

/** El número que se publica: acá vive el ×2 de la cintura. `null` = esa fila no sale. */
export function paraPublicar(medida: Medida, valor: string | undefined): string | null {
  return paraPublicarJs(medida, valor) as string | null
}

/** Las filas de la tabla. Una fila sin un solo número ⛔ no se publica. */
export function filasDe(familia: Familia | null, ficha: Cargados, talles: string[], cargadas: Medidas): FilaMedida[] {
  return filasDeJs(familia, ficha, talles, cargadas) as FilaMedida[]
}

/** El `3/3` de la fila. Marcar «estira» cuenta como contestada: es trabajo hecho. */
export function contestadasDe(familia: Familia | null, ficha: Cargados, talles: string[], cargadas: Medidas): { con: number; total: number } {
  return contestadasDeJs(familia, ficha, talles, cargadas) as { con: number; total: number }
}
