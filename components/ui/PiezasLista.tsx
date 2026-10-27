'use client'

/**
 * Las piezas que van ARRIBA de una `ListaTrabajo` (diseño ERP §3): nacieron en el piloto de Ventas y se mudaron acá para
 * que Stock, Clientes y Productos salgan con el mismo molde.
 *
 *  - `TileResumen` — el resumen del filtro, ARRIBA de la lista. `oscuro` = el número que manda (uno por pantalla).
 *  - `VistasLista` — las vistas con su número («A preparar 12»): cada una ya dice cuántas hay antes de entrar.
 *  - `BuscadorLista` — el buscador de la sección (Bruno: «si no, no se encuentra nada»).
 *  - `ChipEstado` — el estado de una fila desde un mapa `clave → [tono, texto]`; en una columna angosta termina en «…».
 *  - `cuandoCorto` — «18/10 10:40» en hora argentina: la fecha de una fila y de su ficha.
 */

import { StatusPill } from '@/components/ui/Badge'
import { Icono } from '@/components/ui/Icono'
import { color, font, weight, type Tone } from '@/components/ui/tokens'

/** «18/10 10:40», en hora argentina (UTC−3, fijo: la hora es la del local, la vea quien la vea). Sin fecha, «—». */
export const cuandoCorto = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString()
  return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`
}

export function TileResumen({ titulo, valor, oscuro, nota }: { titulo: string; valor: string; oscuro?: boolean; nota?: string }) {
  // Franja de ~54 px (diseño §9): título arriba, el número (18 px) y su nota en la misma línea.
  return (
    <div style={{ flex: '1 1 180px', minWidth: 0, padding: '8px 14px', borderRadius: 12, background: oscuro ? 'var(--mo-side-bg)' : color.surface, border: oscuro ? 0 : `1px solid ${color.line}`, color: oscuro ? '#fff' : color.ink }}>
      <div style={{ fontSize: font.xs, lineHeight: '14px', color: oscuro ? '#94a3b8' : color.mut }}>{titulo}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 18, lineHeight: '24px', fontWeight: weight.bold, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{valor}</span>
        {nota && <span title={nota} style={{ fontSize: font.xs, color: oscuro ? '#94a3b8' : color.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{nota}</span>}
      </div>
    </div>
  )
}

export function VistasLista({ vistas, valor, conteo, onCambio }: {
  /** `[clave, nombre, …]`, en el orden en que se muestran (lo que venga después del nombre, ⛔ se mira). */
  vistas: ReadonlyArray<readonly [string, string, ...unknown[]]>
  valor: string
  conteo: Record<string, number>
  onCambio: (k: string) => void
}) {
  return (
    <div role="tablist" aria-label="Vistas" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 12px 0' }}>
      {vistas.map(([k, nombre]) => {
        const on = valor === k
        return (
          <button
            key={k} type="button" role="tab" aria-selected={on} onClick={() => onCambio(k)}
            style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: 13.5, fontWeight: weight.semibold, border: `1px solid ${on ? 'var(--mo-side-bg)' : color.line}`, background: on ? 'var(--mo-side-bg)' : color.surface, color: on ? '#fff' : color.ink2 }}
          >
            {nombre}
            <span style={{ fontSize: 12, fontWeight: weight.bold, padding: '0 6px', borderRadius: 999, background: on ? 'rgba(255,255,255,0.18)' : color.bg2, color: on ? '#fff' : color.mut }}>{(conteo[k] ?? 0).toLocaleString('es-AR')}</span>
          </button>
        )
      })}
    </div>
  )
}

export function BuscadorLista({ valor, onCambio, etiqueta, placeholder }: { valor: string; onCambio: (q: string) => void; etiqueta: string; placeholder: string }) {
  return (
    <label style={{ flex: '1 1 240px', display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 10px', border: `1px solid ${color.line2}`, borderRadius: 9 }}>
      <Icono nombre="lupa" size={16} style={{ color: color.mut2 }} />
      <input aria-label={etiqueta} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} style={{ flex: 1, border: 0, outline: 0, font: 'inherit', background: 'transparent', minWidth: 0 }} />
    </label>
  )
}

/** El nombre de un producto o cliente en una lista: peso 500, 12 px, gris oscuro (diseño §9: vienen en MAYÚSCULAS del catálogo, en negrita «gritaban»). */
export const estiloNombre: React.CSSProperties = { fontWeight: 500, fontSize: 12, color: color.ink2 }

export function ChipEstado({ mapa, k }: { mapa: Record<string, readonly [Tone, string]>; k: string }) {
  const [tono, texto] = mapa[k] || ['neutral', k]
  // Con la columna angosta (monitor de 1333 px) el chip largo («Compra pendiente en GN») termina en «…» y lo dice entero al pasar el mouse.
  return <span title={texto} style={{ display: 'inline-flex', maxWidth: '100%', verticalAlign: 'middle' }}><StatusPill tone={tono} style={{ maxWidth: '100%', minWidth: 0 }} label={<span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{texto}</span>} /></span>
}
