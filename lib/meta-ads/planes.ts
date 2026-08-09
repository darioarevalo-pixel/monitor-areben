/**
 * El motor de planes por pasos, del lado tipado.
 *
 * ⚠️ La lógica —qué pasos existen, cuáles son reintentables, qué hacer con uno que quedó en curso—
 * **no vive acá**: vive en `lib/meta-ads/planes.core.js`, en JS plano, porque `api/_meta-planes.js`
 * la necesita y no puede importar TypeScript. Este archivo aporta los tipos.
 */

import type { LineaPauta } from './tipos'
import {
  armarPlanCrear as armarPlanCrearJs,
  armarPlanDuplicar as armarPlanDuplicarJs,
  armarPlanMoverPlata as armarPlanMoverPlataJs,
  CLAVES_PLAN as CLAVES_PLAN_JS,
  entraOtroPaso as entraOtroPasoJs,
  ESPERA_SONDA_MS as ESPERA_SONDA_MS_JS,
  estadoDePlan as estadoDePlanJs,
  marcadorDe as marcadorDeJs,
  marcaDePaso as marcaDePasoJs,
  MAX_INTENTOS as MAX_INTENTOS_JS,
  nombreConMarca as nombreConMarcaJs,
  politicaReintento as politicaReintentoJs,
  PRESUPUESTO_MS as PRESUPUESTO_MS_JS,
  repartir as repartirJs,
  siguientePaso as siguientePasoJs,
  sustituir as sustituirJs,
  TIMEOUT_PASO_MS as TIMEOUT_PASO_MS_JS,
  TIPOS_PASO as TIPOS_PASO_JS,
  TIPOS_PLAN as TIPOS_PLAN_JS,
  TOPE_COPIAS as TOPE_COPIAS_JS,
} from './planes.core.js'

export type TipoPlan = 'duplicar' | 'crear' | 'mover-plata'

export type TipoPaso =
  | 'copiar-campania'
  | 'crear-campania'
  /** ⚠️ Ya no se genera; sigue acá porque los planes viejos de la base lo referencian. */
  | 'copiar-conjunto'
  | 'crear-conjunto'
  | 'crear-aviso'
  | 'presupuesto'
  | 'nombre'
  | 'heredar-linea'

/** `listo` no es una decisión: es un paso que ya no tiene nada que hacer. */
export type Politica = 'ejecutar' | 'sondear' | 'esperar' | 'rendirse' | 'listo'

export type EstadoPaso = 'pendiente' | 'en-curso' | 'hecho' | 'dudoso' | 'fallado' | 'salteado'
export type EstadoPlan = 'pendiente' | 'en-curso' | 'hecho' | 'atascado' | 'cancelado'

export type PasoPlan = {
  orden: number
  tipo: TipoPaso
  /** En castellano: **es lo que se ve** en la pantalla, no una etiqueta técnica traducida después. */
  rotulo: string
  estado: EstadoPaso
  intentos: number
  pedido: Record<string, string> | null
  /** El id que produjo este paso; lo consume el siguiente por `{{orden}}`. */
  resultadoId: string | null
  /** La marca única con la que la sonda encuentra lo que este paso creó. `null` si no crea nada. */
  marca: string | null
  detalle: string | null
  ultimoEn: string | null
  /**
   * ¿Este paso fallado se puede volver a mandar a mano?
   *
   * 🔑 **No es lo mismo que `reintentable` de `TIPOS_PASO`**: aquélla dice si el MOTOR lo puede
   * repetir solo; ésta, si una PERSONA lo puede mandar de nuevo después de arreglar afuera lo que
   * Meta pidió. Va en `true` sólo cuando Meta contestó que no —determinístico, no creó nada— y en
   * `false` cuando el paso murió por ambigüedad, que es el único caso donde insistir empeora.
   */
  puedeReintentar: boolean
}

export type Plan = {
  id: number
  idem: string
  marcador: string
  creado: string
  quien: string
  tipo: TipoPlan
  variante: string | null
  cuentaId: string
  linea: LineaPauta
  entrada: Record<string, unknown>
  contexto: Record<string, string>
  simulacro: boolean
  estado: EstadoPlan
  detalle: string | null
  pasos: PasoPlan[]
}

