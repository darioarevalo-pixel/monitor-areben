'use client'

/** Table — primitivas componibles de tabla (look SaaS: bordes sutiles, tabular-nums, hover de fila). */
import { color, radius, font, weight, space } from '@/components/ui/tokens'

export function TableWrap({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${color.line}`, borderRadius: radius.lg, background: color.surface, ...style }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>{children}</table>
    </div>
  )
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead style={{ background: color.bg }}>{children}</thead>
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>
}

export function Tr({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  return <tr onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined, ...style }}>{children}</tr>
}

export type ThProps = { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; width?: number | string; style?: React.CSSProperties }
export function Th({ children, align = 'left', width, style }: ThProps) {
  return (
    <th style={{ textAlign: align, fontSize: font.xs, fontWeight: weight.semibold, color: color.mut2, textTransform: 'uppercase', letterSpacing: 0.5, padding: `${space[3]}px ${space[4]}px`, borderBottom: `1px solid ${color.line}`, whiteSpace: 'nowrap', width, ...style }}>
      {children}
    </th>
  )
}

export type TdProps = { children?: React.ReactNode; align?: 'left' | 'right' | 'center'; mono?: boolean; wrap?: boolean; strong?: boolean; style?: React.CSSProperties }
export function Td({ children, align = 'left', mono, wrap, strong, style }: TdProps) {
  return (
    <td
      style={{
        textAlign: align, fontSize: font.base, color: color.ink2,
        padding: `${space[3]}px ${space[4]}px`, borderBottom: `1px solid ${color.bg2}`,
        whiteSpace: wrap ? 'normal' : 'nowrap',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        fontVariantNumeric: align === 'right' ? 'tabular-nums' : undefined,
        fontWeight: strong ? weight.semibold : undefined,
        ...style,
      }}
    >
      {children}
    </td>
  )
}
