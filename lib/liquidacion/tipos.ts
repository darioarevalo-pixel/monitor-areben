/**
 * Los tipos de Liquidación — campañas de sale, de la selección a la decisión.
 *
 * La forma en la base está en `sql/migrate-liquidacion.sql`. Acá interesa una sola idea: el ítem
 * lleva **la foto del producto en el momento en que se lo mandó** desde Análisis, y no se vuelve a
 * leer del ETL. Una campaña se decide con los números de ese día; si el modal leyera el ETL de hoy,
 * un producto definido la semana pasada mostraría otro margen que el que se aprobó y no habría
 * forma de saber cuál se miró.
 */

/**
 * En qué anda una campaña.
 *
 * `borrador` y `en_curso` son lo mismo para la base y distinto para quien mira: la segunda dice
 * "esto ya se está trabajando", que es lo que evita que dos personas arranquen la misma campaña
 * desde cero. `aplicada` es el corte duro — de ahí en adelante hay precios escritos en Gestión Nube
 * y deshacer deja de ser gratis.
 */
export type EstadoCampania = 'borrador' | 'en_curso' | 'aplicada' | 'cerrada'

/**
 * En qué anda un producto dentro de la campaña.
 *
 * 🔑 `descartado` **no** es borrarlo. Que un producto se haya mirado y no vaya es información: sin
 * ese estado, el mismo producto vuelve a aparecer en la próxima pasada y se lo vuelve a evaluar.
 *
 * 🔑 `confirmado` es `definido` **mirado por otra persona**. Existe porque el precio lo pone uno y
 * lo carga otro en Gestión Nube, y sin un estado propio no hay forma de distinguir "todavía no lo
 * revisé" de "lo revisé y está bien": el silencio se lee igual en los dos casos. Ver `RevisionItem`.
 */
export type EstadoItem = 'pendiente' | 'definido' | 'confirmado' | 'descartado' | 'aplicado'

export const ESTADOS_CAMPANIA: readonly EstadoCampania[] = ['borrador', 'en_curso', 'aplicada', 'cerrada']
export const ESTADOS_ITEM: readonly EstadoItem[] = ['pendiente', 'definido', 'confirmado', 'descartado', 'aplicado']

/** Una campaña. Los conteos los arma el servidor: la pantalla no baja los ítems para contarlos. */
export interface Liquidacion {
  id: string
  nombre: string
  estado: EstadoCampania
  /** Vigencia. Opcionales: una campaña puede nacer sin fechas y ponérselas al aplicarla. */
  desde: string | null
  hasta: string | null
  nota: string | null
  creadoPor: string | null
  creado: number
  /** Cuántos productos tiene y cómo se reparten. Proyección del servidor, no se guarda. */
  conteo: ConteoCampania
}

export interface ConteoCampania {
  total: number
  pendientes: number
  definidos: number
  confirmados: number
  descartados: number
  aplicados: number
}

/**
 * El producto **como estaba** cuando entró a la campaña. Congelada a propósito (ver arriba).
 *
 * `sinCosto` viaja aparte de `costo` porque son cosas distintas: un costo que no vino de Gestión
 * Nube no es un costo cero. En julio de 2026, 428 productos de BDI quedaron costando cero en
 * silencio y nadie se enteró — liquidar sobre eso es regalar mercadería.
 */
export interface FotoDelMomento {
  nombre: string
  sku: string | null
  costo: number
  sinCosto: boolean
  precioNormal: number
  /** Lo que ya estaba en oferta en Tienda Nube cuando entró, si había algo. */
  promoPrevia: number | null
  stock: number
  ventas7: number
  ventas30: number
  ventas90: number
  /** Días de vida útil de stock al ritmo de venta del momento. `null` si no se pudo calcular. */
  vidaUtil: number | null
  ultimaVenta: string | null
  /** Días desde la última venta. Es lo que se mira para decidir, más que la fecha. */
  diasSinVender: number
  imagen: string | null
}

/**
 * Lo que decidió una persona.
 *
 * `margen` es el **margen bruto sobre el precio de sale** —el mismo número que hoy muestra la lista
 * de precios de sale de Comisiones, porque sale de `armarItemSale`—, no el margen neto por forma de
 * pago × canal. El neto depende de cómo pague el cliente y son doce números, no uno: el modal lo
 * muestra en la matriz y **no se guarda**. Guardar uno de los doce sería elegir por el que mira.
 */
export interface DecisionItem {
  precioSale: number | null
  /** % de descuento contra `precioNormal`, redondeado. Se deriva; no es una segunda fuente. */
  pctDesc: number | null
  markup: number | null
  margen: number | null
  nota: string | null
  porQuien: string | null
  cuando: number | null
}

/**
 * La segunda mirada: quién revisó este precio y qué dijo.
 *
 * 🔑 **La objeción va acá y no en la nota.** `decision.nota` es de quien puso el precio y sobrevive
 * a todo; la objeción es de otra persona, tiene que poder contestarse, y sobre todo **se limpia
 * sola** cuando el precio se vuelve a guardar. Metida en la misma nota, quedaría una objeción vieja
 * pegada a un precio nuevo, que es peor que no tener objeción.
 *
 * 🔑 **`precioAnterior` existe porque el revisor puede cambiar el precio.** Confirmar tocando el
 * número es un solo paso y evita el ida y vuelta, pero sin guardar contra qué se cambió, el que lo
 * había puesto se entera sólo si se acuerda del número que había escrito.
 */
export interface RevisionItem {
  /** Quién lo miró. `null` = todavía no pasó por revisión. */
  porQuien: string | null
  cuando: number | null
  /** El motivo, si en vez de confirmar objetó. Obligatorio al objetar. */
  objecion: string | null
  /** Qué precio había antes, si el revisor lo cambió al confirmar. */
  precioAnterior: number | null
}

/** Lo que pasó al escribir el precio en Gestión Nube. Se llena en la tanda 3. */
export interface AplicacionItem {
  aplicadoEn: number | null
  variantesEscritas: number | null
  categoriaSaleAgregada: boolean
}

export interface LiquidacionItem {
  pid: string
  estado: EstadoItem
  foto: FotoDelMomento
  decision: DecisionItem
  /** Opcional: los ítems guardados antes de que existiera la revisión no la traen. */
  revision?: RevisionItem
  aplicacion: AplicacionItem
}

/** Qué tan grave es un aviso. `alto` es el que frena: no se define un precio sin resolverlo. */
export type NivelAviso = 'alto' | 'medio'

/**
 * Qué aviso es, para poder tratarlo distinto sin mirarle el texto.
 *
 * 🔑 Existe porque el modal necesita **ocultar `ya-en-oferta` mientras el precio está precargado y
 * nadie lo tocó**: ahí ese aviso no advierte nada, describe el punto de partida. Filtrar por el
 * texto sería atarse a una redacción — cambiar una palabra del cartel rompería el filtro en
 * silencio, y el aviso volvería a aparecer sin que ningún test se entere.
 */
export type ClaveAviso =
  | 'sin-costo'
  | 'costo-cero'
  | 'sin-lista'
  | 'bajo-costo'
  | 'no-es-descuento'
  | 'ya-en-oferta'
  | 'sin-stock'

export interface Aviso {
  clave: ClaveAviso
  nivel: NivelAviso
  texto: string
}
