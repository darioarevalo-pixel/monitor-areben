'use client'

/**
 * Una red para que un bloque roto NO se lleve puesta la ficha.
 *
 * # 🔴 Por qué existe (3-sep-2026)
 *
 * El panel es la herramienta de todos los días y **no tenía ninguna**: no hay un solo
 * `ErrorBoundary` en la app ni un `error.tsx` de Next. En React eso significa que un error tirado
 * adentro de CUALQUIER bloque desmonta todo el árbol de arriba — o sea, la ficha del cliente deja
 * de abrir. Pasó exactamente eso el 3-sep-2026 al sumar "Que le pague a un acreedor": el bloque
 * falló y lo que se vio fue el panel muerto, sin ninguna pista de dónde.
 *
 * Lo que esto cambia: el bloque que falla se apaga solo, **con el motivo a la vista**, y el resto
 * de la ficha sigue andando. Es la diferencia entre "hoy no puedo atender clientes" y "este
 * recuadro no anda".
 *
 * ⚠️ NO atrapa errores de eventos asincrónicos (un `onClick` que revienta adentro de un `await`):
 * eso React no lo manda a los boundaries. Para esos, cada bloque sigue necesitando su try/catch.
 * Esto cubre el render y los efectos, que es donde se muere el árbol.
 *
 * # Por qué muestra el error y no un cartel lindo
 *
 * Porque el que lo va a ver primero es quien lo puede arreglar. Un "algo salió mal" obliga a
 * reproducirlo a ciegas; el mensaje de verdad ahorra la mitad del camino. Es un recuadro chico y
 * gris, no una pantalla de error.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { color, font, radius, space } from '@/components/ui/tokens'

type Props = { children: ReactNode; nombre: string }
type Estado = { error: Error | null }

export class Aislado extends Component<Props, Estado> {
  state: Estado = { error: null }

  static getDerivedStateFromError(error: Error): Estado {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Queda en la consola con el nombre del bloque adelante, para poder filtrarlo.
    console.error(`[panel:${this.props.nombre}]`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section
        style={{
          background: color.surface, border: `1px dashed ${color.line}`, borderRadius: radius.lg,
          padding: `${space[2]}px ${space[3]}px`, margin: `0 ${space[2]}px ${space[2]}px`,
          fontSize: font.xs, color: color.mut,
        }}
      >
        <b>{this.props.nombre}</b> no se pudo mostrar. El resto de la ficha anda igual.
        <div style={{ marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-word' }}>
          {this.state.error.message || String(this.state.error)}
        </div>
      </section>
    )
  }
}
