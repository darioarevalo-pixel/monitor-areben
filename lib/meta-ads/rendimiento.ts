/**
 * El re-export TIPADO de `rendimiento.core.js`, para la pantalla.
 *
 * Mismo par que `snapshot`/`reglas`/`planes`: el `.js` plano es el que pueden importar `api/*.js` y
 * `scripts/*.mjs` —corren en Node sin pasar por el compilador de Next—, y esto es lo que le da tipos
 * al que lo usa desde React. ⛔ No hay lógica acá: una segunda implementación es una que discrepa.
 */
import {
  aprendizajeDe as aprendizajeDeJs,
  armarZona as armarZonaJs,
  CAIDA_CTR as CAIDA_CTR_JS,
  celdasDeLaFoto as celdasDeLaFotoJs,
  concentracionDe as concentracionDeJs,
  configDeHoy as configDeHoyJs,
  CON_AIRE as CON_AIRE_JS,
  CONV_APRENDIZAJE as CONV_APRENDIZAJE_JS,
  COLS_RENDIMIENTO as COLS_RENDIMIENTO_JS,
  desdeDe as desdeDeJs,
  desgasteDe as desgasteDeJs,
  DIAS_ZONA as DIAS_ZONA_JS,
  elegirVentana as elegirVentanaJs,
  enVentana as enVentanaJs,
  PASO_ESCALON as PASO_ESCALON_JS,
  SUBA_CPM as SUBA_CPM_JS,
  ultimoDiaCerrado as ultimoDiaCerradoJs,
  USA_LA_CAJA as USA_LA_CAJA_JS,
  VENTANA as VENTANA_JS,
  veredictoDeCelda as veredictoDeCeldaJs,
} from './rendimiento.core.js'

/** Una fila de la foto, tal como la trae `COLS_RENDIMIENTO`. Todo opcional: los tests siembran poco. */
export type FilaZona = {
  fecha?: string
  nivel?: string
  objeto_id?: string
  campaign_id?: string | null
  adset_id?: string | null
  nombre?: string | null
  linea?: string | null
  cuenta_id?: string | null
  estado?: string | null
  estado_efectivo?: string | null
  estado_real?: string | null
  diario_crudo?: number | null
  moneda?: string | null
  capturado_at?: string | null
  spend?: number | null
  impresiones?: number | null
  clicks?: number | null
  ctr?: number | null
  cpm?: number | null
  compras?: number | null
  revenue?: number | null
  carritos?: number | null
  checkouts?: number | null
  lpv?: number | null
}

/** Un día de la serie de una celda. */
export type DiaCelda = {
  fecha: string
  spend: number
  compras: number
  clicks: number
  impresiones: number
  /** `null` en el backfill: Meta no expone el histórico de presupuestos. */
  diarioCrudo: number | null
}

/** De quién es la culpa de que el costo suba. Ver `desgasteDe()`. */
export type Firma = 'pieza' | 'subasta' | 'sano' | 'sin-datos'

export type Desgaste = {
  firma: Firma
  motivo: string
  ctrDelta: number | null
  cpmDelta: number | null
  ctrA: number | null
  ctrB: number | null
  cpmA: number | null
  cpmB: number | null
}

export type Aprendizaje = {
  convSemana: number
  necesita: number
  faltan: number
  cruza: boolean
  /** El presupuesto/día que cruzaría el umbral. `null` sin CPA medido — ⛔ nunca 0. */
  pide: number | null
  cpa: number | null
  /** El último día en que el diario cambió: ahí arrancó de cero el contador de aprendizaje. */
  reiniciadoEl: string | null
}

export type ClaseVeredicto = 'apagada' | 'rota' | 'quieta' | 'sin-techo' | 'midiendo' | 'alto' | 'escalar' | 'ok'

export type Veredicto = {
  clase: ClaseVeredicto
  titulo: string
  /** Qué acción propone. `null` = ninguna. */
  accion: 'pausar' | 'escalar' | 'mirar' | null
  /** 🔑 Los NÚMEROS que lo sostienen, no una frase. Es lo que separa una decisión de una corazonada. */
  porque: string[]
  pctTecho: number | null
  pctDiario: number | null
}

export type Celda = {
  id: string
  nombre: string
  linea: string
  campaignId: string | null
  cuentaId: string | null
  moneda: string | null
  estado: string | null
  estadoReal: string | null
  /** El diario en la moneda de la cuenta, ya dividido por 100. `null` = sin dato. */
  diario: number | null
  spend: number
  impresiones: number
  clicks: number
  compras: number
  revenue: number
  ctr: number
  cpc: number
  cpm: number
  roas: number
  carritos: number | null
  checkouts: number | null
  lpv: number | null
  costo: number
  costoCarrito: number | null
  diasConGasto: number
  desde: string
  hasta: string
  serie: DiaCelda[]
  desgaste: Desgaste
  aprendizaje: Aprendizaje
  veredicto: Veredicto
}

