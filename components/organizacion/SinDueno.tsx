'use client'

/**
 * **Sin dueño** — lo que ningún nombre reclamó, agrupado por sector.
 *
 * 🔑 **El orden es por sector y, adentro, por el más viejo primero.** Un gris no se resuelve solo y
 * el que lleva más tiempo escrito es el que ya se cobró algo: dejarlo en el orden de carga lo
 * esconde detrás de los recién anotados.
 *
 * 🔴 **Y dice «anotado el …», ⛔ NUNCA «sin dueño hace …».** No es lo mismo y no tenemos el segundo
 * dato: `created_at` dice cuándo se escribió la fila, no desde cuándo está huérfana — si a algo se
 * le sacó la dueña ayer, la fila puede ser de hace tres meses. Poner «hace 3 meses sin dueño» sería
 * inventar una espera que nadie midió. [[feedback_areben_updated_at_no_mide_la_espera]]
 */

import { grises, type Responsabilidad } from '@/lib/organizacion/tipos'
import { Renglon } from './FichaPersona'
import { FUNCIONES } from '@/lib/permisos'
import { Button, EmptyState, Notice, color, font, space, weight } from '@/components/ui'

export function SinDueno({ filas, manuales, puedeEditar, onEditar, onEliminar, onNuevo }: {
  filas: Responsabilidad[]
  manuales: { id: string; titulo: string; publicado: boolean }[]
  puedeEditar: boolean
  onEditar: (r: Responsabilidad) => void
  onEliminar: (r: Responsabilidad) => void
  onNuevo: () => void
}) {
  const todos = grises(filas)

  // 🔑 El vacío de acá NO es una felicitación. Que la lista esté vacía casi nunca significa que todo
  // tenga dueño: significa que nadie escribió lo que no lo tiene. Un «✅ todo cubierto» sería la
  // afirmación más cara de la pantalla.
  if (!todos.length) {
    return (
      <EmptyState
        title="No hay ninguno anotado."
        hint="⚠️ Que la lista esté vacía no dice que todo tenga dueño: dice que nadie anotó lo que no lo tiene. Un gris se carga como cualquier responsabilidad, dejando la persona en blanco."
        action={puedeEditar ? <Button size="sm" onClick={onNuevo}>Crear una sin dueña</Button> : undefined}
      />
    )
  }

  const porSector = FUNCIONES
    .map((f) => ({
      sector: f,
      filas: todos
        .filter((g) => g.sector === f.key)
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))),
    }))
    .filter((g) => g.filas.length)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[5] }}>
      <Notice tone="warning">
        {todos.length === 1
          ? 'Hay una cosa de la que el sector responde y ninguna persona reclamó.'
          : `Hay ${todos.length} cosas de las que un sector responde y ninguna persona reclamó.`}{' '}
        Se ven a propósito: un gris escondido es el que se cobra.
      </Notice>

      {porSector.map(({ sector, filas: gs }) => (
        <div key={sector.key}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], marginBottom: space[2] }}>
            <span style={{ fontSize: font.lg, fontWeight: weight.semibold, color: color.ink }}>{sector.label}</span>
            <span style={{ fontSize: font.sm, color: color.mut2 }}>{gs.length}</span>
          </div>
          {gs.map((g) => (
            <div key={g.id} style={{ borderLeft: `3px solid ${color.warningBorder}`, paddingLeft: space[3] }}>
              <Renglon
                fila={g}
                manuales={manuales}
                puedeEditar={puedeEditar}
                onEditar={onEditar}
                onEliminar={onEliminar}
              />
              {/* «Anotado el», ⛔ no «hace tanto sin dueño»: ver el encabezado. */}
              {g.created_at && (
                <div style={{ fontSize: font.xs, color: color.mut2, padding: `${space[1]}px 0 ${space[3]}px` }}>
                  Anotado el {new Date(g.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
                  {puedeEditar && <> · <button type="button" onClick={() => onEditar(g)} style={{ height: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: color.brand, fontSize: font.xs, fontWeight: weight.semibold }}>darle dueña</button></>}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