/** Lo que contesta `?recurso=plan` al avanzar. `seguir` es «volvé a llamarme», no «terminó mal». */
export type AvanceDePlan = {
  plan: Plan
  /** `true` mientras queden pasos: el cliente vuelve a llamar hasta que sea `false`. */
  seguir: boolean
  /** Cuántos pasos se ejecutaron en ESTA llamada. */
  hechos: number
  /**
   * 🔑 Quedan pasos **pero no hay que volver enseguida**: el avance se frenó por algo que arregla el
   * tiempo (Meta armando la copia, una llamada cortada). Sin esta bandera, `seguir:true` es
   * indistinguible de «seguí ya» y el cliente martilla hasta el rate limit.
   */
  pausa?: boolean
  /** Por qué se frenó, en castellano. Es lo que se muestra al lado del botón Seguir. */
  motivo?: string
}

export type DefPaso = { rotulo: string; reintentable: boolean; crea: boolean; sondaEn?: string }
export type DefPlan = { sub: string; rotulo: string; rotuloPermiso: string }

export const TIPOS_PASO = TIPOS_PASO_JS as Record<TipoPaso, DefPaso>
export const TIPOS_PLAN = TIPOS_PLAN_JS as Record<TipoPlan, DefPlan>
export const CLAVES_PLAN = CLAVES_PLAN_JS as TipoPlan[]
export const TOPE_COPIAS = TOPE_COPIAS_JS as number
export const MAX_INTENTOS = MAX_INTENTOS_JS as number
export const ESPERA_SONDA_MS = ESPERA_SONDA_MS_JS as number
export const TIMEOUT_PASO_MS = TIMEOUT_PASO_MS_JS as number
export const PRESUPUESTO_MS = PRESUPUESTO_MS_JS as number

export const entraOtroPaso = entraOtroPasoJs as (gastadoMs: number) => boolean
export const marcadorDe = marcadorDeJs as (idem: string) => string
export const marcaDePaso = marcaDePasoJs as (marcador: string, orden: number) => string
export const nombreConMarca = nombreConMarcaJs as (base: string, marca: string) => string
export const politicaReintento = politicaReintentoJs as (
  paso: Partial<PasoPlan> | null,
  ahora: Date | number,
) => Politica
export const siguientePaso = siguientePasoJs as (pasos: PasoPlan[]) => PasoPlan | null
export const estadoDePlan = estadoDePlanJs as (pasos: Array<{ estado: EstadoPaso }>, cancelado?: boolean) => EstadoPlan
export const sustituir = sustituirJs as (
  pedido: Record<string, unknown> | null,
  contexto: Record<string, string>,
) => { ok: true; pedido: Record<string, string> } | { ok: false; faltan: string[] }

type Armado =
  | { ok: true; pasos: Array<Omit<PasoPlan, 'estado' | 'intentos' | 'resultadoId' | 'detalle' | 'ultimoEn'>>; variante: string; reparto?: { deNuevo: number; aNuevo: number } }
  | { ok: false; status: number; error: string }

export const armarPlanDuplicar = armarPlanDuplicarJs as (entrada: unknown, marcador: string) => Armado
/** Una campaña NUEVA a partir de una receta: nada se edita, todo se copia de algo que ya entrega. */
export const armarPlanCrear = armarPlanCrearJs as (entrada: unknown, marcador: string) => Armado
/** Sin marcador: mover plata no crea ningún objeto, así que no hay nombre en el que anotarla. */
export const armarPlanMoverPlata = armarPlanMoverPlataJs as (entrada: unknown) => Armado
export const repartir = repartirJs as (
  deActual: number,
  aActual: number,
  monto: number,
  minDiarioCrudo: number | null,
) => { ok: true; deNuevo: number; aNuevo: number } | { ok: false; status: number; error: string }

/**
 * Lo que la receta tuvo que corregir para que Meta acepte la copia — un emplazamiento que falta, un
 * campo que Meta eliminó, un diario que subió al mínimo.
 *
 * 🔑 **Se lee ANTES de «Empezar», no después.** Una corrección silenciosa sobre la configuración de
 * algo que gasta plata es exactamente lo que nadie puede auditar más tarde. Sale de `entrada`, que
 * es `jsonb` y llega sin tipo, así que se filtra en vez de castearse.
 */
export function avisosDe(plan: Plan | null | undefined): string[] {
  const a = plan?.entrada?.avisos
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && x.length > 0) : []
}

/**
 * La clave de idempotencia de un plan. Se genera **al apretar el botón**, igual que la de una acción
 * suelta y por el mismo motivo: generarla al mandar haría dos claves con un doble clic.
 *
 * El prefijo `p` la distingue de la de una acción (`a…`) a simple vista en la base.
 */
export function nuevoIdemPlan(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
