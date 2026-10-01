'use client'

import { color, font } from '@/components/ui'
import type { EstadoModulo } from '@/lib/mapa-local/core'
import type { Modulo, Pared } from '@/lib/mapa-local/tipos'

/**
 * El plano del local visto desde arriba, según el plano de la obra: la vidriera arriba, la pared
 * derecha larga (D01–D12) de la entrada hacia el fondo, la pared izquierda corta (I01–I02) en la
 * entrada, la isla en el medio del recorrido, y al fondo los cambiadores y el depósito.
 * ⚠️ Es un esquema para ubicarse, ⛔ no está a escala.
 */

export const FONDO_ESTADO: Record<EstadoModulo, string> = {
  vacio: color.bg2,
  ok: color.successBg,
  lleno: color.warningBg,
  desborda: color.dangerBg,
}
export const BORDE_ESTADO: Record<EstadoModulo, string> = {
  vacio: color.line2,
  ok: color.successBorder,
  lleno: color.warningBorder,
  desborda: color.danger,
}

type Props = {
  modulos: Modulo[]
  estados: Record<string, EstadoModulo>
  /** Módulos con una alerta grave (barra que tapa a la otra, prenda que toca el piso). */
  graves: Set<string>
  elegido: string | null
  onElegir: (codigo: string, pared: Pared) => void
}

const W = 300
const H = 560

/** Dónde se dibuja cada módulo: repartidos a lo largo de su pared, en orden de código. */
function posiciones(modulos: Modulo[]) {
  const de = (p: Pared) => modulos.filter((m) => m.pared === p).sort((a, b) => a.codigo.localeCompare(b.codigo))
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {}
  const der = de('der')
  const paso = der.length ? Math.min(30, 340 / der.length) : 30
  der.forEach((m, i) => (out[m.codigo] = { x: W - 34, y: 48 + i * paso, w: 20, h: paso - 3 }))
  de('izq').forEach((m, i) => (out[m.codigo] = { x: 14, y: 48 + i * 30, w: 20, h: 27 }))
  de('isla').forEach((m, i) => (out[m.codigo] = { x: 110 + i * 10, y: 130 + i * 40, w: 70, h: 24 }))
  return out
}

export function Plano({ modulos, estados, graves, elegido, onElegir }: Props) {
  const pos = posiciones(modulos)
  const texto = { fontSize: 11, fill: color.mut, fontFamily: 'inherit' } as const
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 340, display: 'block' }} role="img" aria-label="Plano del local">
      <rect x={6} y={6} width={W - 12} height={H - 12} rx={6} style={{ fill: color.surface, stroke: color.line2 }} strokeWidth={2} />
      <line x1={70} y1={6} x2={W - 70} y2={6} style={{ stroke: color.brand }} strokeWidth={5} />
      <text x={W / 2} y={26} textAnchor="middle" style={texto}>ENTRADA · VIDRIERA</text>
      <rect x={70} y={280} width={80} height={36} rx={4} style={{ fill: color.bg2, stroke: color.line }} />
      <text x={110} y={302} textAnchor="middle" style={texto}>Mostrador</text>
      <rect x={14} y={400} width={120} height={146} rx={4} style={{ fill: color.bg2, stroke: color.line }} />
      <text x={74} y={476} textAnchor="middle" style={texto}>Cambiadores</text>
      <rect x={160} y={420} width={126} height={126} rx={4} style={{ fill: color.bg2, stroke: color.line }} />
      <text x={223} y={486} textAnchor="middle" style={texto}>Depósito</text>
      {modulos.map((m) => {
        const p = pos[m.codigo]
        if (!p) return null
        const est = estados[m.codigo] || 'vacio'
        const sel = elegido === m.codigo
        const lineas = new Set(m.niveles.filter((n) => n.tipos.length).map((n) => n.linea))
        const franja = lineas.has('sale') && !lineas.has('nc') ? color.warning : lineas.has('nc') && !lineas.has('sale') ? color.brand : color.mut2
        const horizontal = m.pared === 'isla'
        return (
          <g key={m.codigo} onClick={() => onElegir(m.codigo, m.pared)} style={{ cursor: 'pointer' }}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={3} style={{ fill: FONDO_ESTADO[est], stroke: sel ? color.brand : BORDE_ESTADO[est] }} strokeWidth={sel ? 3 : 1.5} />
            {/* La franja dice la línea: índigo colección, ámbar sale, gris mezcla. */}
            {horizontal ? (
              <rect x={p.x} y={p.y + p.h - 4} width={p.w} height={4} style={{ fill: franja }} />
            ) : (
              <rect x={m.pared === 'der' ? p.x + p.w - 4 : p.x} y={p.y} width={4} height={p.h} style={{ fill: franja }} />
            )}
            <text
              x={horizontal ? p.x + p.w / 2 : m.pared === 'der' ? p.x - 4 : p.x + p.w + 4}
              y={p.y + p.h / 2 + 4}
              textAnchor={horizontal ? 'middle' : m.pared === 'der' ? 'end' : 'start'}
              style={{ fontSize: font.xs, fill: color.ink2, fontWeight: sel ? 700 : 500, fontFamily: 'inherit' }}
            >
              {m.codigo}
              {graves.has(m.codigo) ? ' ⚠' : ''}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
