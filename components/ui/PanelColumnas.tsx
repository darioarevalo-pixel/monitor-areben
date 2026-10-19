'use client'

/**
 * PanelColumnas — «Columnas · 7 de 11» (diseño ERP §3): mostrar/ocultar y cambiar el orden de las columnas de una
 * `ListaTrabajo`; las fijas dicen «siempre» y ⛔ se ocultan; «Volver a las de siempre». Guardar lo elegido (por
 * usuario) es de quien la usa: esto sólo avisa.
 */

import { useEffect, useRef, useState } from 'react'
import { Icono } from '@/components/ui/Icono'
import { color, font, radius, shadow, space, weight } from '@/components/ui/tokens'

export type ColumnaElegible = { key: string; titulo: string; visible: boolean; fija: boolean }

export function PanelColumnas({ columnas, onAlternar, onMover, onRestablecer }: {
  columnas: ColumnaElegible[]
  onAlternar: (key: string) => void
  onMover: (key: string, d: -1 | 1) => void
  onRestablecer: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierto])
  const visibles = columnas.filter((c) => c.visible).length
  const flecha: React.CSSProperties = { height: 26, width: 26, padding: 0, border: 0, borderRadius: radius.sm, background: 'transparent', color: color.mut, cursor: 'pointer', fontSize: 13 }

  return (
    <div ref={caja} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button" aria-haspopup="dialog" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}
        style={{
          height: 36, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRadius: 9, whiteSpace: 'nowrap', cursor: 'pointer',
          fontFamily: 'inherit', fontWeight: weight.semibold, fontSize: font.md,
          border: `1px solid ${abierto ? color.brandSolid : color.line2}`, background: abierto ? color.brandBg : color.surface, color: abierto ? color.brand : color.ink2,
        }}
      >
        <Icono nombre="columnas" size={16} />Columnas · {visibles} de {columnas.length}
      </button>
      {abierto && (
        <div role="dialog" aria-label="Columnas de la lista" style={{ position: 'absolute', zIndex: 40, top: 'calc(100% + 6px)', right: 0, width: 280, background: color.surface, border: `1px solid ${color.line}`, borderRadius: 12, boxShadow: shadow.pop, padding: space[2] }}>
          {columnas.map((c, i) => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: '4px 6px', borderRadius: radius.sm }}>
              <input id={`col-${c.key}`} type="checkbox" checked={c.visible} disabled={c.fija} onChange={() => onAlternar(c.key)} />
              <label htmlFor={`col-${c.key}`} style={{ flex: 1, fontSize: font.md, color: color.ink }}>
                {c.titulo}{c.fija && <span style={{ marginLeft: 6, fontSize: font.sm, color: color.mut2 }}>siempre</span>}
              </label>
              <button type="button" aria-label={`Subir ${c.titulo}`} title="Subir" disabled={i === 0} onClick={() => onMover(c.key, -1)} style={{ ...flecha, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
              <button type="button" aria-label={`Bajar ${c.titulo}`} title="Bajar" disabled={i === columnas.length - 1} onClick={() => onMover(c.key, 1)} style={{ ...flecha, opacity: i === columnas.length - 1 ? 0.3 : 1 }}>↓</button>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${color.bg2}`, marginTop: space[1], paddingTop: space[2], display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: space[2] }}>
            <span style={{ fontSize: font.sm, color: color.mut }}>Queda guardado para vos.</span>
            <button type="button" onClick={onRestablecer} style={{ height: 'auto', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: color.brand, fontWeight: weight.semibold, fontSize: font.sm }}>Volver a las de siempre</button>
          </div>
        </div>
      )}
    </div>
  )
}
