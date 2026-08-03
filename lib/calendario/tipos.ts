/**
 * Los tipos del calendario editorial.
 *
 * ⚠️ El catálogo de fechas no vive acá: vive en `lib/calendario/fechas.core.js`, en JS plano,
 * porque `api/_calendario.js` lo necesita para validar y no puede importar TypeScript.
 */

import type { Etapa } from '@/lib/meta-ads/tipos'

/** Qué clase de fecha es, en el catálogo. */
export type ClaseFecha = 'fija' | 'regla' | 'anunciada'

/**
 * Cuánto se le puede creer a la fecha. Es el dato que decide si el calendario sirve o miente, así
 * que viaja hasta el render y se dibuja distinto en cada caso:
 *
 *  - `firme` — pasó o va a pasar ese día. Fijas, reglas, hitos marcados en firme y anunciadas que
 *    alguien ya confirmó.
 *  - `estimada` — el catálogo la calculó lo mejor que pudo, pero la decide una cámara y todavía no
 *    se confirmó. Va con chip ámbar y botón para fijarla.
 *  - `proyectada` — un hito propio que el equipo cargó sin fecha cerrada ("la cápsula sale por
 *    agosto"). Se puede mover sin borrar nada.
 */
export type Certeza = 'firme' | 'estimada' | 'proyectada'

export interface FechaComercial {
  clave: string
  titulo: string
  clase: ClaseFecha
  anticipoDias: number
  resolver: (anio: number) => string | null
  porQue: string
  comoSeConfirma?: string
}

/** Una fecha anunciada que alguien confirmó a mano, para un año concreto. */
export interface FechaFijada {
  clave: string
  anio: number
  /** `YYYY-MM-DD` */
  fecha: string
  por: string | null
}

/** Un hito propio del equipo: lanzamiento, sesión de fotos, llegada de mercadería. */
export interface Hito {
  id: string
  /** `YYYY-MM-DD` */
  fecha: string
  /** `false` = proyectada: la fecha todavía se puede mover. */
  firme: boolean
  titulo: string
  tipo: string
  nota: string | null
  creadoPor: string | null
  creado: number | null
}

/** Cuántas ideas hay anotadas para una fecha, abiertas por etapa. Es el enganche con Meta Ads. */
export type CoberturaEtapas = Record<Etapa, number>

/**
 * Una fila de "Lo que se viene". Comerciales e hitos propios se unifican acá a propósito: para
 * quien mira la pantalla son lo mismo —algo que pasa tal día y para lo que hay que tener piezas— y
 * separarlos en dos listas obligaría a cruzarlas de memoria.
 */
export interface EntradaCalendario {
  /** Único y estable: `comercial:<clave>:<año>` o `hito:<id>`. Es a lo que se le cuelga una idea. */
  id: string
  clase: 'comercial' | 'hito'
  /** `YYYY-MM-DD` */
  fecha: string
  titulo: string
  certeza: Certeza
  /** Días desde `desde` hasta la fecha. 0 es hoy. */
  faltan: number
  anticipoDias: number
  /** Días hasta que hay que empezar a producir. Negativo o 0 = ya se debería estar craneando. */
  arrancarEn: number
  /** Por qué esta fecha está en la lista (comerciales) o la nota que dejó quien la cargó (hitos). */
  detalle: string | null
  comoSeConfirma?: string
  tipo: string | null
  creadoPor: string | null
  /** Ideas anotadas para esta fecha, por etapa. Todo ceros si nadie anotó nada todavía. */
  cobertura: CoberturaEtapas
}

/** Lo mínimo que `proximas()` necesita saber de una idea para contar la cobertura. */
export interface IdeaParaContar {
  evento: string | null
  etapa: string
  estado: string
}
