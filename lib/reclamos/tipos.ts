/**
 * Tipos y matemática de Devoluciones (tabla `devoluciones`, ver sql/migrate-devoluciones.sql).
 *
 * Este archivo es PURO —sin React, sin fetch— porque es donde vive la plata: cuánto se le
 * devuelve a cada persona y si conviene pagar el envío para que el producto vuelva. Todo lo que
 * está acá tiene test (`tests/devoluciones.test.ts`).
 *
 * Las tres decisiones que modela un reclamo, y que son independientes entre sí:
 *   - **el producto**: vuelve · se lo queda el cliente · nunca salió   (la decidimos nosotros, es económica)
 *   - **la compensación**: plata total · parte · otra unidad · cupón · nada
 *   - **la evidencia**: fotos + relato que carga el cliente por un link
 */

import type { Marca } from '@/lib/nav.datos'

// ── Los ejes ────────────────────────────────────────────────────────────────────

/**
 * Qué pasó. Son los siete casos reales del negocio, no categorías genéricas.
 *
 * `mal_armado` nombra **el error nuestro** y no el síntoma del cliente ("me llegó otra cosa"):
 * agrupados por motivo, estos reclamos muestran si el problema está en el picking y no en
 * post-venta. Es la diferencia entre medir la consecuencia y medir la causa.
 *
 * `otro` ya no se ofrece al cargar, pero se conserva en el tipo: hay reclamos viejos con ese
 * valor y sacarlo del tipo los dejaría sin etiqueta en la pantalla.
 */
export type MotivoReclamo =
  | 'arrepentimiento'
  | 'no_esperaba'
  /**
   * No le quedó el talle. Es **qué pasó**, no qué quiere: la mayoría termina en cambio, pero el
   * dato que importa es otro. Agrupados por este motivo, los reclamos señalan la **guía de talles
   * y la ficha del producto** — exactamente igual que `mal_armado` señala el picking. Mezclado
   * dentro de `no_esperaba`, ese dato no existe.
   */
  | 'talle'
  | 'falla'
  | 'faltante'
  | 'mal_armado'
  | 'no_llego'
  | 'sin_stock'
  | 'no_era_lo_esperado' // histórico: quedó en filas viejas, hoy es `no_esperaba`
  | 'otro'

/**
 * Qué quiere el cliente. Se pregunta al abrir el reclamo y es distinto de lo que finalmente se
 * hace (`compensacion`): sirve para ver cuántas veces le damos algo distinto de lo que pidió.
 */
export type Expectativa = 'plata' | 'mismo_producto' | 'otro_producto' | 'completar'

export const EXPECTATIVA_LABEL: Record<Expectativa, string> = {
  plata: 'Que le devuelvan la plata',
  mismo_producto: 'El mismo producto, en buen estado',
  otro_producto: 'Cambiarlo por otro',
  completar: 'Que le manden lo que falta',
}

/**
 * Cómo se lee cada opción **según el caso**. La etiqueta genérica alcanza para la mayoría, pero en
 * algunos motivos dice cualquier cosa: "que le manden lo que falta" en un pedido que nunca llegó, o
 * "cambiarlo por otro" en algo que el cliente todavía no tiene.
 *
 * Sólo se listan los motivos donde la genérica está mal. El resto usa `EXPECTATIVA_LABEL`.
 */
const EXPECTATIVA_LABEL_POR_MOTIVO: Partial<Record<MotivoReclamo, Partial<Record<Expectativa, string>>>> = {
  no_llego: {
    completar: 'Que le mandemos el pedido de nuevo',
    plata: 'Que le devolvamos la plata',
  },
  faltante: { completar: 'Que le mandemos el producto que faltó' },
  mal_armado: { completar: 'Que le mandemos el producto que faltó' },
  // Acá no es "qué espera": el cliente todavía no sabe que hay un problema. Es qué ELIGIÓ cuando
  // se le avisó, que es el único caso donde la decisión es suya.
  sin_stock: {
    otro_producto: 'Cambiarlo por otro producto',
    plata: 'Que le devolvamos la plata',
  },
}

export function expectativaLabel(e: Expectativa, m?: MotivoReclamo | null): string {
  return (m && EXPECTATIVA_LABEL_POR_MOTIVO[m]?.[e]) || EXPECTATIVA_LABEL[e]
}

/**
 * El rótulo de la pregunta. En `sin_stock` no es "qué espera" —no recibió nada, ni sabe que hay un
 * problema— sino qué eligió cuando se le ofrecieron las dos salidas.
 */
export function tituloExpectativa(m?: MotivoReclamo | null): string {
  return m && decideElCliente(m) && !PERFIL_MOTIVO[m].recibioAlgo ? '¿Qué eligió?' : '¿Qué esperaba?'
}

/**
 * Qué pasa con el producto:
 *   - `stock`    vuelve sano y se revende.
 *   - `falla`    vuelve pero no se revende como nuevo: va al ledger de Fallas.
 *   - `no_salio` nunca se despachó (faltante, sin stock): no hay nada que esperar ni etiqueta.
 *   - `perdida`  se perdió en el camino: ni vuelve ni está. Hay reclamo al transportista.
 */
export type DestinoPrenda = 'stock' | 'falla' | 'no_salio' | 'perdida'

export type Compensacion =
  | 'plata_total'
  | 'plata_parcial'
  /** Otra unidad DEL MISMO producto (reposición). Sin diferencia de precio. */
  | 'otra_unidad'
  /** Otro producto DISTINTO: es el cambio de toda la vida, y por eso hay diferencia de precio. */
  | 'otro_producto'
  | 'reenvio'
  | 'cupon'
  | 'ninguna'

/**
 * Cómo vuelve el producto. `presencial` es el cliente acercándose al local: **no hay envío**, así
 * que no hay etiqueta, ni costo, ni código que seguir. Sin esta distinción la pantalla asumía
 * siempre un envío en curso y había que marcar "Volvió" sobre un tránsito que nunca existió.
 */
export type ViaRetorno = 'correo' | 'andreani' | 'cadete' | 'presencial'

export const VIA_LABEL: Record<ViaRetorno, string> = {
  andreani: 'Andreani',
  correo: 'Correo Argentino',
  cadete: 'Cadete',
  presencial: 'La trae al local',
}

/** Las que tienen código de seguimiento. Cadete y presencial no: no hay nada que rastrear. */
const VIA_CON_SEGUIMIENTO: ViaRetorno[] = ['andreani', 'correo']
export const pideSeguimiento = (via?: ViaRetorno | null): boolean => !!via && VIA_CON_SEGUIMIENTO.includes(via)
/** Presencial no tiene envío: ni costo ni etiqueta. */
export const hayEnvio = (via?: ViaRetorno | null): boolean => !!via && via !== 'presencial'

/**
 * `esperando_cliente` es el link mandado y sin responder; `en_revision` es el cliente ya cargó
 * y falta que Administración decida. `en_transito`/`recibido` solo aplican si el producto vuelve.
 */
export type EstadoReclamo =
  | 'borrador' | 'esperando_cliente' | 'en_revision' | 'resuelto'
  | 'en_transito' | 'recibido' | 'cerrado' | 'anulado'

/** Los tres pendientes que se cierran por separado, porque avanzan a ritmos distintos. */
export type PendienteEstado = 'pendiente' | 'hecho' | 'no_aplica'

/** El cobro de la diferencia de un cambio. Solo aplica cuando queda plata a cobrar. */
export type CobroEstado = 'no_aplica' | 'pendiente' | 'cobrado'

export const MOTIVO_LABEL: Record<MotivoReclamo, string> = {
  arrepentimiento: 'Arrepentimiento',
  no_esperaba: 'No era lo que esperaba',
  talle: 'No le quedó el talle',
  falla: 'Falla',
  faltante: 'Faltante de producto',
  mal_armado: 'Pedido mal armado',
  no_llego: 'No le llegó nunca',
  sin_stock: 'No tenemos stock',
  no_era_lo_esperado: 'No era lo que esperaba', // histórico
  // Catch-all histórico, y hoy también lo que se guarda cuando un cambio va SIN motivo:
  // cambiar es un derecho del comprador y no hace falta justificarlo.
  otro: 'Sin motivo',
}

