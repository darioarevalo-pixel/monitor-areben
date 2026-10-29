'use client'

/**
 * Las piezas que van ARRIBA de una `ListaTrabajo` (diseño ERP §3): nacieron en el piloto de Ventas y se mudaron acá para
 * que Stock, Clientes y Productos salgan con el mismo molde.
 *
 *  - `TileResumen` — el resumen del filtro, ARRIBA de la lista. `oscuro` = el número que manda (uno por pantalla).
 *  - `VistasLista` — las vistas con su número («A preparar 12»): cada una ya dice cuántas hay antes de entrar.
 *  - `BuscadorLista` — el buscador de la sección (Bruno: «si no, no se encuentra nada»). Con `filtros`, en la compu van al
 *    lado; 📱 en el celular (≤ 900 px) se juntan en el botón «Filtros», que los abre en una hoja desde abajo.
 *  - `FiltroOpciones` — un filtro de una opción: `select` en la compu, botones de a uno en la hoja del celular.
 *  - `ChipEstado` — el estado de una fila desde un mapa `clave → [tono, texto]`; en una columna angosta termina en «…».
 *  - `cuandoCorto` — «18/10 10:40» en hora argentina: la fecha de una fila y de su ficha.
 */

import { useState } from 'react'
import { StatusPill } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Icono } from '@/components/ui/Icono'
import { Modal } from '@/components/ui/Modal'
import { color, font, weight, type Tone } from '@/components/ui/tokens'
import { usePantallaAngosta } from '@/lib/movil'

/** «18/10 10:40», en hora argentina (UTC−3, fijo: la hora es la del local, la vea quien la vea). Sin fecha, «—». */
export const cuandoCorto = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}

/** El color del tile dice algo (diseño §9): principal = EL número de la pantalla (uno) · neutro = el resto · revisar = hay algo para mirar · bien = en orden. */
export type TonoTile = 'principal' | 'neutro' | 'revisar' | 'bien'

const TILES: Record<TonoTile, { fondo: string; borde: string; titulo: string; valor: string; nota: string }> = {
  principal: { fondo: 'var(--mo-brand-solid)', borde: 'var(--mo-brand-solid)', titulo: 'rgba(255,255,255,0.8)', valor: '#fff', nota: 'rgba(255,255,255,0.8)' },
  neutro: { fondo: 'var(--mo-brand-bg)', borde: 'var(--mo-brand-border)', titulo: 'var(--mo-brand)', valor: color.ink, nota: color.mut },
  revisar: { fondo: 'var(--mo-danger-bg)', borde: 'var(--mo-danger-border)', titulo: 'var(--mo-danger-ink)', valor: 'var(--mo-danger-ink)', nota: 'var(--mo-danger-ink)' },
  bien: { fondo: 'var(--mo-success-bg)', borde: 'var(--mo-success-border)', titulo: 'var(--mo-success-ink)', valor: 'var(--mo-success-ink)', nota: 'var(--mo-success-ink)' },
}

/** `tono` para un conteo de cosas a revisar: rojo si hay, verde si no. */
export const tonoDeConteo = (n: number | null | undefined): TonoTile => (n ? 'revisar' : 'bien')

export function TileResumen({ titulo, valor, oscuro, tono, nota }: { titulo: string; valor: string; /** = `tono="principal"` */ oscuro?: boolean; tono?: TonoTile; nota?: string }) {
  // Franja de ~54 px (diseño §9): título arriba, el número (18 px) y su nota en la misma línea.
  const t = TILES[tono ?? (oscuro ? 'principal' : 'neutro')]
  return (
    // `mo-tile`: en el celular van de a dos por renglón (globals.css).
    <div className="mo-tile" style={{ flex: '1 1 180px', minWidth: 0, padding: '8px 14px', borderRadius: 12, background: t.fondo, border: `1px solid ${t.borde}`, color: t.valor }}>
      <div style={{ fontSize: font.xs, lineHeight: '14px', color: t.titulo }}>{titulo}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 18, lineHeight: '24px', fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{valor}</span>
        {nota && <span title={nota} style={{ fontSize: font.xs, color: t.nota, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{nota}</span>}
      </div>
    </div>
  )
}

/** Las vistas que son un PROBLEMA a revisar (§9 color): en rojo cuando tienen algo. */
const VISTAS_PROBLEMA = new Set(['neg', 'sincosto', 'atrasadas', 'dif', 'sinpagar', 'sinfactura', 'debe'])

export function VistasLista({ vistas, valor, conteo, onCambio, todasRojas }: {
  /** Todas las vistas son problemas (Diferencias, Conciliación). */
  todasRojas?: boolean
  /** `[clave, nombre, …]`, en el orden en que se muestran (lo que venga después del nombre, ⛔ se mira). */
  vistas: ReadonlyArray<readonly [string, string, ...unknown[]]>
  valor: string
  conteo: Record<string, number>
  onCambio: (k: string) => void
}) {
  return (
    // `mo-vistas`: en el celular se deslizan de costado en un solo renglón (globals.css).
    <div role="tablist" aria-label="Vistas" className="mo-vistas" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 12px 0' }}>
      {vistas.map(([k, nombre]) => {
        const on = valor === k
        const rojo = !on && (todasRojas || VISTAS_PROBLEMA.has(k)) && (conteo[k] ?? 0) > 0
        return (
          <button
            key={k} type="button" role="tab" aria-selected={on} onClick={() => onCambio(k)}
            style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 13.5, fontWeight: weight.semibold, border: `1px solid ${on ? 'var(--mo-brand-solid)' : rojo ? 'var(--mo-danger-border)' : color.line}`, background: on ? 'var(--mo-brand-solid)' : rojo ? 'var(--mo-danger-bg)' : color.surface, color: on ? '#fff' : rojo ? 'var(--mo-danger-ink)' : color.ink2 }}
          >
            {nombre}
            <span style={{ fontSize: 12, fontWeight: weight.bold, padding: '0 6px', borderRadius: 999, background: on ? 'rgba(255,255,255,0.18)' : rojo ? 'var(--mo-danger-border)' : color.bg2, color: on ? '#fff' : rojo ? 'var(--mo-danger-ink)' : color.mut }}>{(conteo[k] ?? 0).toLocaleString('es-AR')}</span>
          </button>
        )
      })}
    </div>
  )
}

