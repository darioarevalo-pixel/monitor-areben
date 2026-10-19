'use client'

/**
 * ListaTrabajo — la lista del ERP (diseño aprobado 18-oct, `~/Documents/erp-monitor/diseno.md` §3–4): la pieza que más
 * se repite. Nació en el piloto de Ventas; Stock, Clientes y Productos salen con el mismo molde.
 *
 *  - **Encabezado fijo** al bajar (la lista scrollea adentro de su caja).
 *  - 🔴 **Todas las filas miden LO MISMO**: `width: 100%` + `min-width` = la suma de los MÍNIMOS de las columnas
 *    (`anchoMinimo`). ⛔ `max-content`: cada fila es su propia grilla y una columna `minmax(…, fr)` se estiraba con el
 *    texto de ESA fila ⇒ una venta con nombre largo corría el resto (la #348 de Zattia, captura de Bruno, 19-oct).
 *    ⛔ un `min-width` a ojo: con uno fijo los botones quedaban dibujados AFUERA, sobre blanco (captura de Bruno, 18-oct).
 *  - **Textos cortos ⛔ se parten**: cada celda es una línea con «…».
 *  - Clic en el título de una columna que ordena: ↓ ↑. Tilde a la izquierda ⇒ selección (la barra la pone quien usa).
 *  - **Íconos A LA IZQUIERDA** (listas de TRABAJO), en la primera columna después del tilde: `acciones(fila)`.
 *  - Clic en la fila ⇒ `onAbrir` (la ficha al costado: la lista ⛔ se pierde). Los botones de adentro ⛔ la abren.
 *  - Densidad: compacta 40 px · cómoda 52 px.
 */

import { color, font, radius, weight } from '@/components/ui/tokens'

export type ColumnaLista = {
  key: string
  titulo: string
  /** Ancho en la grilla: '92px', 'minmax(170px, 1.2fr)'… */
  ancho: string
  ordena?: boolean
  derecha?: boolean
}

export type OrdenLista = { col: string; dir: 'asc' | 'desc' } | null

const HUECO = 10
const RELLENO = 16

/**
 * El ancho mínimo de una fila: la suma de lo mínimo de cada columna (`'92px'` ⇒ 92, `'minmax(170px, 1.2fr)'` ⇒ 170) +
 * los huecos + el relleno. Un ancho que ⛔ se sabe medir (`1fr`, `auto`) es un error: ésa es la columna que se estira.
 */
