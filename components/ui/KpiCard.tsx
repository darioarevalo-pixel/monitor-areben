'use client'

/** KpiCard — tarjeta de métrica (reemplaza .stat y las KPI inline). */
import { Card } from '@/components/ui/Card'
import { color, font, weight, toneTokens, type Tone } from '@/components/ui/tokens'

export type KpiCardProps = {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  tone?: Tone
  info?: React.ReactNode
  /** Cuando la tarjeta ES un filtro (ej. los segmentos del CRM), no solo un número. */
  onClick?: () => void
  style?: React.CSSProperties
}

export function KpiCard({ label, value, sub, tone = 'neutral', info, onClick, style }: KpiCardProps) {
  const t = toneTokens[tone]
  const accent = tone !== 'neutral'
  return (
    <Card
      padding={4}
      interactive={!!onClick}
      onClick={onClick}
      style={{ flex: '1 1 200px', minWidth: 160, borderColor: accent ? t.border : color.line, background: accent ? t.bg : color.surface, cursor: onClick ? 'pointer' : undefined, ...style }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: font.xs, fontWeight: weight.medium, color: accent ? t.fg : color.mut, letterSpacing: 0 }}>
        {label}
        {info}
      </div>
      <div style={{ fontSize: font.xl, fontWeight: weight.bold, color: accent ? t.fg : color.ink, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: font.xs, color: color.mut, marginTop: 2 }}>{sub}</div>}
    </Card>
  )
}
