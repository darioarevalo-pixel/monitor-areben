'use client'

/** Card / SectionCard — superficies del kit. */
import { forwardRef } from 'react'
import { color, radius, shadow, space, font, weight } from '@/components/ui/tokens'

export type CardProps = {
  padding?: keyof typeof space
  interactive?: boolean
} & React.HTMLAttributes<HTMLDivElement>

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card({ padding = 6, interactive, style, ...rest }, ref) {
  return (
    <div
      ref={ref}
      style={{
        background: color.surface,
        border: `1px solid ${color.line}`,
        borderRadius: radius['2xl'],
        boxShadow: shadow.sm,
        padding: space[padding],
        transition: interactive ? 'box-shadow .12s ease, border-color .12s ease' : undefined,
        ...style,
      }}
      {...rest}
    />
  )
})

export type SectionCardProps = {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  info?: React.ReactNode
} & CardProps

/** Card con header estandarizado: título + subtítulo + acciones (derecha) + slot info (InfoPopover). */
export function SectionCard({ title, subtitle, actions, info, children, ...rest }: SectionCardProps) {
  return (
    <Card {...rest}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[3], marginBottom: space[5] }}>
          <div style={{ minWidth: 0 }}>
            {title && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: font.xl, fontWeight: weight.bold, letterSpacing: -0.2, color: color.ink }}>
                {title}
                {info}
              </div>
            )}
            {subtitle && <div style={{ fontSize: font.sm, color: color.mut, marginTop: 3 }}>{subtitle}</div>}
          </div>
          {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      {children}
    </Card>
  )
}