export function anchoMinimo(anchos: string[]): number {
  const suma = anchos.reduce((a, w) => {
    const m = /^(?:minmax\(\s*)?(\d+(?:\.\d+)?)px\b/.exec(w.trim())
    if (!m) throw new Error(`ListaTrabajo: el ancho «${w}» no tiene mínimo en px (usar '92px' o 'minmax(92px, 1fr)').`)
    return a + Number(m[1])
  }, 0)
  return suma + HUECO * Math.max(0, anchos.length - 1) + RELLENO
}

export function ListaTrabajo<T>({
  columnas, filas, claveDe, celda, acciones, anchoAcciones = 132, seleccion, onSeleccion, orden, onOrden,
  densidad = 'compacta', activa, onAbrir, etiquetaFila, vacio, maxAlto = 'calc(100vh - 260px)',
}: {
  columnas: ColumnaLista[]
  filas: T[]
  claveDe: (f: T) => string
  celda: (f: T, col: string) => React.ReactNode
  /** Los íconos de la fila (izquierda). Sin la prop, la columna ⛔ se dibuja. */
  acciones?: (f: T) => React.ReactNode
  anchoAcciones?: number
  seleccion?: Set<string>
  onSeleccion?: (s: Set<string>) => void
  orden?: OrdenLista
  onOrden?: (o: OrdenLista) => void
  densidad?: 'compacta' | 'comoda'
  /** La fila con la ficha abierta (se pinta). */
  activa?: string | null
  onAbrir?: (f: T) => void
  /** Cómo se nombra la fila para el lector de pantalla y el tilde («Venta #301»). */
  etiquetaFila: (f: T) => string
  vacio?: React.ReactNode
  maxAlto?: number | string
}) {
  const conTilde = !!onSeleccion
  const anchos = [conTilde ? '36px' : null, acciones ? `${anchoAcciones}px` : null, ...columnas.map((c) => c.ancho)].filter((x): x is string => !!x)
  const plantilla = anchos.join(' ')
  const alto = densidad === 'comoda' ? 52 : 40
  const grilla: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: plantilla, columnGap: HUECO, alignItems: 'center',
    // 🔴 todas las filas del mismo ancho (ver arriba): ⛔ `max-content`.
    width: '100%', minWidth: anchoMinimo(anchos), boxSizing: 'border-box', padding: '0 12px 0 4px', whiteSpace: 'nowrap',
  }
  const todas = filas.length > 0 && !!seleccion && filas.every((f) => seleccion.has(claveDe(f)))
  const alternar = (k: string) => {
    if (!seleccion || !onSeleccion) return
    const s = new Set(seleccion)
    if (s.has(k)) s.delete(k)
    else s.add(k)
    onSeleccion(s)
  }
  const ordenar = (c: ColumnaLista) => {
    if (!c.ordena || !onOrden) return
    const act = orden?.col === c.key
    onOrden({ col: c.key, dir: act && orden?.dir === 'desc' ? 'asc' : 'desc' })
  }

  return (
    <div role="table" aria-rowcount={filas.length} style={{ overflow: 'auto', maxHeight: maxAlto, position: 'relative' }}>
      <div role="row" style={{ ...grilla, height: 38, position: 'sticky', top: 0, zIndex: 3, background: 'var(--mo-bg)', borderBottom: `1px solid ${color.line}`, fontSize: font.sm, fontWeight: weight.semibold, color: color.mut }}>
        {conTilde && (
          <span role="columnheader" style={{ display: 'grid', placeItems: 'center' }}>
            <input
              type="checkbox" aria-label={todas ? 'Soltar todas' : 'Elegir todas'} checked={todas}
              onChange={() => onSeleccion!(todas ? new Set() : new Set(filas.map(claveDe)))}
            />
          </span>
        )}
        {acciones && <span role="columnheader"><span style={OCULTO}>Acciones</span></span>}
        {columnas.map((c) => {
          const act = orden?.col === c.key
          return (
            <span key={c.key} role="columnheader" aria-sort={act ? (orden!.dir === 'asc' ? 'ascending' : 'descending') : undefined} style={{ textAlign: c.derecha ? 'right' : 'left', minWidth: 0 }}>
              {c.ordena && onOrden ? (
                <button
                  type="button" onClick={() => ordenar(c)}
                  style={{ height: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'transparent', padding: 0, font: 'inherit', fontSize: font.sm, fontWeight: weight.semibold, cursor: 'pointer', color: act ? color.ink : color.mut }}
                >
                  {c.titulo}
                  <span aria-hidden style={{ fontSize: 11, color: act ? color.brand : color.mut2 }}>{act ? (orden!.dir === 'desc' ? '↓' : '↑') : '↕'}</span>
                </button>
              ) : c.titulo}
            </span>
          )
        })}
      </div>
      {!filas.length && vacio}
      {filas.map((f) => {
        const k = claveDe(f)
        const sel = !!seleccion?.has(k)
        const abierta = activa === k
        return (
          <div
            key={k} role="row" className="mo-lista-fila" aria-selected={sel || abierta}
            onClick={(e) => {
              // Lo que se aprieta ADENTRO de la fila (íconos, tilde, menú) ⛔ abre la ficha.
              if ((e.target as HTMLElement).closest('button, a, input, [role="menu"]')) return
              onAbrir?.(f)
            }}
            style={{ ...grilla, height: alto, borderBottom: `1px solid ${color.bg2}`, cursor: onAbrir ? 'pointer' : 'default', background: sel || abierta ? color.brandBg : undefined }}
          >
            {conTilde && (
              <span role="cell" style={{ display: 'grid', placeItems: 'center' }}>
                <input type="checkbox" aria-label={`Elegir ${etiquetaFila(f)}`} checked={sel} onChange={() => alternar(k)} />
              </span>
            )}
            {acciones && <span role="cell" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>{acciones(f)}</span>}
            {columnas.map((c) => (
              <span key={c.key} role="cell" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: c.derecha ? 'right' : 'left', fontVariantNumeric: 'tabular-nums' }}>
                {celda(f, c.key)}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}

const OCULTO: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }

/**
 * El ícono de una fila (28×28, sin borde): el gesto que se repite una vez por fila (VOCABULARIO §3.3), con su nombre
 * al pasar el mouse. `verde` = hay algo para hacer (saldo, facturada); apagado ⇒ dice por qué en el `title`.
 */
export function IconoFila({ children, label, onClick, verde, apagado }: {
  children: React.ReactNode
  label: string
  onClick?: () => void
  verde?: boolean
  apagado?: boolean
}) {
  return (
    <button
      type="button" aria-label={label} title={label} disabled={apagado} onClick={onClick}
      style={{
        // 🔴 height explícita: `.shell-content button` le fija la altura de un control (tests/boton-crudo-altura).
        height: 28, width: 28, padding: 0, display: 'inline-grid', placeItems: 'center', border: 0, borderRadius: radius.md,
        background: 'transparent', cursor: apagado ? 'default' : 'pointer',
        color: apagado ? color.line2 : verde ? 'var(--mo-success)' : color.mut2,
      }}
    >
      {children}
    </button>
  )
}
