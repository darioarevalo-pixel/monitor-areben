'use client'

/**
 * Interruptor — la MISMA información mirada de dos (o tres) formas: «Por venta | Por producto» (Darío, 19-nov).
 * ⛔ Es navegación entre secciones: para eso, `Tabs`. Va al lado del título; la elegida, blanca y en relieve sobre el gris.
 */

import { color, font, weight } from './tokens'

export function Interruptor({ opciones, valor, onCambio, etiqueta }: {
  opciones: ReadonlyArray<{ key: string; label: string }>
  valor: string
  onCambio: (k: string) => void
  etiqueta: string
}) {
  return (
    <div role="tablist" aria-label={etiqueta} style={{ display: 'inline-flex', padding: 3, gap: 2, borderRadius: 10, background: color.bg2, border: `1px solid ${color.line}` }}>
      {opciones.map((o) => {
        const on = o.key === valor
        return (
          <button
            key={o.key} type="button" role="tab" aria-selected={on} onClick={() => onCambio(o.key)}
            // `.shell-content button` fija la altura: acá va explícita.
            style={{
              height: 32, padding: '0 14px', border: 0, borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
              fontSize: font.sm, fontWeight: on ? weight.semibold : weight.medium,
              background: on ? color.surface : 'transparent', color: on ? 'var(--mo-brand)' : color.mut,
              boxShadow: on ? '0 1px 2px rgba(15,23,42,.08), 0 1px 1px rgba(15,23,42,.04)' : 'none',
              transition: 'background .12s, color .12s',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
