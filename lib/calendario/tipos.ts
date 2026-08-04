/**
 * Los tipos del calendario editorial.
 *
 * ⚠️ El catálogo de fechas no vive acá: vive en `lib/calendario/fechas.core.js`, en JS plano,
 * porque `api/_calendario.js` lo necesita para validar y no puede importar TypeScript.
 */

import type { Etapa } from '@/lib/meta-ads/tipos'

/** Cuánto se le puede creer a la fecha del catálogo. NO confundir con `TipoFecha`. */
export type ClaseFecha = 'fija' | 'regla' | 'anunciada'

/**
 * Qué clase de cosa es la fecha. Es **ortogonal** a `ClaseFecha`, que responde otra pregunta: un
 * feriado puede ser fijo (25-dic), regla (el traslado del 20-nov) o anunciado (un puente turístico).
 *
 * Decide con qué peldaño arranca la pregunta —una comercial sugiere `fuerte`, un feriado o una
 * efeméride sugieren `institucional`— y si el renglón "Etapas armadas" se dibuja por defecto.
 */
export type TipoFecha = 'comercial' | 'feriado' | 'efemeride'

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
  tipo: TipoFecha
  anticipoDias: number
  resolver: (anio: number) => string | null
  /** El año en que la regla deja de alcanzar y la fecha pasa a ser estimada (traslado de fin de semana). */
  estimadaEn?: (anio: number) => boolean
  porQue: string
  comoSeConfirma?: string
}

/**
 * Con cuánta fuerza jugamos una fecha. `null` es "todavía no lo decidimos", y es el default: no hay
 * fila en la base hasta que alguien elige. Ver el docblock de `PRIORIDADES` en `fechas.core.js`.
 */
export type Prioridad = 'fuerte' | 'suave' | 'institucional' | 'pasamos'

/**
 * La decisión editorial sobre una fecha, para una marca y un año.
 *
 * Va por `entradaId` (`comercial:<clave>:<año>`) y no por clave suelta a propósito: el Día del Niño
 * del año que viene es otra decisión. Que BDI se sume y Zattia pase es normal, y por eso la tabla
 * tiene `store` como en todas las demás.
 */
export interface DecisionFecha {
  entradaId: string
  prioridad: Prioridad
  /** `YYYY-MM-DD`: cuándo hay que empezar a producir. `null` = se decidió jugarla y falta ponerlo. */
  arrancar: string | null
  por: string | null
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
  /** Lo que el catálogo **sugiere** de anticipo. No dispara nada solo: ver `PRIORIDADES`. */
  anticipoDias: number
  /** `YYYY-MM-DD` sugerido para arrancar (`fecha - anticipoDias`). Prellena el modal, nada más. */
  arranqueSugerido: string | null
  /** Qué clase de cosa es: comercial, feriado o efeméride. Los hitos propios van en `null`. */
  tipo: TipoFecha | null
  /** El peldaño que se ofrece primero. Sugerencia del primer clic, no un techo. */
  prioridadSugerida: Prioridad | null
  /** Con cuánta fuerza decidimos jugarla. `null` = nadie lo decidió todavía. */
  prioridad: Prioridad | null
  /** `YYYY-MM-DD` que puso una persona para empezar a producir, o `null`. */
  arrancar: string | null
  /**
   * Días hasta ese arranque. Negativo o 0 = ya habría que estar produciendo.
   *
   * 🔴 **`null` mientras nadie lo haya puesto**, y ese null es el punto de todo el cambio: si sale
   * de una resta del catálogo, la pantalla anuncia urgencia sobre fechas que el equipo ni pensaba
   * trabajar. Sin decisión humana no hay número, y sin número no hay nada que gritar.
   */
  arrancarEn: number | null
  /** Por qué esta fecha está en la lista (comerciales) o la nota que dejó quien la cargó (hitos). */
  detalle: string | null
  comoSeConfirma?: string
  /** El tipo del hito propio (lanzamiento, sesión de fotos…). `null` en las comerciales. */
  tipoHito: string | null
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
