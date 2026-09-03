/**
 * Tipos de Etiquetas: impresión de etiquetas 5×2,5 cm (Code 128) nombradas por lo que dicen
 * —información de producto · precio · precio rebajado · SKU— más la etiqueta libre. Port del
 * bloque index.html:6628-7209.
 */

/** Los cuatro dibujos de la tabla de productos (libre es un editor aparte). */
export type ModoEtiqueta = 'dep' | 'loc' | 'promo' | 'sku'

/**
 * La pestaña en la que se cargan cantidades. **No es lo mismo que `ModoEtiqueta`**, y ésa es la
 * distinción que ordena esta pantalla: `ModoEtiqueta` es **qué dice la etiqueta** (el dibujo) y el
 * slot es **sobre qué prendas** (todo el catálogo, las que tienen oferta viva, las que hay que
 * reetiquetar).
 *
 * `cola` es el caso que lo deja claro: no tiene un dibujo propio —usa los que ya están— y lo que
 * aporta es la lista. Guarda sus cantidades aparte para no pisar las de Promo, que es otra lista.
 */
export type Slot = ModoEtiqueta | 'cola'

/** Las pestañas de la pantalla, en orden. `libre` no carga cantidades: es un editor. */
export const PESTANIAS = ['dep', 'loc', 'promo', 'cola', 'sku', 'libre'] as const
export type Pestania = (typeof PESTANIAS)[number]

/**
 * Qué es cada etiqueta, en un solo lugar.
 *
 * 🔑 **Se nombran por lo que DICEN, no por dónde se pegan.** «Depósito» y «Local» eran ubicaciones,
 * y ninguna de las dos tiene una línea de código que dependa de dónde está la prenda: la primera
 * imprime la información del producto y la segunda esa misma información más el precio. Lo pidió
 * Bruno el 16-ago-2026 y el código le daba la razón.
 *
 * 🔑 **Y estaba repartido en cadenas de ternarios**: el título del panel, el subtítulo y el texto
 * del escáner se escribían en tres lugares distintos, que ya estaban desincronizados. Un modo nuevo
 * obligaba a tocar los tres y a nadie le fallaba nada si se olvidaba de uno. El cuarto lugar es
 * `lib/nav.datos.ts`, que declara los sub-permisos: lo ata `tests/etiquetas-core.test.ts`.
 */
export const ETIQUETA: Record<ModoEtiqueta, { emoji: string; nombre: string; dice: string; alEscanear: string }> = {
  dep: {
    emoji: '📄',
    nombre: 'Información de producto',
    dice: 'Nombre, variante, SKU y código de barras (Code 128), en 5 × 2,5 cm. Sin precio.',
    alEscanear: 'información de producto (sin precio)',
  },
  loc: {
    emoji: '💲',
    nombre: 'Precio',
    dice: 'La misma información, más el precio que la tienda cobra hoy. Sin precio no se imprime: avisa cuáles.',
    alEscanear: 'precio',
  },
  promo: {
    emoji: '🔥',
    nombre: 'Precio rebajado',
    dice: 'Para lo que está en oferta: el precio anterior tachado y chico, y el nuevo grande.',
    alEscanear: 'precio rebajado (antes/ahora)',
  },
  sku: {
    emoji: '🔢',
    nombre: 'SKU',
    dice: 'Sólo el SKU, grande y centrado. Es la que se pega en la bolsa del depósito, y se puede imprimir en 5 × 2,5 cm o en 10 × 15 cm.',
    alEscanear: 'sólo el SKU',
  },
}

/**
 * Las dos pestañas que no son un dibujo: una es una lista y la otra un editor. Van acá y no en
 * `ETIQUETA` porque no tienen `dice` —no hay una etiqueta que describir— y meterlas ahí obligaría a
 * inventarles uno.
 */
const PESTANIA_EXTRA: Record<'cola' | 'libre', { emoji: string; nombre: string }> = {
  cola: { emoji: '🔁', nombre: 'Para reetiquetar' },
  libre: { emoji: '✏️', nombre: 'Libre' },
}

/** Cómo se llama cada pestaña, con su ícono. */
export function rotuloPestania(p: Pestania): { emoji: string; nombre: string } {
  return p === 'cola' || p === 'libre' ? PESTANIA_EXTRA[p] : ETIQUETA[p]
}

/**
 * La etiqueta que dibuja cada pestaña.
 *
 * ⚠️ `cola` dice `promo` sólo como valor de arranque: ahí el dibujo se decide **prenda por prenda**
 * con `modoDe` (ver `lib/etiquetas/pdf.ts`), porque la cola mezcla las que entran a una oferta con
 * las que vuelven a precio de lista.
 */
export const MODO_DE: Record<Slot, ModoEtiqueta> = { dep: 'dep', loc: 'loc', promo: 'promo', sku: 'sku', cola: 'promo' }

/** La variante etiquetable, tal como viene de `allVariantes` del ETL. */
export type VarianteEti = {
  id: string
  pid: string
  name: string
  size: string
  sku: string
  barcode: string
  stock: number
  /**
   * Tiene stock en `inventario` pero su producto todavía no está en el catálogo sincronizado
   * (`allVariantesHuerfanas` del ETL). Antes estas variantes ni se listaban: un producto recién
   * cargado en GN no se podía etiquetar y no había forma de saber por qué.
   */
  sinProducto?: boolean
}

/** Cantidades cargadas por modo: id de variante → cantidad. */
export type Cantidades = Record<string, number>

/** Precio final por producto (pid → precio) y promo (pid → {normal, promo}). */
export type MapaPrecios = Record<string, number>
export type Promo = { normal: number; promo: number }
export type MapaPromo = Record<string, Promo>

/** Una línea de la etiqueta de formas de pago / etiqueta libre. */
export type LineaEtiqueta = { texto: string; tam: 'titulo' | 'subtitulo' | 'normal' | 'chico'; bold: boolean }

/** Un elemento de la secuencia de impresión: una variante, un separador (null) o la etiqueta de formas de pago. */
export type LabelItem = VarianteEti | null | { __fp: true }

/** Config del PDF libre. */
export type LibreConfig = {
  grande: boolean
  copias: number
  barcode: string
  precio: number | null
  lineas: LineaEtiqueta[]
}

/**
 * Cómo imprime la pestaña de SKU. Las tres son de esa pestaña sola y se recuerdan por marca.
 *
 * 🔑 **Existe porque la bolsa del depósito no es una prenda.** Un producto de cuatro colores son
 * cuatro bolsas, y hasta el 3-sep-2026 había que escanear las cuatro. `grupo` convierte un escaneo
 * en las cuatro etiquetas y `grande` las manda a una sola de 10 × 15 en vez de a cuatro chiquitas.
 *
 * 🔑 **`elegir` es el freno, y arranca apagado a propósito.** Toda la sección es «escaneá y ya está»:
 * si cada escaneo abriera una lista para tildar, el escáner dejaría de ahorrar nada. Prendido, el
 * escaneo abre la lista en vez de imprimir — para el día del ingreso raro, no para todos los días.
 */
export type ConfigSku = { grupo: boolean; grande: boolean; elegir: boolean }

/** Lo que ve quien nunca tocó nada: exactamente el comportamiento de siempre. */
export const CONFIG_SKU_DEFAULT: ConfigSku = { grupo: false, grande: false, elegir: false }