/** Los que se ofrecen al cargar, en el orden en que pasan de verdad. */
export const MOTIVOS_VIGENTES: MotivoReclamo[] = [
  'talle', 'arrepentimiento', 'no_esperaba', 'falla', 'faltante', 'mal_armado', 'no_llego', 'sin_stock',
]

/**
 * Los motivos que entran por el **mostrador**, o sea por la puerta Cambios.
 *
 * Son los tres en que no hay nada que evaluar: llegó lo que pidió, en buen estado, y no lo quiere.
 * Todo el resto (falla, faltante, mal armado, no llegó, sin stock) implica una decisión nuestra o
 * una gestión, así que **entra por Reclamos**. Antes el POS ofrecía los ocho y eso invitaba a
 * resolver de mostrador casos que necesitan expediente.
 *
 * ⚠️ El motivo del cambio es **opcional de verdad**: cambiar es un derecho del comprador y no hace
 * falta justificarlo. Antes decía "opcional" pero el select no tenía opción vacía y arrancaba en
 * `talle`, así que en la práctica se guardaba `talle` aunque nadie lo hubiera elegido — y eso
 * ensuciaba la única señal que el campo existe para dar.
 */
export const MOTIVOS_CAMBIO: MotivoReclamo[] = ['talle', 'arrepentimiento', 'no_esperaba']

/**
 * ¿El producto salió del depósito alguna vez? Los casos en que NO define medio flujo: no hay
 * etiqueta de vuelta, no hay tránsito, y no hay nada que reingresar — solo plata y stock.
 *
 * ⚠️ **No alcanza con esto para saber qué hacer con el stock**, y confundirlo cuesta caro: en
 * `faltante` la unidad ESTÁ en el depósito (hay que reingresarla en GN) y en `sin_stock` NO EXISTE
 * (hay que darla de baja). Mismo "nunca salió", movimiento opuesto. Eso lo responde
 * `hayUnidadFisica`.
 */
export const NUNCA_SALIO: MotivoReclamo[] = ['faltante', 'sin_stock']

/** Motivos donde el error es NUESTRO. Sirve para separar lo que se puede corregir de lo que no. */
export const ERROR_PROPIO: MotivoReclamo[] = ['falla', 'faltante', 'mal_armado', 'sin_stock']

// ── El perfil de cada motivo ────────────────────────────────────────────────────
//
// Todo lo que cambia de un caso a otro sale de acá, y sale de **dos preguntas físicas**: ¿el
// producto salió del depósito? ¿la unidad existe? Con eso se derivan el stock, la plata, las fotos
// y qué se le puede ofrecer. Antes cada una de esas respuestas era un `includes` suelto en un
// archivo distinto, y por eso se contradecían.

/** Cuándo hace falta una foto, y de qué. */
export type PideFotos =
  /** La foto ES la prueba: sin ella no se decide (falla, mal armado). */
  | 'siempre'
  /** Solo si el producto vuelve por plata. Si lo cambia, se ve en el mostrador. */
  | 'si_quiere_plata'
  /** No del producto reclamado —no lo tiene— sino de lo que SÍ recibió, para verificar. */
  | 'de_lo_recibido'
  /** No hay nada que fotografiar. */
  | 'nunca'

export type PerfilMotivo = {
  /** Cuándo se usa este motivo. Es el texto del ⓘ, y lo leen las tres pantallas. */
  ayuda: string
  /** ¿El pedido salió del depósito? */
  salio: boolean
  /** ¿La unidad existe físicamente? Separa `faltante` (sí, reingresar) de `sin_stock` (no, dar de baja). */
  unidadExiste: boolean
  /** ¿El cliente llegó a recibir algo? Es lo que decide si se le devuelve el envío de ida. */
  recibioAlgo: boolean
  /** ¿El reclamo es sobre la venta entera? Entonces no se destildan productos. */
  ventaCompleta: boolean
  /** ¿Quién decide? En casi todos nosotros, con la evidencia. En `sin_stock`, el cliente. */
  decideCliente: boolean
  fotos: PideFotos
  /** Las salidas que se le pueden ofrecer, en el orden en que conviene. */
  expectativas: Expectativa[]
  /** ¿Se le puede ofrecer un descuento para que se lo quede en vez de devolverlo? */
  retencion: boolean
}

/**
 * ⚠️ `talle`, `arrepentimiento` y `no_esperaba` son **el mismo flujo con tres etiquetas**. Se
 * mantienen separados a propósito: cada uno mide algo distinto y es la única señal de por qué
 * vuelven las cosas — el talle mide la guía de talles, "no era lo que esperaba" mide la ficha de
 * producto, y el arrepentimiento no mide nada nuestro. Fusionarlos ahorraría una línea de código y
 * perdería el dato.
 */
export const PERFIL_MOTIVO: Record<MotivoReclamo, PerfilMotivo> = {
  talle: {
    ayuda: 'Llegó lo que pidió, en buen estado, pero no le entra. Es lo que mide si la guía de talles está bien.',
    salio: true, unidadExiste: true, recibioAlgo: true, ventaCompleta: false, decideCliente: true,
    fotos: 'si_quiere_plata', expectativas: ['otro_producto', 'plata'], retencion: true,
  },
  arrepentimiento: {
    ayuda: 'Se arrepintió, sin más. Llegó bien y es lo que pidió: no mide nada nuestro.',
    salio: true, unidadExiste: true, recibioAlgo: true, ventaCompleta: false, decideCliente: true,
    fotos: 'si_quiere_plata', expectativas: ['plata', 'otro_producto'], retencion: true,
  },
  no_esperaba: {
    ayuda: 'Llegó lo que pidió pero no era como se lo imaginaba. Es lo que mide si la ficha de producto (fotos, descripción, medidas) está engañando.',
    salio: true, unidadExiste: true, recibioAlgo: true, ventaCompleta: false, decideCliente: true,
    fotos: 'si_quiere_plata', expectativas: ['plata', 'otro_producto'], retencion: true,
  },
  falla: {
    ayuda: 'Llegó con un defecto: mancha, costura, rotura. Error nuestro o del proveedor. Las fotos son la prueba y las decidimos nosotros.',
    salio: true, unidadExiste: true, recibioAlgo: true, ventaCompleta: false, decideCliente: false,
    fotos: 'siempre', expectativas: ['mismo_producto', 'plata', 'otro_producto'], retencion: true,
  },
  faltante: {
    ayuda: 'El paquete llegó pero faltaba un producto adentro. La unidad sigue en el depósito: no salió. Distinto de "pedido mal armado", donde llegó otra cosa en su lugar.',
    salio: false, unidadExiste: true, recibioAlgo: true, ventaCompleta: false, decideCliente: false,
    fotos: 'de_lo_recibido', expectativas: ['completar', 'plata'], retencion: false,
  },
  mal_armado: {
    ayuda: 'Le llegó un producto distinto al que compró. Hay que corregir dos stocks: el que pidió no salió y el que se mandó por error salió sin descontarse.',
    salio: false, unidadExiste: true, recibioAlgo: true, ventaCompleta: false, decideCliente: false,
    fotos: 'siempre', expectativas: ['completar', 'plata'], retencion: false,
  },
  no_llego: {
    ayuda: 'El pedido nunca llegó a destino: se perdió en el transporte. Va sobre la venta completa y en paralelo se le reclama al transportista, que es plata recuperable.',
    salio: true, unidadExiste: false, recibioAlgo: false, ventaCompleta: true, decideCliente: true,
    fotos: 'nunca', expectativas: ['completar', 'plata'], retencion: false,
  },
  sin_stock: {
    ayuda: 'Entró la venta pero el producto no existe. El cliente no recibió nada ni está enterado: se le avisa y ELIGE ÉL entre cambiarlo o que le devolvamos la plata.',
    salio: false, unidadExiste: false, recibioAlgo: false, ventaCompleta: true, decideCliente: true,
    fotos: 'nunca', expectativas: ['otro_producto', 'plata'], retencion: false,
  },
  // Históricos: quedan para que una fila vieja no reviente. Se comportan como su equivalente.
  no_era_lo_esperado: {
    ayuda: 'Motivo histórico. Usá "No era lo que esperaba".',
    salio: true, unidadExiste: true, recibioAlgo: true, ventaCompleta: false, decideCliente: true,
    fotos: 'si_quiere_plata', expectativas: ['plata', 'otro_producto'], retencion: true,
  },
  otro: {
    ayuda: 'Motivo histórico, sin flujo propio. Elegí el que corresponda.',
    salio: true, unidadExiste: true, recibioAlgo: true, ventaCompleta: false, decideCliente: false,
    fotos: 'si_quiere_plata', expectativas: ['plata', 'otro_producto'], retencion: true,
  },
}

