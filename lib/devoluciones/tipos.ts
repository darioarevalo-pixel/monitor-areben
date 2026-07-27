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

export type MotivoDevolucion = 'arrepentimiento' | 'falla' | 'sin_stock' | 'no_era_lo_esperado' | 'otro'

/**
 * Qué pasa con la prenda. `no_salio` es el caso de "se vendió sin stock": no hay nada que
 * esperar ni etiqueta que emitir, porque la prenda nunca se despachó.
 */
export type DestinoPrenda = 'stock' | 'falla' | 'no_salio'

export type Compensacion = 'plata_total' | 'plata_parcial' | 'otra_unidad' | 'cupon' | 'ninguna'

/**
 * `esperando_cliente` es el link mandado y sin responder; `en_revision` es el cliente ya cargó
 * y falta que Administración decida. `en_transito`/`recibido` solo aplican si la prenda vuelve.
 */
export type EstadoDevolucion =
  | 'borrador' | 'esperando_cliente' | 'en_revision' | 'resuelto'
  | 'en_transito' | 'recibido' | 'cerrado' | 'anulado'

/** Los tres pendientes que se cierran por separado, porque avanzan a ritmos distintos. */
export type PendienteEstado = 'pendiente' | 'hecho' | 'no_aplica'

export const MOTIVO_LABEL: Record<MotivoDevolucion, string> = {
  arrepentimiento: 'Se arrepintió',
  falla: 'Vino fallado',
  sin_stock: 'Se vendió sin stock',
  no_era_lo_esperado: 'No era lo que esperaba',
  otro: 'Otro',
}

export const ESTADO_LABEL: Record<EstadoDevolucion, string> = {
  borrador: 'Borrador',
  esperando_cliente: 'Esperando al cliente',
  en_revision: 'Para revisar',
  resuelto: 'Resuelto, en curso',
  en_transito: 'En camino de vuelta',
  recibido: 'Recibido',
  cerrado: 'Cerrado',
  anulado: 'Anulado',
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

/** Una línea del reclamo. `costo` y `pvp_feria` salen de GN y son los que deciden si conviene el retorno. */
export type ItemDevolucion = {
  sku?: string | null
  product_id?: string | null
  size_id?: string | null
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
export function pagadoPorItem(item: Pick<ItemDevolucion, 'precio' | 'cantidad'>, orden?: OrdenTN | null): number {
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

export type MontoDevolucion = {
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
  items: ItemDevolucion[],
  orden?: OrdenTN | null,
  opciones?: { devolverEnvio?: boolean; montoAcordado?: number | null },
): MontoDevolucion {
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
  items: ItemDevolucion[],
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

  if (!recuperable) {
    return { recuperable, envioVuelta, conviene: false, motivo: 'No se sabe cuánto se recupera: falta el precio o el PVP de feria.' }
  }
  if (piso > 0 && recuperable < piso) {
    return { recuperable, envioVuelta, conviene: false, motivo: `Está por debajo del piso de ${piso}: no se pide el retorno.` }
  }
  if (envioVuelta > 0 && recuperable <= envioVuelta) {
    return { recuperable, envioVuelta, conviene: false, motivo: `No conviene: recuperás ${recuperable} y gastás ${envioVuelta} de envío.` }
  }
  return { recuperable, envioVuelta, conviene: true, motivo: `Conviene: recuperás ${recuperable} y el envío sale ${envioVuelta}.` }
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
  items: ItemDevolucion[]
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

export type DevolucionEvento = { estado: EstadoDevolucion; at: string; usuario?: string | null; nota?: string | null }

export type DevolucionRow = {
  id: number
  store: Marca
  numero: string
  orden_tn?: string | null
  cliente?: string | null
  /** Token del link que se le pasa al cliente para que cargue fotos. Nunca se muestra en listados. */
  token?: string | null
  token_vence?: string | null
  motivo: MotivoDevolucion
  motivo_detalle?: string | null
  relato_cliente?: string | null
  fotos?: FotoReclamo[]
  destino_prenda?: DestinoPrenda | null
  compensacion?: Compensacion | null
  estado: EstadoDevolucion
  items: ItemDevolucion[]
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
  envio_costo?: number | null
  seguimiento_vuelta?: string | null
  gn_venta_id?: string | null
  gn_venta_number?: string | null
  stock_estado: PendienteEstado
  reintegro_estado: PendienteEstado
  tn_stock_estado: PendienteEstado
  reintegro_at?: string | null
  reintegro_por?: string | null
  reintegro_comprobante?: string | null
  cupon_codigo?: string | null
  falla_ids?: number[]
  costo_caso?: number | null
  usuario?: string | null
  historial?: DevolucionEvento[]
  created_at?: string
  updated_at?: string
}

/** `D-0007`. Mismo formato que el `C-0045` de Cambios. */
export function numeroReclamo(id: number): string {
  return 'D-' + String(id).padStart(4, '0')
}

/**
 * Qué falta para poder cerrar el reclamo. Devuelve la lista en criollo: si no está vacía, el
 * botón de cerrar va deshabilitado con esto como explicación.
 */
export function faltantesParaCerrar(d: DevolucionRow): string[] {
  const faltan: string[] = []
  if (d.stock_estado === 'pendiente') faltan.push('anular la venta original en Gestión Nube')
  if (d.reintegro_estado === 'pendiente') faltan.push('devolver la plata')
  if (d.tn_stock_estado === 'pendiente') faltan.push('corregir el stock en Tienda Nube')
  if (d.destino_prenda === 'stock' && d.estado !== 'recibido' && d.estado !== 'cerrado') faltan.push('recibir la prenda')
  // Cuando la prenda se le queda al cliente, la foto es la única prueba de que la falla existió.
  if (d.destino_prenda === 'falla' && !(d.fotos || []).length) faltan.push('al menos una foto del producto')
  return faltan
}
