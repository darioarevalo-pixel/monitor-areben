'use client'

/**
 * Los botones de una fila. Los usan la tabla de campañas y la de conjuntos, con las mismas reglas.
 *
 * Qué se dibuja y qué no:
 *  - **Reactivar** aparece en lo que está pausado; **Pausar**, en lo que está entregando.
 *  - **Presupuesto** sólo donde hay un diario propio que tocar. Si el presupuesto está a nivel
 *    campaña (CBO) o es un total (lifetime), no se dibuja: sería un botón que Meta rechaza.
 *  - `inerte` es el caso de las publicaciones de Instagram promocionadas: figuran ACTIVE para
 *    siempre y no entregan nada hace meses. Son cientos, y llenarlas de botones taparía las cinco
 *    campañas que se llevan la plata. Se dice por qué en el `title` en vez de esconderlo.
 */

import { Button, color, space } from '@/components/ui'
import type { Acciones, ObjetoMeta } from '@/components/meta-ads/acciones/tipos'

export function BotonesAccion({ objeto, estado, diarioCrudo, sinPresupuesto, inerte, acciones }: {
  objeto: ObjetoMeta
  estado: string | null
  diarioCrudo: number
  /** El presupuesto no vive en este objeto (CBO en la campaña, o presupuesto total). */
  sinPresupuesto?: boolean
  /** Por qué este objeto no ofrece acciones aunque figure activo. */
  inerte?: string | null
  acciones: Acciones
}) {
  const activo = estado === 'ACTIVE'
  const puedeEstado = acciones.puede('estado', objeto.linea)
  const puedePresupuesto = acciones.puede('presupuesto', objeto.linea)
  const puedeNombre = acciones.puede('nombre', objeto.linea)
  // Un aviso no se duplica: la copia de un aviso suelto no tiene dónde entregar. Lo dice la tabla de
  // acciones (`niveles`) y acá se respeta en vez de repetir el criterio.
  const puedeDuplicar = objeto.nivel !== 'aviso' && acciones.puede('duplicar', objeto.linea)
  // Sólo desde un conjunto: es de donde se lee la segmentación. Pide el mismo permiso que duplicar,
  // porque hace lo mismo —crear objetos en Meta— y un sub propio sería una tilde más que dar.
  const puedeCrear = objeto.nivel === 'conjunto' && acciones.puede('duplicar', objeto.linea)
  const trabajando = acciones.enCurso === objeto.id

  if (!puedeEstado && !puedePresupuesto && !puedeNombre && !puedeDuplicar && !puedeCrear) return <span style={{ color: color.mut2 }}>—</span>
  if (activo && inerte) return <span style={{ color: color.mut2 }} title={inerte}>—</span>

  return (
    <div style={{ display: 'flex', gap: space[1], flexWrap: 'wrap' }}>
      {puedeEstado && (
        <Button
          size="sm"
          variant="ghost"
          disabled={trabajando}
          onClick={() => acciones.onEstado(objeto, estado)}
        >
          {trabajando ? '…' : activo ? 'Pausar' : 'Reactivar'}
        </Button>
      )}
      {puedePresupuesto && !sinPresupuesto && diarioCrudo > 0 && (
        <Button
          size="sm"
          variant="ghost"
          disabled={trabajando}
          onClick={() => acciones.onPresupuesto(objeto, diarioCrudo)}
        >
          Presupuesto
        </Button>
      )}
      {puedeDuplicar && (
        <Button
          size="sm"
          variant="ghost"
          disabled={trabajando}
          onClick={() => acciones.onDuplicar(objeto, diarioCrudo, !!sinPresupuesto)}
          title="Crea una copia pausada, con sus conjuntos y avisos, y le pone el nombre y el presupuesto que le digas"
        >
          Duplicar
        </Button>
      )}
      {puedeCrear && (
        <Button
          size="sm"
          variant="ghost"
          disabled={trabajando}
          onClick={() => acciones.onCrear(objeto, diarioCrudo)}
          title="Crea una campaña NUEVA, pausada, con esta misma segmentación y estos mismos avisos. Duplicar, en cambio, deja la copia adentro de la campaña actual"
        >
          Nueva campaña
        </Button>
      )}
      {/* Renombrar va último: es lo único de esta columna que no cambia lo que Meta hace, y ponerlo
          antes de Pausar le robaría el lugar de lectura al botón que sí mueve la entrega. */}
      {puedeNombre && (
        <Button
          size="sm"
          variant="ghost"
          disabled={trabajando}
          onClick={() => acciones.onNombre(objeto)}
          title="Cambia sólo el nombre. No toca la entrega ni el presupuesto"
        >
          Renombrar
        </Button>
      )}
    </div>
  )
}
