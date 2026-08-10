/** Novedades: qué cambió en los sistemas, y quién lo leyó. */

import { ESTADOS as ESTADOS_JS, esEstado as esEstadoJs, sinLeer as sinLeerJs } from './estados.core.js'

export type EstadoNovedad = 'borrador' | 'publicada' | 'archivada'

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
  created_at?: string
  updated_at?: string
}

/** Una lectura: esta persona leyó esta novedad en esta versión. */
export type Lectura = { novedad_id: string; version: number; usuario?: string; leida_at?: string }

export type DatosSistema = {
  novedades: Novedad[]
  leidas: Lectura[]
  puede: { publicar: boolean }
}

export const ESTADOS = ESTADOS_JS as readonly EstadoNovedad[]
export const esEstado = esEstadoJs as (v: unknown) => boolean

/** Las publicadas que esta persona todavía no leyó en la versión de hoy. */
export const sinLeer = sinLeerJs as (novedades: Novedad[], leidas: Lectura[]) => Novedad[]

/** La novedad vacía del editor. Nace en borrador siempre: publicar es un acto aparte. */
export const NUEVA: Novedad = {
  id: '',
  estado: 'borrador',
  importante: false,
  titulo: '',
  cuerpo: '',
  version: 1,
}
