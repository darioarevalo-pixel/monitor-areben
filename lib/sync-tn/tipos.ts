/**
 * Tipos del sync de ventas Tienda Nube → Gestión Nube (hoy: Stunned).
 *
 * `OrdenTN` y `VentaGN` son, literalmente, lo que devuelve
 * `bdi-catalogo/api/tiendanube-audit?ordenes=1` — el nombre de los campos se respeta para que no
 * haya una capa de traducción más donde perder algo.
 */

export type LineaTN = {
  product_id: number | string | null
  variant_id: number | string | null
  name?: string | null
  sku?: string | null
  quantity: number
  price?: number | string | null
}

export type OrdenTN = {
  id: number | string
  number: number | string
  cliente?: string | null
  total?: number | string | null
  /** ISO con offset de Buenos Aires, tal como lo manda TN. */
  fecha?: string | null
  subtotal?: number | null
  descuento_total?: number | null
  descuento_cupon?: number | null
  descuento_pago?: number | null
  envio_costo_cliente?: number | null
  pago_metodo?: string | null
  pago_gateway?: string | null
  /** 'paid' | 'pending' | 'authorized' | 'refunded' | … */
  estado_pago?: string | null
  /** 'open' | 'closed' | 'cancelled' */
  estado_orden?: string | null
  /** Lo dice `tnFetchCanceladas`, no la lista: es el dato en el que se confía. */
  cancelada?: boolean
  products: LineaTN[]
}

/** Renglón de una venta de GN (del espejo o del `include_details=1`). */
export type LineaGN = {
  product_id: number | string | null
  size_id: number | string | null
  quantity: number
}

export type VentaGN = {
  id: number | string
  number?: string | null
  date_sale?: string | null
  channel_id?: number | null
  channel?: string | null
  store?: string | null
  /** Lo llena la integración NATIVA de TN en GN. Las cargadas a mano lo tienen en null. */
  tn_order?: string | null
  integration_id?: string | null
  integration_source?: string | null
  total_price?: number | null
  client_name?: string | null
  active?: boolean
  archived?: boolean
  detalles?: LineaGN[]
}

/** Fila de `sync_procesados` (ver sql/migrate-sync-procesados.sql). */
export type LedgerRow = {
  store: string
  fuente: 'tn' | 'gn'
  tipo: 'venta' | 'stock'
  ref_id: string
  hash?: string | null
  detalle?: { estado?: EstadoLedger; [k: string]: unknown } | null
  procesado_at?: string
}

/**
 * `enviando` = se reservó y todavía no volvió la respuesta de GN.
 * `dudoso`   = GN cortó con 5xx/red: NO se sabe si la venta se creó. Sólo un humano lo destraba.
 */
export type EstadoLedger = 'enviando' | 'ok' | 'dudoso'

export type MotivoCola =
  | 'anterior_al_corte'
  | 'ya_importada'
  | 'en_revision'
  | 'ya_en_gn'
  | 'cancelada'
  | 'no_paga'
  | 'sku_sin_mapeo'
  | 'cantidad_invalida'

export type LineaPlan = {
  sku: string
  nombre: string | null
  /** Los ids de GN que van al POST /ventas: `product_id` y `size_id`. */
  gn_product_id: string
  gn_variant_id: string
  quantity: number
  unit_price: number
}

/** Sospecha de que esta orden YA está cargada a mano en GN. No bloquea: avisa. */
export type Advertencia = {
  tipo: 'duplicado_manual'
  gn_venta_id: string
  gn_number: string | null
  date_sale: string | null
  canal: string | null
}

export type PlanVenta = {
  orden_id: string
  numero: string
  /** Día (YYYY-MM-DD) en hora de Buenos Aires, recortado del ISO de TN. */
  dia: string
  fecha: string | null
  cliente: string | null
  total_tn: number | null
  estado_pago: string | null
  /**
   * Cómo pagó, como lo nombra TN (`pago_metodo`, y si no `pago_gateway`). No se usa para armar la
   * venta: va a la NOTA de la venta de GN, junto con el nombre y el número de orden. Es el único
   * lugar donde esos datos sobreviven — todas las ventas online caen en un mismo cliente genérico.
   */
  pago: string | null
  lineas: LineaPlan[]
  unidades: number
  /**
   * Descuento a nivel venta, en pesos. NO se copia de un campo de TN: se DEDUCE de lo que la
   * persona pagó por los productos (`total − envío`) contra la suma de los precios de lista. Así
   * queda bien sea cual sea el origen (cupón, promoción, % por transferencia) sin depender de
   * adivinar qué campo de TN lo trae. Queda a la vista en el dry-run justamente para poder
   * contrastarlo contra una orden real antes de escribir nada.
   */
  descuento: number
  advertencias: Advertencia[]
}

export type ItemCola = {
  numero: string
  dia: string
  fecha: string | null
  cliente: string | null
  motivo: MotivoCola
  detalle: string | null
}

export type PlanSync = {
  crear: PlanVenta[]
  cola: ItemCola[]
  resumen: {
    ordenes: number
    a_crear: number
    unidades: number
    con_advertencia: number
    por_motivo: Partial<Record<MotivoCola, number>>
  }
}

export type ConfigSync = {
  /** YYYY-MM-DD. Las órdenes anteriores se ignoran: son las que ya se cargaron a mano. */
  corte: string
  /** Si es true, sólo entran las órdenes con `estado_pago === 'paid'`. */
  soloPagas: boolean
  /** Días de gracia al cruzar una orden contra una venta ya cargada a mano en GN. */
  toleranciaDias: number
}
