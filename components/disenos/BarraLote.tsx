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

import type { EstadoDiseno } from '@/lib/disenos/tipos'
import { Button, color, radius, space } from '@/components/ui'

/**
 * Los botones dicen la ACCIÓN, no el estado. `DB_ESTADOS` tiene los rótulos de las columnas
 * («Confirmados», «Rechazados»), y usarlos acá dejaba un botón que decía «Rechazados» — un
 * sustantivo en plural donde tiene que haber un verbo, y encima idéntico al chip del filtro que
 * está tres centímetros más arriba y hace otra cosa.
 */
const MOVER: { k: EstadoDiseno; verbo: (n: number) => string; ico: string }[] = [
  { k: 'confirmado', ico: '✅', verbo: (n) => (n === 1 ? 'Confirmar el elegido' : `Confirmar los ${n}`) },
  { k: 'duda', ico: '🤔', verbo: () => 'Pasar a duda' },
  { k: 'rechazado', ico: '❌', verbo: () => 'Rechazar' },
]

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
      {MOVER.map((m) => (
        <Button key={m.k} size="sm" variant="outline" onClick={() => onEstado(m.k)}>
          {m.ico} {m.verbo(n)}
        </Button>
      ))}
      <Button size="sm" variant="ghost" tone="danger" onClick={onQuitar}>
        {/* ⚠️ Decía «Quitar», y el diálogo que abre ya decía «Sacar» en el título, en el botón y
            en el mensaje: el disparador y la confirmación nombraban el mismo gesto distinto.
            `VOCABULARIO.md` §1.1 → **Sacar**, porque el diseño sigue existiendo y sus votos quedan. */}
        Sacar {n === 1 ? 'el elegido' : 'los ' + n}
      </Button>
      <Button size="sm" variant="ghost" onClick={onLimpiar} style={{ marginLeft: 'auto' }}>
        Deseleccionar
      </Button>
    </div>
  )
}
