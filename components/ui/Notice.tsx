'use client'

/** Notice — banner de aviso/feedback por tono (success/danger/warning/etc.). */
import { radius, font, space, toneTokens, type Tone } from '@/components/ui/tokens'

export type NoticeProps = {
  tone?: Tone
  icon?: React.ReactNode
  children: React.ReactNode
  onClose?: () => void
  style?: React.CSSProperties
}

export function Notice({ tone = 'neutral', icon, children, onClose, style }: NoticeProps) {
  const t = toneTokens[tone]
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        fontSize: font.sm, color: t.fg, background: t.bg, border: `1px solid ${t.border}`,
        borderRadius: radius.md, padding: `${space[2]}px ${space[3]}px`,
        ...style,
      }}
    >
      {icon && <span aria-hidden style={{ lineHeight: 1.4 }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {onClose && (
        <button onClick={onClose} aria-label="Cerrar" style={{ background: 'transparent', border: 'none', color: t.fg, cursor: 'pointer', fontSize: font.md, lineHeight: 1, padding: 0 }}>×</button>
      )}
    </div>
  )
}
