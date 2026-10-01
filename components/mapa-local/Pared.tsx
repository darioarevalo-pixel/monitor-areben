'use client'

import { color } from '@/components/ui'
import { cfgDeTipo, cupoDe, estadoDeModulo, idNivel, LARGO_CM, type Ubicacion } from '@/lib/mapa-local/core'
import type { MapaLocal, Modulo } from '@/lib/mapa-local/tipos'
import { BORDE_ESTADO } from './Plano'

/**
 * Una pared vista DE FRENTE, como la ve el cliente parado en el local: cada barra a su altura real
 * y cada prenda colgando con su largo. Es donde se ve lo que las fotos mostraban —una barra de
 * arriba cuyas prendas llegan a la de abajo, una barra simple con la mitad de abajo vacía—, que en
 * el plano visto desde arriba ⛔ no se ve.
 * Escala: 1 unidad = 1 cm. El alto útil dibujado es 220 cm.
 */

const ALTO = 220
const MARGEN = 14
const ABAJO = 34

type Props = {
  mapa: MapaLocal
  modulos: Modulo[]
  u: Ubicacion
  graves: Set<string>
  elegido: string | null
  onElegir: (codigo: string) => void
}

export function Pared({ mapa, modulos, u, graves, elegido, onElegir }: Props) {
  const ordenados = [...modulos].sort((a, b) => a.orden - b.orden)
  const xs = ordenados.map((_, i) => ordenados.slice(0, i).reduce((s, m) => s + m.anchoCm + MARGEN, MARGEN))
  const total = ordenados.reduce((s, m) => s + m.anchoCm + MARGEN, MARGEN)
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${total} ${ALTO + ABAJO}`} style={{ width: Math.max(total * 1.1, 320), maxWidth: '100%', minWidth: Math.min(total * 0.9, 900), display: 'block' }} role="img" aria-label="La pared vista de frente">
        <line x1={0} y1={ALTO} x2={total} y2={ALTO} style={{ stroke: color.line2 }} strokeWidth={2} />
        {ordenados.map((m, i) => {
          const x0 = xs[i]
          const est = estadoDeModulo(mapa, m, u)
          const sel = elegido === m.codigo
          return (
            <g key={m.codigo} onClick={() => onElegir(m.codigo)} style={{ cursor: 'pointer' }}>
              <rect x={x0 - 4} y={4} width={m.anchoCm + 8} height={ALTO + ABAJO - 6} rx={4} style={{ fill: sel ? color.brandBg : 'transparent', stroke: sel ? color.brandBorder : 'transparent' }} />
              {/* Los parantes de cremallera. */}
              <line x1={x0} y1={10} x2={x0} y2={ALTO} style={{ stroke: color.mut2 }} strokeWidth={1.5} />
              <line x1={x0 + m.anchoCm} y1={10} x2={x0 + m.anchoCm} y2={ALTO} style={{ stroke: color.mut2 }} strokeWidth={1.5} />
              {m.niveles.map((n) => {
                const yBarra = ALTO - n.alturaCm
                const prendas = u.porBarra[idNivel(m, n)] || []
                const cupo = Math.max(1, cupoDe(mapa, m, n))
                const paso = (m.anchoCm - 6) / cupo
                return (
                  <g key={n.pos}>
                    {n.pos === 'frente' ? (
                      <line x1={x0 + m.anchoCm / 2 - 14} y1={yBarra} x2={x0 + m.anchoCm / 2 + 14} y2={yBarra} style={{ stroke: color.ink2 }} strokeWidth={3} />
                    ) : (
                      <line x1={x0 - 2} y1={yBarra} x2={x0 + m.anchoCm + 2} y2={yBarra} style={{ stroke: color.ink2 }} strokeWidth={3} />
                    )}
                    {prendas.map((p, i) => {
                      const largo = LARGO_CM[cfgDeTipo(mapa, p.tipo)?.largo ?? 'L2']
                      const tono = p.linea === 'sale' ? color.warning : color.brand
                      if (n.pos === 'frente') {
                        return <rect key={p.clave} x={x0 + m.anchoCm / 2 - 12 + i * 6} y={yBarra + 2} width={24} height={largo * 0.8} rx={3} style={{ fill: tono, opacity: 0.35 + i * 0.2 }} />
                      }
                      const px = x0 + 3 + paso * (i + 0.5)
                      return <line key={p.clave} x1={px} y1={yBarra + 1} x2={px} y2={Math.min(ALTO, yBarra + largo)} style={{ stroke: tono, opacity: 0.75 }} strokeWidth={Math.max(1, Math.min(3, paso * 0.6))} />
                    })}
                  </g>
                )
              })}
              <text x={x0 + m.anchoCm / 2} y={ALTO + 14} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: color.ink2, fontFamily: 'inherit' }}>
                {m.codigo}
                {graves.has(m.codigo) ? ' ⚠' : ''}
              </text>
              <text x={x0 + m.anchoCm / 2} y={ALTO + 27} textAnchor="middle" style={{ fontSize: 10, fill: BORDE_ESTADO[est.estado], fontWeight: 600, fontFamily: 'inherit' }}>
                {est.usadas}/{est.cupo}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
