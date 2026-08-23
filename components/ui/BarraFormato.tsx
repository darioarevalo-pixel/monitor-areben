'use client'

/**
 * La barra de formato de un `<textarea>` de markdown.
 *
 * 🔑 **Vive acá porque la usan los DOS editores** —el de Novedades y el de Manuales— y lo que se
 * repetía no era el dibujo de los botones sino lo único que puede fallar: leer la selección del
 * textarea de verdad y reponerla después de que React repinta. Copiada, la segunda copia se
 * arreglaba sola el día que alguien tocara la primera.
 *
 * Lo que le hace cada botón al texto no está acá: está en `lib/markdown/barra.ts`, que es puro y se
 * prueba en Node sin DOM. Esto es el cableado.
 */

import { useCallback, type RefObject } from 'react'
import { aplicar, AYUDA, type Marca } from '@/lib/markdown/barra'
import { Button } from '@/components/ui/Button'
import { space } from '@/components/ui/tokens'

/**
 * La barra, en el orden en que se usa: primero lo de adentro de una frase, después lo que arma la
 * estructura, y al final los dos bloques. Cada botón se muestra **con la pinta de lo que hace** (la
 * negrita en negrita), que es más rápido de leer que su nombre.
 */
const BOTONES: { m: Marca; label: string; estilo?: React.CSSProperties }[] = [
  { m: 'negrita', label: 'B', estilo: { fontWeight: 800 } },
  { m: 'italica', label: 'I', estilo: { fontStyle: 'italic' } },
  { m: 'codigo', label: '‹›', estilo: { fontFamily: 'ui-monospace, monospace' } },
  { m: 'link', label: 'Link' },
  { m: 'titulo', label: 'Título' },
  { m: 'subtitulo', label: 'Subtítulo' },
  { m: 'lista', label: '• Lista' },
  { m: 'numerada', label: '1. Lista' },
  { m: 'tabla', label: 'Tabla' },
  { m: 'recuadro', label: 'Recuadro' },
]

export type Formato = {
  marcar: (m: Marca) => void
  atajos: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}

/**
 * El cableado: qué hace un botón y qué hacen los atajos.
 *
 * ⚠️ La selección se lee y se repone **sobre el textarea de verdad**: sin eso, cada toque manda el
 * cursor al final y hay que volver a marcar la palabra siguiente a mano.
 */
export function useFormato(
  caja: RefObject<HTMLTextAreaElement | null>,
  setTexto: (t: string) => void,
): Formato {
  const marcar = useCallback(
    (m: Marca) => {
      const el = caja.current
      if (!el) return
      const r = aplicar(el.value, el.selectionStart, el.selectionEnd, m)
      setTexto(r.texto)
      // Después del `setTexto` el valor del textarea todavía es el viejo: reponer la selección va en
      // el frame siguiente, cuando React ya lo pintó.
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(r.ini, r.fin)
      })
    },
    [caja, setTexto],
  )

  const atajos = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      const m: Marca | null = k === 'b' ? 'negrita' : k === 'i' ? 'italica' : k === 'k' ? 'link' : null
      if (!m) return
      e.preventDefault()
      marcar(m)
    },
    [marcar],
  )

  return { marcar, atajos }
}

export function BarraFormato({ marcar }: { marcar: (m: Marca) => void }) {
  return (
    <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', marginBottom: space[1] }}>
      {BOTONES.map((b) => (
        <Button
          key={b.m}
          variant="ghost"
          size="sm"
          // ⚠️ `type="button"`: adentro de un form, el default es submit.
          type="button"
          title={AYUDA[b.m]}
          onClick={() => marcar(b.m)}
          style={b.estilo}
        >
          {b.label}
        </Button>
      ))}
    </div>
  )
}
