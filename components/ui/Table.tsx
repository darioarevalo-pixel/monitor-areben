'use client'

/**
 * Table — primitivas componibles de tabla.
 *
 * La forma vive en `.mo-table` (kit.css), que es lo que permite lo que antes no se podía
 * con estilos inline: **cabecera pegajosa** (`position: sticky` sobre el scroll del
 * wrapper) y densidad por token (`--mo-row-h`: 38px en compu, 44px en móvil). Con
 * planillas de 500 filas, perder los nombres de columna al scrollear era el defecto más
 * caro de la app.
 *
 * `maxHeight` en TableWrap activa el scroll interno; sin él la tabla crece y el sticky
 * se apoya en el scroll de la página.
 */

export function TableWrap({ children, maxHeight, style }: { children: React.ReactNode; maxHeight?: number | string; style?: React.CSSProperties }) {
  return (
    <div
      className="mo-tablewrap"
      style={{ ...(maxHeight != null ? ({ '--mo-table-max': typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight } as React.CSSProperties) : null), ...style }}
    >
      <table className="mo-table">{children}</table>
    </div>
  )
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead>{children}</thead>
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>
}

export function Tr({ children, onClick, style }: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <tr onClick={onClick} className={onClick ? 'mo-tr--click' : undefined} style={style}>
      {children}
    </tr>
  )
}

export type ThProps = {
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
  width?: number | string
  /** Cabecera clickeable para ordenar: cambia el cursor y el hover. */
  onClick?: () => void
  /** Dirección actual del orden por esta columna (dibuja la flecha). */
  sort?: 'asc' | 'desc' | null
  style?: React.CSSProperties
}

export function Th({ children, align = 'left', width, onClick, sort, style }: ThProps) {
  return (
    <th
      className={onClick ? 'mo-th--sortable' : undefined}
      onClick={onClick}
      aria-sort={sort ? (sort === 'asc' ? 'ascending' : 'descending') : undefined}
      style={{ textAlign: align, width, ...style }}
    >
      {children}
      {sort && <span aria-hidden style={{ marginLeft: 4, opacity: 0.8 }}>{sort === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

export type TdProps = {
  children?: React.ReactNode
  align?: 'left' | 'right' | 'center'
  mono?: boolean
  wrap?: boolean
  strong?: boolean
  /** Alto libre: para celdas que hospedan un input o dos líneas de texto. */
  tall?: boolean
  colSpan?: number
  style?: React.CSSProperties
}

export function Td({ children, align = 'left', mono, wrap, strong, tall, colSpan, style }: TdProps) {
  return (
    <td
      colSpan={colSpan}
      className={[align === 'right' ? 'mo-td--num' : '', strong ? 'mo-td--strong' : '', wrap ? 'mo-td--wrap' : '', tall ? 'mo-td--tall' : '']
        .filter(Boolean)
        .join(' ')}
      style={{
        textAlign: align,
        whiteSpace: wrap ? undefined : 'nowrap',
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        ...style,
      }}
    >
      {children}
    </td>
  )
}
