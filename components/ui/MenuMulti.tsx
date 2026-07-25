'use client'

/**
 * MenuMulti — desplegable de selección múltiple con contador ("3 meses").
 *
 * Existía como `.mkt-multi` en el CSS legacy, usado por Marketing y por el filtro de mes
 * de ingreso de Productos. Se sube al kit porque es el control que faltaba cada vez que
 * una sección necesitaba filtrar por varias cosas a la vez, y sin él terminaban en una
 * fila de checkboxes sueltos.
 *
 * Se cierra con Escape o al clickear afuera — el legacy solo se cerraba volviendo a
 * tocar el botón, así que quedaba abierto tapando la tabla.
 */
import { useEffect, useRef, useState } from 'react'
import { color, font, radius, shadow, space } from '@/components/ui/tokens'

export type OpcionMulti = { key: string; label: React.ReactNode; n?: number }

export function MenuMulti({
  opciones,
  seleccion,
  onCambiar,
  etiqueta,
  vacio = 'Todos',
  ancho = 190,
}: {
  opciones: OpcionMulti[]
  seleccion: Set<string>
  onCambiar: (s: Set<string>) => void
  /** Cómo nombrar N seleccionados: (n) => `${n} meses`. */
  etiqueta: (n: number, unico?: string) => string
  vacio?: string
  ancho?: number
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  const toggle = (k: string, on: boolean) => {
    const n = new Set(seleccion)
    if (on) n.add(k)
    else n.delete(k)
    onCambiar(n)
  }

  const unico = seleccion.size === 1 ? opciones.find((o) => o.key === [...seleccion][0]) : undefined
  const texto = seleccion.size === 0 ? vacio : etiqueta(seleccion.size, typeof unico?.label === 'string' ? unico.label : undefined)

  return (
    <div ref={caja} style={{ position: 'relative', width: ancho }}>
      <button
        type="button"
        className="mo-select"
        onClick={() => setAbierto((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          textAlign: 'left',
          cursor: 'pointer',
          ...(seleccion.size ? { borderColor: color.brandBorder, background: color.brandBg, color: color.brand, fontWeight: 600 } : null),
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span>
        <span aria-hidden style={{ opacity: 0.5 }}>
          ▾
        </span>
      </button>

      {abierto && (
        <div
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: '100%',
            maxHeight: 280,
            overflowY: 'auto',
            background: color.surface,
            border: `1px solid ${color.line}`,
            borderRadius: radius.lg,
            boxShadow: shadow.pop,
            padding: space[1],
          }}
        >
          {opciones.map((o) => (
            <label
              key={o.key}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: font.base, color: color.ink2, cursor: 'pointer', borderRadius: radius.sm, whiteSpace: 'nowrap' }}
            >
              <input type="checkbox" checked={seleccion.has(o.key)} onChange={(e) => toggle(o.key, e.target.checked)} style={{ accentColor: 'var(--mo-brand-solid)' }} />
              {o.label}
              {o.n != null && <span style={{ color: color.mut2, fontSize: font.xs }}>({o.n})</span>}
            </label>
          ))}
          {seleccion.size > 0 && (
            <button
              type="button"
              onClick={() => onCambiar(new Set())}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginTop: 4,
                paddingTop: 6,
                padding: '6px 8px',
                borderTop: `1px solid ${color.line}`,
                background: 'transparent',
                border: 'none',
                color: color.danger,
                fontSize: font.sm,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ✕ Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  )
}