export function BuscadorLista({ valor, onCambio, etiqueta, placeholder, filtros, filtrosActivos = 0 }: {
  valor: string
  onCambio: (q: string) => void
  etiqueta: string
  placeholder: string
  /** Los filtros de la lista (`FiltroOpciones`, `Select`…): al lado en la compu, en la hoja de «Filtros» en el celular. */
  filtros?: React.ReactNode
  /** Cuántos filtros están corridos de lo de siempre: el número del botón «Filtros». */
  filtrosActivos?: number
}) {
  const angosta = usePantallaAngosta()
  const [hoja, setHoja] = useState(false)
  const campo = (
    <label className="mo-buscador" style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px', border: `1px solid ${color.line2}`, borderRadius: 9 }}>
      <Icono nombre="lupa" size={16} style={{ color: color.mut2 }} />
      <input aria-label={etiqueta} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} style={{ flex: 1, border: 0, outline: 0, font: 'inherit', background: 'transparent', minWidth: 0 }} />
    </label>
  )
  if (!filtros) return campo
  if (!angosta) return <>{campo}{filtros}</>
  return (
    <>
      {campo}
      <Button variant="outline" onClick={() => setHoja(true)} aria-label={filtrosActivos ? `Filtros (${filtrosActivos} puestos)` : 'Filtros'}>
        Filtros
        {filtrosActivos > 0 && <span aria-hidden style={{ minWidth: 18, height: 18, marginLeft: 6, padding: '0 5px', borderRadius: 9, display: 'inline-grid', placeItems: 'center', fontSize: 11, fontWeight: weight.bold, color: '#fff', background: 'var(--mo-brand-solid)' }}>{filtrosActivos}</span>}
      </Button>
      <Modal abierto={hoja} onCerrar={() => setHoja(false)} titulo="Filtros" pie={<Button onClick={() => setHoja(false)}>Ver la lista</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{filtros}</div>
      </Modal>
    </>
  )
}

/** Un filtro de UNA opción: `select` en la compu (como siempre), botones en la hoja del celular (se tocan con el dedo). */
export function FiltroOpciones({ etiqueta, opciones, valor, onCambio, style }: {
  etiqueta: string
  opciones: ReadonlyArray<readonly [string, string]>
  valor: string
  onCambio: (k: string) => void
  /** El ancho del `select` en la compu. */
  style?: React.CSSProperties
}) {
  const angosta = usePantallaAngosta()
  if (!angosta) return <Select aria-label={etiqueta} style={style} value={valor} onChange={(e) => onCambio(e.target.value)}>{opciones.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select>
  return (
    <div role="radiogroup" aria-label={etiqueta}>
      <div style={{ fontSize: font.sm, color: color.mut, marginBottom: 6 }}>{etiqueta}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {opciones.map(([k, t]) => {
          const on = k === valor
          return (
            <button
              key={k} type="button" role="radio" aria-checked={on} onClick={() => onCambio(k)}
              style={{ height: 34, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: on ? weight.semibold : 500, border: `1px solid ${on ? 'var(--mo-brand-solid)' : color.line2}`, background: on ? 'var(--mo-brand-bg)' : color.surface, color: on ? 'var(--mo-brand)' : color.ink2 }}
            >
              {t}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** El nombre de un producto o cliente en una lista: peso 500, 12 px, gris oscuro (diseño §9: vienen en MAYÚSCULAS del catálogo, en negrita «gritaban»). */
export const estiloNombre: React.CSSProperties = { fontWeight: 500, fontSize: 12, color: color.ink2 }

export function ChipEstado({ mapa, k }: { mapa: Record<string, readonly [Tone, string]>; k: string }) {
  const [tono, texto] = mapa[k] || ['neutral', k]
  // Con la columna angosta (monitor de 1333 px) el chip largo («Compra pendiente en GN») termina en «…» y lo dice entero al pasar el mouse.
  return <span title={texto} style={{ display: 'inline-flex', maxWidth: '100%', verticalAlign: 'middle' }}><StatusPill tone={tono} style={{ maxWidth: '100%', minWidth: 0 }} label={<span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{texto}</span>} /></span>
}
