/**
 * Tipos del Friday memo y la cara TypeScript de los dos `.core.js`.
 *
 * Los cores son `.js` plano porque los importa `api/_memo.js`, que corre en Node sin pasar por el
 * compilador de Next. Acá se les pone tipo una sola vez, para que la pantalla no los use `any`.
 */

import {
  BLOQUES as BLOQUES_JS,
  SISTEMAS as SISTEMAS_JS,
  TEMAS as TEMAS_JS,
  cerrada as cerradaJs,
  claveValida as claveValidaJs,
  etiquetaSemana as etiquetaSemanaJs,
  hoyAr as hoyArJs,
  semanaAnterior as semanaAnteriorJs,
  semanaDe as semanaDeJs,
  semanaSiguiente as semanaSiguienteJs,
  sumarDias as sumarDiasJs,
} from './semana.core.js'
import {
  CANALES_MINORISTA as CANALES_MINORISTA_JS,
  LABEL_LINEA as LABEL_LINEA_JS,
  LINEAS_MEMO as LINEAS_MEMO_JS,
  costoPorCompra as costoPorCompraJs,
  delta as deltaJs,
  fusionarPorCanal as fusionarPorCanalJs,
  resumirCanales as resumirCanalesJs,
  semaforoPauta as semaforoPautaJs,
  ticketPromedio as ticketPromedioJs,
} from './foto.core.js'

import { MARCAS as MARCAS_JS } from '../lineas.core.js'

import type { RenglonClavado, ResumenClavados } from '../clavados/tipos'
import type { Marca } from '../nav.datos'

/** Las tres líneas del negocio. Stunned no es una marca: es una línea de Zattia. */
export type Linea = 'bdi' | 'zattia' | 'stunned'

export type { Marca }

export type Semana = { id: string; ini: string; fin: string }

export type Bloque = 'acta' | 'avance'

export type VentaLinea = { facturado: number; unidades: number; tickets: number }

/**
 * La venta por canal de UNA marca: la semana, la anterior, y los nombres crudos de Gestión Nube que
 * cayeron en cada canal.
 *
 * ⚠️ **`nombres` es sólo de la semana actual** — los de la previa no se muestran en ningún lado, y
 * guardar un dato que nadie lee lo vuelve verdad para siempre en el jsonb del cierre.
 */
export type CanalDeMarca = {
  actual: Record<string, VentaLinea>
  previa: Record<string, VentaLinea>
  nombres: Record<string, string[]>
}
export type PautaLinea = { gasto: number; compras: number; revenue: number }

/** Venta y pauta: los dos bloques que se pueden congelar sin mentir. */
export type Foto = {
  semana: { ini: string; fin: string }
  previa: { ini: string; fin: string }
  venta: { actual: Record<string, VentaLinea>; previa: Record<string, VentaLinea> }
  /**
   * Venta por canal. **Opcional a propósito**: las semanas cerradas antes del 24-ago-2026 se
   * congelaron sin este corte y no hay verbo de reabrir. `undefined` significa «no se midió esa
   * semana» y la pantalla lo dice así — un cero acá sería un número plausible y falso para siempre.
   */
  canal?: {
    /**
     * 🔴 **Abierto POR MARCA desde el 24-ago-2026, y `marcas` es lo que distingue las dos formas.**
     * Antes las dos bases se sumaban en el handler y la pantalla dibujaba un solo «Local»: en la
     * semana del 17 al 23 eso son $6.168.837, de los que **$4.577.127 son de Zattia** y $1.591.710
     * de BDI. Leído bajo el rótulo de la tabla de arriba —que sí va por línea— es 3,9× de más.
     *
     * `undefined` (la clave entera) es «no se midió esa semana». `canal` **sin** `marcas` es una
     * semana congelada con la forma vieja: los números están, pero no se puede saber de qué marca
     * es cada uno, y la pantalla los rotula «las dos marcas juntas» en vez de inventar el reparto.
     */
    marcas?: Record<string, CanalDeMarca>
    /** La forma vieja, fusionada. Sólo la traen las semanas congeladas antes del 24-ago-2026. */
    actual?: Record<string, VentaLinea>
    previa?: Record<string, VentaLinea>
    nombres?: Record<string, string[]>
  }
  /**
   * El recupero de los clavados. **Opcional a propósito**, igual que `canal`: las semanas cerradas
   * antes de que existiera el bloque no lo tienen y no hay verbo de reabrir. `undefined` significa
   * «no se midió esa semana».
   */
  clavados?: { renglones: RenglonClavado[]; resumen: ResumenClavados }
  pauta: { actual: Record<string, PautaLinea>; previa: Record<string, PautaLinea> }
  techos: Record<string, number>
  /** Fuentes que no se pudieron leer. Se muestran: media foto sin aviso se lee como foto entera. */
  problemas: string[]
}

