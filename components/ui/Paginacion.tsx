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
 * Una barra de progreso. **La única del kit**, y la que faltaba: el repo tenía seis dibujadas a
 * mano en el JSX de otras tantas secciones (`Embudo`, `Colores` ×2, `Talles`, `RankingCard`,
 * `DemandaCard`) más ésta, y la séptima se iba a escribir sola en cuanto una pantalla necesitara
 * una barra que fuera el punto de la tarjeta y no un adorno abajo de un número.
 *
 * `pct` se recorta a 0-100 acá adentro: la fuente natural es `avanceDeMeta().pct`, que ya viene
 * recortado, pero un porcentaje calculado a mano en el llamador no tiene por qué estarlo y una
 * barra que se sale del riel se ve como un bug de CSS.
 */
export function Barra({ pct, tono, alto = 4, ancho, style }: { pct: number; tono: string; alto?: number; ancho?: number | string; style?: React.CSSProperties }) {
  const radio = Math.max(2, Math.round(alto / 2))
  return (
    <span style={{ display: 'block', height: alto, width: ancho ?? '100%', borderRadius: radio, background: color.bg2, overflow: 'hidden', ...style }}>
      <span style={{ display: 'block', height: '100%', borderRadius: radio, width: `${Math.min(100, Math.max(0, pct))}%`, background: tono }} />
    </span>
  )
}

/**
 * Barra chiquita bajo un número (stock). Reemplaza `.mini-bar` del CSS legacy.
 * `derecha` la alinea con el número en las columnas numéricas (que van a la derecha).
 *
 * Es `Barra` con la geometría de siempre (4×60): sus once llamadores dependen de ese tamaño fijo,
 * así que el parámetro no sube a ellos.
 */
export function MiniBar({ pct, tono, derecha }: { pct: number; tono: string; derecha?: boolean }) {
  return <Barra pct={pct} tono={tono} alto={4} ancho={60} style={{ marginTop: 4, marginLeft: derecha ? 'auto' : undefined }} />
}
