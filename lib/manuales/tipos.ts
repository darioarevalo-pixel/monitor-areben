/**
 * Manuales: el procedimiento de trabajo, no el paso a paso de la pantalla.
 *
 * # La frontera con `Instructivo`, que ya existe y se queda donde está
 *
 * `components/ui/Instructivo.tsx` son **los pasos de esta pantalla, en el orden en que se hacen**:
 * cambian con el código, están al lado del botón que ejecutan, y uno desactualizado se nota al
 * toque. Siguen viviendo en el JSX de cada sección.
 *
 * Un **manual** es otra cosa: quién lo hace, cuándo, qué pasa antes y después, qué hacer si sale
 * mal. Vive en la base, lo edita quien trabaja, y no necesita un deploy para corregirse.
 */

export type Manual = {
  id: string
  /** Key de sección del monitor, o `null` si es un procedimiento que no es de una pantalla. */
  seccion?: string | null
  titulo: string
  /** Markdown del subconjunto de `lib/markdown/core.ts`. */
  cuerpo: string
  orden: number
  autor?: string | null
  publicado: boolean
  created_at?: string
  updated_at?: string
}

/**
 * Una rutina de la Agenda que apunta a este manual.
 *
 * 🔑 **Es la flecha al revés.** `agenda_items.manual_id` cuelga de la tabla `manuales` y hasta acá
 * sólo servía para dibujar el botón «Cómo se hace» en el pendiente. Leída al revés contesta otra
 * pregunta —**para qué se usa este texto**— y le da al cartel de borrado el número que no tenía.
 */
export type RutinaDeManual = {
  id: string
  titulo: string
  /** `pendiente` pide tilde; `aviso` sólo informa. Es lo mismo que `ClaseItem` de la Agenda. */
  clase: 'pendiente' | 'aviso'
}

/** Lo que viaja en el GET del shell: sin `cuerpo`, que se pide al abrir. */
export type ManualIndice = Pick<Manual, 'id' | 'seccion' | 'titulo' | 'publicado'>

export const NUEVO: Manual = {
  id: '',
  seccion: null,
  titulo: '',
  cuerpo: '',
  orden: 0,
  publicado: false,
}

/** El manual publicado de una sección, si lo hay. El índice único garantiza que sea uno solo. */
export function manualDe(indice: ManualIndice[], seccion: string): ManualIndice | undefined {
  return indice.find((m) => m.seccion === seccion && m.publicado)
}
