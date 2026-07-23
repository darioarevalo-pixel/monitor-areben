'use client'

/** Toolbar — fila de acciones/filtros (flex, gap, wrap, alineado). */
import { space } from '@/components/ui/tokens'

export type ToolbarProps = {
  children: React.ReactNode
  justify?: 'start' | 'between'
  gap?: keyof typeof space
  style?: React.CSSProperties
}

export function Toolbar({ children, justify = 'start', gap = 2, style }: ToolbarProps) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space[gap],
        justifyContent: justify === 'between' ? 'space-between' : 'flex-start',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
