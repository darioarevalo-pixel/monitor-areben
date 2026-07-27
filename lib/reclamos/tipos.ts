/**
 * Tipos y matemática de Devoluciones (tabla `devoluciones`, ver sql/migrate-devoluciones.sql).
 *
 * Este archivo es PURO —sin React, sin fetch— porque es donde vive la plata: cuánto se le
 * devuelve a cada persona y si conviene pagar el envío para que la prenda vuelva. Todo lo que
 * está acá tiene test (`tests/devoluciones.test.ts`).
 *
 * Las tres decisiones que modela un reclamo, y que son independientes entre sí:
 *   - **la prenda**: vuelve · se la queda el cliente · nunca salió   (la decidimos nosotros, es económica)
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
 * Qué pasa con la prenda:
 *   - `stock`    vuelve sana y se revende.
 *   - `falla`    vuelve pero no se revende como nueva: va al ledger de Fallas.
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
 * Cómo vuelve la prenda. `presencial` es el cliente acercándose al local: **no hay envío**, así
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
 * y falta que Administración decida. `en_transito`/`recibido` solo aplican si la prenda vuelve.
 */
export type EstadoReclamo =
  | 'borrador' | 'esperando_cliente' | 'en_revision' | 'resuelto'
  | 'en_transito' | 'recibido' | 'cerrado' | 'anulado'

/** Los tres pendientes que se cierran por separado, porque avanzan a ritmos distintos. */
export type PendienteEstado = 'pendiente' | 'hecho' | 'no_aplica'

export const MOTIVO_LABEL: Record<MotivoReclamo, string> = {
  arrepentimiento: 'Arrepentimiento',
  no_esperaba: 'No era lo que esperaba',
  falla: 'Falla',
  faltante: 'Faltante de producto',
  mal_armado: 'Pedido mal armado',
  no_llego: 'No le llegó nunca',
  sin_stock: 'No tenemos stock',
  no_era_lo_esperado: 'No era lo que esperaba', // histórico
  otro: 'Otro', // histórico
}

/** Los que se ofrecen al cargar, en el orden en que pasan de verdad. */
export const MOTIVOS_VIGENTES: MotivoReclamo[] = [
  'arrepentimiento', 'no_esperaba', 'falla', 'faltante', 'mal_armado', 'no_llego', 'sin_stock',
]

/**
 * ¿La prenda salió del depósito alguna vez? Los tres casos en que NO define medio flujo: no hay
 * etiqueta de vuelta, no hay tránsito, y no hay nada que reingresar — solo plata y stock.
 */
export const NUNCA_SALIO: MotivoReclamo[] = ['faltante', 'sin_stock']

/** Motivos donde el error es NUESTRO. Sirve para separar lo que se puede corregir de lo que no. */
export const ERROR_PROPIO: MotivoReclamo[] = ['falla', 'faltante', 'mal_armado', 'sin_stock']

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
 * la trae en mano, "En camino de vuelta" es mentira — no hay nada viajando, hay alguien que
 * todavía no vino.
 */
export function estadoEnCriollo(d: Pick<ReclamoRow, 'estado' | 'via_retorno'>): string {
  if (d.estado === 'en_transito' && d.via_retorno === 'presencial') return 'Esperando que la traiga'
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
 * precio de lista, se le está devolviendo plata que nunca pagó. **Es el hueco que Cambios
 * tiene hoy** (toma el precio del devuelto sin descuentos, `lib/cambios/tipos.ts`).
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
  // En "se la queda + parte de la plata" manda el monto acordado con el cliente, no la cuenta.
  const acordado = opciones?.montoAcordado
  const total = typeof acordado === 'number' && isFinite(acordado) && acordado >= 0
    ? redondear(acordado)
    : redondear(producto + envio)
  return { producto, envio, total }
}

// ── ¿Conviene que la prenda vuelva? ─────────────────────────────────────────────

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
 * Lo recuperable **depende del estado de la prenda**, y esa es la parte que se pasa por alto:
 *   - **sana** → vuelve a stock y se revende a precio completo: se recupera el precio de venta.
 *   - **fallada** → NO vuelve a stock (va al ledger de Fallas). Lo único que se saca de esa
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

