'use client'

/**
 * Paginacion — el pie de las tablas largas (productos, variantes…).
 *
 * Antes era `.pagination` del CSS legacy con dos botones de flecha sin etiqueta y el
 * conteo en el medio. Cambios: los botones dicen qué hacen, el total se lee primero
 * (que es el dato que se busca: cuántos hay), y en móvil se apila sin desbordarse.
 */
import { Button } from '@/components/ui/Button'
import { color, font, space } from '@/components/ui/tokens'

export function Paginacion({
  pagina,
  paginas,
  total,
  onCambiar,
  singular = 'registro',
  plural = 'registros',
}: {
  pagina: number
  paginas: number
  total: number
  onCambiar: (n: number) => void
  singular?: string
  plural?: string
}) {
  if (paginas <= 1) {
    return (
      <div style={{ marginTop: space[3], fontSize: font.sm, color: color.mut }}>
        {total.toLocaleString('es-AR')} {total === 1 ? singular : plural}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginTop: space[3] }}>
      <span style={{ fontSize: font.sm, color: color.mut }}>
        {total.toLocaleString('es-AR')} {total === 1 ? singular : plural} · página{' '}
        <b style={{ color: color.ink2 }}>{pagina}</b> de {paginas}
      </span>
      <div style={{ display: 'flex', gap: space[2], marginLeft: 'auto' }}>
        <Button size="sm" variant="outline" onClick={() => onCambiar(Math.max(1, pagina - 1))} disabled={pagina === 1}>
          ← Anterior
        </Button>
        <Button size="sm" variant="outline" onClick={() => onCambiar(Math.min(paginas, pagina + 1))} disabled={pagina === paginas}>
          Siguiente →
        </Button>
      </div>
    </div>
  )
}

/**
 * Barra chiquita bajo un número (stock). Reemplaza `.mini-bar` del CSS legacy.
 * `derecha` la alinea con el número en las columnas numéricas (que van a la derecha).
 */
export function MiniBar({ pct, tono, derecha }: { pct: number; tono: string; derecha?: boolean }) {
  return (
    <span style={{ display: 'block', height: 4, width: 60, borderRadius: 2, background: color.bg2, marginTop: 4, marginLeft: derecha ? 'auto' : undefined, overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', borderRadius: 2, width: `${Math.min(100, Math.max(0, pct))}%`, background: tono }} />
    </span>
  )
}
