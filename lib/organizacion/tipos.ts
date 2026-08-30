/**
 * Organización — los tipos, y el re-export tipado de `core.js`.
 *
 * Misma pareja que `lib/permisos.core.js` / `lib/permisos.ts`: las reglas viven una sola vez en el
 * `.js` plano (que los handlers de `api/` sí pueden importar) y acá se les pone tipo para la app.
 */

import type { Funcion } from '@/lib/permisos'

export type ClaseResp = 'responde' | 'entrega' | 'decide' | 'publica' | 'no_es_suyo'

/** Una responsabilidad. `persona: null` es el gris — una fila válida, no un dato faltante. */
export type Responsabilidad = {
  id: string
  sector: Funcion
  /** `name` exacto del padrón, o `null` = sin dueño. */
  persona?: string | null
  clase: ClaseResp
  titulo: string
  /** Markdown del subconjunto de `lib/markdown/core.ts`. */
  detalle?: string | null
  /** El manual que explica CÓMO se hace. Misma flecha que `agenda_items.manualId`. */
  manual_id?: string | null
  orden: number
  activo: boolean
  autor?: string | null
  created_at?: string
  updated_at?: string
}

export type TipoNodo = 'sector' | 'persona' | 'puesto'

/**
 * Un nodo del organigrama. `persona` es null en los que no tienen cuenta en el monitor.
 *
 * ⚠️ **La misma persona puede tener DOS nodos**: Cande está en Marketing y en Diseño, y las dos son
 * ciertas. La clave del árbol es `id`; la identidad de la persona sigue siendo su `name`.
 */
export type Nodo = {
  id: string
  label: string
  tipo: TipoNodo
  padre_id?: string | null
  persona?: string | null
  nota?: string | null
  orden: number
  activo: boolean
  /** Rama de conducción: no se le manda a quien no es admin. Arrastra a los hijos. */
  interno?: boolean
}

/** Un nodo ya colgado de su padre. Lo arma `arbol()`. */
export type NodoConHijos = Nodo & { hijos: NodoConHijos[] }

export type DatosOrganizacion = {
  nodos: Nodo[]
  resp: Responsabilidad[]
  puede: { editar: boolean }
}

export const NUEVA: Responsabilidad = {
  id: '',
  sector: 'marketing',
  persona: null,
  clase: 'responde',
  titulo: '',
  detalle: '',
  manual_id: null,
  orden: 0,
  activo: true,
}

// El núcleo, tipado. ⛔ No reimplementar ninguna de estas del lado de la pantalla.
import {
  CLASES as CLASES_JS,
  CLASE_DEL_GRIS as CLASE_DEL_GRIS_JS,
  KEYS_CLASE as KEYS_CLASE_JS,
  arbol as arbolJs,
  deLaPersona as deLaPersonaJs,
  delSector as delSectorJs,
  filaValida as filaValidaJs,
  grises as grisesJs,
  labelDeClase as labelDeClaseJs,
  sinDueno as sinDuenoJs,
  visiblesPara as visiblesParaJs,
} from './core.js'

export const CLASES = CLASES_JS as { key: ClaseResp; label: string; ayuda: string }[]
export const CLASE_DEL_GRIS = CLASE_DEL_GRIS_JS as ClaseResp
export const KEYS_CLASE = KEYS_CLASE_JS as ClaseResp[]

export const sinDueno = sinDuenoJs as (fila: Responsabilidad) => boolean
export const labelDeClase = labelDeClaseJs as (key: ClaseResp) => string
export const filaValida = filaValidaJs as (fila: Partial<Responsabilidad>, sectores?: string[]) => string | null
export const delSector = delSectorJs as (filas: Responsabilidad[], sector: Funcion) => Responsabilidad[]
export const deLaPersona = deLaPersonaJs as (filas: Responsabilidad[], persona: string) => Responsabilidad[]
export const grises = grisesJs as (filas: Responsabilidad[]) => Responsabilidad[]
export const arbol = arbolJs as (nodos: Nodo[]) => NodoConHijos[]
export const visiblesPara = visiblesParaJs as (nodos: Nodo[], esAdmin: boolean) => Nodo[]
