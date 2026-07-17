/**
 * Tipos de "Fundas por modelo" (key `fundas-modelo`, solo BDI).
 *
 * Port del bloque partido del legacy (index.html 3069-3454 + 4481-5495). Por
 * ahora cubre el ranking (Paso 1); demanda y simulación se agregan en sus pasos.
 *
 * Fundas es el PRIMER consumidor de `lib/etl` + el store en prod. No toca KV ni
 * server: lee del store en memoria y persiste en localStorage (pasos 3+).
 */

/** Una fila del ranking por modelo. Espejo de `window._fmRankData` (index.html:5459). */
export type FilaRanking = {
  pos: number
  model: string
  qty: number
  /** % del total, redondeado a 1 decimal (como el legacy, 5460). */
  pct: number
}

/** Estado del cartel de corte por agotamiento (index.html:5405-5433). */
export type Corte = {
  /** ¿Se recortó el rango de meses? */
  activo: boolean
  /** El texto que muestra `#fm-corte-info`; '' si el corte está apagado. */
  mensaje: string
  /** ¿Mostrar el cartel? (el legacy lo oculta cuando el corte está apagado.) */
  visible: boolean
  /** Último mes incluido tras el corte (undefined si no cortó). */
  cutoffMonth?: string
}

/** Lo que el port necesita del `DatosETL` del store para computar el ranking. */
export type DatosRanking = {
  allMonths: string[]
  allFundasStats: Record<string, Record<string, number>>
  /** Clave `${modelo}|||${product_name}` → Set de product_id. NO serializable. */
  fmKeyPids: Record<string, Set<string>>
  /** Clave `${pid}|||${modelo}` → stock. */
  invByProdModelo: Record<string, number>
}

/** El estado interactivo de la card de ranking (checkboxes, rango, corte). */
export type FiltroRanking = {
  rangeStart: string
  rangeEnd: string
  checkedModels: Set<string>
  /** Total de modelos disponibles: si están todos, el filtro no está activo (5368). */
  totalModels: number
  checkedProds: Set<string>
  totalProds: number
  corteEnabled: boolean
  corteN: number
  corteDiseno: string | undefined
}

/** Salida del cómputo puro del ranking. El chart y la tabla se pintan aparte. */
export type ResultadoRanking = {
  /** Filas ordenadas por qty desc, con pos y pct. */
  filas: FilaRanking[]
  total: number
  corte: Corte
  /** Primer y último mes efectivos tras el corte (para el título del gráfico). */
  effStart: string
  effEnd: string
  /** Cantidad de modelos con datos en el rango (para el pie "N modelos"). */
  cantModelos: number
}

// ── Demanda por modelo (corregida) ────────────────────────────────────────────

import type { FilaVenta, FilaDetalle } from '@/lib/etl/tipos'

/** Fila cruda por modelo del cálculo de demanda. Espejo de `rows` de
 *  fmDemandaPorModelo (index.html:3320-3332). */
export type FilaDemanda = {
  model: string
  /** Unidades minoristas y mayoristas dentro de la ventana. */
  umin: number
  umay: number
  /** Proporción por volumen crudo, en % (dentro de su canal). */
  volMin: number
  volMay: number
  /** Proporción ajustada por agotamiento (volumen + empujón capado), en %. */
  ajMin: number
  ajMay: number
}

/** Salida de fmDemandaPorModelo (3336). */
export type ResultadoDemanda = {
  rows: FilaDemanda[]
  totMin: number
  totMay: number
  /** Peso natural del minorista en la combinada (totMin/total). */
  wMinDefault: number
  cutoff: string
}

/** Lo que el port necesita del store para computar la demanda. */
export type DatosDemanda = {
  allVentas: FilaVenta[]
  allDetalles: FilaDetalle[]
  /** Stock del Depósito Minorista, clave `${pid}|||${modelo}` (agotamiento real). */
  invDepoMin: Record<string, number>
  prodMeta: Record<string, { created: string | null; cat: string }>
  /** Clave `${modelo}|||${product_name}` → Set de pids. NO serializable. */
  fmKeyPids: Record<string, Set<string>>
  /** Era `Date.now()` (3233). Congelado por parámetro para paridad determinista. */
  today: Date
}

/** Ventana de corte por diseño (index.html:3226). */
export type CorteDemanda = { on: boolean; dias: number; modelos: number }

/** Fila combinada de la tabla, tras aplicar método (aj/vol) y peso de canal. */
export type FilaDemandaComb = { model: string; pMin: number; pMay: number; pComb: number }
