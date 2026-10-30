'use client'

/**
 * FichaCostado — la ficha que se abre AL COSTADO de una lista (diseño ERP §3 y §5): la lista ⛔ se pierde. Cierra con la
 * X, con Escape o tocando el fondo; en el celular ocupa la pantalla entera. Adentro va lo de cada sección.
 *
 * `Historial` — la línea de tiempo de una ficha: cada hecho con ícono, quién y cuándo; una edición, antes → después.
 * `BarraSeleccion` — la barra flotante de las filas tildadas (acciones en lote); `AccionSeleccion`, cada botón de adentro.
 * `DatoFicha` — un dato de la ficha (título chico arriba, valor abajo); van en una grilla que se acomoda sola.
 *
 * 📱 **En el celular (≤ 900 px, Bruno 29-oct) la acción principal va FIJA AL PIE**, donde llega el pulgar: `pie` dice cuál
 * (venta → Registrar cobro · prenda → Ajustar · cliente → WhatsApp), una segunda opcional y el resto en «⋯». En la compu
 * el pie ⛔ se dibuja: la ficha sigue con sus botones arriba, y cada ficha los esconde en el celular para ⛔ duplicarlos.
 * `BarraSeleccion` ⛔ aparece en el celular: ahí ⛔ se trabaja en lote.
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { Icono, type NombreIcono } from '@/components/ui/Icono'
import { MenuAcciones, type AccionMenu } from '@/components/ui/MenuAcciones'
import { usePantallaAngosta } from '@/lib/movil'
import { color, font, shadow, space, toneTokens, weight, type Tone } from '@/components/ui/tokens'

export type BotonPie = { label: string; onClick: () => void; disabled?: boolean }
/** Lo que va al pie en el celular: la principal (llena, a la derecha), una segunda (de borde) y el resto en «⋯». */
export type PieFicha = { principal?: BotonPie; otra?: BotonPie; mas?: AccionMenu[] }

export function FichaCostado({ abierta, onCerrar, titulo, etiqueta, pie, children }: {
  abierta: boolean
  onCerrar: () => void
  /** La línea de arriba («Venta #301 · 18/10 10:40»). */
  titulo: React.ReactNode
  /** Para el lector de pantalla («Ficha de la venta #301»). */
  etiqueta: string
  /** 📱 Sólo en el celular: la barra fija al pie. */
  pie?: PieFicha
  children: React.ReactNode
}) {
  const angosta = usePantallaAngosta()
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
        {angosta && pie && <PieDeFicha pie={pie} etiqueta={etiqueta} />}
      </aside>
    </div>,
    document.body,
  )
}

function PieDeFicha({ pie, etiqueta }: { pie: PieFicha; etiqueta: string }) {
  const { principal, otra, mas = [] } = pie
  if (!principal && !otra && !mas.length) return null
  return (
    <PieFijo etiqueta="Acciones de la ficha" data-pie-ficha>
      {otra && <Button variant="outline" disabled={otra.disabled} onClick={otra.onClick} style={BOTON_PIE}>{otra.label}</Button>}
      {principal && <Button variant="solid" tone="brand" disabled={principal.disabled} onClick={principal.onClick} style={BOTON_PIE}>{principal.label}</Button>}
      <MenuAcciones acciones={mas} etiqueta={`Más acciones · ${etiqueta}`} alPie />
    </PieFijo>
  )
}

/** Un botón del pie: todos del mismo ancho y de 44 px de alto (el pulgar). */
export const BOTON_PIE: React.CSSProperties = { flex: '1 1 0', minWidth: 0, height: 44 }

/**
 * 📱 La barra fija al pie, donde llega el pulgar: la de la ficha y la de una TAREA del celular (recibir, ajustar — tanda 3,
 * 30-oct). Se pega al pie de lo que se desliza (en el ERP, `.shell-content`, que termina arriba de la barra de abajo).
 */
export function PieFijo({ etiqueta, children, ...data }: { etiqueta: string; children: React.ReactNode } & Record<`data-${string}`, boolean | string>) {
  return (
    <div role="group" aria-label={etiqueta} {...data} style={{ position: 'sticky', bottom: 0, zIndex: 2, marginTop: 'auto', display: 'flex', alignItems: 'center', gap: space[2], padding: '8px 12px calc(12px + env(safe-area-inset-bottom))', background: color.surface, borderTop: `1px solid ${color.line}` }}>
      {children}
    </div>
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
  const angosta = usePantallaAngosta()
  if (!cuantas || angosta) return null
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