/** El texto del ⓘ de cada motivo: cuándo se usa, para no tener que adivinar cuál asignar. */
export function ayudaDeMotivo(m: MotivoReclamo): string {
  return PERFIL_MOTIVO[m].ayuda
}

/**
 * Qué se le puede ofrecer, según el motivo.
 *
 * Antes era una lista fija de cuatro opciones que no dependía de nada, así que en un "no le llegó
 * nunca" se ofrecía "el mismo producto en buen estado" y en una falla "que le manden lo que falta".
 */
export function expectativasDe(m: MotivoReclamo): Expectativa[] {
  return PERFIL_MOTIVO[m].expectativas
}

/**
 * ¿Hay que pedirle fotos, y de qué?
 *
 * **Depende del motivo Y de qué quiere el cliente**, no sólo del motivo: la foto sirve para ver en
 * qué estado vuelve el producto, así que sólo hace falta cuando el producto vuelve. Si lo quiere
 * cambiar, lo trae al mostrador y se ve ahí.
 */
export function pideFotos(m: MotivoReclamo, expectativa?: Expectativa | null): boolean {
  const modo = PERFIL_MOTIVO[m].fotos
  if (modo === 'nunca') return false
  if (modo === 'si_quiere_plata') return expectativa !== 'otro_producto' && expectativa !== 'mismo_producto'
  return true
}

/** El reclamo es sobre la venta entera: no se pueden destildar productos. */
export function sobreLaVentaCompleta(m: MotivoReclamo): boolean {
  return PERFIL_MOTIVO[m].ventaCompleta
}

/**
 * ¿La unidad reclamada existe físicamente?
 *
 * Es la pregunta que separa dos casos que parecen el mismo: en `faltante` el producto está en el
 * depósito y si se devuelve la plata hay que **reingresarlo** en GN; en `sin_stock` no existe y
 * hay que **darlo de baja**. Los dos "nunca salieron" y el movimiento es opuesto.
 */
export function hayUnidadFisica(m: MotivoReclamo): boolean {
  return PERFIL_MOTIVO[m].unidadExiste
}

/**
 * ¿Se le devuelve también el envío de ida?
 *
 * Sólo cuando **no recibió nada** (`no_llego`, `sin_stock`). En todo el resto la devolución es del
 * producto únicamente: el envío se prestó el servicio, llegó. Antes esto era un checkbox libre que
 * se podía tildar en cualquier caso.
 */
export function devuelveElEnvioDeIda(m: MotivoReclamo): boolean {
  return !PERFIL_MOTIVO[m].recibioAlgo
}

/**
 * ¿Se le puede ofrecer un descuento para que se lo quede?
 *
 * Sólo tiene sentido si el producto está en su poder. La cuenta la hace `cuentaDescuento`: el techo
 * es lo que perdemos porque vuelva — la logística si está sano, la depreciación más el envío si
 * está fallado.
 */
export function ofreceRetencion(m: MotivoReclamo): boolean {
  return PERFIL_MOTIVO[m].retencion
}

/** ¿Decide el cliente en vez de nosotros? Hoy sólo en `sin_stock`, que es el caso raro. */
export function decideElCliente(m: MotivoReclamo): boolean {
  return PERFIL_MOTIVO[m].decideCliente
}

export const ESTADO_LABEL: Record<EstadoReclamo, string> = {
  borrador: 'Borrador',
  esperando_cliente: 'Esperando al cliente',
  en_revision: 'Para revisar',
  resuelto: 'Resuelto, en curso',
  en_transito: 'En camino de vuelta',
  recibido: 'Recibido',
  cerrado: 'Cerrado',
  anulado: 'Anulado',
}

/**
 * El estado como lo lee alguien del local. Cambia solo en un caso, pero importa: si el cliente
 * lo trae en mano, "En camino de vuelta" es mentira — no hay nada viajando, hay alguien que
 * todavía no vino.
 */
export function estadoEnCriollo(d: Pick<ReclamoRow, 'estado' | 'via_retorno'>): string {
  if (d.estado === 'en_transito' && d.via_retorno === 'presencial') return 'Esperando que lo traiga'
  return ESTADO_LABEL[d.estado] ?? d.estado
}

// ── La orden de Tienda Nube ─────────────────────────────────────────────────────

/**
 * Lo que devuelve `tiendanube-audit?orden=N`. Los campos de plata y de forma de pago los
 * agregó el proyecto de Devoluciones: **son opcionales a propósito**. Si bdi-catalogo todavía
 * no tiene esa versión desplegada llegan `undefined`, y entonces el monto se carga a mano en
 * vez de calcularse — degradación, no error.
 */
export type OrdenTN = {
  id: string | number
  number: string | number
  cliente?: string | null
  total?: number | null
  envio?: string | null
  fecha?: string | null
  pago_metodo?: string | null
  pago_gateway?: string | null
  pago_cuotas?: number | null
  subtotal?: number | string | null
  descuento_total?: number | string | null
  descuento_cupon?: number | string | null
  descuento_pago?: number | string | null
  cupon?: string | null
  envio_costo_cliente?: number | string | null
  estado_pago?: string | null
  estado_orden?: string | null
  products?: ProductoOrdenTN[]
}

export type ProductoOrdenTN = {
  product_id?: string | number | null
  variant_id?: string | number | null
  name?: string | null
  sku?: string | null
  /** TN los manda como texto ("1", "8990.00"). El cálculo los tolera. */
  quantity?: number | string | null
  price?: number | string | null
}

/**
 * Una línea del reclamo. `costo` y `pvp_feria` salen de GN y son los que deciden si conviene el
 * retorno.
 *
 * ⚠️ **Hay ids de dos mundos y no son intercambiables.** `product_id`/`size_id` son de Gestión
 * Nube (se completan cruzando por SKU) y sirven para descontar stock y crear la falla.
 * `tn_product_id`/`variant_id` son de Tienda Nube y sirven para corregir el stock de la tienda.
 * Usar uno donde va el otro escribe en el producto equivocado.
 */
export type ItemReclamo = {
  sku?: string | null
  product_id?: string | null
  size_id?: string | null
  /** De Tienda Nube (el par con `variant_id`), para escribir stock en la tienda. */
  tn_product_id?: string | null
  variant_id?: string | null
  producto: string
  variante?: string | null
  cantidad: number | string
  /** Precio unitario de lista, tal como vino en la orden de TN (puede ser texto). */
  precio?: number | string | null
  /** Lo que realmente se pagó por la línea, ya con los descuentos prorrateados. */
  pagado?: number | null
  costo?: number | null
  pvp_feria?: number | null
}

// ── La plata ────────────────────────────────────────────────────────────────────

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Número positivo, o 0. **Acepta strings a propósito**: Tienda Nube manda los precios y las
 * cantidades como texto (`price: "8990.00"`, `quantity: "1"`), así que exigir `number` acá hacía
 * que toda orden real calculara 0. Se descubrió probando contra una orden de verdad.
 */
const positivo = (n: unknown): number => {
  const v = typeof n === 'string' ? Number(n) : n
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : 0
}

/**
 * Lo que la persona **efectivamente pagó** por una línea: el precio de lista menos la parte
 * proporcional de los descuentos de la orden.
 *
 * El prorrateo no es un detalle. Si la orden tuvo un cupón del 20% y se devuelve un ítem a
 * precio de lista, se le está devolviendo plata que nunca pagó. **Era el hueco del motor viejo de
 * Cambios**, que tomaba el precio del devuelto sin descuentos.
 *
 * Sin `subtotal` o sin descuentos (o si la versión vieja del endpoint no los manda), devuelve
 * el bruto: es el comportamiento anterior, no una regresión.
 */