export type CuentaCambio = {
  /** Lo que se lleva, a precio de lista. */
  nuevos: number
  /** Lo que devuelve, a lo que REALMENTE pagó (con los descuentos de la orden prorrateados). */
  devueltos: number
  diferencia: number
  descuentoForma: number
  /** Positivo: lo paga el cliente. Negativo: se le devuelve. Cero: parejo. */
  total: number
  /** En criollo, para la pantalla y para el mensaje. */
  quienPaga: 'cliente' | 'nosotros' | 'nadie'
}

/**
 * La cuenta de un cambio por otro producto.
 *
 * ⚠️ **Acá está el arreglo del hueco que tenía el motor viejo de Cambios**: tomaba el precio de
 * lista de lo devuelto en vez de lo que la persona **pagó**. En una orden con cupón del 20%, eso
 * le acreditaba al cliente plata que nunca puso — y la diferencia le quedaba a favor. Con
 * `pagadoPorItem` el devuelto se valúa por lo pagado y la cuenta cierra.
 *
 * El descuento por forma de pago solo aplica sobre una diferencia **a cobrar**: si el cambio da a
 * favor del cliente no hay nada que descontar.
 */
export function calcularCambio(opciones: {
  devueltos: ItemReclamo[]
  nuevos: ItemReclamo[]
  orden?: OrdenTN | null
  formaPago?: FormaPago | null
  /** Un descuento extra acordado a mano, sobre la diferencia a cobrar. */
  descuentoManual?: number | null
}): CuentaCambio {
  const { devueltos, nuevos, orden } = opciones
  const totalNuevos = redondear(nuevos.reduce((s, it) => s + positivo(it.precio) * positivo(it.cantidad), 0))
  const totalDevueltos = redondear(devueltos.reduce((s, it) => s + (it.pagado ?? pagadoPorItem(it, orden)), 0))
  const diferencia = redondear(totalNuevos - totalDevueltos)

  // Los descuentos solo tienen sentido sobre lo que el cliente TIENE que poner.
  const manual = diferencia > 0 ? Math.min(positivo(opciones.descuentoManual), diferencia) : 0
  const base = Math.max(diferencia - manual, 0)
  const pct = opciones.formaPago ? DESCUENTO_FORMA[opciones.formaPago] : 0
  const descuentoForma = diferencia > 0 ? redondear((base * pct) / 100) : 0
  const total = redondear(diferencia - manual - descuentoForma)

  return {
    nuevos: totalNuevos,
    devueltos: totalDevueltos,
    diferencia,
    descuentoForma,
    total,
    quienPaga: total > 0 ? 'cliente' : total < 0 ? 'nosotros' : 'nadie',
  }
}

// ── Qué aplica a cada motivo ────────────────────────────────────────────────────

/**
 * Las salidas que tienen sentido según lo que pasó. No es cosmético: ofrecer "le mandamos otra
 * igual" en un arrepentimiento, o "le devolvemos una parte" en un pedido mal armado, invita a
 * resolver mal. Cada motivo tiene su repertorio.
 */
export function compensacionesDe(motivo: MotivoReclamo): Compensacion[] {
  switch (motivo) {
    // Se arrepintió o no era lo que esperaba: la prenda está bien, lo que se discute es la plata.
    // El descuento parcial existe para retenerlo; mandarle otra igual no tendría sentido.
    case 'arrepentimiento':
    case 'no_esperaba':
    case 'no_era_lo_esperado':
      return ['otro_producto', 'plata_total', 'plata_parcial', 'cupon']
    // Falla: es donde hay más margen: devolver, descontar para que se la quede, o reponerla.
    case 'falla':
      return ['otra_unidad', 'otro_producto', 'plata_total', 'plata_parcial', 'cupon']
    // Nunca salió: o se lo mandamos, o le devolvemos esa parte. No hay prenda que negociar.
    case 'faltante':
    case 'sin_stock':
      return ['reenvio', 'plata_total', 'cupon']
    // Le mandamos otra cosa: lo que corresponde es mandarle lo suyo. Devolver la plata es la
    // salida si ya no lo quiere.
    case 'mal_armado':
      return ['reenvio', 'plata_total', 'cupon']
    // Se perdió en el camino: se repone o se devuelve. La prenda no está en ningún lado.
    case 'no_llego':
      return ['reenvio', 'plata_total']
    default:
      return ['plata_total', 'plata_parcial', 'otra_unidad', 'reenvio', 'cupon', 'ninguna']
  }
}

