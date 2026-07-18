/**
 * Tipos del Conteo de Depósito. El ajuste es por DIFERENCIA (±), nunca absoluto: la
 * diferencia se congela al terminar cada producto (contado − sistema del momento en
 * que se abrió); al aplicar se relee el stock VIVO y `nuevo = vivo + dif`. La app
 * arma un Excel; el ajuste real en GN lo hace el operador subiéndolo a "Importar y
 * Ajustar". Port de index.html:11549-12021.
 */

export type EstadoProd = 'sin_iniciar' | 'en_progreso' | 'terminado'

export type CdepVariante = {
  vid: string
  sid: number | string
  size: string
  barcode?: string
  inventory_id: number | string | null
  esperado: number
}
export type CdepProducto = { pid: string; name: string; variants: CdepVariante[] }

export type EstadoDeProd = {
  estado: EstadoProd
  contado: Record<string, number>
  /** Sistema congelado (baseline) por vid, al abrir el producto. */
  snap: Record<string, number>
  /** Diferencia congelada (contado − snap) por vid, al terminar. */
  dif: Record<string, number>
  /** Sello local: ms del conteo de este producto (aún sin aplicar). */
  terminadoAt?: number
}
export type CdepState = Record<string, EstadoDeProd>

/** Una fila del ajuste (una variante con diferencia). */
export type FilaAjuste = {
  inventory_id: number | string
  product_code: string
  producto: string
  variante: string
  ubicacion: string
  barcode: string
  vivo: number
  dif: number
  nuevo: number
  sistema: number | null
  contado: number | null
}

export type ResumenAjuste = {
  mas: number
  menos: number
  lineas: number
  unidades_ajustadas: number
  hora_stock: string | null
  productos: { pid: string; nombre: string }[]
}

export type Preview = {
  rows: FilaAjuste[]
  resumen: ResumenAjuste
  /** Variantes con diferencia que NO se ajustan (stock no confiable). */
  missing: { prod: string; size: string }[]
  ubicacion: string
  store: string
}

/** Un conteo aplicado del historial (`/api/conteos-deposito`). */
export type ConteoHistorial = {
  fecha_aplicado?: string
  usuario?: string
  resumen?: Partial<ResumenAjuste>
  detalle?: Array<Record<string, unknown>>
}
