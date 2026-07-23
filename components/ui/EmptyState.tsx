'use client'

/** EmptyState — estado vacío / placeholder consistente. */
import { color, radius, font, weight, space } from '@/components/ui/tokens'

export type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  hint?: React.ReactNode
  action?: React.ReactNode
  dashed?: boolean
  style?: React.CSSProperties
}

export function EmptyState({ icon, title, hint, action, dashed, style }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center',
        padding: `${space[8]}px ${space[5]}px`, color: color.mut,
        border: dashed ? `1px dashed ${color.line2}` : 'none',
        borderRadius: dashed ? radius.lg : undefined,
        background: dashed ? color.bg : undefined,
        ...style,
      }}
    >
      {icon && <div style={{ fontSize: 26, lineHeight: 1 }}>{icon}</div>}
      <div style={{ fontSize: font.md, fontWeight: weight.semibold, color: color.ink2 }}>{title}</div>
      {hint && <div style={{ fontSize: font.sm, color: color.mut, maxWidth: 380 }}>{hint}</div>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  )
}