export function pagadoPorItem(item: Pick<ItemReclamo, 'precio' | 'cantidad'>, orden?: OrdenTN | null): number {
  const bruto = positivo(item.precio) * positivo(item.cantidad)
  if (!bruto) return 0
  const subtotal = positivo(orden?.subtotal)
  const descuento = positivo(orden?.descuento_total)
  if (!subtotal || !descuento) return redondear(bruto)
  // Un descuento mayor al subtotal dejaría el pagado en negativo: se acota. No debería pasar,
  // pero es plata y el dato viene de afuera.
  const prorrateo = Math.min(descuento * (bruto / subtotal), bruto)
  return redondear(bruto - prorrateo)
}

export type MontoReclamo = {
  /** Suma de lo pagado por los ítems del reclamo. */
  producto: number
  /** El envío que pagó el cliente, si se decide devolverlo. */
  envio: number
  total: number
}

/**
 * Cuánta plata se le devuelve. Solo el producto, salvo que se tilde devolver también el envío
 * que pagó —que es una decisión comercial/legal, no del sistema, y por eso viene por parámetro—.
 *
 * El envío de VUELTA (la etiqueta que pagamos nosotros) no entra acá: no se le descuenta al
 * cliente ni se le cobra.
 */
export function calcularMonto(
  items: ItemReclamo[],
  orden?: OrdenTN | null,
  opciones?: { devolverEnvio?: boolean; montoAcordado?: number | null },
): MontoReclamo {
  const producto = redondear(items.reduce((s, it) => s + (it.pagado ?? pagadoPorItem(it, orden)), 0))
  const envio = opciones?.devolverEnvio ? redondear(positivo(orden?.envio_costo_cliente)) : 0
  // En "se lo queda + parte de la plata" manda el monto acordado con el cliente, no la cuenta.
  const acordado = opciones?.montoAcordado
  const total = typeof acordado === 'number' && isFinite(acordado) && acordado >= 0
    ? redondear(acordado)
    : redondear(producto + envio)
  return { producto, envio, total }
}

// ── ¿Conviene que el producto vuelva? ─────────────────────────────────────────────

export type CuentaRetorno = {
  /** Lo que se recupera si vuelve. */
  recuperable: number
  envioVuelta: number
  conviene: boolean
  /** Por qué, en criollo, para mostrarlo al lado de la sugerencia. */
  motivo: string
}

/**
 * La cuenta que hoy no está en ningún lado y hace perder plata: pagar un envío de vuelta de
 * una funda que en feria se vende por menos que ese envío.
 *
 * Lo recuperable **depende del estado de el producto**, y esa es la parte que se pasa por alto:
 *   - **sano** → vuelve a stock y se revende a precio completo: se recupera el precio de venta.
 *   - **fallado** → NO vuelve a stock (va al ledger de Fallas). Lo único que se saca de esa
 *     unidad es venderla en feria, así que lo recuperable es el **PVP de feria**, que suele ser
 *     una fracción del precio de lista.
 *
 * `piso` es el corte duro configurable: por debajo de eso no se pide el retorno aunque la
 * cuenta dé, porque el trabajo de recibirlo y procesarlo tampoco es gratis.
 */
export function convieneRetorno(
  items: ItemReclamo[],
  opciones: { fallada: boolean; envioVuelta: number; piso?: number },
): CuentaRetorno {
  const { fallada, piso = 0 } = opciones
  const envioVuelta = redondear(positivo(opciones.envioVuelta))
  const recuperable = redondear(
    items.reduce(
      (s, it) => s + positivo(fallada ? it.pvp_feria : (it.precio ?? it.pvp_feria)) * positivo(it.cantidad),
      0,
    ),
  )

  // El desglose no es adorno: los valores se cargan POR UNIDAD y el reclamo puede tener varias.
  // Sin esto, alguien carga 6.000 de PVP de feria, lee "recuperás 12.000" y piensa que la cuenta
  // está mal — pasó apenas se probó la pantalla.
  const unidades = items.reduce((s, it) => s + positivo(it.cantidad), 0)
  const detalle = unidades > 1 ? ` (${unidades} unidades × ${redondear(recuperable / unidades)} c/u)` : ''

  if (!recuperable) {
    return { recuperable, envioVuelta, conviene: false, motivo: 'No se sabe cuánto se recupera: falta el precio o el PVP de feria.' }
  }
  if (piso > 0 && recuperable < piso) {
    return { recuperable, envioVuelta, conviene: false, motivo: `Está por debajo del piso de ${piso}: no se pide el retorno.` }
  }
  if (envioVuelta > 0 && recuperable <= envioVuelta) {
    return { recuperable, envioVuelta, conviene: false, motivo: `No conviene: recuperás ${recuperable}${detalle} y gastás ${envioVuelta} de envío.` }
  }
  return { recuperable, envioVuelta, conviene: true, motivo: `Conviene: recuperás ${recuperable}${detalle} y el envío sale ${envioVuelta}.` }
}

// ── El cambio por otro producto ─────────────────────────────────────────────────

/** Solo dos formas, y transferencia lleva descuento. Igual que en el motor viejo de Cambios. */
export type FormaPago = 'tarjeta' | 'transferencia'
/** El % que se le descuenta a la diferencia A COBRAR según cómo pague. */
const DESCUENTO_FORMA: Record<FormaPago, number> = { tarjeta: 0, transferencia: 10 }

export const FORMA_PAGO_DEF: Record<FormaPago, { label: string; descuento: number }> = {
  tarjeta: { label: 'Tarjeta', descuento: DESCUENTO_FORMA.tarjeta },
  transferencia: { label: 'Transferencia', descuento: DESCUENTO_FORMA.transferencia },
}

/**
 * Quién paga el envío del cambio. **No es un detalle de logística: cambia el total a cobrar.**
 * El envío queda solo en el Monitor y NO viaja a la venta de Gestión Nube (decisión de Bruno en el
 * motor viejo), pero si lo paga el cliente hay que cobrárselo en el mostrador.
 */
export type EnvioPaga = 'cliente' | 'nosotros'

/** Días que el cliente tiene para cambiar desde la compra. Regla del negocio. */
export const DIAS_CAMBIO = 30

export type CuentaCambio = {
  /** Lo que se lleva, a precio de lista. */
  nuevos: number
  /** Lo que devuelve, a lo que REALMENTE pagó (con los descuentos de la orden prorrateados). */
  devueltos: number
  /** Σnuevos − Σdevueltos, antes de descuentos y de envío. Es el "Subtotal productos" del ticket. */
  diferencia: number
  descuentoManual: number
  descuentoForma: number
  /** Los dos descuentos juntos: lo que se resta del subtotal. */
  descuento: number
  /** El envío, solo si lo paga el cliente. Si lo pagamos nosotros no entra en el total. */
  envioACobrar: number
  /** Positivo: lo paga el cliente. Negativo: se le devuelve. Cero: parejo. */
  total: number
  /** En criollo, para la pantalla y para el mensaje. */
  quienPaga: 'cliente' | 'nosotros' | 'nadie'
}

