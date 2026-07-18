/**
 * Tipos de Cupones, contra la forma REAL que guarda el legacy en el KV
 * (`kind=cupones`, forma `{cupones:[...]}`, index.html:10712-10723). Un cupón es un
 * descuento nominal por cliente que la empleada del local busca por nombre y aplica
 * al cobrar; no toca la tienda online.
 */

export type TipoDescuento = 'porcentaje' | 'monto'

/**
 * Estado derivado (nunca se persiste). El orden de precedencia importa: anulado
 * gana sobre todo; usado sólo aplica a cupones de un solo uso; después vence.
 */
export type EstadoCupon = 'vigente' | 'porvencer' | 'vencido' | 'usado' | 'anulado'

export type Cupon = {
  id: string
  nombre: string
  telefono?: string
  tipo: TipoDescuento
  valor: number
  codigo?: string
  minimo?: number
  motivo?: string
  /** Un solo uso: se marca como usado al aplicarlo. Si es false, es reutilizable. */
  unSoloUso: boolean
  /** YYYY-MM-DD. */
  vence: string
  fechaCreado: string
  creadoPor: string
  usado: boolean
  usadoFecha: string
  anulado: boolean
}

export type FiltroCupon = 'vigentes' | 'porvencer' | 'usados' | 'vencidos' | 'todos'
