/**
 * Mapa del local (Zattia): los percheros del salón, qué va en cada barra y cuánto entra.
 *
 * 🔑 **Se asignan TIPOS de prenda a cada barra, ⛔ no prendas.** Cada prenda deduce sola dónde va
 * por su tipo (`tipoDePrenda`, el mismo del Chequeo de exhibición) y su línea (en oferta o no, por
 * `ofertaVigente`). Lo que entra nuevo ya tiene lugar y lo que pasa a sale cambia de zona solo:
 * nadie ubica seiscientas prendas a mano.
 */

/** Colección (precio lleno) o sale (oferta vigente en Tienda Nube). */
export type LineaPrenda = 'nc' | 'sale'
/** Lo que acepta una barra. `ambas` es la barra que no separa. */
export type LineaBarra = LineaPrenda | 'ambas'

/**
 * La clase de largo de una prenda colgada, que es lo que decide la altura de la barra.
 * L1 corta (crops, remeras, shorts) · L2 media (camisas, sweaters) · L3 larga (vestidos, jeans enteros).
 */
export type Largo = 'L1' | 'L2' | 'L3'

/** Qué barra del módulo es. `frente` es el brazo que muestra una o dos prendas de frente. */
export type PosNivel = 'alta' | 'baja' | 'simple' | 'frente'

export type Pared = 'der' | 'izq' | 'isla'

export type Nivel = {
  pos: PosNivel
  /** Altura de la barra desde el piso, en cm. */
  alturaCm: number
  linea: LineaBarra
  /** Tipos de prenda que van en esta barra (`TOP`, `BABY TEE`…). */
  tipos: string[]
  /** Cupo fijado a mano. `null` = se calcula por ancho × densidad. */
  cupo: number | null
}

export type Modulo = {
  /** `D01`…`D12`, `I01`, `I02`, `ISLA`. */
  codigo: string
  pared: Pared
  /** El orden en que el cliente lo encuentra caminando el local (1 = el primero). */
  orden: number
  anchoCm: number
  niveles: Nivel[]
}

export type TipoCfg = {
  tipo: string
  largo: Largo
  /** Perchas por metro lineal a densidad cómoda (que se deslicen con una mano). */
  perchasPorM: number
  /**
   * Perchas por metro lineal al TOPE: apretadas, sin que se deslicen. Es lo máximo que entra, ⛔ no
   * lo que conviene. `null` = sin medir, y entonces el tope se toma igual al cómodo (⛔ no se inventa).
   * Medido por Bruno el 30-sep-2026: 38 BLUSAS en una barra de 0,75 m.
   */
  topePorM: number | null
  /** `false` = no va colgado (bombachas, accesorios): no cuenta como demanda de barra. */
  cuelga: boolean
  /**
   * En qué temporada va al salón. Fuera de ella el tipo **duerme**: se guarda a propósito y ⛔ no
   * pide percha (los sweaters en verano, las bikinis en invierno). Sin el campo vale lo del tipo en
   * el armado inicial, o `'todo'` (un mapa guardado antes del 1-oct-2026 ⛔ no lo trae).
   */
  temporada?: Temporada
}

/** Cuándo va al salón un tipo de prenda. */
export type Temporada = 'todo' | 'verano' | 'invierno'

/** Un tramo del año, como `MM-DD`. Si `desde` es posterior a `hasta`, cruza el año nuevo. */
export type RangoTemporada = { desde: string; hasta: string }

/**
 * Las fechas de cada temporada. 🔑 **Pueden pisarse, y el pedazo que se pisa es el CAMBIO de
 * temporada**: ahí están despiertas las dos y compiten por la percha con las mismas reglas.
 */
export type Temporadas = { verano: RangoTemporada; invierno: RangoTemporada }

/** Cómo se cuenta el cupo de una barra: cómodo (lo que conviene) o al tope (lo máximo que entra). */
export type ModoCupo = 'comodo' | 'tope'

export type MapaLocal = {
  version: 1
  modulos: Modulo[]
  tipos: TipoCfg[]
  /** Sin el campo valen `TEMPORADAS_INICIALES` (un mapa guardado antes del 1-oct-2026 ⛔ no lo trae). */
  temporadas?: Temporadas
}

/**
 * En qué tramo cae una prenda para quedarse en el salón cuando no entran todas (ver `prioridad`).
 * - `nueva`: dada de alta hace 7 días o menos; tiene lugar asegurado.
 * - `vende`: compite por ritmo (ventas por día). Incluye lo que ⛔ no se sabe (sin datos no se la castiga)
 *   y lo que tiene menos de 30 días a la venta, aunque todavía no haya vendido.
 * - `sin-rotacion`: cero ventas en 30 días, y a la venta hace más de 30.
 */
export type Tramo = 'nueva' | 'vende' | 'sin-rotacion'

/**
 * Una prenda del salón: **un producto en un color**. Es lo que ocupa una percha, porque se exhibe
 * una sola unidad por modelo×color y el resto de los talles va al depósito del local.
 */
export type Prenda = {
  clave: string
  productId: string
  nombre: string
  color: string
  tipo: string
  /** `null` = no cruzó con Tienda Nube, así que no se sabe si está en oferta. */
  linea: LineaPrenda | null
  img: string | null
  /** Unidades en el Local sumando todos sus talles. */
  unidades: number
  /**
   * Unidades vendidas en 30 días, sumando sus talles y **todos los canales** (el ETL ⛔ no las parte por
   * canal a nivel variante). `null` = ⛔ no se sabe: el ETL todavía no llegó o el producto ⛔ no cruzó.
   */
  ventas30: number | null
  /** La última venta, `YYYY-MM-DD`, de cualquier talle. */
  ultimaVenta: string | null
  /** El alta en Gestión Nube, `YYYY-MM-DD`. `null` = ⛔ no se sabe. */
  alta: string | null
  /** Ventas por día desde que está a la venta (ver `ritmoDe`). `null` = ⛔ no se saben las ventas. */
  ritmo: number | null
  tramo: Tramo
}
