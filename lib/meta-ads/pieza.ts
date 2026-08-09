/**
 * La pieza y el creativo nuevo, del lado tipado.
 *
 * ⚠️ La lógica —qué copy se lee, qué formatos no sirven de modelo, cómo se arma el
 * `object_story_spec`— **no vive acá**: vive en `lib/meta-ads/pieza.core.js`, en JS plano, porque
 * `api/_meta-planes.js` la necesita y no puede importar TypeScript. Este archivo aporta los tipos, y
 * es de donde comen los tests y la pantalla.
 */

import {
  CAMPOS_CREATIVO_MODELO as CAMPOS_CREATIVO_MODELO_JS,
  claseDePieza as claseDePiezaJs,
  CLASE_POR_EXTENSION as CLASE_POR_EXTENSION_JS,
  copyDeCreativo as copyDeCreativoJs,
  cuerpoDeCreativo as cuerpoDeCreativoJs,
  TOPE_PIEZAS as TOPE_PIEZAS_JS,
  validarPiezas as validarPiezasJs,
} from './pieza.core.js'

/** De qué clase es una pieza. `null` = no se reconoció la extensión y no se sube nada. */
export type ClasePieza = 'video' | 'imagen'

/** El creativo del aviso modelo, tal como lo devuelve Graph con `CAMPOS_CREATIVO_MODELO`. */
export interface CreativoLeido {
  id?: string
  name?: string
  title?: string
  body?: string
  effective_object_story_id?: string
  object_story_spec?: {
    page_id?: string
    instagram_user_id?: string
    /** Cómo se llamaba antes `instagram_user_id`. Los avisos viejos siguen devolviendo éste. */
    instagram_actor_id?: string
    link_data?: Record<string, unknown> & {
      message?: string
      name?: string
      description?: string
      link?: string
      picture?: string
      child_attachments?: unknown[]
      call_to_action?: { type?: string; value?: { link?: string } }
    }
    video_data?: Record<string, unknown> & {
      message?: string
      title?: string
      link_description?: string
      video_id?: string
      image_url?: string
      call_to_action?: { type?: string; value?: { link?: string } }
    }
  }
}

/** Todo lo que hace a un creativo menos la pieza: es lo que se hereda del modelo. */
export interface CopyDeAviso {
  pageId: string
  /** `null` = el modelo no salía por Instagram. El aviso nuevo tampoco: se degrada, no se rompe. */
  instagramId: string | null
  mensaje: string | null
  titulo: string | null
  descripcion: string | null
  destino: string
  /** El botón del modelo. `null` = no tenía, y no se le inventa uno. */
  cta: string | null
}

/** Una pieza ya subida al Blob y lista para mandarle a Meta. */
export interface PiezaCargada {
  nombre: string
  url: string
  clase: ClasePieza
}

/** Lo que se le pasa a `cuerpoDeCreativo` una vez que la pieza ya vive en Meta (o en el Blob). */
export type PiezaEnMeta =
  | { clase: 'video'; videoId: string; miniatura: string | null }
  | { clase: 'imagen'; url: string }

type Falla = { ok: false; status: number; error: string }

export const CAMPOS_CREATIVO_MODELO = CAMPOS_CREATIVO_MODELO_JS as string
export const CLASE_POR_EXTENSION = CLASE_POR_EXTENSION_JS as Record<string, ClasePieza>
export const TOPE_PIEZAS = TOPE_PIEZAS_JS as number

export const claseDePieza = claseDePiezaJs as (nombre: string) => ClasePieza | null
export const copyDeCreativo = copyDeCreativoJs as (
  cr: CreativoLeido | null | undefined,
) => { ok: true; copy: CopyDeAviso } | Falla
export const cuerpoDeCreativo = cuerpoDeCreativoJs as (
  copy: CopyDeAviso | null,
  pieza: PiezaEnMeta | null,
) => { ok: true; cuerpo: Record<string, string> } | Falla
export const validarPiezas = validarPiezasJs as (
  piezas: unknown,
) => { ok: true; piezas: PiezaCargada[] } | Falla
