'use client'

/** MoneyText — formato de moneda ARS consistente (tabular-nums para alinear columnas). */
import { color, weight, toneTokens, type Tone } from '@/components/ui/tokens'

export function formatMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

export type MoneyTextProps = {
  value: number | null | undefined
  tone?: Tone
  strong?: boolean
  signed?: boolean
  placeholder?: string
  style?: React.CSSProperties
}

export function MoneyText({ value, tone, strong, signed, placeholder, style }: MoneyTextProps) {
  const empty = value == null || Number.isNaN(value)
  const txt = empty ? (placeholder ?? '—') : (signed && (value as number) > 0 ? '+' : '') + formatMoney(value)
  return (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        fontWeight: strong ? weight.bold : undefined,
        color: tone ? toneTokens[tone].fg : color.ink,
        ...style,
      }}
    >
      {txt}
    </span>
  )
}
