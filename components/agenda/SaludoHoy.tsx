'use client'

/**
 * El encabezado de «Hoy» como en la maqueta del celular (Darío, 19-oct-2026): «Hola, Lorena», la
 * fecha, y un anillo con cuántas hizo de cuántas. Al completar todas, el anillo pasa a verde.
 *
 * Las cuentas salen de `pendientesDe`, la misma lista que se tilda abajo: el anillo y la lista ⛔ no
 * pueden discrepar.
 */

import { color, font, space, weight } from '@/components/ui'
import { fechaLarga } from '@/lib/inicio/core'

export function SaludoHoy({ nombre, hechas, total }: { nombre: string; hechas: number; total: number }) {
  const pct = total ? Math.round((hechas / total) * 100) : 0
  const lleno = total > 0 && hechas === total
  const fecha = fechaLarga()
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3],
      borderBottom: `1px solid ${color.line}`, paddingBottom: space[3],
    }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ fontSize: font['2xl'], fontWeight: weight.bold, color: color.ink, letterSpacing: -0.2, margin: 0 }}>
          Hola, {nombre}
        </h2>
        <p style={{ fontSize: font.base, color: color.mut, marginTop: 2 }}>
          {fecha.charAt(0).toUpperCase() + fecha.slice(1)}
        </p>
      </div>
      {total > 0 && (
        <div
          role="img"
          aria-label={`${hechas} de ${total} tareas hechas`}
          style={{
            width: 54, height: 54, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center',
            background: `conic-gradient(${lleno ? color.success : color.brandSolid} ${pct}%, ${color.bg2} 0)`,
          }}
        >
          <span style={{
            width: 42, height: 42, borderRadius: '50%', background: color.bg, display: 'grid', placeItems: 'center',
            fontSize: font.sm, fontWeight: weight.bold, color: color.ink, fontVariantNumeric: 'tabular-nums',
          }}>
            {hechas}/{total}
          </span>
        </div>
      )}
    </header>
  )
}
