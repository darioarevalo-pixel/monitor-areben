/**
 * El PARTE DE PAUTA, tipado. El núcleo vive en `parte.core.js`, que es `.js` plano porque quien lo
 * arma es `api/_meta-parte.js` y los handlers corren en Node sin pasar por el compilador de Next.
 * Este archivo es el re-export tipado que usan la pantalla y los tests — mismo par que
 * `formato.ts` / `formato.core.js`.
 *
 * ⛔ **No se escribe lógica acá.** Lo que decida algo va al `.core.js`, o queda fuera del alcance
 * del servidor y del script que un día lo corra desde Actions.
 */
import * as core from '@/lib/meta-ads/parte.core.js'

/** Una fila de aviso ya normalizada: lo que Meta devolvió, con los nombres del parte. */
export type FilaAviso = {
  aviso: string
  conjunto: string
  campania?: string
  campaniaId?: string
  linea?: string
  tipo?: string
  estado?: string
  gasto: number
  compras: number
  revenue: number
  impresiones?: number
  clics?: number
  ctr?: number
  cpm?: number
  /** Los tres pasos de ANTES de la compra. Sin ellos el parte imprime ceros plausibles. */
  lpv?: number
  carritos?: number
  checkouts?: number
}

/** Un día de la serie: la pauta, sin la caja. */
export type DiaDePauta = { fecha: string; gasto: number; compras: number; revenue?: number }

/**
 * Un día con las DOS versiones del mismo hecho.
 *
 * 🔑 `atrib` es `number | null` y esa distinción es el tipo entero: `null` es «no se puede saber»
 * (no hubo pedidos ese día) y `0` sería «Meta no vio ninguna», que es una afirmación distinta.
 */
export type DiaCruzado = {
  fecha: string
  pedidos: number
  gasto: number
  costoPedidoReal: number
  comprasMeta: number
  costoCompraMeta: number
  atrib: number | null
}

/** Una de las dos ventanas que se restan para sacar el marginal. */
export type VentanaDelMarginal = {
  desde: string
  hasta: string
  dias: number
  gasto: number
  pedidos: number
  gastoDia: number
  pedidosDia: number
  costoPedido: number
}

/** El marginal, o el motivo por el que no se puede calcular. Nunca las dos cosas. */
export type Marginal = {
  a: VentanaDelMarginal | null
  b: VentanaDelMarginal | null
  marginal: number | null
  motivo: string
}

/** Un balde de una hora, ya normalizado. `hora` es 0-23 en la zona de la CUENTA, la que resolvió Meta. */
export type HoraDePauta = {
  hora: number
  linea?: string
  gasto: number
  compras: number
  revenue?: number
  impresiones?: number
}

/**
 * La banda de HOY, lista para dibujar.
 *
 * 🔑 Los tres `| null` son el tipo entero, y ninguno es un default disfrazado:
 * `costo` null = no hubo compras (⛔ no «salieron gratis»); `pctTecho` null = no hay ficha de
 * rentabilidad cargada; `aEstaHora` null = Meta no dio el desglose horario, y entonces
 * `motivoSinHora` dice cuál de los dos motivos fue.
 */
export type BandaHoy = {
  linea: string
  hoy: {
    gasto: number
    compras: number
    costo: number | null
    revenue: number
    roas: number | null
    carritos: number
    checkouts: number
    clics: number
  }
  techo: number
  pctTecho: number | null
  veredicto: string
  /** Suma de los topes diarios de los conjuntos que entregan. Con `sinTope > 0` es un PISO. */
  tope: number
  /** Cuántos conjuntos que entregan no tienen tope propio (CBO). Con uno solo, el % no se dibuja. */
  sinTope: number
  conjuntos: number
  hora: number | null
  aEstaHora: { gasto: number; compras: number; costo: number | null } | null
  motivoSinHora: string | null
  ayerEntero: { gasto: number; compras: number; costo: number | null }
}

export type ArmarParte = {
  hoy?: FilaAviso[]
  ayer?: FilaAviso[]
  serie?: DiaDePauta[]
  /** Techo de costo POR COMPRA de cada línea. Una línea sin fila guardada no entra: el parte
   *  contesta `?` en vez de juzgar contra un default. */
  techos?: Record<string, number>
  /** Techo DIARIO de cada conjunto, indexado por NOMBRE. Distingue «no le alcanza» de «no la usa». */
  techosDiarios?: Record<string, number>
  caja?: DiaCruzado[]
  lineaCaja?: string
  objetivoPedidos?: number
  meta?: { cuenta?: string; leido?: string; hoy?: string; ayer?: string; zona?: string }
}

export const limpiar = core.limpiar as (s: unknown) => string
export const veredicto = core.veredicto as (gasto: number, compras: number, techo: number | undefined) => string
export const sumar = core.sumar as (filas: FilaAviso[]) => Record<string, number>
export const porConjunto = core.porConjunto as (filas: FilaAviso[]) => (FilaAviso & { filas: FilaAviso[] })[]
/** `hasta` es el último día CERRADO. En la práctica no es opcional: sin él entra el día en curso
 *  con medio día de gasto contra medio día de pedidos, justo en la ventana que decide el marginal. */
export const cruzarConLaCaja = core.cruzarConLaCaja as (
  serie: DiaDePauta[],
  pedidosPorDia: Record<string, number>,
  hasta?: string,
) => DiaCruzado[]
/**
 * Sólo mira `fecha`, `gasto` y `pedidos`, y el tipo lo dice: pedir un `DiaCruzado` entero obligaría
 * a fabricar cuatro campos que la función no lee para poder llamarla.
 */
export const marginalEntreVentanas = core.marginalEntreVentanas as (
  cruce: Pick<DiaCruzado, 'fecha' | 'gasto' | 'pedidos'>[],
  dias?: number,
) => Marginal
export const renderParte = core.renderParte as (args: ArmarParte) => string
/** La hora en curso **según el dato**: el balde más alto de HOY que tuvo entrega. `null` si ninguno. */
export const horaEnCurso = core.horaEnCurso as (filasHoy: HoraDePauta[]) => number | null
export const sumarHasta = core.sumarHasta as (
  filas: HoraDePauta[],
  corte: number | null,
) => { gasto: number; compras: number; revenue: number; impresiones: number }
export const topeQueEntrega = core.topeQueEntrega as (
  filasHoy: FilaAviso[],
  techosDiarios?: Record<string, number>,
  estados?: Record<string, string>,
  linea?: string,
) => { tope: number; sinTope: number; conjuntos: number }
export const bandaDeHoy = core.bandaDeHoy as (args: {
  hoy?: FilaAviso[]
  ayer?: FilaAviso[]
  horasHoy?: HoraDePauta[]
  horasAyer?: HoraDePauta[]
  techos?: Record<string, number>
  techosDiarios?: Record<string, number>
  estados?: Record<string, string>
  linea?: string
}) => BandaHoy