export type DiaCaja = {
  fecha: string
  pedidos: number
  gasto: number
  costoPedidoReal: number
  comprasMeta: number
  costoCompraMeta: number
  /** `null` sin pedidos reales ese día: no es «0%», es «no se puede saber». */
  atrib: number | null
}

export type Ventana = {
  desde: string
  hasta: string
  dias: number
  gasto: number
  pedidos: number
  gastoDia: number
  pedidosDia: number
  costoPedido: number
}

/** 🔴 `marginal` es `null` CON MOTIVO cuando no se puede calcular, y eso es la mitad de la función. */
export type Marginal = { a: Ventana | null; b: Ventana | null; marginal: number | null; motivo: string }

export type Pieza = { pieza: string; gasto: number; compras: number; cajas: number; pct: number }
export type Concentracion = { total: number; piezas: Pieza[]; mayor: Pieza | null }

export type Zona = {
  desde: string
  hasta: string
  totales: {
    spend: number
    compras: number
    revenue: number
    clicks: number
    impresiones: number
    carritos: number | null
    checkouts: number | null
    lpv: number | null
    costoMeta: number
    pedidos: number
    pedidosDia: number
    costoPedidoReal: number
    pctTecho: number | null
  }
  techo: number
  techoCaja: number | null
  objetivoPedidos: number
  celdas: Celda[]
  caja: DiaCaja[]
  marginal: Marginal
  concentracion: Concentracion
}

/** Lo que contesta `?recurso=rendimiento`. `zona: null` con `motivo` cuando no hay día cerrado. */
export type RespuestaZona = {
  ok: true
  linea: string
  dias: number
  zona: Zona | null
  motivo?: string
  techo: number | null
  techoCaja: number | null
  ficha: { cargadaEl: string | null; ticket: number } | null
  meta: { label: string; objetivo: number; fecha: string | null } | null
  problemas: string[]
}

export const COLS_RENDIMIENTO = COLS_RENDIMIENTO_JS as string
export const CONV_APRENDIZAJE = CONV_APRENDIZAJE_JS as number
export const VENTANA = VENTANA_JS as number
export const PASO_ESCALON = PASO_ESCALON_JS as number
export const CAIDA_CTR = CAIDA_CTR_JS as number
export const SUBA_CPM = SUBA_CPM_JS as number
export const USA_LA_CAJA = USA_LA_CAJA_JS as number
export const CON_AIRE = CON_AIRE_JS as number
export const DIAS_ZONA = DIAS_ZONA_JS as readonly number[]

export const elegirVentana = elegirVentanaJs as (crudo: unknown) => { dias: number; error?: undefined } | { error: string; dias?: undefined }
export const ultimoDiaCerrado = ultimoDiaCerradoJs as (filas: FilaZona[]) => string | null
export const enVentana = enVentanaJs as (filas: FilaZona[], desde: string | null, hasta: string | null) => FilaZona[]
export const desdeDe = desdeDeJs as (hasta: string, dias: number) => string
export const celdasDeLaFoto = celdasDeLaFotoJs as (filas: FilaZona[]) => Omit<Celda, 'desgaste' | 'aprendizaje' | 'veredicto'>[]
export const desgasteDe = desgasteDeJs as (serie: Partial<DiaCelda>[], ventana?: number) => Desgaste
export const aprendizajeDe = aprendizajeDeJs as (celda: { serie: Partial<DiaCelda>[] }, ventana?: number) => Aprendizaje
export const veredictoDeCelda = veredictoDeCeldaJs as (
  celda: Omit<Celda, 'desgaste' | 'aprendizaje' | 'veredicto'>,
  ctx?: { techo?: number; desgaste?: Partial<Desgaste> | null; aprendizaje?: Partial<Aprendizaje> | null },
) => Veredicto
export const concentracionDe = concentracionDeJs as (filas: FilaZona[]) => Concentracion
/** 🔑 Las métricas son de la ventana; la configuración es de HOY. ⛔ Recibe TODAS las filas. */
export const configDeHoy = configDeHoyJs as (filas: FilaZona[]) => Map<string, {
  fecha: string; nombre: string; estado: string | null; estadoReal: string | null; diario: number | null
}>
export const armarZona = armarZonaJs as (opts: {
  filas?: FilaZona[]
  techo?: number
  techoCaja?: number | null
  pedidosPorDia?: Record<string, number>
  hasta?: string
  objetivoPedidos?: number
  ventana?: number
}) => Zona
