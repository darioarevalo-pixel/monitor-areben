'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const PANEL_W = 288

/**
 * Botón "ⓘ" que abre un panel explicativo. Port del InfoPopover del dashboard
 * (~/Projects/areben-dashboard/components/ui/info-popover.tsx), adaptado a la paleta
 * del monitor (CSS plano, sin Tailwind ni lucide).
 *
 * El panel se renderiza en un PORTAL a document.body con posición `fixed`: así NO lo
 * recorta el `overflow` de las cards contenedoras (el bug clásico donde el popover se
 * abría cortado). El trigger es un `<span role="button">` para poder anidarse dentro
 * de labels/headers que ya son button/div sin generar HTML inválido.
 */
export function InfoPopover({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const reposicionar = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8))
    const top = r.bottom + 6
    setCoords({ top, left })
  }, [])

  useEffect(() => {
    if (!open) return
    reposicionar()
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', reposicionar, true)
    window.addEventListener('resize', reposicionar)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', reposicionar, true)
      window.removeEventListener('resize', reposicionar)
    }
  }, [open, reposicionar])

  const toggle = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    setOpen((o) => !o)
  }

  return (
    <span ref={triggerRef} style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto', verticalAlign: 'middle' }}>
      <span
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle(e)
          }
        }}
        title="Ver cómo funciona"
        className={`info-dot${open ? ' open' : ''}`}
        aria-label={`Info: ${titulo}`}
      >
        {/* Icono info (lucide-style), sin dependencia */}
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </span>
      {open &&
        coords != null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: PANEL_W }}
            className="info-pop"
          >
            <div className="info-pop-title">{titulo}</div>
            <div className="info-pop-body">{children}</div>
          </div>,
          document.body,
        )}
    </span>
  )
}
