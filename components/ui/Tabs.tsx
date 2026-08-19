'use client'

/** Tabs — navegación por pestañas. variant 'pill' (look ámbar) | 'underline' (sub-navs). */
import { color, radius, font, weight, space } from '@/components/ui/tokens'

export type TabItem = {
  key: string
  label: React.ReactNode
  disabled?: boolean
  badge?: React.ReactNode
  hint?: string
  /**
   * `data-guia` de esta pestaña, para que el tour de «Cómo se usa» pueda pararse encima.
   *
   * 🔑 La pestaña es el ancla ESTABLE de todo lo que vive adentro de ella: la tabla desaparece con
   * la lista vacía y media barra de botones sólo existe en algún estado, pero la pestaña está
   * siempre. Ver `lib/guia/core.ts`.
   */
  guia?: string
}

export type TabsProps = {
  items: TabItem[]
  value: string
  onChange: (key: string) => void
  variant?: 'pill' | 'underline'
  style?: React.CSSProperties
}

export function Tabs({ items, value, onChange, variant = 'pill', style }: TabsProps) {
  return (
    <div
      role="tablist"
      style={{
        display: 'flex', flexWrap: 'wrap', gap: variant === 'pill' ? space[2] : space[4],
        borderBottom: variant === 'underline' ? `1px solid ${color.line}` : undefined,
        ...style,
      }}
    >
      {items.map((it) => {
        const active = it.key === value
        const off = !!it.disabled
        const pill: React.CSSProperties = {
          fontSize: font.base, fontWeight: weight.semibold, padding: '7px 14px', borderRadius: radius.md,
          border: `1px solid ${active ? color.brandBorder : color.line}`,
          background: active ? color.brandBg : color.surface,
          color: active ? color.brand : off ? color.mut2 : color.mut,
          cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.7 : 1,
        }
        const underline: React.CSSProperties = {
          fontSize: font.base, fontWeight: weight.semibold, padding: '8px 2px', background: 'transparent', border: 'none',
          borderBottom: `2px solid ${active ? color.brandBorder : 'transparent'}`,
          color: active ? color.brand : off ? color.mut2 : color.mut,
          cursor: off ? 'not-allowed' : 'pointer', marginBottom: -1,
        }
        return (
          <button
            key={it.key} role="tab" aria-selected={active} disabled={off} title={it.hint} data-guia={it.guia}
            onClick={() => !off && onChange(it.key)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...(variant === 'pill' ? pill : underline) }}
          >
            {it.label}
            {it.badge != null && <span style={{ fontSize: font.xs, color: active ? color.brand : color.mut2 }}>{it.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
