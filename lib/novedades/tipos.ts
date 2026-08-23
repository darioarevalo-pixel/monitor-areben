/** Novedades: qué cambió en los sistemas, y quién lo leyó. */

import {
  ESTADOS as ESTADOS_JS,
  esEstado as esEstadoJs,
  seMarcanAlEntrar as seMarcanAlEntrarJs,
  sinLeer as sinLeerJs,
} from './estados.core.js'
import { normalizarDestino as normalizarDestinoJs, TODOS as TODOS_JS } from './destino.core.js'
import type { ManualIndice } from '@/lib/manuales/tipos'
import type { Marca } from '@/lib/nav.datos'

export type EstadoNovedad = 'borrador' | 'publicada' | 'archivada'

/**
 * A quién le llega. Ver `destino.core.js`: el filtro corre en el servidor, no en la pantalla.
 *
 * `marca` es ortogonal al tipo y **ausente significa las dos**: acota a quién le llega, no de quién
 * es la novedad, que sigue siendo una sola fila sin marca.
 *
 * ⚠️ `personas` es la única forma que **no la recibe el admin**: lo que se dirige por nombre es de
 * quien lleva el nombre. Hoy la usa sólo la Agenda; el editor de Novedades no la ofrece.
 */
export type Destino =
  | { tipo: 'todos'; marca?: Marca }
  | { tipo: 'seccion'; key: string; marca?: Marca }
  | { tipo: 'roles'; roles: string[]; marca?: Marca }
  /** Por nombre de usuario (`perfil.name`), no por mail: los puestos compartidos no tienen. */
  | { tipo: 'personas'; personas: string[]; marca?: Marca }

export type Novedad = {
  id: string
  estado: EstadoNovedad
  /** Las importantes frenan al entrar hasta que se leen. Se usa poco a propósito. */
  importante: boolean
  titulo: string
  /** Markdown del subconjunto de `lib/markdown/core.ts`. */
  cuerpo: string
  /** Sube cuando hay que volver a hacerla leer. Ver el `.sql`. */
  version: number
  autor?: string | null
  publicada_at?: string | null
  destino?: Destino
  /**
   * Si además le toca a quien está mirando. **Lo calcula el servidor**, que es el único que sabe.
   * No es lo mismo que "la puede ver": quien publica recibe todas para administrarlas, y esto dice
   * cuáles le suman al badge y cuáles lo frenan con el cartel.
   */
  paraMi?: boolean
  created_at?: string
  updated_at?: string
}

/** Una lectura: esta persona leyó esta novedad en esta versión. */
export type Lectura = { novedad_id: string; version: number; usuario?: string; leida_at?: string }

export type DatosSistema = {
  novedades: Novedad[]
  leidas: Lectura[]
  manuales: ManualIndice[]
  puede: { publicar: boolean; editarManuales: boolean }
}

export const ESTADOS = ESTADOS_JS as readonly EstadoNovedad[]
export const esEstado = esEstadoJs as (v: unknown) => boolean

/** Las publicadas que esta persona todavía no leyó en la versión de hoy. */
export const sinLeer = sinLeerJs as (novedades: Novedad[], leidas: Lectura[]) => Novedad[]

/** Las que se dan por leídas con sólo abrir la sección. ⚠️ Las importantes NO: ver el core. */
export const seMarcanAlEntrar = seMarcanAlEntrarJs as (novedades: Novedad[]) => Novedad[]

export const TODOS = TODOS_JS as Destino
export const normalizarDestino = normalizarDestinoJs as (d: unknown) => Destino

/** La novedad vacía del editor. Nace en borrador siempre: publicar es un acto aparte. */
export const NUEVA: Novedad = {
  id: '',
  estado: 'borrador',
  importante: false,
  titulo: '',
  cuerpo: '',
  version: 1,
  destino: { tipo: 'todos' },
}
