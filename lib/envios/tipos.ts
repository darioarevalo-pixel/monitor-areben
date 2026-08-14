/**
 * Las formas de Envíos del día. Espejo de `sql/migrate-envios.sql`: si acá aparece un campo que la
 * tabla no tiene, el guardado lo va a tirar en silencio.
 */

import type { Marca } from '../nav'

export type Turno = 'mañana' | 'tarde'
export type OrigenEnvio = 'tn' | 'manual'
export type EstadoEnvio = 'pendiente' | 'preparado' | 'despachado' | 'entregado' | 'no_entregado' | 'reintento'

/** Un paquete que sale a la calle un día, en un turno. */
export type Envio = {
  id: string
  /** La marca del ENVÍO, no la de la pantalla: el cadete lleva las dos en la misma mochila. */
  store: Marca
  fecha: string // YYYY-MM-DD
  turno: Turno
  origen: OrigenEnvio
  /** Número de orden de Tienda Nube. `null` en los manuales. */
  orden_numero: string | null

  cliente: string | null
  /** Crudo, como lo dio TN. El `549` lo arma `linkWhatsapp`, no la base. */
  telefono: string | null
  direccion: string
  piso_depto: string | null
  localidad: string | null
  anotacion: string | null

  /** Cuánto vale el envío. Existe siempre, se haya cobrado o no. */
  monto_envio: number | string
  /** Si ya se pagó por adelantado. Es lo que decide si la etiqueta dice PAGADO o un monto. */
  envio_pagado: boolean
  /** El saldo del producto a cobrar en la puerta. Casi siempre 0: el pedido ya se pagó antes. */
  monto_pedido_a_cobrar: number | string

  estado: EstadoEnvio
  vendedor: string | null
  cadete: string | null
  /** La orden de TN congelada al armar el reparto. Ver el encabezado de la migración. */
  datos: Record<string, unknown>
  autor: string | null
  created_at?: string
  updated_at?: string
}

/** Lo que hay que saber para cerrar un turno. Ver `totalesDelTurno`. */
export type TotalesTurno = {
  envios: number
  /** Lo que ya entró antes de salir. No se rinde: se controla. */
  enviosPagos: number
  /** La plata que el cadete tiene que traer. Sólo lo entregado de verdad. */
  aRendir: number
  /** Cuántos paquetes todavía no salieron de la casa. */
  pendienteDeSalir: number
  noEntregados: number
  /** Lo que rendiría si todo lo que sigue en la calle llegara. La diferencia contra `aRendir`
   *  es la plata que todavía está afuera. */
  aRendirSiTodoLlega: number
}

/** El cierre de caja de un turno. La ausencia de fila es "todavía no se cerró". */
export type CierreTurno = {
  fecha: string
  turno: Turno
  /** Lo que se le pagó al cadete. `null` NO es cero: es "no se cargó". */
  pagado_al_cadete: number | string | null
  /** Lo que el cadete trajo de verdad, para contrastar contra `aRendir`. */
  rendido: number | string | null
  cerrado_por: string | null
  cerrado_en: string | null
}

/**
 * Una orden de Tienda Nube, con el bloque de envío que `mapOrdenTN` empezó a mandar el 13-ago-2026.
 *
 * Vive acá y no en `cliente.ts` porque quien decide si el paquete va a la mochila del cadete es
 * `vaAlReparto` (en `core.ts`, puro y testeable): dejarla al lado del `fetch` obligaba al test a
 * importar `apiFetch`, y con eso a arrastrar la sesión y el cliente de identidad.
 */
export type OrdenTN = {
  number: number | string
  cliente: string | null
  /** `shipping_option`. ⚠️ **Texto libre que la tienda edita**: ver `vaAlReparto`. */
  envio: string | null
  fecha: string | null
  envio_costo_cliente: number | null
  envio_tipo: string | null
  /** `shipping_tracking_number`. Sólo lo tienen las que despacha un correo, y recién al despacharlas. */
  envio_tracking?: string | null
  estado_pago: string | null
  estado_orden: string | null
  cancelada?: boolean
  envio_direccion: {
    nombre: string | null
    telefono: string | null
    calle: string | null
    numero: string | null
    piso: string | null
    localidad: string | null
    provincia: string | null
    cp: string | null
  } | null
}
