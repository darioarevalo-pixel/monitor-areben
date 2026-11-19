'use client'

/**
 * ERP › Ventas › lo vendido (Darío, 19-nov): el número del período como protagonista, con la comparación contra el mes pasado al
 * mismo día y las barras de cada día. ⛔ Lo ve sólo Admin: el resto entra a Ventas a trabajar sus pestañas, no a mirar la plata.
 * A la derecha, una tarjeta aparte: «Por cobrar» en ámbar (un pendiente, no un logro) en Ventas; el margen en Por producto.
 */

import { color, font, weight } from '@/components/ui'
import { plata } from '@/lib/erp/ventas-lista.core.js'

export type Comparacion = { pct: number | null; antes: number; mes: string; dia: number }
export type DatoChico = { antes?: string; valor: string; despues?: string }
export type Lateral = { titulo: string; valor: number; nota?: string; tono: 'aviso' | 'neutro' }

const DIA_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const fechaCorta = (d: string) => `${DIA_SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`

/** «$ 52.472.647» con el signo chico: el número es lo que se lee. */
export function Monto({ valor, size }: { valor: number; size: number }) {
  const t = plata(valor).replace(/^\$\s?/, '')
  return (
    <span style={{ fontSize: size, lineHeight: 1.05, fontWeight: weight.bold, letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: size * 0.55, fontWeight: weight.semibold, verticalAlign: '0.12em', opacity: 0.55 }}>$ </span>{t}
    </span>
  )
}

/** Lo vendido cada día: hoy en índigo lleno, los días que faltan como una raya. */
export function Barras({ dias, hoy, alto = 92 }: { dias: Array<{ dia: string; vendido: number }>; hoy: string; alto?: number }) {
  const max = Math.max(1, ...dias.map((d) => d.vendido))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div role="img" aria-label="Lo vendido cada día" style={{ display: 'flex', alignItems: 'flex-end', gap: dias.length > 20 ? 3 : 6, height: alto }}>
        {dias.map((d) => {
          const futuro = d.dia > hoy
          const esHoy = d.dia === hoy
          const h = futuro ? 4 : Math.max(4, Math.round((d.vendido / max) * alto))
          return (
            <div
              key={d.dia} title={futuro ? fechaCorta(d.dia) : `${fechaCorta(d.dia)} · ${plata(d.vendido)}`}
              style={{ flex: 1, minWidth: 0, height: h, borderRadius: '3px 3px 1px 1px', background: futuro ? color.bg2 : esHoy ? 'var(--mo-brand-solid)' : 'color-mix(in srgb, var(--mo-brand-solid) 32%, transparent)' }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.xs, color: color.mut2, fontVariantNumeric: 'tabular-nums' }}>
        <span>{dias[0]?.dia.slice(8, 10)}/{dias[0]?.dia.slice(5, 7)}</span>
        <span>{dias.at(-1)?.dia.slice(8, 10)}/{dias.at(-1)?.dia.slice(5, 7)}</span>
      </div>
    </div>
  )
}

export function Chicos({ datos }: { datos: DatoChico[] }) {
  return (
    <div style={{ display: 'flex', gap: '6px 20px', flexWrap: 'wrap', fontSize: font.sm, color: color.mut }}>
      {datos.map((d, i) => (
        <span key={i}>{d.antes && `${d.antes} `}<b style={{ color: color.ink, fontWeight: weight.semibold, fontVariantNumeric: 'tabular-nums' }}>{d.valor}</b>{d.despues && ` ${d.despues}`}</span>
      ))}
    </div>
  )
}

export function ResumenVentas({ titulo, vendido, datos, comparacion, dias, hoy, lateral }: {
  titulo: string; vendido: number; datos: DatoChico[]
  comparacion: Comparacion | null
  dias: Array<{ dia: string; vendido: number }>; hoy: string
  lateral: Lateral | null
}) {
  const sube = (comparacion?.pct ?? 0) >= 0
  const aviso = lateral?.tono === 'aviso' && lateral.valor > 0
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
      <section
        aria-label={titulo}
        style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexWrap: 'wrap', gap: '20px 40px', alignItems: 'center', padding: '20px 24px', borderRadius: 16, background: color.surface, border: `1px solid ${color.line}`, boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(67,56,202,.18)' }}
      >
        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0, color: color.ink }}>
          <div style={{ fontSize: font.sm, fontWeight: weight.medium, color: color.mut }}>{titulo}</div>
          <Monto valor={vendido} size={42} />
          {comparacion && comparacion.pct !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: font.sm }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontWeight: weight.semibold, fontVariantNumeric: 'tabular-nums', background: sube ? 'var(--mo-success-bg)' : 'var(--mo-danger-bg)', color: sube ? 'var(--mo-success-ink)' : 'var(--mo-danger-ink)' }}>
                {sube ? '▲' : '▼'} {Math.abs(comparacion.pct)}%
              </span>
              <span style={{ color: color.mut }}>vs. {comparacion.mes} al día {comparacion.dia} · {plata(comparacion.antes)}</span>
            </div>
          )}
          <div style={{ paddingTop: 10, marginTop: 2, borderTop: `1px solid ${color.bg2}` }}><Chicos datos={datos} /></div>
        </div>
        {dias.length > 1 && <div style={{ flex: '1.4 1 280px', minWidth: 0 }}><Barras dias={dias} hoy={hoy} /></div>}
      </section>

      {lateral && (
        <section
          aria-label={lateral.titulo}
          style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, padding: '20px 22px', borderRadius: 16, background: aviso ? 'var(--mo-warning-bg)' : color.surface, border: `1px solid ${aviso ? 'var(--mo-warning-border)' : color.line}`, color: aviso ? 'var(--mo-warning-ink)' : color.ink }}
        >
          <div style={{ fontSize: font.sm, fontWeight: weight.medium, color: aviso ? undefined : color.mut }}>{lateral.titulo}</div>
          <Monto valor={lateral.valor} size={28} />
          {lateral.nota && <div style={{ fontSize: font.xs, opacity: aviso ? 0.85 : 1, color: aviso ? undefined : color.mut }}>{lateral.nota}</div>}
        </section>
      )}
    </div>
  )
}
