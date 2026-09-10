'use client'

/**
 * La ⭐ **general** de un producto, para la fila de Análisis → Por producto.
 *
 * 🔑 **Es otra pregunta que la ⭐ de una campaña**, aunque el botón sea el mismo. Ésta dice «este
 * producto es de los nuestros», y sigue valiendo para la campaña que venga; la de la campaña dice
 * «de esta feria, comunicá éste». Un básico barato puede ser la estrella de una liquidación al
 * costo y no serlo nunca más. El porqué de que sean dos alcances y una sola tabla está en
 * `sql/migrate-destacados.sql`.
 *
 * Vive acá y ⛔ no en `components/productos/` por lo mismo que `MarcaClavado`: **esa tabla es del
 * repo compartido con Darío**, y desde allá esto entra en una línea.
 */

import { Estrella } from './Estrella'
import { useToast } from '@/components/ui'
import type { Destacados } from './useDestacados'

export function MarcaEstrella({
  p,
  destacados,
}: {
  p: { id: number | string; name?: string; sku?: string | null }
  destacados: Destacados
}) {
  const toast = useToast()
  const pid = String(p.id)
  const marcado = destacados.porProducto.get(pid) || null

  return (
    <Estrella
      marcado={marcado}
      nombre={p.name || pid}
      titulo="(vale para todas las campañas)"
      onAlternar={async () => {
        try {
          await destacados.alternar({ id: p.id, nombre: p.name ?? null, sku: p.sku ?? null })
          toast.ok(marcado
            ? 'Le sacamos la estrella.'
            : 'Marcado como producto estrella. Se ve acá y en las listas de precios.')
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'No se pudo guardar la estrella.')
        }
      }}
    />
  )
}