/**
 * La cuenta de un cambio por otro producto — la del ticket del POS, de arriba hacia abajo:
 *
 *     Subtotal productos   Σnuevos − Σdevueltos
 *     − Descuento          manual en $, y después el % por forma de pago sobre lo que queda
 *     = Total productos    esto es lo único que viaja a la venta de Gestión Nube
 *     + Envío              solo si lo paga el cliente; queda únicamente en el Monitor
 *     = Total a pagar
 *
 * # Cuánto vale lo que entrega: LISTA CONTRA LISTA
 *
 * Un cambio se cuenta **lista contra lista**, o sea que el cliente **conserva el descuento** que
 * había conseguido en la compra original. Cambiar una funda por la misma funda da **cero**, que es
 * lo que cualquiera espera parado en el mostrador. Si se le acreditara lo que pagó, cambiar algo
 * comprado con cupón por su equivalente le saldría plata — el castigo justo al revés.
 *
 * ⚠️ **Pero eso sólo vale mientras la diferencia esté a favor NUESTRO.** Si se lleva algo más
 * barato y el crédito fuera el precio de lista, se le devolvería plata que nunca puso: es
 * exactamente el hueco del motor viejo de Cambios. Con la funda de la orden #20700 —lista $8.990,
 * pagada $7.641,50— cambiada por algo de $6.000, lista contra lista devolvería $2.990 cuando
 * corresponden $1.641,50.
 *
 * Entonces la cuenta corre **dos veces**: primero lista contra lista; si da a favor del cliente,
 * se rehace valuando lo devuelto a **lo que pagó**, y ése es el número que vale. Así el cliente
 * conserva su descuento cuando pone plata, y nunca sale de la caja más de lo que entró.
 *
 * Los dos descuentos solo aplican sobre una diferencia **a cobrar**: si el cambio da a favor del
 * cliente no hay nada que descontar. El envío, en cambio, se suma siempre que lo pague él —
 * incluso sobre una diferencia a favor, donde achica lo que le devolvemos.
 */
export function calcularCambio(opciones: {
  devueltos: ItemReclamo[]
  nuevos: ItemReclamo[]
  orden?: OrdenTN | null
  formaPago?: FormaPago | null
  /** Un descuento extra acordado a mano, sobre la diferencia a cobrar. */
  descuentoManual?: number | null
  /** Lo que sale el envío del cambio. Solo entra al total si lo paga el cliente. */
  envioCosto?: number | null
  envioPaga?: EnvioPaga | null
}): CuentaCambio {
  const { devueltos, nuevos, orden } = opciones
  const totalNuevos = redondear(nuevos.reduce((s, it) => s + positivo(it.precio) * positivo(it.cantidad), 0))

  // Los dos valores de lo devuelto: a precio de vidriera y a lo que la persona realmente puso.
  const aLista = redondear(devueltos.reduce((s, it) => s + positivo(it.precio) * positivo(it.cantidad), 0))
  const aPagado = redondear(devueltos.reduce((s, it) => s + (it.pagado ?? pagadoPorItem(it, orden)), 0))

  // Lista contra lista mientras el cliente ponga plata: conserva el descuento que había conseguido.
  // En cuanto la cuenta queda a favor de él, se revalúa a lo pagado para no devolver de más — que
  // es la única regla innegociable del módulo.
  const totalDevueltos = totalNuevos - aLista >= 0 ? aLista : Math.min(aLista, aPagado)
  const diferencia = redondear(totalNuevos - totalDevueltos)

  // Los descuentos solo tienen sentido sobre lo que el cliente TIENE que poner.
  const descuentoManual = diferencia > 0 ? Math.min(positivo(opciones.descuentoManual), diferencia) : 0
  const base = Math.max(diferencia - descuentoManual, 0)
  const pct = opciones.formaPago ? DESCUENTO_FORMA[opciones.formaPago] : 0
  const descuentoForma = diferencia > 0 ? redondear((base * pct) / 100) : 0
  const descuento = redondear(descuentoManual + descuentoForma)
  const envioACobrar = opciones.envioPaga === 'cliente' ? redondear(positivo(opciones.envioCosto)) : 0
  const total = redondear(diferencia - descuento + envioACobrar)

  return {
    nuevos: totalNuevos,
    devueltos: totalDevueltos,
    diferencia,
    descuentoManual,
    descuentoForma,
    descuento,
    envioACobrar,
    total,
    quienPaga: total > 0 ? 'cliente' : total < 0 ? 'nosotros' : 'nadie',
  }
}

/** ¿Este reclamo es un cambio? Es la única condición: la salida es otro producto. */
export function esCambio(d: Pick<ReclamoRow, 'compensacion'>): boolean {
  return d.compensacion === 'otro_producto'
}

// ── Qué aplica a cada motivo ────────────────────────────────────────────────────

/**
 * Las salidas que tienen sentido según lo que pasó. No es cosmético: ofrecer "le mandamos otra
 * igual" en un arrepentimiento, o "le devolvemos una parte" en un pedido mal armado, invita a
 * resolver mal. Cada motivo tiene su repertorio.
 */
export function compensacionesDe(motivo: MotivoReclamo): Compensacion[] {
  switch (motivo) {
    // Se arrepintió o no era lo que esperaba: el producto está bien, lo que se discute es la plata.
    // El descuento parcial existe para retenerlo; mandarle otra igual no tendría sentido.
    case 'arrepentimiento':
    case 'no_esperaba':
    case 'no_era_lo_esperado':
      return ['otro_producto', 'plata_total', 'plata_parcial', 'cupon']
    // El talle: el producto está sana y casi siempre se lleva otra. Por eso el cambio va primero —
    // es la salida por defecto, no una más de la lista.
    case 'talle':
      return ['otro_producto', 'plata_total', 'plata_parcial', 'cupon']
    // Falla: es donde hay más margen: devolver, descontar para que se lo quede, o reponerla.
    case 'falla':
      return ['otra_unidad', 'otro_producto', 'plata_total', 'plata_parcial', 'cupon']
    // Nunca salió: o se lo mandamos, o le devolvemos esa parte. No hay producto que negociar.
    case 'faltante':
    case 'sin_stock':
      return ['reenvio', 'plata_total', 'cupon']
    // Le mandamos otra cosa: lo que corresponde es mandarle lo suyo. Devolver la plata es la
    // salida si ya no lo quiere.
    case 'mal_armado':
      return ['reenvio', 'plata_total', 'cupon']
    // Se perdió en el camino: se repone o se devuelve. El producto no está en ningún lado.
    case 'no_llego':
      return ['reenvio', 'plata_total']
    default:
      return ['plata_total', 'plata_parcial', 'otra_unidad', 'reenvio', 'cupon', 'ninguna']
  }
}

/** ¿Hay un producto que pueda volver? En los tres casos donde no, media pantalla sobra. */
export function puedeVolverLaPrenda(motivo: MotivoReclamo): boolean {
  return !NUNCA_SALIO.includes(motivo) && motivo !== 'no_llego'
}

/** El destino de el producto queda determinado por el motivo, salvo en la falla. */
export function destinoDe(motivo: MotivoReclamo, vuelve: boolean): DestinoPrenda {
  if (NUNCA_SALIO.includes(motivo)) return 'no_salio'
  if (motivo === 'no_llego') return 'perdida'
  if (motivo === 'falla') return 'falla'
  return vuelve ? 'stock' : 'falla'
}

/**
 * En "pedido mal armado" hay dos productos y **dos posibles descuadres de stock**. Esta función
 * dice cuál de los dos hay que corregir, que es lo que nadie tiene en la cabeza a las 6 de la
 * tarde:
 *
 *   - El producto **correcto** ya está descontado por la venta original. Si se lo mandamos ahora,
 *     cuadra solo: no hay nada que hacer.
 *   - El producto **equivocado** salió del depósito y GN no se enteró. Si el cliente se lo queda,
 *     **hay que descontarlo**; si lo devuelve, vuelve al depósito y tampoco hay nada que hacer.
 */
export function correccionesMalArmado(opciones: { equivocadoVuelve: boolean; seEnviaElCorrecto: boolean }): {
  descontarEnviadoPorError: boolean
  anularVentaOriginal: boolean
  nota: string
} {
  const { equivocadoVuelve, seEnviaElCorrecto } = opciones
  const descontarEnviadoPorError = !equivocadoVuelve
  const anularVentaOriginal = !seEnviaElCorrecto
  const partes: string[] = []
  if (descontarEnviadoPorError) partes.push('el producto que se envió por error se lo queda el cliente: hay que descontarlo del stock')
  if (anularVentaOriginal) partes.push('el producto correcto no se envía: hay que anular su venta para que vuelva al stock')
  return {
    descontarEnviadoPorError,
    anularVentaOriginal,
    nota: partes.length ? partes.join(' · ') : 'El stock cuadra solo: no hay nada que corregir.',
  }
}

// ── El descuento para que se lo quede ───────────────────────────────────────────

