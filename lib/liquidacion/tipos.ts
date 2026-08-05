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
 */
export type EstadoItem = 'pendiente' | 'definido' | 'descartado' | 'aplicado'

export const ESTADOS_CAMPANIA: readonly EstadoCampania[] = ['borrador', 'en_curso', 'aplicada', 'cerrada']
export const ESTADOS_ITEM: readonly EstadoItem[] = ['pendiente', 'definido', 'descartado', 'aplicado']

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
  aplicacion: AplicacionItem
}

/** Qué tan grave es un aviso. `alto` es el que frena: no se define un precio sin resolverlo. */
export type NivelAviso = 'alto' | 'medio'

export interface Aviso {
  nivel: NivelAviso
  texto: string
}
