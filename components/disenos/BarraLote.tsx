'use client'

/**
 * La barra de decidir en lote. Aparece pegada abajo apenas hay algo elegido.
 *
 * 🔑 **Es el verbo que faltaba.** Medido el 24-ago-2026: los 37 diseños de BDI estaban los 37 en
 * "Por revisar" — 10 personas habían votado 34 de ellos con un ranking limpio de 5,00 a 1,29, y no
 * se había movido ni uno solo a Confirmado. Con un botón por tarjeta, cerrar la ronda son 37
 * punterías; nadie las hace.
 *
 * ⚠️ Las tres de mover estado NO piden confirmación: son reversibles con un clic y pedir permiso
 * cada vez es lo que hace que la gente deje de usar el lote. Quitar sí, porque saca del tablero
 * para todo el equipo.
 */

import { DB_ESTADOS, type EstadoDiseno } from '@/lib/disenos/tipos'
import { Button, color, radius, space } from '@/components/ui'

const MOVER: EstadoDiseno[] = ['confirmado', 'duda', 'rechazado']

export function BarraLote({ n, onEstado, onQuitar, onLimpiar }: { n: number; onEstado: (e: EstadoDiseno) => void; onQuitar: () => void; onLimpiar: () => void }) {
  if (!n) return null
  return (
    <div
      style={{
        position: 'sticky',
        bottom: 0,
        zIndex: 20,
        marginTop: space[3],
        display: 'flex',
        alignItems: 'center',
        gap: space[2],
        flexWrap: 'wrap',
        padding: space[3],
        background: color.brandBg,
        border: `1px solid ${color.brandBorder}`,
        borderRadius: radius.lg,
      }}
    >
      <b style={{ fontSize: 13, color: color.brand }}>
        {n} {n === 1 ? 'elegido' : 'elegidos'}
      </b>
      {MOVER.map((k) => {
        const e = DB_ESTADOS.find((x) => x.k === k)!
        return (
          <Button key={k} size="sm" variant="outline" onClick={() => onEstado(k)}>
            {e.ico} {k === 'confirmado' ? `Confirmar ${n === 1 ? 'el elegido' : 'los ' + n}` : e.lbl}
          </Button>
        )
      })}
      <Button size="sm" variant="ghost" tone="danger" onClick={onQuitar}>
        Quitar {n === 1 ? 'el elegido' : 'los ' + n}
      </Button>
      <Button size="sm" variant="ghost" onClick={onLimpiar} style={{ marginLeft: 'auto' }}>
        Deseleccionar
      </Button>
    </div>
  )
}