export type CuentaDescuento = {
  /** Hasta acá se puede ofrecer sin perder plata respecto de pedirlo de vuelta. */
  techo: number
  /** Lo que conviene ofrecer primero: deja margen para negociar. */
  sugerido: number
  /** Lo que se pierde si el producto vuelve, en positivo. */
  seePierdeSiVuelve: number
  /** Cuando el techo supera el precio: regalarlo sale más barato que pedirlo. */
  convieneRegalar: boolean
  motivo: string
}

/** Del techo, lo que se ofrece primero. El resto queda como margen de negociación. */
const FRACCION_SUGERIDA = 0.5

/**
 * Cuánto se le puede descontar al cliente para que se quede el producto, en vez de que vuelva.
 *
 * **La regla: el descuento máximo es lo que perdés porque vuelva.** Y eso cambia radicalmente
 * según en qué estado vuelve, que es lo que hace que un techo único sea caro:
 *
 *   - **Sana** (arrepentimiento, no era lo que esperaba): vuelve al stock y se revende a precio
 *     completo. Lo único que perdés es la logística → `techo = envío de vuelta`.
 *   - **Fallada**: NO se revende como nuevo, va a feria. Perdés el envío **y** la diferencia entre
 *     lo que vale nueva y lo que vas a sacar en feria → `techo = precio − PVP feria + envío`.
 *
 * El caso real de BDI que justifica esto: funda de $12.000, PVP feria $3.500, envío $6.000. Si
 * vuelve, se termina $2.500 en rojo; el techo da $14.500, o sea **más que el precio**: regalarlo
 * sale más barato que pedirlo. Con un techo del envío se perdían ~$8.500 por unidad.
 *
 * Devuelve el techo Y un sugerido conservador: el techo es el límite de "no perder", no la oferta.
 */
export function cuentaDescuento(opciones: {
  items: ItemReclamo[]
  fallada: boolean
  envioVuelta: number
  /** Lo que cuesta recibir, revisar y reingresar. Se suma al techo: también te lo ahorrás. */
  costoOperativo?: number
}): CuentaDescuento {
  const { items, fallada } = opciones
  const envio = positivo(opciones.envioVuelta)
  const operativo = positivo(opciones.costoOperativo)
  const precio = redondear(items.reduce((s, it) => s + positivo(it.precio) * positivo(it.cantidad), 0))
  const feria = redondear(items.reduce((s, it) => s + positivo(it.pvp_feria) * positivo(it.cantidad), 0))

  if (fallada && !feria) {
    return { techo: 0, sugerido: 0, seePierdeSiVuelve: 0, convieneRegalar: false, motivo: 'Falta el PVP de feria: sin eso no se puede saber cuánto se pierde si vuelve.' }
  }

  // Lo que se pierde si vuelve. En una fallada, la depreciación es la parte grande.
  const depreciacion = fallada ? Math.max(precio - feria, 0) : 0
  const seePierdeSiVuelve = redondear(depreciacion + envio + operativo)
  const techo = seePierdeSiVuelve
  const sugerido = redondear(Math.min(techo * FRACCION_SUGERIDA, precio))
  const convieneRegalar = techo >= precio && precio > 0

  const motivo = fallada
    ? `Si vuelve perdés ${seePierdeSiVuelve} (se deprecia ${depreciacion} más ${envio} de envío).` +
      (convieneRegalar ? ' Es más que el precio: regalarlo sale más barato que pedirlo.' : '')
    : `Vuelve sano y se revende a precio completo, así que lo único que perdés es ${seePierdeSiVuelve} de logística.`

  return { techo, sugerido, seePierdeSiVuelve, convieneRegalar, motivo }
}

/**
 * Qué nos costó el caso. Sin esto no se puede responder después "cuánto nos costaron las
 * devoluciones este mes" ni con qué proveedor se van en fallas.
 *
 * La unidad perdida se valúa **a costo**: es lo que se fue por la puerta cuando el producto se le
 * regala al cliente. Si vuelve (a stock o a fallas) no se perdió, se recuperó.
 */
export function costoDelCaso(opciones: {
  montoDevuelto: number
  envioVuelta?: number | null
  envioReemplazo?: number | null
  items: ItemReclamo[]
  destino: DestinoPrenda
}): number {
  const { montoDevuelto, items, destino } = opciones
  const envios = positivo(opciones.envioVuelta) + positivo(opciones.envioReemplazo)
  // Solo se pierde la unidad si el cliente se lo queda; si vuelve —sana o fallada— se recupera.
  const unidadPerdida = destino === 'stock' || destino === 'no_salio'
    ? 0
    : items.reduce((s, it) => s + positivo(it.costo) * positivo(it.cantidad), 0)
  return redondear(positivo(montoDevuelto) + envios + unidadPerdida)
}

// ── La fila ─────────────────────────────────────────────────────────────────────

export type FotoReclamo = { url: string; at: string; por?: 'cliente' | 'equipo' }

export type DevolucionEvento = { estado: EstadoReclamo; at: string; usuario?: string | null; nota?: string | null }

export type ReclamoRow = {
  id: number
  store: Marca
  /** Derivado del id con `numeroReclamo`, no una columna: no viene de la base. */
  numero?: string
  orden_tn?: string | null
  cliente?: string | null
  /** Token del link que se le pasa al cliente para que cargue fotos. Nunca se muestra en listados. */
  token?: string | null
  token_vence?: string | null
  motivo: MotivoReclamo
  motivo_detalle?: string | null
  relato_cliente?: string | null
  fotos?: FotoReclamo[]
  destino_prenda?: DestinoPrenda | null
  compensacion?: Compensacion | null
  estado: EstadoReclamo
  items: ItemReclamo[]
  monto_producto?: number | null
  monto_acordado?: number | null
  monto_envio_devuelto?: number | null
  monto_total?: number | null
  pago_metodo?: string | null
  pago_gateway?: string | null
  devolver_envio?: boolean | null
  /** Lo que sugirió la cuenta vs lo que se decidió: si difieren, quedó registrado. */
  retorno_sugerido?: boolean | null
  retorno_decidido?: boolean | null
  /** Cómo vuelve. Null si no vuelve (se lo queda el cliente) o si todavía no se decidió. */
  via_retorno?: ViaRetorno | null
  /**
   * El envío de VUELTA. En un reclamo común es siempre a nuestro cargo; en un **cambio** puede
   * pagarlo el cliente, y por eso existe `envio_paga`.
   */
  envio_costo?: number | null
  /** Quién paga el envío. Solo tiene sentido en un cambio; en el resto es siempre nuestro. */
  envio_paga?: EnvioPaga | null
  seguimiento_vuelta?: string | null
  /** El envío de IDA: solo existe cuando se le manda otra unidad. También a nuestro cargo. */
  envio_ida_costo?: number | null
  seguimiento_ida?: string | null
  gn_venta_id?: string | null
  gn_venta_number?: string | null
  /** La venta técnica que descontó del stock la unidad de reemplazo. */
  gn_venta_reemplazo_id?: string | null
  gn_venta_reemplazo_number?: string | null
  stock_estado: PendienteEstado
  reintegro_estado: PendienteEstado
  tn_stock_estado: PendienteEstado
  reintegro_at?: string | null
  reintegro_por?: string | null
  reintegro_comprobante?: string | null
  cupon_codigo?: string | null
  expectativa?: Expectativa | null
  /** El número de reclamo al transportista, cuando el pedido se perdió en el camino. */
  reclamo_correo?: string | null
  reclamo_correo_estado?: PendienteEstado
  /** Lo que se le mandó al cliente, con su texto y su fecha. */
  mensajes?: { tipo: string; at: string; por?: string | null; texto: string }[]
  /** En "pedido mal armado": lo que se le TENDRÍA que haber mandado. */
  items_correctos?: ItemReclamo[]
  /** En un cambio por otro producto: lo que se lleva. De acá sale la diferencia de precio. */
  items_nuevos?: ItemReclamo[]
  forma_pago?: FormaPago | null
  /** Positivo: lo paga el cliente. Negativo: se le devuelve. */
  diferencia?: number | null
  descuento_manual?: number | null
  /**
   * El cobro del cambio, en dos tiempos. `pagado` es el **gate** para generar la venta en GN: se
   * marca cuando el cliente puso la plata, y recién entonces se puede facturar. Sin esta separación
   * el cambio se armaba y se cobraba en el mismo gesto, que no es lo que pasa en el mostrador.
   */
  pagado?: boolean | null
  /** El pendiente de caja: la diferencia quedó a cobrar y todavía no entró. */
  cobro_estado?: CobroEstado | null
  /**
   * El producto que el cliente devuelve en un cambio vuelve al stock **a mano** en GN (la API no
   * acepta una venta negativa). No confundir con `stock_estado`, que traza la ANULACIÓN de la venta
   * original: en un cambio esa venta no se anula nunca, porque el cliente se queda con la compra y
   * solo cambia el artículo.
   */
  reingreso_estado?: PendienteEstado | null
  /** La solicitud de etiqueta (EM####) del envío del cambio. Se guarda SIN el prefijo. */
  solicitud_envio?: string | null
  falla_ids?: number[]
  costo_caso?: number | null
  usuario?: string | null
  historial?: DevolucionEvento[]
  created_at?: string
  updated_at?: string
}

