/**
 * El guardarraíl de la poda, del lado tipado.
 *
 * ⚠️ La lógica **no vive acá**: vive en `lib/meta-ads/podado.core.js`, en JS plano, porque la
 * necesitan `api/_meta-planes.js` y los scripts de `scripts/`, y ninguno de los dos puede importar
 * TypeScript. Este archivo aporta los tipos.
 */

import type { ClaveUmbral, FilaRegla, NivelRegla, Umbrales } from './reglas'
import {
  candidatosAPodar as candidatosAPodarJs,
  CLAVES_MOTIVO as CLAVES_MOTIVO_JS,
  decidirPoda as decidirPodaJs,
  faltanParaPodar as faltanParaPodarJs,
  MOTIVOS_PODA as MOTIVOS_PODA_JS,
  TOPE_PODA as TOPE_PODA_JS,
} from './podado.core.js'

/** Por qué se apaga algo. Ver `MOTIVOS_PODA` en el `.core.js`. */
export type MotivoPoda = 'sin-ventas' | 'bajo-roas'

export const MOTIVOS_PODA = MOTIVOS_PODA_JS as Record<MotivoPoda, {
  preset: string
  rotulo: string
  requiere: ClaveUmbral[]
}>
export const CLAVES_MOTIVO = CLAVES_MOTIVO_JS as MotivoPoda[]
export const TOPE_PODA = TOPE_PODA_JS as number

/** Lo que el guardarraíl vio para decidir. Queda guardado en el paso y se lee después. */
export type EvidenciaPoda = {
  spend?: number
  compras?: number
  revenue?: number
  roas?: number
  roas_objetivo?: number
  gasto_minimo?: number
  dias?: number
  estado?: string | null
  estado_antes?: string
  hasta?: string
  ventana?: number
}

/**
 * La respuesta del guardarraíl. **Frenar es un resultado con motivo escrito**, no un `false`: ese
 * texto es lo que queda en el paso `salteado` y lo que explica por qué la poda dejó tres de cinco.
 */
export type DecisionPoda = {
  seguir: boolean
  motivo: string
  evidencia: EvidenciaPoda
  /** Sólo cuando frenó por umbrales sin definir. */
  faltan?: ClaveUmbral[]
  /** Ya estaba apagado en Meta. No es un fallo: alguien llegó antes. */
  yaApagado?: boolean
  /** No hay foto de la ventana. «No se sabe» no es «no vende», y sólo una de las dos justifica apagar. */
  sinFoto?: boolean
  /** 🔴 Meta le atribuyó compras desde que entró en la lista. Es la razón de ser del guardarraíl. */
  vendioDespues?: boolean
}

export type PedidoPoda = {
  objetoId: string
  nivel?: NivelRegla
  estadoActual: string
  motivo?: MotivoPoda
  filas: FilaRegla[]
  umbrales: Umbrales
  hasta: string
  ventana?: number
}

export const decidirPoda = decidirPodaJs as (pedido: PedidoPoda) => DecisionPoda

/** Un objeto que hoy cumple la condición de poda, con los números que la justifican. */
export type Candidato = {
  objetoId: string
  nivel: NivelRegla
  nombre: string
  linea: string | null
  cuentaId: string | null
  motivo: MotivoPoda
  spend: number
  compras: number
  revenue: number
  roas: number
  dias: number
  /** Lo que se deja de gastar por día. Promedio de la ventana: un aviso no tiene diario propio. */
  porDia: number
}

export const candidatosAPodar = candidatosAPodarJs as (pedido: {
  filas: FilaRegla[]
  umbrales: Umbrales
  hasta: string
  motivo?: MotivoPoda
  nivel?: NivelRegla
  ventana?: number
}) => { ok: boolean; error?: string; faltan?: ClaveUmbral[]; detalle?: string; candidatos: Candidato[] }

/** Qué umbrales faltan definir para que una poda pueda armarse. Vacío = se puede. */
export const faltanParaPodar = faltanParaPodarJs as (umbrales: Partial<Umbrales>, motivo?: MotivoPoda) => ClaveUmbral[]
