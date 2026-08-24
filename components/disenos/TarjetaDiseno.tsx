'use client'

/**
 * Una funda en la grilla del tablero: la foto, su puntaje, su nombre y su estado.
 *
 * 🔑 **El ★ está siempre**, sin abrir nada. Era el pedido concreto: hasta ago-2026 el puntaje de la
 * ronda sólo aparecía si alguien entraba al modal de votación y apretaba "Resultados", así que el
 * dato con el que se decide la compra vivía a dos clics de donde se decide.
 */

import { etiquetaPuntaje } from '@/lib/disenos/core'
import { DB_ESTADOS, type Diseno, type EstadoDiseno } from '@/lib/disenos/tipos'
import type { PuntajeDiseno } from '@/lib/disenos/votacion'
import { color, radius, space } from '@/components/ui'

export function TarjetaDiseno({
  d,
  pt,
  elegida,
  onElegir,
  onVer,
  onNombre,
  onEstado,
}: {
  d: Diseno
  pt?: PuntajeDiseno
  elegida: boolean
  onElegir: (id: string, e: React.MouseEvent) => void
  onVer: (url: string) => void
  onNombre: (id: string, v: string) => void
  onEstado: (id: string, e: EstadoDiseno) => void
}) {
  const est = DB_ESTADOS.find((x) => x.k === d.estado) || DB_ESTADOS[0]
  const enviado = d.enviados?.length ? d.enviados[d.enviados.length - 1] : null
  return (
    <div
      style={{
        border: `1px solid ${elegida ? color.brandBorder : color.line}`,
        borderTop: `4px solid ${est.color}`,
        boxShadow: elegida ? `0 0 0 2px ${color.brandBg}` : undefined,
        borderRadius: radius.md,
        overflow: 'hidden',
        background: color.surface,
      }}
    >
      <div style={{ position: 'relative' }}>
        {/* Tocar la foto ELIGE; la lupa es la que abre. Al revés, tildar 34 pide 34 punterías
            sobre un cuadradito, y elegir en lote es lo que la pantalla vino a hacer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={d.url}
          alt=""
          loading="lazy"
          onClick={(e) => onElegir(d.id, e)}
          style={{ width: '100%', height: 140, objectFit: 'cover', cursor: 'pointer', background: color.bg2, display: 'block', opacity: elegida ? 0.82 : 1 }}
        />
        <input
          type="checkbox"
          checked={elegida}
          onChange={() => undefined}
          onClick={(e) => onElegir(d.id, e)}
          aria-label={`Elegir ${d.name || 'este diseño'}`}
          style={{ position: 'absolute', top: 6, left: 6, width: 18, height: 18, cursor: 'pointer', accentColor: color.brandSolid }}
        />
        <button
          onClick={() => onVer(d.url)}
          title="Ver la foto grande"
          aria-label="Ver la foto grande"
          style={{ position: 'absolute', top: 5, right: 5, width: 24, height: 24, padding: 0, border: 'none', borderRadius: '50%', background: color.scrim, color: '#fff', fontSize: 12, lineHeight: 1, cursor: 'zoom-in' }}
        >
          ⤢
        </button>
        <div
          title={pt?.n ? `${pt.n} ${pt.n === 1 ? 'persona puntuó' : 'personas puntuaron'} este diseño en la ronda` : 'Nadie puntuó este diseño en la ronda'}
          style={{ position: 'absolute', left: 5, bottom: 5, background: color.scrim, color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 20 }}
        >
          {etiquetaPuntaje(pt)}
        </div>
        {enviado && (
          <div
            title={`Se mandó a «${enviado.ingresoDesc || 'una importación'}»${enviado.fecha ? ' el ' + new Date(enviado.fecha).toLocaleDateString('es-AR') : ''}${enviado.por ? ' · ' + enviado.por : ''}`}
            style={{ position: 'absolute', right: 5, bottom: 5, background: color.scrim, color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 20, maxWidth: '60%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
          >
            → {enviado.ingresoDesc || 'importación'}
          </div>
        )}
      </div>
      <div style={{ padding: space[2] }}>
        <input
          defaultValue={d.name}
          onChange={(e) => onNombre(d.id, e.target.value)}
          placeholder="Nombre comercial…"
          title="Con este nombre se va a cargar el producto en Gestión Nube"
          style={{ width: '100%', fontSize: 12, fontWeight: 600, border: 'none', borderBottom: `1px solid ${color.bg2}`, padding: '2px 0', marginBottom: 5, boxSizing: 'border-box', background: 'transparent', color: color.ink }}
        />
        <div style={{ display: 'flex', gap: 3 }}>
          {DB_ESTADOS.map((s) => (
            <button
              key={s.k}
              onClick={() => onEstado(d.id, s.k)}
              title={s.lbl}
              aria-pressed={d.estado === s.k}
              style={{ flex: 1, padding: '2px 0', fontSize: 12, border: `1px solid ${d.estado === s.k ? s.color : color.line}`, background: d.estado === s.k ? s.color : color.surface, borderRadius: radius.sm, cursor: 'pointer' }}
            >
              {s.ico}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