/**
 * ¿La falla que se crea desde este reclamo tiene que descontar stock?
 *
 * Es la regla más delicada del módulo, porque equivocarla no rompe nada visible: deja el stock
 * mal por una unidad hasta el próximo conteo.
 *
 *   - **Se le devolvió la plata** → la venta original se anula, y al anularla la unidad vuelve al
 *     stock. Está fallada y no se puede vender: hay que volver a sacarla. **Descuenta.**
 *   - **Se le mandó otra unidad igual** → la venta original NO se anula (el cliente se queda con
 *     lo que compró) y esa unidad ya salió del stock. Descontarla otra vez restaría dos veces por
 *     una sola producto. **No descuenta.**
 */
export function laFallaDescuentaStock(compensacion: Compensacion | null | undefined): boolean {
  return compensacion !== 'otra_unidad'
}

// ── Alertas por antigüedad ──────────────────────────────────────────────────────

/**
 * Los días a partir de los cuales un reclamo deja de estar "en curso" y pasa a estar dormido.
 * Son distintos a propósito: que un cliente tarde en mandar fotos es normal, que la plata no
 * salga en cinco días no.
 */
export const DIAS_ALERTA = { cliente: 10, plata: 5, transito: 15, sinDecidir: 3 } as const

export type AlertaReclamo = { tono: Tono; texto: string; dias: number }
type Tono = 'warning' | 'danger'

const diasDesde = (iso?: string | null, ahora = Date.now()): number => {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return isFinite(t) ? Math.floor((ahora - t) / 86400000) : 0
}

/**
 * Qué está durmiendo en este reclamo. Se **deriva** de las fechas y los pendientes: no hay tabla
 * de alertas ni proceso que las genere, igual que los avisos del sidebar.
 *
 * El orden importa: lo primero de la lista es lo que se muestra cuando hay lugar para una sola.
 * La plata va primero porque es la que el cliente reclama.
 */
export function alertasDe(d: ReclamoRow, ahora = Date.now()): AlertaReclamo[] {
  const alertas: AlertaReclamo[] = []
  const desdeCreado = diasDesde(d.created_at, ahora)
  const desdeToque = diasDesde(d.updated_at || d.created_at, ahora)

  if (d.reintegro_estado === 'pendiente' && d.compensacion && desdeToque >= DIAS_ALERTA.plata) {
    alertas.push({ tono: 'danger', texto: `Hace ${desdeToque} días que la plata no sale`, dias: desdeToque })
  }
  if (d.estado === 'esperando_cliente' && desdeCreado >= DIAS_ALERTA.cliente) {
    alertas.push({ tono: 'warning', texto: `El cliente no responde hace ${desdeCreado} días`, dias: desdeCreado })
  }
  if (d.estado === 'en_transito' && desdeToque >= DIAS_ALERTA.transito) {
    alertas.push({ tono: 'warning', texto: `Hace ${desdeToque} días que no llega`, dias: desdeToque })
  }
  // Ya cargó las fotos y nadie decidió: es el único que depende de nosotros y no del cliente.
  if (d.estado === 'en_revision' && desdeToque >= DIAS_ALERTA.sinDecidir) {
    alertas.push({ tono: 'danger', texto: `Esperando una decisión hace ${desdeToque} días`, dias: desdeToque })
  }
  return alertas
}

/** Cuántos reclamos tienen alguna alerta. Es el número del badge. */
export function conAlerta(filas: ReclamoRow[], ahora = Date.now()): number {
  return filas.filter((d) => alertasDe(d, ahora).length > 0).length
}

/**
 * `R-0042`. **Un solo prefijo para todo el post-venta**, cambios incluidos.
 *
 * Antes convivían `D-` (de cuando la sección se llamaba Devoluciones) y `C-` (de Cambios). Ninguna
 * de las dos nombra lo que esto es hoy, y con dos prefijos Administración tiene que seguir dos
 * colas para lo mismo. Se unificó aprovechando que las tablas estaban vacías: después son mensajes
 * ya mandados a clientes.
 */
export function numeroReclamo(id: number): string {
  return 'R-' + String(id).padStart(4, '0')
}

/**
 * ¿Venció el link del cliente?
 *
 * El portal rechaza un token vencido con el mismo 404 que usa para uno inválido, así que del lado
 * del cliente "venció" y "no existe" se ven idénticos. Conviene chequearlo antes de copiar el
 * mensaje y regenerarlo en el acto, en vez de mandarle un link muerto.
 *
 * Sin fecha devuelve `false`: los reclamos viejos no tienen `token_vence` y no hay que tratarlos
 * como vencidos.
 */
export function tokenVencido(vence: string | null | undefined): boolean {
  if (!vence) return false
  const t = Date.parse(vence)
  return Number.isFinite(t) && t < Date.now()
}

/**
 * Qué falta para poder cerrar el reclamo. Devuelve la lista en criollo: si no está vacía, el
 * botón de cerrar va deshabilitado con esto como explicación.
 *
 * ⚠️ **Un cambio no cierra con las mismas condiciones que una devolución**, y esta es la
 * distinción que hay que tener a la vista:
 *   - La venta original **no se anula**: el cliente se queda con la compra y solo cambia el
 *     artículo. Exigir la anulación dejaba todo cambio trabado para siempre.
 *   - **No hay plata que devolver** salvo que la diferencia haya quedado a favor del cliente.
 *   - Lo que sí hay, y no existía como pendiente, es **reingresar a mano** el producto que volvió.
 */
export function estaDecidido(d: ReclamoRow): boolean {
  return !!d.compensacion
}

export function faltantesParaCerrar(d: ReclamoRow): string[] {
  const faltan: string[] = []
  const cambio = esCambio(d)

  // Mientras no haya decisión, el único pendiente real es decidir. Los de plata y stock salen de
  // la decisión, así que antes de tenerla no se sabe si van a existir — y en la mitad de los casos
  // no existen. Antes nacían en 'pendiente' y la fila mostraba "anular la venta original en
  // Gestión Nube · devolver la plata" desde el minuto cero: pendientes inventados, que es la forma
  // más rápida de que la gente aprenda a no mirar la columna.
  if (!estaDecidido(d) && d.estado !== 'anulado') {
    faltan.push('decidir qué se hace')
    // El reclamo al transportista corre en paralelo y no espera a nadie: es plata recuperable y si
    // el reclamo se cierra sin presentarlo, se perdió.
    if (d.reclamo_correo_estado === 'pendiente') faltan.push('presentar el reclamo al transportista')
    if (d.tn_stock_estado === 'pendiente') faltan.push('corregir el stock en Tienda Nube')
    return faltan
  }

  if (cambio) {
    if (d.reingreso_estado === 'pendiente') faltan.push('reingresar en Gestión Nube el producto devuelto')
    if (d.cobro_estado === 'pendiente') faltan.push('cobrar la diferencia')
    // Solo cuando la cuenta quedó a favor del cliente sale plata de la caja.
    if (d.reintegro_estado === 'pendiente' && (d.diferencia ?? 0) < 0) faltan.push('devolverle la diferencia')
  } else {
    if (d.stock_estado === 'pendiente') faltan.push('anular la venta original en Gestión Nube')
    if (d.reintegro_estado === 'pendiente') faltan.push('devolver la plata')
  }

  if (d.tn_stock_estado === 'pendiente') faltan.push('corregir el stock en Tienda Nube')
  // Plata recuperable: si el reclamo se cierra sin esto, esa plata se perdió y nadie se entera.
  if (d.reclamo_correo_estado === 'pendiente') faltan.push('presentar el reclamo al transportista')
  if (d.destino_prenda === 'stock' && d.estado !== 'recibido' && d.estado !== 'cerrado') faltan.push('recibir el producto')
  // Cuando el producto se le queda al cliente, la foto es la única prueba de que la falla existió.
  if (d.destino_prenda === 'falla' && !(d.fotos || []).length) faltan.push('al menos una foto del producto')
  return faltan
}

