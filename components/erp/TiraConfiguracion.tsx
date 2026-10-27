'use client'

/**
 * La tira de Configuración (decisión 12, tablero 6 del v8): cómo encajan cuenta · medio · ruta · regla. Va arriba de
 * Cuentas, Rutas y Reglas, con la de la pestaña en oscuro; cada pieza lleva a su pestaña (el medio ⛔ tiene una).
 */

import { color, font, weight } from '@/components/ui'

export type PiezaConfiguracion = 'cuentas' | 'rutas' | 'reglas'

const PIEZAS: Array<{ k: string; titulo: string; nota: string; va?: PiezaConfiguracion }> = [
  { k: 'cuenta', titulo: 'Cuenta', nota: 'dónde cae la plata (las del dashboard)', va: 'cuentas' },
  { k: 'medio', titulo: 'Medio', nota: 'con qué paga el cliente' },
  { k: 'ruta', titulo: 'Ruta', nota: 'qué cuenta recibe cada medio', va: 'rutas' },
  { k: 'regla', titulo: 'Regla de cobro', nota: 'el descuento o recargo del medio', va: 'reglas' },
]

export function TiraConfiguracion({ activa, ir }: { activa: PiezaConfiguracion; ir?: (p: PiezaConfiguracion) => void }) {
  return (
    <div role="list" aria-label="Cómo encajan cuenta, medio, ruta y regla" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {PIEZAS.map((p) => {
        const on = p.va === activa
        const caja: React.CSSProperties = {
          flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 14px', borderRadius: 10, textAlign: 'left',
          fontFamily: 'inherit', background: on ? 'var(--mo-brand-solid)' : color.surface, border: `1px solid ${on ? 'var(--mo-brand-solid)' : color.line}`,
        }
        const contenido = (
          <>
            <span style={{ fontWeight: weight.bold, color: on ? '#fff' : color.ink }}>{p.titulo}</span>
            <span style={{ fontSize: font.sm, color: on ? '#94a3b8' : color.mut }}>{p.nota}</span>
          </>
        )
        return p.va && !on && ir
          ? <button key={p.k} type="button" role="listitem" onClick={() => ir(p.va!)} style={{ ...caja, height: 'auto', cursor: 'pointer' }}>{contenido}</button>
          : <div key={p.k} role="listitem" aria-current={on || undefined} style={caja}>{contenido}</div>
      })}
    </div>
  )
}
