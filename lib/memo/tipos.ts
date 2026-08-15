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
  LABEL_LINEA as LABEL_LINEA_JS,
  LINEAS_MEMO as LINEAS_MEMO_JS,
  costoPorCompra as costoPorCompraJs,
  delta as deltaJs,
  semaforoPauta as semaforoPautaJs,
  ticketPromedio as ticketPromedioJs,
} from './foto.core.js'

/** Las tres líneas del negocio. Stunned no es una marca: es una línea de Zattia. */
export type Linea = 'bdi' | 'zattia' | 'stunned'

export type Semana = { id: string; ini: string; fin: string }

export type Bloque = 'acta' | 'avance'

export type VentaLinea = { facturado: number; unidades: number; tickets: number }
export type PautaLinea = { gasto: number; compras: number; revenue: number }

/** Venta y pauta: los dos bloques que se pueden congelar sin mentir. */
export type Foto = {
  semana: { ini: string; fin: string }
  previa: { ini: string; fin: string }
  venta: { actual: Record<string, VentaLinea>; previa: Record<string, VentaLinea> }
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

export const ticketPromedio = ticketPromedioJs as (v: VentaLinea | undefined) => number | null
export const costoPorCompra = costoPorCompraJs as (p: PautaLinea | undefined) => number | null
export const delta = deltaJs as (a: number, p: number) => { abs: number; pct: number | null }
export const semaforoPauta = semaforoPautaJs as (
  linea: string,
  p: PautaLinea | undefined,
  techo: number | undefined,
) => 'verde' | 'amarillo' | 'rojo' | 'sin-dato'
