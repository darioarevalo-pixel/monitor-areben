/**
 * Tipos del dominio Sesión de fotos, escritos contra la forma REAL que guarda el
 * legacy en el KV (`kind=sesionfotos`, index.html:9900-9923), no idealizados: los
 * campos opcionales lo son porque en el KV hay solicitudes viejas sin ellos.
 *
 * Una solicitud es un retiro de productos para fotografiar. El eje del módulo es
 * que el retiro es reversible: sale (venta en GN o control a mano), se fotografía
 * y vuelve (devolución). Por eso cada ítem se cuenta dos veces —preparado y
 * devuelto— y la solicitud no cierra hasta que volvió todo.
 */

/** Ubicación física de la que se retira una variante. */
export type Origen = 'deposito' | 'local'

/**
 * El ciclo de vida de una solicitud. El estado avanza casi siempre solo: al
 * completar el escaneo de preparado → `preparada`; al crear las ventas en GN →
 * `cargada`; al completar la devolución → `devuelta`; cuando GN confirma que la
 * venta se anuló → `cerrada`.
 */
export type EstadoSolicitud = 'pendiente' | 'preparada' | 'cargada' | 'devuelta' | 'cerrada'

/** Una venta creada en Gestión Nube por un origen de la solicitud. */
export type VentaGN = {
  id: number | string
  number?: number | string
  [k: string]: unknown
}

export type ItemSolicitud = {
  /** `pid_sid` para variantes reales; `bc_<barcode>` para nuevos; `man_<mid>` para los "a mano". */
  vid: string
  pid: string | null
  sid: string | null
  nombre: string
  variante: string
  sku: string
  qty: number
  origen: Origen
  /** Stock de sistema al momento de armar (informativo). */
  stockDep?: number
  stockLoc?: number
  /** Código de barras de un ítem escaneado que todavía no está en GN. */
  barcode?: string
  /** Producto escaneado que aún no existe en GN: se guarda por código de barras. */
  nuevo?: boolean
  /** Un `nuevo` todavía sin vincular a su producto de GN. */
  pendiente?: boolean
  /** Un `nuevo` ya vinculado a su producto de GN (apareció por barcode). */
  vinculado?: boolean
  /** Prenda sin código: control a mano, no genera venta ni toca stock. */
  manual?: boolean
}

/** Registro de un ítem quitado de la solicitud antes de crear las ventas. */
export type ItemEliminado = {
  vid: string
  pid: string | null
  nombre: string
  variante: string
  sku: string
  qty: number
  origen: Origen
  fecha: string
  por: string
  motivo: string
}

export type Solicitud = {
  id: string
  /** YYYY-MM-DD. */
  fecha: string
  /** Date.now() al crearla. */
  creado: number
  creadoPor: string
  descripcion: string
  estado: EstadoSolicitud
  items: ItemSolicitud[]
  /** Ventas creadas en GN, por origen. Su presencia marca "ya salió". */
  ventas?: Partial<Record<Origen, VentaGN>>
  /** Conteo de preparado por vid (fase retiro). */
  verif?: Record<string, number>
  /** Conteo de devolución por vid (fase devolución). */
  devuelto?: Record<string, number>
  eliminados?: ItemEliminado[]
}

/** Fase de verificación por escaneo. */
export type Fase = 'retiro' | 'devolucion'
