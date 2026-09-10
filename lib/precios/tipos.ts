/**
 * Precios de campaña — los tipos de la vista de Marketing.
 *
 * ⚠️ **Esto ⛔ no es `LiquidacionItem` con menos campos**: es una proyección distinta, con nombres
 * propios (`precioLista`, `precio`) y con un campo que el ítem no tiene (`firme`). Tiparla como un
 * `Pick<LiquidacionItem, …>` ataría la pantalla de Marketing a la forma de la foto congelada, que es
 * exactamente lo que la lista blanca de `lib/precios/core.core.js` existe para cortar.
 */

/** Una variante (talle y color juntos, como los guarda Gestión Nube) con sus unidades. */
export interface VariantePrecio {
  /** `Bordó - M`, o `Variante Única` cuando el producto no tiene variantes. */
  nombre: string
  /** Unidades por tienda. Las claves son los `store_name` reales de la marca: Zattia tiene dos y
   *  BDI tres (`Local`, `Deposito Minorista`, `Deposito Mayorista`). ⛔ Puede faltar una. */
  por: Record<string, number>
  total: number
}

/** Un renglón de la lista de precios, tal como sale del handler. */
export interface PrecioItem {
  pid: string
  nombre: string
  sku: string | null
  /** La foto de 1024 px que ya guardó la campaña. `null` = el producto no tenía imagen ese día. */
  imagen: string | null
  /** El precio de lista, el de antes de la campaña. */
  precioLista: number
  /** El precio de la campaña. */
  precio: number | null
  /** ⛔ `null` = no se puede calcular (sin precio de lista). Nunca 0: un 0% afirma que no bajó. */
  pctDesc: number | null
  /** `false` = el precio todavía lo tiene que mirar otra persona y se puede mover. */
  firme: boolean
  /** Unidades de HOY, del espejo. Ver `leidoEn`. Es la suma de `variantes`, no una cuenta aparte. */
  stock: number
  /**
   * El desglose por talle/color, para desplegar. En Gestión Nube el talle y el color son **una
   * sola cosa** (`Bordó - M`), así que esto es un solo nivel y no dos.
   *
   * ⛔ Trae **todas** las variantes, incluidas las que están en cero: los renglones tienen que
   * sumar `stock`. Qué se pliega lo decide la pantalla.
   */
  variantes: VariantePrecio[]
  /** `true` si alguien lo marcó como producto estrella de esta campaña. */
  estrella: boolean
}

/** La campaña, como la ve Marketing: sin conteos de costo ni estado interno de revisión. */
export interface CampaniaPrecios {
  id: string
  nombre: string
  /** YYYY-MM-DD. `null` = la campaña no tiene fecha cargada. */
  desde: string | null
  hasta: string | null
  /** La nota que escribió quien la armó. Es donde dice, por ejemplo, que la feria es presencial. */
  nota: string | null
  /** Cuántos renglones tiene. */
  n: number
}

export interface ListaDePrecios {
  campania: CampaniaPrecios
  items: PrecioItem[]
  /**
   * Las tiendas que existen en esta marca, ya ordenadas (Local primero). Viaja aparte de los ítems
   * para que la tabla del desglose tenga las mismas columnas en todas las filas.
   */
  tiendas: string[]
  /**
   * ISO de cuándo se sincronizó el espejo del que salió el stock. `null` = no se pudo saber, y la
   * pantalla lo dice en vez de inventar un "recién".
   */
  leidoEn: string | null
}
