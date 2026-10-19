'use client'

/**
 * FichaCostado — la ficha que se abre AL COSTADO de una lista (diseño ERP §3 y §5): la lista ⛔ se pierde. Cierra con la
 * X, con Escape o tocando el fondo; en el celular ocupa la pantalla entera. Adentro va lo de cada sección.
 *
 * `Historial` — la línea de tiempo de una ficha: cada hecho con ícono, quién y cuándo; una edición, antes → después.
 * `BarraSeleccion` — la barra flotante de las filas tildadas (acciones en lote); `AccionSeleccion`, cada botón de adentro.
 * `DatoFicha` — un dato de la ficha (título chico arriba, valor abajo); van en una grilla que se acomoda sola.
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icono, type NombreIcono } from '@/components/ui/Icono'
import { color, font, shadow, space, toneTokens, weight, type Tone } from '@/components/ui/tokens'

export function FichaCostado({ abierta, onCerrar, titulo, etiqueta, children }: {
  abierta: boolean
  onCerrar: () => void
  /** La línea de arriba («Venta #301 · 18/10 10:40»). */
  titulo: React.ReactNode
  /** Para el lector de pantalla («Ficha de la venta #301»). */
  etiqueta: string
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!abierta) return
    // Si hay un diálogo abierto encima (cobro, editar), Escape lo cierra a ÉL primero.
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-modal="true"]') && onCerrar()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [abierta, onCerrar])
  if (!abierta || typeof document === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <button type="button" aria-label="Cerrar la ficha" onClick={onCerrar} style={{ position: 'absolute', inset: 0, height: 'auto', border: 0, padding: 0, background: 'rgba(15, 23, 41, 0.18)', cursor: 'default' }} />
      <aside aria-label={etiqueta} style={{ position: 'relative', width: 'min(560px, 100vw)', height: '100%', overflowY: 'auto', background: color.surface, boxShadow: shadow.modal, display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[2], padding: '12px 16px', background: color.surface, borderBottom: `1px solid ${color.line}` }}>
          <span style={{ fontSize: font.base, color: color.mut, fontWeight: weight.medium }}>{titulo}</span>
          <button type="button" aria-label="Cerrar" onClick={onCerrar} style={{ height: 32, width: 32, padding: 0, display: 'grid', placeItems: 'center', border: 0, borderRadius: 8, background: 'transparent', color: color.mut, cursor: 'pointer' }}>
            <Icono nombre="cruz" size={18} />
          </button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: space[5] }}>{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

export type HechoHistorial = { cuando: string; titulo: string; detalle?: string; icono: NombreIcono; tono: Tone; antes?: string; despues?: string }

export function Historial({ hechos, cuandoTexto }: { hechos: HechoHistorial[]; cuandoTexto: (iso: string) => string }) {
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {hechos.map((h, i) => {
        const t = toneTokens[h.tono]
        return (
          <li key={i} style={{ display: 'flex', gap: space[3] }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span aria-hidden style={{ width: 28, height: 28, flex: '0 0 28px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: t.bg, color: t.fg }}><Icono nombre={h.icono} size={15} /></span>
              <span aria-hidden style={{ flex: '1 1 auto', width: 2, minHeight: 10, background: i === hechos.length - 1 ? 'transparent' : color.line }} />
            </div>
            <div style={{ paddingBottom: space[3], minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span style={{ fontWeight: weight.semibold, color: color.ink }}>{h.titulo}</span>
                <span style={{ fontSize: font.sm, color: color.mut2, fontVariantNumeric: 'tabular-nums' }}>{cuandoTexto(h.cuando)}</span>
              </span>
              {h.detalle && <span style={{ fontSize: font.base, color: color.mut }}>{h.detalle}</span>}
              {h.antes != null && (
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, fontSize: font.base }}>
                  <span style={{ color: color.mut, textDecoration: 'line-through' }}>{h.antes}</span>
                  <span aria-hidden style={{ color: color.mut2 }}>→</span>
                  <span style={{ color: color.ink, fontWeight: weight.medium }}>{h.despues}</span>
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function DatoFicha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: font.sm, color: color.mut }}>{titulo}</span>
      <span style={{ color: color.ink, overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </div>
  )
}

/** La grilla de los `DatoFicha`: tantas columnas de 150 px como entren. */
export function DatosFicha({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: space[3] }}>{children}</div>
}

export function BarraSeleccion({ cuantas, onSoltar, children }: { cuantas: number; onSoltar: () => void; children: React.ReactNode }) {
  if (!cuantas) return null
  return (
    <div role="region" aria-label="Acciones de las elegidas" style={{ position: 'sticky', bottom: 16, zIndex: 5, margin: '0 auto', width: 'fit-content', maxWidth: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space[2], padding: '8px 10px 8px 16px', borderRadius: 12, background: 'var(--mo-side-bg)', color: '#fff', boxShadow: shadow.modal }}>
      <span style={{ fontWeight: weight.semibold, whiteSpace: 'nowrap' }}>{cuantas} {cuantas === 1 ? 'elegida' : 'elegidas'}</span>
      {children}
      <button type="button" onClick={onSoltar} style={{ height: 34, padding: '0 10px', border: 0, borderRadius: 8, background: 'transparent', color: '#cbd5e1', cursor: 'pointer', fontWeight: weight.semibold }}>Soltar</button>
    </div>
  )
}

export function AccionSeleccion({ icono, onClick, children }: { icono: NombreIcono; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ height: 34, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', border: 0, borderRadius: 8, background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontWeight: weight.semibold }}>
      <Icono nombre={icono} size={16} />{children}
    </button>
  )
}
