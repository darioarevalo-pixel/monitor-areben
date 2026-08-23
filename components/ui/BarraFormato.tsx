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

import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'
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
 * cursor al principio y el bloque siguiente se inserta arriba de todo, encima de lo que ya había.
 *
 * 🔴 **Se repone en un `useLayoutEffect` y NO en un `requestAnimationFrame`, y eso está MEDIDO**
 * (23-ago-2026, caminando el editor en prod): con el rAF —que es como estaba escrito desde que la
 * barra nació, en Novedades— el foco se quedaba en el botón y `selectionStart` en 0. El motivo es
 * que el rAF puede correr **antes** de que React haya pintado el valor nuevo, y `setSelectionRange`
 * sobre el valor viejo se recorta a lo que ese valor daba. El efecto de layout, en cambio, corre
 * después del commit por definición: por eso pide `texto` y no le alcanza con el `set`.
 */
export function useFormato(
  caja: RefObject<HTMLTextAreaElement | null>,
  texto: string,
  setTexto: (t: string) => void,
): Formato {
  /** Dónde hay que dejar el cursor apenas el texto nuevo esté en el DOM. */
  const pendiente = useRef<{ ini: number; fin: number } | null>(null)

  useLayoutEffect(() => {
    const p = pendiente.current
    if (!p) return
    pendiente.current = null
    const el = caja.current
    if (!el) return
    el.focus()
    el.setSelectionRange(p.ini, p.fin)
  }, [texto, caja])

  const marcar = useCallback(
    (m: Marca) => {
      const el = caja.current
      if (!el) return
      const r = aplicar(el.value, el.selectionStart, el.selectionEnd, m)
      pendiente.current = { ini: r.ini, fin: r.fin }
      setTexto(r.texto)
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
