/**
 * Insumos — las formas. Las listas cerradas y la validación viven en `core.core.js`, que es el que
 * también importa el handler; acá va sólo lo que el compilador necesita.
 */

export type TipoInsumo = 'comercial' | 'comestible' | 'limpieza' | 'oficina' | 'otro'
export type Unidad = 'unidad' | 'rollo' | 'caja' | 'paquete' | 'kg' | 'litro' | 'metro'
export type Ubicacion = 'deposito' | 'local-bdi' | 'local-zattia'
export type TipoMovimiento = 'compra' | 'consumo' | 'traslado' | 'recuento'
export type Canal = 'local' | 'online' | 'mayorista'

/**
 * Cómo se mide el consumo.
 *
 * 🔑 **La marca no es un campo de la regla: sale de `insumo.marcas`.** «Bolsas chicas de Zattia» ya
 * dice de quién es; repetirlo acá sería un lugar más donde puede decir otra cosa. Vacío = las dos,
 * y entonces el ritmo suma las ventas de las dos.
 */
export type ReglaConsumo =
  | { modo?: undefined }
  | { modo: 'manual' }
  | { modo: 'por-venta'; canal?: Canal | null; porVenta: number; ubicacion?: Ubicacion | null }

export type Insumo = {
  id: string
  nombre: string
  tipo: TipoInsumo
  unidad: Unidad
  /** Cómo se compra: 'caja', 'bulto'. Sólo para tipear y para mostrar el equivalente. */
  bulto: string | null
  /** Cuántas `unidad` trae un `bulto`. */
  porBulto: number | null
  /** `[]` = las dos. */
  marcas: string[]
  minimo: number
  /** Cuánto tarda en llegar. `null` = no se sabe ⇒ sólo corre el corte por unidades. */
  diasReposicion: number | null
  consumo: ReglaConsumo
  activo: boolean
  nota: string | null
  autor: string | null
  creado: string
  actualizado: string
}

export type Movimiento = {
  id: string
  insumoId: string
  tipo: TipoMovimiento
  ubicacion: Ubicacion
  /** SIEMPRE positiva. El signo lo pone `signoDe()` en `core.core.js`. */
  cantidad: number
  fecha: string
  /** Sólo en `compra`, y sólo si se sabe. `null` ⛔ no es 0. */
  precioTotal: number | null
  proveedor: string | null
  comprobante: string | null
  /** Las dos patas de un traslado, o los renglones de un mismo pedido. */
  grupo: string | null
  /** `'salida'` / `'entrada'` en un traslado. */
  pata: 'salida' | 'entrada' | null
  usuario: string | null
  nota: string | null
  creado: string
}

/** Las compras (pedidos) de un día, por canal. Lo que el handler manda para medir el ritmo. */
export type DiaCompras = { fecha: string; local: number; online: number; mayorista: number }

/** Lo que dura un insumo, con su denominador al lado. */
export type Ritmo = {
  /** Cuánto se gasta por día, en la unidad del insumo. */
  porDia: number
  fuente: 'ventas' | 'libro'
  /** Sobre cuántos días se midió. */
  dias: number
  /** Cuántas observaciones lo sostienen. Con 0 el ritmo es `null`, no 0. */
  observaciones: number
}

/**
 * El precio de referencia. 🔑 **Va siempre con su denominador**: cuántas compras lo sostienen y
 * desde cuándo. Un promedio sin eso no se puede discutir.
 */
export type PrecioReferencia = {
  /** Por unidad del insumo. */
  unitario: number
  /** `'promedio'` a partir de dos compras; con una sola es `'ultima'` y ⛔ no se rotula promedio. */
  clase: 'promedio' | 'ultima'
  compras: number
  desde: string
  hasta: string
}

/** Por qué hay que comprar. */
export type FaltaComprar = {
  motivo: 'unidades' | 'dias'
  total: number
  /** Los días que queda, si hay ritmo. */
  dias: number | null
  /** Desde cuándo está así — la fecha del movimiento que lo cruzó, ⛔ no la de hoy. */
  desde: string
}

/** Un lugar en cero teniendo en otro: no se compra, se sube. */
export type FaltaSubir = { ubicacion: Ubicacion; hay: number; desde: string }

export type Reposicion = { comprar: FaltaComprar | null; subir: FaltaSubir[] }

// ─────────────────────────────────────────────────────────────────────────────────────────────
// El pedido — la promesa. El libro guarda hechos; esto guarda que alguien llamó al proveedor.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Un pedido al proveedor.
 *
 * 🔴 **No vive en el libro y no es un quinto tipo de movimiento**: no mueve una sola unidad. Que
 * `insumo_movimiento` tenga sólo hechos que suman o restan es lo que deja que `stockPor()` sea una
 * suma pelada — ver el encabezado de `sql/migrate-insumo-pedido.sql`.
 *
 * 🔑 **No tiene columna `estado`.** Que esté abierto se deriva: no cancelado y sin ninguna compra
 * que lo nombre por `grupo`. Un estado guardado es un segundo lugar donde puede decir otra cosa
 * que el libro, y el libro es el que manda.
 */
export type Pedido = {
  id: string
  insumoId: string
  /** En la unidad del insumo. `null` = se pidió sin saber cuánto viene, y sigue siendo útil. */
  cantidad: number | null
  /** 🔑 El reloj del pedido. ⛔ Nunca `creado`: se anota tarde y contaría de menos. */
  pedidoAt: string
  proveedor: string | null
  /** Cuándo lo prometieron. `null` = no dijeron; ⛔ no es «hoy» ni «nunca». */
  promesaAt: string | null
  canceladoAt: string | null
  usuario: string | null
  nota: string | null
  creado: string
}

/** Un pedido que todavía no llegó, con el reloj ya resuelto. */
export type PedidoAbierto = {
  pedido: Pedido
  /** Días desde que se pidió, hasta hoy. */
  diasEsperando: number
  /**
   * Cuándo se lo espera. Sale de la promesa del proveedor si la hay; si no, de `diasReposicion`.
   * `null` = ⛔ no se sabe, y entonces el pedido **nunca** se marca demorado.
   */
  esperadoEl: string | null
  /** Pasó la fecha esperada. Con `esperadoEl` en `null` es siempre `false`. */
  demorado: boolean
}

/**
 * Cuánto tardó de verdad en llegar, medido. Va **con su denominador**, igual que el precio: con una
 * sola observación se rotula `'ultima'` y ⛔ no «promedio».
 *
 * 🔴 **Esto NO alimenta la regla.** Es una sugerencia para que alguien cargue `diasReposicion`
 * mirando un número real en vez de inventarlo. Un derivado de una observación manejando un aviso
 * es lo que ya dejó una regla de Meta prendida y muda.
 */
export type DemoraMedida = {
  dias: number
  clase: 'promedio' | 'ultima'
  pedidos: number
  desde: string
  hasta: string
}
