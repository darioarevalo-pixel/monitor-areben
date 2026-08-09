/**
 * El guardarraíl de los escalones, del lado tipado.
 *
 * ⚠️ La lógica **no vive acá**: vive en `lib/meta-ads/escalado.core.js`, en JS plano, porque la
 * necesitan `api/_meta-planes.js` y `scripts/avanzar-planes-meta.mjs` y ninguno de los dos puede
 * importar TypeScript. Este archivo aporta los tipos.
 */

import type { FilaRegla, NivelRegla, Umbrales, ClaveUmbral } from './reglas'
import {
  decidirEscalon as decidirEscalonJs,
  escalera as escaleraJs,
  estaEsperando as estaEsperandoJs,
  faltanParaEscalar as faltanParaEscalarJs,
  HORAS_ESCALON_DEFECTO as HORAS_ESCALON_DEFECTO_JS,
  HORAS_ESCALON_MINIMO as HORAS_ESCALON_MINIMO_JS,
  PRESET_GUARDARRAIL as PRESET_GUARDARRAIL_JS,
  proximoEn as proximoEnJs,
  TOPE_ESCALONES as TOPE_ESCALONES_JS,
  ultimoDiaCerrado as ultimoDiaCerradoJs,
} from './escalado.core.js'

export const PRESET_GUARDARRAIL = PRESET_GUARDARRAIL_JS as 'ganador-escalar'
export const HORAS_ESCALON_DEFECTO = HORAS_ESCALON_DEFECTO_JS as number
export const HORAS_ESCALON_MINIMO = HORAS_ESCALON_MINIMO_JS as number
export const TOPE_ESCALONES = TOPE_ESCALONES_JS as number

/** Lo que el guardarraíl vio para decidir. Es lo que se guarda en el paso y se muestra en pantalla. */
export type EvidenciaEscalon = {
  roas?: number
  roas_objetivo?: number
  dias_seguidos?: number
  piden?: number
  desde_crudo?: number
  a_crudo?: number
  diario_crudo?: number
  techo_diario_crudo?: number
  spend?: number
  revenue?: number
  hasta?: string
  ventana?: number
}

/**
 * La respuesta del guardarraíl. **Frenar es un resultado con motivo escrito**, no un `false`: ese
 * texto es lo que queda en el paso `salteado` y lo que se lee días después.
 */
export type Decision = {
  seguir: boolean
  motivo: string
  evidencia: EvidenciaEscalon
  /** Sólo cuando frenó por umbrales sin definir. */
  faltan?: ClaveUmbral[]
  /** Frenó porque no hay foto de la ventana: no se sabe cómo viene, y eso no es lo mismo que «viene mal». */
  sinFoto?: boolean
  /** Frenó porque llegó al techo. Es la forma buena de que una escalada se termine. */
  llegoAlTecho?: boolean
  /** Sólo cuando sigue. */
  desdeCrudo?: number
  aCrudo?: number
}

export type PedidoDecision = {
  objetoId: string
  nivel?: NivelRegla
  diarioCrudo: number
  filas: FilaRegla[]
  umbrales: Umbrales
  hasta: string
  moneda?: string
  ventana?: number
}

export const decidirEscalon = decidirEscalonJs as (pedido: PedidoDecision) => Decision

/** Los diarios por los que iría pasando la escalada. Previsión, no promesa: se recalcula al ejecutar. */
export const escalera = escaleraJs as (diarioCrudo: number, pasos: number, techoCrudo: number) => number[]

/** Cuándo se toca el próximo escalón, contado **desde ahora**. */
export const proximoEn = proximoEnJs as (ahora: Date | number, horas?: number) => string | null

/** ¿Este plan está esperando su próximo escalón? */
export const estaEsperando = estaEsperandoJs as (
  plan: { proximo_en?: string | null; proximoEn?: string | null },
  ahora: Date | number,
) => boolean

/**
 * 🔴 El último día CERRADO. **Nunca hoy**: el día en curso figura con lo poco que se juntó y corta
 * cualquier racha. Ver el porqué, medido, en el `.core.js`.
 */
export const ultimoDiaCerrado = ultimoDiaCerradoJs as (ahora: Date | number) => string | null

/** Qué umbrales faltan definir para que una escalada pueda armarse. Vacío = se puede. */
export const faltanParaEscalar = faltanParaEscalarJs as (umbrales: Partial<Umbrales>) => ClaveUmbral[]
