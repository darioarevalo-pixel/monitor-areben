/**
 * Tipos de la capa de datos: las filas crudas que devuelve Supabase y el objeto
 * que computa el ETL.
 *
 * Escritos a mano contra los `select=` reales de fetchFresh (index.html:2070-2095),
 * no generados de la base: el shell pide un subconjunto acotado de columnas y
 * tipar la tabla entera invitaría a leer campos que nunca vienen.
 *
 * Ojo con los tipos laxos (`retailer_price: number | string | null`): PostgREST
 * devuelve `numeric` como string. El legacy lo resuelve con parseFloat en cada
 * uso; el port hace lo mismo.
 */

// ── Filas crudas de Supabase ──────────────────────────────────────────────────

export type FilaProducto = {
  id: number | string
  name: string | null
  category: string | null
  sku: string | null
  /** Solo lo pide Zattia (index.html:2073): en BDI viene undefined. */
  proveedor?: string | null
  retailer_price: number | string | null
  unit_cost: number | string | null
  created_at: string | null
  /** El select filtra por `active=eq.1`, pero computarDatos igual chequea `!== false`. */
  active?: boolean | number | null
}

export type FilaInventario = {
  product_id: number | string
  product_name: string | null
  size_id: number | string
  size_name: string | null
  available_quantity: number | null
  store_name: string | null
  /** El fetch tiene fallback a un select sin sku/barcode (index.html:2077). */
  sku?: string | null
  barcode?: string | null
}

export type FilaVenta = {
  id: number
  date_sale: string | null
  channel: string | null
  /** Solo BDI (index.html:2084). */
  channel_id?: number | string | null
}

export type FilaDetalle = {
  sale_id: number | string
  product_id: number | string | null
  size_id: number | string | null
  size: string | null
  quantity: number | null
}

export type FilaVentasPorMes = {
  mes: string
  channel: string | null
  cantidad_ventas: number | string | null
  total_items: number | string | null
  promedio_items_por_venta?: number | string | null
}

export type FilaVentasPorCategoriaMes = {
  mes: string
  categoria: string
  total_items: number | string | null
}

export type FilaFundasPorModeloMes = {
  mes: string
  modelo: string | null
  product_id: number | string
  product_name: string | null
  product_created_at: string | null
  total_items: number | string | null
}

export type FilaColorManual = {
  product_name: string
  color: string
}

/** Lo que devuelve fetchUltimoSync (index.html:2165) leyendo la API de GitHub. */
export type SyncMeta = {
  last_run: string | null
  latest_status: string
  latest_conclusion: string | null
} | null

// ── Salida del ETL ────────────────────────────────────────────────────────────

/** getPhase (index.html:2144). `cls` es la clase CSS del legacy; se porta tal cual. */
export type Fase = {
  label: 'obsoleto' | 'dormido' | 'crecimiento' | 'madurez' | 'declive'
  cls: string
}

/**
 * `lifespan` y `lifespanFirst` usan 99999 como centinela de "sin dato" en vez de
 * null, porque las tablas del legacy ordenan por esa columna y null rompía el
 * sort. Se mantiene: cambiarlo es tocar lógica, no portarla.
 */
export const LIFESPAN_SIN_DATO = 99999

export type Producto = {
  id: string
  name: string
  sku: string | null
  proveedor: string | null
  category: string | null
  retailer_price: number
  unit_cost: number
  /** Margen sobre PVP, en %. null si no hay precio. */
  margin: number | null
  /** Recargo sobre costo, en %. null si no hay costo. */
  markup: number | null
  ingresoMes: string | null
  firstSale: string | null
  lastSale: string | null
  daysSinceLast: number
  sales7: number
  sales15: number
  sales30: number
  sales60: number
  sales90: number
  totalSales: number
  /** Una entrada por mes de `months` (los últimos 16), en ese orden. */
  monthlySales: number[]
  stock: number
  lifespan: number
  lifespanFirst: number
  phase: Fase
}