/** ¿Hay una prenda que pueda volver? En los tres casos donde no, media pantalla sobra. */
export function puedeVolverLaPrenda(motivo: MotivoReclamo): boolean {
  return !NUNCA_SALIO.includes(motivo) && motivo !== 'no_llego'
}

/** El destino de la prenda queda determinado por el motivo, salvo en la falla. */
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

// ── El descuento para que se la quede ───────────────────────────────────────────

export type CuentaDescuento = {
  /** Hasta acá se puede ofrecer sin perder plata respecto de pedirla de vuelta. */
  techo: number
  /** Lo que conviene ofrecer primero: deja margen para negociar. */
  sugerido: number
  /** Lo que se pierde si la prenda vuelve, en positivo. */
  seePierdeSiVuelve: number
  /** Cuando el techo supera el precio: regalarla sale más barato que pedirla. */
  convieneRegalar: boolean
  motivo: string
}

/** Del techo, lo que se ofrece primero. El resto queda como margen de negociación. */
const FRACCION_SUGERIDA = 0.5

/**
 * Cuánto se le puede descontar al cliente para que se quede la prenda, en vez de que vuelva.
 *
 * **La regla: el descuento máximo es lo que perdés porque vuelva.** Y eso cambia radicalmente
 * según en qué estado vuelve, que es lo que hace que un techo único sea caro:
 *
 *   - **Sana** (arrepentimiento, no era lo que esperaba): vuelve al stock y se revende a precio
 *     completo. Lo único que perdés es la logística → `techo = envío de vuelta`.
 *   - **Fallada**: NO se revende como nueva, va a feria. Perdés el envío **y** la diferencia entre
 *     lo que vale nueva y lo que vas a sacar en feria → `techo = precio − PVP feria + envío`.
 *
 * El caso real de BDI que justifica esto: funda de $12.000, PVP feria $3.500, envío $6.000. Si
 * vuelve, se termina $2.500 en rojo; el techo da $14.500, o sea **más que el precio**: regalarla
 * sale más barato que pedirla. Con un techo del envío se perdían ~$8.500 por unidad.
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
      (convieneRegalar ? ' Es más que el precio: regalarla sale más barato que pedirla.' : '')
    : `Vuelve sana y se revende a precio completo, así que lo único que perdés es ${seePierdeSiVuelve} de logística.`

  return { techo, sugerido, seePierdeSiVuelve, convieneRegalar, motivo }
}

/**
 * Qué nos costó el caso. Sin esto no se puede responder después "cuánto nos costaron las
 * devoluciones este mes" ni con qué proveedor se van en fallas.
 *
 * La unidad perdida se valúa **a costo**: es lo que se fue por la puerta cuando la prenda se le
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
  // Solo se pierde la unidad si el cliente se la queda; si vuelve —sana o fallada— se recupera.
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
  /** Cómo vuelve. Null si no vuelve (se la queda el cliente) o si todavía no se decidió. */
  via_retorno?: ViaRetorno | null
  /** El envío de VUELTA (la fallada que regresa), siempre a nuestro cargo. */
  envio_costo?: number | null
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
 *     una sola prenda. **No descuenta.**
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

/** `D-0007`. Mismo formato que el `C-0045` de Cambios. */
export function numeroReclamo(id: number): string {
  return 'D-' + String(id).padStart(4, '0')
}

/**
 * Qué falta para poder cerrar el reclamo. Devuelve la lista en criollo: si no está vacía, el
 * botón de cerrar va deshabilitado con esto como explicación.
 */
export function faltantesParaCerrar(d: ReclamoRow): string[] {
  const faltan: string[] = []
  if (d.stock_estado === 'pendiente') faltan.push('anular la venta original en Gestión Nube')
  if (d.reintegro_estado === 'pendiente') faltan.push('devolver la plata')
  if (d.tn_stock_estado === 'pendiente') faltan.push('corregir el stock en Tienda Nube')
  // Plata recuperable: si el reclamo se cierra sin esto, esa plata se perdió y nadie se entera.
  if (d.reclamo_correo_estado === 'pendiente') faltan.push('presentar el reclamo al transportista')
  if (d.destino_prenda === 'stock' && d.estado !== 'recibido' && d.estado !== 'cerrado') faltan.push('recibir la prenda')
  // Cuando la prenda se le queda al cliente, la foto es la única prueba de que la falla existió.
  if (d.destino_prenda === 'falla' && !(d.fotos || []).length) faltan.push('al menos una foto del producto')
  return faltan
}
