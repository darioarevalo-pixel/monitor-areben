'use client'

/**
 * FaseBadge — la etiqueta de estado del ciclo de vida de un producto o variante
 * (nuevo / crecimiento / madurez / declive / dormido / obsoleto).
 *
 * El ETL devuelve la fase con una clase CSS del legacy (`badge-success`, `badge-warning`…)
 * en `lib/etl/helpers.ts`. Ese acoplamiento entre la lógica y una clase de CSS es de la
 * época del iframe; como no se toca `lib/` en el rediseño (los tests de paridad dependen
 * de esos valores), la traducción a un `Tone` del kit se hace acá, en la capa de vista,
 * que es donde corresponde.
 */
import { Badge } from '@/components/ui/Badge'
import type { Tone } from '@/components/ui/tokens'

const POR_CLASE: Record<string, Tone> = {
  'badge-success': 'success',
  'badge-warning': 'warning',
  'badge-danger': 'danger',
  'badge-info': 'action',
  'badge-gray': 'neutral',
}

export function toneDeFase(cls: string): Tone {
  return POR_CLASE[cls] ?? 'neutral'
}

export function FaseBadge({ fase }: { fase: { label: string; cls: string } }) {
  return (
    <Badge tone={toneDeFase(fase.cls)} subtle>
      {fase.label}
    </Badge>
  )
}