export type Variante = {
  id: string
  pid: string
  sid: string
  name: string
  size: string
  stock: number
  sku: string
  barcode: string
  lastSale: string | null
  daysSinceLast: number
  sales7: number
  sales15: number
  sales30: number
  sales60: number
  sales90: number
  totalSales: number
  lifespan: number
  phase: Fase
}

export type VentasVariante = {
  total: number
  s7: number
  s15: number
  s30: number
  s60: number
  s90: number
  byMonth: Record<string, number>
  last: string | null
  name: string
  size: string
  pid: string
  sid: string
}

export type EstadisticaMensual = {
  mes: string
  items: number
  ventasCount: number
  byCategory: Record<string, number>
  byChannel: Record<string, number>
}

export type ProductoProveedor = {
  id: string
  name: string | null
  retailer_price: number
  unit_cost: number
  firstSale: string | null
  stock: number
  soldTotal: number
  soldByMonth: Record<string, number>
  margin: number | null
}

export type VentaColor = {
  product_name: string
  color: string
  qty: number
  mes: string
}

export type ColorAgotamiento = {
  initialStock: number
  totalSold: number
  currentStock: number
  selloutDate: string | null
  cumByDate: { date: string; cum: number }[]
}

export type Agotamiento = {
  product_name: string | null
  product_id: string
  proveedor: string | null
  firstSelloutDate: string | null
  soldOutColors: string[]
  colors: Record<string, ColorAgotamiento>
  ratioAtRef: Record<string, { sold: number; pct?: number }>
}

export type VentaTalle = {
  category: string
  size: string
  qty: number
  mes: string
}

/** Entrada de computarDatos: las 7 tablas crudas, tal como salen del fetch o del caché. */
export type EntradaETL = {
  productos: FilaProducto[]
  ventas: FilaVenta[]
  detalles: FilaDetalle[]
  inventario: FilaInventario[]
  vmMes: FilaVentasPorMes[]
  vmCat: FilaVentasPorCategoriaMes[]
  vmFundas: FilaFundasPorModeloMes[]
  syncMeta: SyncMeta
}

/**
 * Lo que el legacy leía de globales y acá viaja explícito. Es la diferencia
 * entre "casi pura" y pura: con esto computarDatos no toca nada de afuera.
 */
export type ContextoETL = {
  /** Era el global TODAY (index.html:1914), congelado al cargar la página. */
  today: Date
  /** Era el global colorManualMap (index.html:1923). Vacío en BDI. */
  colorManualMap: Record<string, string>
}

export type DatosETL = {
  ventas: FilaVenta[]
  detalles: FilaDetalle[]
  invByProduct: Record<string, number>
  /** Clave `${pid}|||${modelo}`. */
  invByProdModelo: Record<string, number>
  /** Igual que invByProdModelo pero solo del Depósito Minorista. */
  invDepoMin: Record<string, number>
  prodMeta: Record<string, { created: string | null; cat: string }>
  /** Clave `${modelo}|||${product_name}`. Contiene Sets: NO es serializable a JSON. */
  fmKeyPids: Record<string, Set<string>>
  fmProdCreatedAt: Record<string, string>
  allVvar: Record<string, VentasVariante>
  allProductos: Producto[]
  allVariantes: Variante[]
  allMonths: string[]
  allMonthlyStats: EstadisticaMensual[]
  /** mes → (`${modelo}|||${product_name}` → items). */
  allFundasStats: Record<string, Record<string, number>>
  allProveedoresData: Record<string, { products: ProductoProveedor[] }>
  allColoresSales: VentaColor[]
  allAgotamientoData: Agotamiento[]
  allTallesData: VentaTalle[]
  allTallesCategories: string[]
  proveedoresList: string[]
  maxVentaDate: string | null
  syncMeta: SyncMeta
}
