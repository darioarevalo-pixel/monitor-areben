'use client'

/**
 * Plegable — un grupo que se abre y se cierra, con una línea que explica qué hay adentro.
 *
 * 🔑 **La ayuda se ve SIEMPRE, esté abierto o cerrado**, y esa es la diferencia con un `<details>`
 * pelado. Nació en Etapas para las campañas que no entregan y las pausadas: si lo único visible es
 * «171 sin gasto en la ventana», nadie sabe si abrirlo vale la pena ni por qué están ahí. La
 * pregunta que contesta el renglón de abajo es «¿esto que escondimos me importa?», y contestarla
 * recién después de abrir es contestarla tarde.
 *
 * El estado vive **afuera**: quien lo usa suele tener varios y necesita poder abrir uno solo.
 */

import { color, font, space, weight } from '@/components/ui/tokens'

export type PlegableProps = {
  abierto: boolean
  onToggle: () => void
  titulo: string
  /** Qué hay adentro y por qué está plegado. Se lee cerrado, que es cuando decide si se abre. */
  ayuda: string
  children: React.ReactNode
}

export function Plegable({ abierto, onToggle, titulo, ayuda, children }: PlegableProps) {
  return (
    <div style={{ borderTop: `1px solid ${color.line}`, paddingTop: space[3], marginTop: space[3] }}>
      <button
        onClick={onToggle}
        style={{
          // `height: auto` no es de adorno: la regla legacy `.shell-content button` le fija a TODO
          // botón la altura de un control (un renglón), y este tiene dos.
          height: 'auto',
          background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
          textAlign: 'left', color: color.ink2, fontSize: font.base, fontWeight: weight.semibold,
        }}
      >
        {abierto ? '▾' : '▸'} {titulo}
      </button>
      <div style={{ fontSize: font.xs, color: color.mut2, marginTop: space[1], lineHeight: 1.4 }}>{ayuda}</div>
      {abierto && <div style={{ marginTop: space[3] }}>{children}</div>}
    </div>
  )
}
