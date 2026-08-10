/** Tipos de "Atención al cliente" — links y mensajes para copiar y pegar en Instagram y WhatsApp. */

/** Un modelo de celular con su link a la tienda ya filtrado. No se guarda: sale del menú. */
export type ModeloTienda = {
  /** El handle de la categoría en Tienda Nube, ej. `iphone-15-pro-max`. Es la clave. */
  slug: string
  /** Como lo escribe la tienda, ej. `iPhone 15 Pro Max`. Es lo que la clienta reconoce. */
  nombre: string
  url: string
}

/**
 * Un producto de la tienda, visto desde acá: lo justo para reconocerlo y mandarle el link.
 *
 * Es un subconjunto del payload de `tiendanube-audit` en su nivel **liviano**. No hay stock ni
 * variantes a propósito: quien atiende necesita mandar el link, y el nivel con variantes pesa el
 * doble. El día que haga falta el stock por talle, se pide `{ variantes: true }` y este tipo crece.
 */
export type ProductoTienda = {
  id: string | number
  name: string
  sku?: string | null
  /** El de la URL pública. Es opcional en el payload: sin él no hay link que copiar. */
  handle?: string | null
  /** `false` = despublicado en la tienda. `undefined` se asume publicado (default de TN). */
  published?: boolean
  price?: number | null
  promo_price?: number | null
  images?: string[]
}

/** Lo que sí se guarda: los links y mensajes que carga el equipo. */
export type ItemAtencion = {
  id: string
  tipo: 'link' | 'mensaje'
  titulo: string
  /** Sólo en `link`. */
  url?: string
  /**
   * En `link` es el texto que acompaña al link cuando se copia el mensaje entero (opcional: sin
   * esto sólo se puede copiar el link pelado). En `mensaje` es el contenido, y es obligatorio.
   */
  texto?: string
  /** Para agrupar en la pantalla: "Envíos", "Cambios", "Promos"… Vacío = sin grupo. */
  grupo?: string
  actualizado?: string
}

/**
 * La plantilla con la que se arma el mensaje de un modelo. Se guarda como un item más, con id fijo,
 * para no necesitar otra tabla ni otro endpoint.
 */
export const ID_PLANTILLA_MODELO = '__plantilla-modelo__'

export const PLANTILLA_MODELO_DEFECTO =
  '¡Hola! Estas son todas las fundas que tenemos para {modelo} 💛\n{link}'

/**
 * La plantilla del mensaje de un producto. Es otra, y no la misma con más marcadores, porque los
 * datos no son los mismos —un producto tiene precio; un modelo de celular, no— y el texto tampoco:
 * "estas son todas las fundas que tenemos para" no sirve para mandar un producto solo.
 */
export const ID_PLANTILLA_PRODUCTO = '__plantilla-producto__'

export const PLANTILLA_PRODUCTO_DEFECTO = '¡Hola! Mirá, esta es la {producto} 💛\n{precio}\n{link}'

export type DatosAtencion = {
  modelos: ModeloTienda[]
  items: ItemAtencion[]
  /** `true` si los modelos salieron de la semilla porque la tienda no contestó. */
  desdeSemilla?: boolean
}
