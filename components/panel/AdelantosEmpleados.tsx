'use client'

/**
 * La ficha de adelantos de sueldo, por empleado — lo que faltaba el 28-sep-2026: a Candela se le
 * habían mandado tres transferencias de mayoristas y no quedaba *cuánto, qué día ni qué cliente*.
 *
 * Cada empleado dice cuánto se le adelantó que **todavía no entró en un sueldo** (el número que se
 * mira), y abajo cada transferencia: el día, el monto, quién la puso y si ya entró en la nómina.
 *
 * 🔑 "Ya entró en el sueldo de septiembre" lo dice el DASHBOARD, no este lado: se lee cada vez.
 * Con el dashboard caído no se inventa — se dice que no se sabe.
 */

import { Button } from '@/components/ui'
import { color, font, space } from '@/components/ui/tokens'
import { mostrar as plata } from '@/lib/compromisos/core'
import { nombreDelMes, type AdelantosDeEmpleado, type LineaAdelanto } from '@/lib/adelantos/core'

/** '2026-09-15' → '15/9', partido a mano: pasado a `Date` se lee UTC y muestra el día anterior. */
function dia(iso: string | null | undefined): string {
  if (!iso) return ''
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)}/${Number(m)}`
}

function estadoDeLinea(l: LineaAdelanto, hoy: string, sinDashboard: boolean): string {
  if (sinDashboard) return 'no se sabe si ya entró en un sueldo'
  if (l.aplicado <= 0.005) return `para el sueldo de ${nombreDelMes(l.compromiso.mes_sueldo ?? '', hoy)}, sin liquidar`
  const en = l.meses.map((m) => nombreDelMes(m, hoy)).join(' y ')
  return l.pendiente > 0.005
    ? `${plata(l.aplicado)} en el sueldo de ${en}; ${plata(l.pendiente)} pasan al siguiente`
    : `en el sueldo de ${en}`
}

export function AdelantosEmpleados({ grupos, hoy, sinDashboard, puedeCancelar, onCancelar, margen }: {
  grupos: AdelantosDeEmpleado[]
  hoy: string
  /** El dashboard no contestó: no se sabe qué entró en un sueldo. */
  sinDashboard: boolean
  puedeCancelar: boolean
  /** Cancelar un adelanto confirmado por error. El servidor lo frena si ya entró en un sueldo. */
  onCancelar: (l: LineaAdelanto) => void
  margen: number
}) {
  if (grupos.length === 0) return null

  return (
    <section style={{ marginBottom: space[3] }}>
      <div style={{ padding: `0 ${margen}px 6px`, fontSize: font.xs, fontWeight: 700, color: color.mut, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Adelantos de sueldo
      </div>
      {grupos.map((g) => (
        <div key={g.empleadoId} style={{ background: color.surface, borderTop: `1px solid ${color.line2}`, padding: `${space[2]}px ${margen}px` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink }}>{g.nombre}</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: font.md, fontWeight: 700, color: color.ink, fontVariantNumeric: 'tabular-nums' }}>
                {sinDashboard ? '—' : plata(g.pendiente)}
              </div>
              <div style={{ fontSize: font.xs, color: color.mut2 }}>sin liquidar</div>
            </div>
          </div>

          {g.pedido > 0 && (
            <div style={{ fontSize: font.xs, color: color.mut2, marginTop: 2 }}>
              Y {plata(g.pedido)} pedidos a clientes que todavía no se acreditaron.
            </div>
          )}

          {g.lineas.map((l) => (
            <div key={l.compromiso.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6, fontSize: font.sm }}>
              <div style={{ width: 38, flexShrink: 0, color: color.mut2, fontVariantNumeric: 'tabular-nums' }}>
                {dia(l.compromiso.fecha_acreditado)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <b style={{ color: color.ink, fontVariantNumeric: 'tabular-nums' }}>{plata(l.monto)}</b>
                  <span style={{ color: color.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    de {l.compromiso.cliente_nombre}
                  </span>
                </div>
                <div style={{ fontSize: font.xs, color: color.mut2 }}>{estadoDeLinea(l, hoy, sinDashboard)}</div>
              </div>
              {puedeCancelar && !sinDashboard && l.aplicado <= 0.005 && (
                <Button size="sm" variant="ghost" onClick={() => onCancelar(l)}>Cancelar</Button>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
