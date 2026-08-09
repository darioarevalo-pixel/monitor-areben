/** Tipos de "Atención al cliente" — links y mensajes para copiar y pegar en Instagram y WhatsApp. */

/** Un modelo de celular con su link a la tienda ya filtrado. No se guarda: sale del menú. */
export type ModeloTienda = {
  /** El handle de la categoría en Tienda Nube, ej. `iphone-15-pro-max`. Es la clave. */
  slug: string
  /** Como lo escribe la tienda, ej. `iPhone 15 Pro Max`. Es lo que la clienta reconoce. */
  nombre: string
  url: string
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

export type DatosAtencion = {
  modelos: ModeloTienda[]
  items: ItemAtencion[]
  /** `true` si los modelos salieron de la semilla porque la tienda no contestó. */
  desdeSemilla?: boolean
}