// ── El POS del cambio ───────────────────────────────────────────────────────────

/**
 * Qué falta para poder **generar la venta** del cambio en Gestión Nube. Es el gate del botón
 * "Crear venta": mientras devuelva algo, no se factura.
 *
 * Portado de `faltantesParaVenta` del motor viejo. Deliberadamente **no exige nada para guardar el
 * borrador**: el cambio se arma en dos tiempos y a medio hacer tiene que poder guardarse.
 */
export function faltantesParaProcesar(d: {
  orden_tn?: string | null
  items?: ItemReclamo[]
  items_nuevos?: ItemReclamo[]
  forma_pago?: FormaPago | null
  via_retorno?: ViaRetorno | null
  envio_paga?: EnvioPaga | null
  solicitud_envio?: string | null
}): string[] {
  const faltan: string[] = []
  if (!d.orden_tn) faltan.push('la orden de venta asociada')
  if (!(d.items || []).length) faltan.push('el producto que devuelve')
  // Sin los ids de GN no se puede descontar stock: un nombre suelto no alcanza.
  if (!(d.items_nuevos || []).some((i) => i.product_id && i.size_id)) faltan.push('el producto que se lleva (de Gestión Nube)')
  if (!d.forma_pago) faltan.push('la forma de pago')
  if (!d.via_retorno) faltan.push('la vía de envío')
  if (!d.envio_paga) faltan.push('quién paga el envío')
  // La solicitud de etiqueta es del envío manual: la cadetería y el mostrador no la tienen.
  if (pideSeguimiento(d.via_retorno) && !d.solicitud_envio) faltan.push('la solicitud de envío (EM)')
  return faltan
}

/**
 * La solicitud de envío guarda **solo el número**: el `EM` es fijo y lo pone la pantalla.
 *
 * Antes se guardaba lo que la persona tipeara, `EM` incluido, y al armar la nota del pedido en GN
 * se le anteponía otro `EM ` — así que en Gestión Nube salía `EM EM1234`. Estas dos funciones son
 * el único lugar donde se decide el formato.
 */
export function numeroEM(v: string | null | undefined): string {
  return String(v || '').trim().replace(/^em[\s-]*/i, '')
}

/** Cómo se muestra: `EM 1234`. Lo que no tiene número se muestra tal cual. */
export function etiquetaEM(v: string | null | undefined): string {
  const raw = String(v || '').trim()
  if (!raw) return ''
  const n = numeroEM(raw)
  return n && /\d/.test(n) ? `EM ${n}` : raw
}

/** Link al seguimiento con el código. Andreani es un portal y no lo toma por URL. */
export function trackingUrl(via: ViaRetorno | null | undefined, codigo: string): string | null {
  const c = (codigo || '').trim()
  if (!c) return null
  if (via === 'andreani') return 'https://www.andreani.com/?tab=seguir-envio'
  if (via === 'correo') return `https://www.correoargentino.com.ar/formularios/e-commerce?id=${encodeURIComponent(c)}`
  return null
}

/** El portal de seguimiento, sin código: para el link que va al lado del campo. */
export function trackingPortalUrl(via: ViaRetorno | null | undefined): string | null {
  if (via === 'andreani') return 'https://www.andreani.com/?tab=seguir-envio'
  if (via === 'correo') return 'https://www.correoargentino.com.ar/formularios/e-commerce?id='
  return null
}

/**
 * Reparte lo que se pegó en el campo de seguimiento: un código va a la ida; dos, el primero a la
 * ida y el segundo a la vuelta. Es para poder pegar los dos de una en vez de abrir dos veces.
 */
export function repartirSeguimiento(entrada: string): { ida: string | null; vuelta: string | null } {
  const parts = (entrada || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return { ida: null, vuelta: null }
  if (parts.length === 1) return { ida: parts[0], vuelta: null }
  return { ida: parts[0], vuelta: parts[1] }
}

/**
 * El detalle del cambio para pasarle al cliente por WhatsApp: la cuenta itemizada, cada concepto
 * con su monto. Es el mismo ticket que muestra la pantalla, en texto — así nadie tiene que
 * transcribirlo a mano y prometer un número distinto del que quedó guardado.
 */
export function detalleCambioTexto(d: {
  id?: number | null
  cliente?: string | null
  items?: ItemReclamo[]
  items_nuevos?: ItemReclamo[]
  orden?: OrdenTN | null
  forma_pago?: FormaPago | null
  via_retorno?: ViaRetorno | null
  envio_costo?: number | null
  envio_paga?: EnvioPaga | null
  descuento_manual?: number | null
  seguimiento_ida?: string | null
  seguimiento_vuelta?: string | null
}): string {
  // `toLocaleString('es-AR')` mete un espacio DURO (U+00A0) antes del símbolo, y esto se pega en
  // WhatsApp: se normaliza a un espacio común.
  const money = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).replace(/ /g, ' ')
  const devueltos = d.items || []
  const nuevos = d.items_nuevos || []
  const t = calcularCambio({
    devueltos, nuevos, orden: d.orden, formaPago: d.forma_pago,
    descuentoManual: d.descuento_manual, envioCosto: d.envio_costo, envioPaga: d.envio_paga,
  })
  const linea = (i: ItemReclamo, monto: number) =>
    `• ${i.cantidad}× ${i.producto}${i.variante ? ` (${i.variante})` : ''} — ${money(monto)}`

  const out: string[] = [`*CAMBIO ${d.id ? numeroReclamo(d.id) : 'nuevo'}*${d.cliente ? ` · ${d.cliente}` : ''}`]
  if (devueltos.length) {
    out.push('Devolvés:')
    devueltos.forEach((i) => out.push(linea(i, i.pagado ?? pagadoPorItem(i, d.orden))))
  }
  if (nuevos.length) {
    out.push('Te llevás:')
    nuevos.forEach((i) => out.push(linea(i, (Number(i.precio) || 0) * (Number(i.cantidad) || 1))))
  }
  out.push('———')
  out.push(`Subtotal productos: ${money(t.diferencia)}`)
  if (d.forma_pago && t.descuentoForma > 0) {
    out.push(`Descuento ${FORMA_PAGO_DEF[d.forma_pago].label} (−${FORMA_PAGO_DEF[d.forma_pago].descuento}%): −${money(t.descuentoForma)}`)
  }
  if (t.descuentoManual > 0) out.push(`Descuento: −${money(t.descuentoManual)}`)
  out.push(`Total productos: ${money(t.diferencia - t.descuento)}`)
  if (t.envioACobrar > 0) out.push(`Envío${d.via_retorno ? ` (${VIA_LABEL[d.via_retorno]})` : ''}: ${money(t.envioACobrar)}`)
  out.push(t.total < 0 ? `*Se te devuelven: ${money(Math.abs(t.total))}*` : `*Total a pagar: ${money(t.total)}*`)
  if (d.seguimiento_ida) out.push(`Seguimiento ida: ${d.seguimiento_ida}`)
  if (d.seguimiento_vuelta) out.push(`Seguimiento vuelta: ${d.seguimiento_vuelta}`)
  return out.join('\n')
}
