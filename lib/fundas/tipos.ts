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