/**
 * Las señales "al momento" (capital parado, pendientes), tal como las computa el panel Gerencial.
 * Se guardan con la fecha en que se tomaron, que es lo que las hace legibles seis meses después.
 */
export type Senales = {
  /** Un renglón por accionable, ya resumido por la pantalla. */
  items: { area: string; severidad: string; marca: string; titulo: string; valor?: number }[]
  /** Cuántos hay de cada severidad, para el encabezado. */
  conteo: { critico: number; atencion: number; oportunidad: number }
}

export type MemoSemana = {
  id: string
  ini: string
  fin: string
  estado: 'abierto' | 'cerrado'
  foto: Foto | null
  foto_tomada_at?: string | null
  senales: Senales | null
  senales_tomadas_at?: string | null
  cerrado_at?: string | null
  cerrado_por?: string | null
}

export type Campo = {
  bloque: Bloque
  clave: string
  autor: string
  texto: string
  updated_at?: string
}

export type Tema = { clave: string; label: string }
export type Sistema = { clave: string; label: string; repos: string[] }

export const TEMAS = TEMAS_JS as Tema[]
export const SISTEMAS = SISTEMAS_JS as Sistema[]
export const BLOQUES = BLOQUES_JS as Bloque[]
export const LINEAS_MEMO = LINEAS_MEMO_JS as Linea[]
export const LABEL_LINEA = LABEL_LINEA_JS as Record<Linea, string>

export const hoyAr = hoyArJs as (now?: Date) => string
export const sumarDias = sumarDiasJs as (iso: string, n: number) => string
export const semanaDe = semanaDeJs as (iso: string) => Semana
export const semanaAnterior = semanaAnteriorJs as (s: Semana) => Semana
export const semanaSiguiente = semanaSiguienteJs as (s: Semana) => Semana
export const cerrada = cerradaJs as (s: Semana, hoy: string) => boolean
export const etiquetaSemana = etiquetaSemanaJs as (s: Semana) => string
export const claveValida = claveValidaJs as (bloque: string, clave: string) => boolean

/** El corte por canal: `mayorista + minorista = total`, y `tecnica` viaja aparte y con nombre. */
export type ResumenCanales = {
  mayorista: VentaLinea
  minorista: VentaLinea
  desglose: { canal: string; venta: VentaLinea }[]
  tecnica: VentaLinea
  total: VentaLinea
}

export const CANALES_MINORISTA = CANALES_MINORISTA_JS as string[]

/**
 * Las dos marcas, en el orden en que se dibujan. Sale de `lib/lineas.core.js` **derivada de las
 * líneas**: escribir `['bdi','zattia']` acá sería la quinta copia de esa lista en el repo.
 */
export const MARCAS_MEMO = MARCAS_JS as Marca[]

/**
 * Junta la venta por canal de varias marcas. La pantalla la usa para el total de la empresa, que
 * **no se guarda en la foto**: dos copias del mismo número son dos respuestas el día que una cambie.
 */
export const fusionarPorCanal = fusionarPorCanalJs as (
  ...partes: (CanalPorMarca | undefined)[]
) => { canales: Record<string, VentaLinea>; nombres: Record<string, string[]> }

/** Lo que `fusionarPorCanal` sabe leer: el corte de una marca en un momento. */
type CanalPorMarca = { canales?: Record<string, VentaLinea>; nombres?: Record<string, string[]> }
export const resumirCanales = resumirCanalesJs as (
  porCanal: Record<string, VentaLinea> | undefined,
) => ResumenCanales

export const ticketPromedio = ticketPromedioJs as (v: VentaLinea | undefined) => number | null
export const costoPorCompra = costoPorCompraJs as (p: PautaLinea | undefined) => number | null
export const delta = deltaJs as (a: number, p: number) => { abs: number; pct: number | null }
export const semaforoPauta = semaforoPautaJs as (
  p: PautaLinea | undefined,
  techo: number | undefined,
) => 'verde' | 'amarillo' | 'rojo' | 'sin-dato'
