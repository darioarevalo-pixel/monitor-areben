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
import { aplicar, AYUDA, insertarImagen, type Marca, type Resultado } from '@/lib/markdown/barra'
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
  /**
   * Mete una imagen ya subida donde está el cursor.
   *
   * ⚠️ **La usa el editor de Manuales y no la barra**: el botón que la dispara abre el explorador de
   * archivos, sube, y recién entonces hay una URL. Por eso no es una `Marca` más.
   */
  imagen: (src: string, alt: string) => void
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

  /**
   * Lo que comparten todos los botones: leer la selección **del textarea de verdad**, aplicar, y
   * dejar anotado dónde tiene que quedar el cursor cuando React haya pintado el texto nuevo.
   */
  const escribir = useCallback(
    (hacer: (texto: string, ini: number, fin: number) => Resultado) => {
      const el = caja.current
      if (!el) return
      const r = hacer(el.value, el.selectionStart, el.selectionEnd)
      pendiente.current = { ini: r.ini, fin: r.fin }
      setTexto(r.texto)
    },
    [caja, setTexto],
  )

  const marcar = useCallback((m: Marca) => escribir((t, a, b) => aplicar(t, a, b, m)), [escribir])

  const imagen = useCallback(
    (src: string, alt: string) => escribir((t, a, b) => insertarImagen(t, a, b, src, alt)),
    [escribir],
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

  return { marcar, imagen, atajos }
}

/**
 * `children` es el hueco del final de la fila: lo usa el editor de Manuales para su botón de subir
 * una imagen, que **no es un botón de formato** —abre el explorador de archivos y tarda— pero se
 * aprieta desde el mismo lugar. Novedades no le pasa nada y la barra queda igual que antes.
 */
export function BarraFormato({ marcar, children }: { marcar: (m: Marca) => void; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap', marginBottom: space[1], alignItems: 'center' }}>
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
      {children}
    </div>
  )
}
