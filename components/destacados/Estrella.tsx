'use client'

/**
 * La ★ de "producto estrella": lo que se comunica de una acción comercial.
 *
 * # Las decisiones de este botón
 *
 *  1. 🔴 **`e.stopPropagation()` es obligatorio.** Las tres filas donde entra hacen algo al
 *     clickearlas: en Análisis la fila abre el acordeón de variantes, en Liquidación abre el modal
 *     de definir precio. Sin esto, marcar una estrella dispara las dos cosas a la vez.
 *  2. **El `title` dice quién la marcó y cuándo**, no "marcar/desmarcar". La estrella es del equipo:
 *     lo que alguien necesita saber al encontrarse una prendida es de quién fue la decisión — y si
 *     dejó una nota, cuál. Mismo criterio que el favorito de la Biblioteca de Meta.
 *  3. **Apagada se dibuja igual de grande.** Un ☆ tenue que aparece sólo al pasar el mouse no
 *     existe en un teléfono, y esta lista se mira parada al lado de una mesa.
 */

import { useState } from 'react'
import { color, font, radius } from '@/components/ui'
import type { Destacado } from '@/lib/destacados/tipos'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function cuando(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()}-${MESES[d.getMonth()]}`
}

export function Estrella({
  marcado, nombre, onAlternar, titulo,
}: {
  /** La fila activa, o `null` si el producto no está destacado en este alcance. */
  marcado: Destacado | null
  /** Para el `aria-label`, que si no dice "estrella" trescientas veces seguidas. */
  nombre: string
  onAlternar: () => Promise<void>
  /** Qué es esta estrella, para el `title` cuando está apagada. Ej.: «de esta campaña». */
  titulo: string
}) {
  const [yendo, setYendo] = useState(false)

  const detalle = marcado
    ? [
        marcado.marcada_por ? `La marcó ${marcado.marcada_por}` : 'Marcada',
        cuando(marcado.marcada_en) ? `el ${cuando(marcado.marcada_en)}` : '',
      ].filter(Boolean).join(' ') + (marcado.nota ? `. ${marcado.nota}` : '')
    : `Marcar como producto estrella ${titulo}`

  return (
    <button
      type="button"
      disabled={yendo}
      aria-pressed={!!marcado}
      aria-label={marcado ? `Sacar la estrella de ${nombre}` : `Marcar ${nombre} como producto estrella`}
      title={detalle}
      onClick={(e) => {
        // Ver la decisión 1 del docblock: la fila entera es clickeable en las tres pantallas.
        e.stopPropagation()
        setYendo(true)
        void onAlternar().finally(() => setYendo(false))
      }}
      style={{
        width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', background: 'none', padding: 0, borderRadius: radius.pill,
        cursor: yendo ? 'wait' : 'pointer', opacity: yendo ? 0.5 : 1,
        fontSize: font.xl, lineHeight: 1,
        color: marcado ? color.warning : color.mut2,
      }}
    >
      {marcado ? '★' : '☆'}
    </button>
  )
}
