/**
 * "Faltantes" — lo que un cliente pidió y no teníamos.
 *
 * # Por qué la sección se llama `pedidos-clientes` y no `solicitudes`
 *
 * ⚠️ **El nombre estaba ocupado.** `solicitudes` ya existe y significa otra cosa (sesión de fotos y
 * consumo interno), y en el menú de Marketing figura literalmente como «Solicitudes de productos»:
 * un producto que se pide para fotografiar. Esto es lo contrario — un producto que se pide para
 * comprar y que no está. Dos secciones con el mismo nombre en el mismo menú es un permiso mal
 * tildado esperando.
 *
 * # Lo que hace útil a esta lista es el AGREGADO, no la lista
 *
 * Una fila suelta no decide nada. «Te lo pidieron 7 veces en 30 días» sí. Todo lo que sigue existe
 * para eso: `texto` se agrupa por su forma normalizada (`claveDeTexto`) y `creado_en` define la
 * ventana. Sin las dos cosas juntas la sección es un cuaderno.
 */

import type { Marca } from '@/lib/nav.datos'

/**
 * Las dos cosas que la palabra «faltante» quiere decir.
 *
 * 🔑 **Son dos decisiones distintas y por eso el ranking no las suma.** `no_trabajamos` es variedad
 * que hay que comprar por primera vez; `sin_stock` es reposición de algo que ya vendemos. Las decide
 * gente distinta con plata distinta, y mezcladas bajo un solo total el número no contesta ninguna
 * de las dos preguntas.
 */
export type TipoFaltante = 'no_trabajamos' | 'sin_stock'

export type CanalPedido = 'local' | 'whatsapp' | 'instagram' | 'mail' | 'tienda'

/** `descartado` es «lo miramos y no lo traemos», no «me equivoqué»: para eso está borrar. */
export type EstadoPedido = 'pedido' | 'conseguido' | 'descartado'

export type PedidoCliente = {
  id: string
  store: Marca
  /** Lo que pidió, **como lo dijo**. La versión normalizada se calcula al agrupar, no se guarda. */
  texto: string
  tipo: TipoFaltante
  canal: CanalPedido
  cliente: string | null
  estado: EstadoPedido
  nota: string | null
  /**
   * El artículo elegido del catálogo de Gestión Nube, cuando se eligió. Los tres son `null` si se
   * escribió a mano — el caso normal de `no_trabajamos`, que no existe en ningún catálogo nuestro.
   *
   * 🔴 `producto_id` no es un adorno: **es la llave con la que agrupa el ranking** cuando está
   * (`claveDePedido`). `sku` es el de la VARIANTE, que es con lo que se repone, y `variante` es su
   * rótulo («Talle 2») — rótulo y no llave, y por eso no va adentro de `texto`.
   */
  producto_id: string | null
  sku: string | null
  variante: string | null
  /** Cuándo se lo pidieron. ISO. Es lo que define la ventana del ranking. */
  creado_en: string
  creado_por: string | null
  actualizado_en?: string
  actualizado_por?: string | null
}

/** Lo que se manda a guardar. El servidor pone `id`, `creado_por` y las fechas. */
export type PedidoNuevo = {
  id?: string
  store: Marca
  texto: string
  tipo?: TipoFaltante
  canal?: CanalPedido
  cliente?: string | null
  estado?: EstadoPedido
  nota?: string | null
  /** El artículo elegido. `sku` y `variante` sólo se guardan si viaja `producto_id`. */
  producto_id?: string | null
  sku?: string | null
  variante?: string | null
}

/**
 * La ventana de tiempo del ranking, en milisegundos epoch.
 *
 * 🔴 **Se pasa siempre y no tiene default.** «Lo más pedido» sin decir *en cuánto tiempo* no es un
 * número: son dos rankings distintos con el mismo título, y el que mira no tiene forma de saber
 * cuál está viendo. Que sea un parámetro obligatorio hace que la pantalla no pueda dibujarlo sin
 * haber elegido —y sin poder rotularlo—.
 */
export type Ventana = { desde: number; hasta: number; dias: number }

/** Un producto pedido, con todas las veces que lo pidieron juntas. */
export type GrupoFaltante = {
  /** La forma normalizada: es la llave por la que se juntaron. */
  clave: string
  /** Cómo lo llama la gente: el texto más repetido del grupo, tal cual lo escribieron. */
  etiqueta: string
  /** Todas las veces que lo pidieron en la ventana, sin importar en qué estado quedó cada una. */
  total: number
  pendientes: number
  conseguidos: number
  descartados: number
  porTipo: Record<TipoFaltante, number>
  /** Por dónde llegó, sin repetir y en el orden de `CANALES`. */
  canales: CanalPedido[]
  /**
   * El artículo del grupo, cuando el grupo se armó por `producto_id` (o sea: cuando lo eligieron
   * del catálogo). `null` en los grupos de texto escrito a mano.
   *
   * ⚠️ `skus` son TODAS las variantes que pidieron de ese producto, no una: el grupo cuenta el
   * producto y los talles son el detalle. Mostrar uno solo afirmaría que los 7 pedidos son de ése.
   */
  productoId: string | null
  skus: string[]
  /** El pedido más reciente del grupo. ISO. */
  ultimo: string
  /** Las filas, de la más nueva a la más vieja. */
  pedidos: PedidoCliente[]
}

/**
 * El ranking, con **lo que quedó afuera al lado del número**.
 *
 * ⚠️ Los tres contadores de descarte no son telemetría: son la diferencia entre «nadie pidió eso» y
 * «se cargó y no lo estoy contando». Un ranking que sólo devuelve los grupos afirma que lo que no
 * está no existe.
 */
export type Ranking = {
  grupos: GrupoFaltante[]
  /** Filas que entraron en la cuenta. Es el «cuántas observaciones» del ranking. */
  contadas: number
  /** Cargadas, pero de antes de la ventana (o del futuro). */
  fueraDeVentana: number
  /** Sin fecha legible: no caen en ninguna ventana, así que no se cuentan en ninguna. */
  sinFecha: number
  /** Con un texto que no deja ninguna palabra («???»): no se pueden agrupar. */
  sinClave: number
  ventana: Ventana
}
