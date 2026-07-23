'use client'

/** Button — primitiva de acción del kit. variant (forma) + tone (color) + size (densidad). */
import { forwardRef, useState } from 'react'
import { color, radius, font, weight, focusRing, toneTokens, toneSolid, type Tone } from '@/components/ui/tokens'

export type ButtonVariant = 'solid' | 'soft' | 'outline' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = {
  variant?: ButtonVariant
  tone?: Tone
  size?: ButtonSize
  loading?: boolean
  iconLeft?: React.ReactNode
  fullWidth?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>

const PAD: Record<ButtonSize, string> = { sm: '4px 10px', md: '8px 16px', lg: '11px 20px' }
const FS: Record<ButtonSize, number> = { sm: font.xs, md: font.base, lg: font.md }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', tone = 'neutral', size = 'md', loading, iconLeft, fullWidth, disabled, style, children, onMouseEnter, onMouseLeave, onFocus, onBlur, ...rest },
  ref,
) {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const t = toneTokens[tone]
  const solid = toneSolid[tone]
  const off = !!disabled || !!loading

  let bg = 'transparent'
  let fg = t.fg
  let border = 'transparent'
  if (variant === 'solid') { bg = solid; fg = '#fff'; border = solid }
  else if (variant === 'soft') { bg = t.bg; fg = t.fg; border = t.border }
  else if (variant === 'outline') { bg = color.surface; fg = tone === 'neutral' ? color.ink2 : t.fg; border = tone === 'neutral' ? color.line : t.border }
  else if (variant === 'ghost') { bg = 'transparent'; fg = tone === 'neutral' ? color.ink2 : t.fg; border = 'transparent' }

  const hovered = hover && !off
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontSize: FS[size], fontWeight: weight.semibold, lineHeight: 1.2,
    padding: PAD[size], borderRadius: radius.lg,
    border: `1px solid ${border}`, background: bg, color: fg,
    cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.55 : 1,
    width: fullWidth ? '100%' : undefined, whiteSpace: 'nowrap',
    transition: 'background .12s ease, box-shadow .12s ease, border-color .12s ease, transform .05s ease',
    boxShadow: focus ? focusRing : undefined,
    filter: hovered ? (variant === 'solid' ? 'brightness(.94)' : 'brightness(.98)') : undefined,
    transform: hovered ? 'translateY(-0.5px)' : undefined,
    ...(hovered && variant !== 'solid' ? { background: variant === 'ghost' ? color.bg2 : t.bg } : null),
    ...style,
  }
  return (
    <button
      ref={ref} disabled={off} style={base}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e) }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e) }}
      onFocus={(e) => { setFocus(true); onFocus?.(e) }}
      onBlur={(e) => { setFocus(false); onBlur?.(e) }}
      {...rest}
    >
      {loading ? <span aria-hidden style={{ opacity: 0.8 }}>…</span> : iconLeft}
      {children}
    </button>
  )
})
