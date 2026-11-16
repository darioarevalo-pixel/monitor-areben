'use client'

import { color, font } from '@/components/ui/tokens'

/** Un renglón plegado de «Más del cliente»: el título, la cantidad y ›; tocarlo abre lo de adentro. */
export function Pliegue({ titulo, cantidad, abierto, onTocar, children }: { titulo: string; cantidad: string; abierto: boolean; onTocar: () => void; children?: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${color.line2}` }}>
      <button type="button" onClick={onTocar} aria-expanded={abierto}
        style={{ display: 'flex', width: '100%', height: 'auto', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 0', background: 'none', border: 0, cursor: 'pointer', fontSize: font.sm, color: 'inherit', textAlign: 'left' }}>
        <span>{titulo}</span><span style={{ fontSize: font.xs, color: color.mut2, whiteSpace: 'nowrap' }}>{cantidad} {abierto ? '⌄' : '›'}</span>
      </button>
      {abierto && <div style={{ paddingBottom: 8 }}>{children}</div>}
    </div>
  )
}
