'use client'

/** Badge / StatusPill — etiquetas de estado por tono semántico. */
import { radius, font, weight, toneTokens, type Tone } from '@/components/ui/tokens'

export type BadgeProps = {
  tone?: Tone
  subtle?: boolean
  children: React.ReactNode
  style?: React.CSSProperties
}

export function Badge({ tone = 'neutral', subtle, children, style }: BadgeProps) {
  const t = toneTokens[tone]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: font.xs, fontWeight: weight.semibold, lineHeight: 1.4,
        padding: '2px 8px', borderRadius: radius.pill,
        color: t.fg, background: t.bg,
        border: subtle ? '1px solid transparent' : `1px solid ${t.border}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

export type StatusPillProps = {
  tone: Tone
  label: React.ReactNode
  dot?: boolean
  style?: React.CSSProperties
}

/** Pill de estado con puntito de color (look SaaS). */
export function StatusPill({ tone, label, dot = true, style }: StatusPillProps) {
  const t = toneTokens[tone]
  return (
    <Badge tone={tone} style={style}>
      {dot && <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: t.fg, display: 'inline-block' }} />}
      {label}
    </Badge>
  )
}
