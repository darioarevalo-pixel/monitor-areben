/**
 * Las formas de Envíos del día. Espejo de `sql/migrate-envios.sql`: si acá aparece un campo que la
 * tabla no tiene, el guardado lo va a tirar en silencio.
 */

import type { Marca } from '../nav'

export type Turno = 'mañana' | 'tarde'
export type OrigenEnvio = 'tn' | 'manual'
/**
 * El camino de un paquete: `pendiente → preparado → en_transito → entregado`, con `no_entregado`
 * como única salida lateral. Ver `siguienteEstado` en `reglas.core.js`.
 */
export type EstadoEnvio = 'pendiente' | 'preparado' | 'en_transito' | 'entregado' | 'no_entregado'

/**
 * Los dos que se fueron el 15-ago-2026, y que **siguen tipados**: prod y los previews comparten una
 * base, así que entre el deploy y la migración que renombra hay filas escritas con estos valores.
 * Una pantalla que no los contemple les da un botón muerto sobre un paquete real.
 */
export type EstadoLegado = 'despachado' | 'reintento'

/** Lo que puede venir de la base hoy: el camino nuevo más lo que todavía no se renombró. */
export type EstadoEnBase = EstadoEnvio | EstadoLegado

/** Un paquete que sale a la calle un día, en un turno. */
export type Envio = {
  id: string
  /** La marca del ENVÍO, no la de la pantalla: el cadete lleva las dos en la misma mochila. */
  store: Marca
  /**
   * El día del reparto, o `null` si todavía no tiene: es la bandeja de pendientes, el pedido que ya
   * se cotizó y espera que el cliente confirme la fecha. **Van siempre de a dos con `turno`**: los
   * dos o ninguno, nunca uno solo. Ver `validarEnvio` y el check `envios_fecha_turno_juntos`.
   */
  fecha: string | null // YYYY-MM-DD
  turno: Turno | null
  origen: OrigenEnvio
  /** Número de orden de Tienda Nube. `null` en los manuales. */
  orden_numero: string | null

  cliente: string | null
  /** Crudo, como lo dio TN. El `549` lo arma `linkWhatsapp`, no la base. */
  telefono: string | null
  direccion: string
  piso_depto: string | null
  localidad: string | null
  /**
   * El código postal, como lo tipeó el cliente en Tienda Nube.
   *
   * Existe para avisar cuando alguien eligió cadetería sin ser de la zona. ⚠️ No es confiable solo:
   * se midió una orden con CP 2000 (Rosario) y localidad «San Martin de las Escobas», a 100 km. Ver
   * `cpFueraDeZona`.
   */
  cp: string | null
  anotacion: string | null

  /**
   * **El costo del reparto. Existe siempre, se cobre o no en la puerta.**
   *
   * Es lo que se le paga al cadete (`tarifaCadete`) y, salvo que esté saldado, lo que él cobra.
   * Nunca se pone en cero para decir que no se cobra: para eso están los dos tildes de abajo.
   */
  monto_envio: number | string
  /** La clienta ya lo pagó por adelantado. El cadete no lo cobra, pero a él se le paga igual. */
  envio_pagado: boolean
  /**
   * Se lo regalamos: no lo paga nadie, y al cadete se le paga igual.
   *
   * 🔑 Va separado de `envio_pagado` aunque en la puerta valgan lo mismo. Son motivos opuestos —una
   * es plata que entró por adelantado, la otra plata que no entró nunca— y colapsarlos en un
   * booleano hace imposible contestar cuánto regalamos en envíos. `validarEnvio` los rechaza juntos.
   */
  envio_bonificado: boolean
  /** El saldo del producto a cobrar en la puerta. Casi siempre 0: el pedido ya se pagó antes. */
  monto_pedido_a_cobrar: number | string

  /** Lo que hay en la base: puede ser un estado legado hasta que corra la migración de cierre. */
  estado: EstadoEnBase
  /**
   * **¿Cobró en la puerta?** Lo marca el cadete desde el portal, no la pantalla interna.
   *
   * 🔑 **Tres valores, no dos.** `null` es "no dijo nada" —todas las filas anteriores al portal, y
   * todas las que nadie tildó— y NO es `false`: se saldan al revés. `false` es un hecho reportado
   * («entregué y no me pagaron») y es el único que le saca la plata de la cuenta al cadete. Ver
   * `cobroPendiente`.
   */
  cobrado: boolean | null
  vendedor: string | null
  cadete: string | null
  /** La orden de TN congelada al armar el reparto. Ver el encabezado de la migración. */
  datos: Record<string, unknown>
  autor: string | null
  created_at?: string
  updated_at?: string
}

/** Lo que hay que saber para cerrar el día. Ver `totalesDelDia`. */
export type TotalesDia = {
  envios: number
  /** Lo que ya entró antes de salir. No se rinde: se controla. */
  enviosPagos: number
  /** Lo que regalamos en envíos ese día. Nunca entró: va aparte de `enviosPagos` a propósito. */
  enviosBonificados: number
  /** Lo que el cadete juntó en las puertas. Sólo lo entregado de verdad, y sólo lo que sí cobró. */
  cobrado: number
  /**
   * Lo que entregó **sin cobrar** (marcó «No cobré» en la puerta). Es plata que hay que reclamarle a
   * la clienta, no al cadete: por eso sale de `cobrado` y no entra en `debeTraer`.
   */
  sinCobrar: number
  /** Lo que le debemos por haber llevado esos paquetes. Los sin cobrar también: los llevó igual. */
  tarifas: number
  /** `cobrado − tarifas`: la plata que tiene que entregar. Negativo = le debemos nosotros. */
  debeTraer: number
  /** Cuántos paquetes todavía no salieron de la casa. */
  pendienteDeSalir: number
  noEntregados: number
  /** Lo que cerraría si todo lo que sigue en la calle llegara. La diferencia contra `debeTraer`
   *  es la plata que todavía está afuera. */
  debeTraerSiTodoLlega: number
}

/**
 * El cierre de caja del DÍA. La ausencia de fila es "todavía no se cerró".
 *
 * 🔑 Es del día y no del turno porque el cadete es uno solo: sale a la mañana y a la tarde con la
 * misma plata en el bolsillo, y partir la caja en dos obligaría a repartir a mano un saldo que en la
 * calle nunca estuvo partido.
 */
export type CierreDia = {
  fecha: string
  /** La plata que entregó. `null` es "no se cerró"; 0 es "no trajo nada", que es lo normal. */
  trajo: number | string | null
  /** Plata que se le dio por fuera del reparto, para saldar lo que se le debía. */
  pagado_aparte: number | string | null
  nota: string | null
  cerrado_por: string | null
  cerrado_en: string | null
}

/**
 * Un día en la cuenta corriente del cadete. Todo derivado: lo único que se guarda es el cierre.
 *
 * El signo, una sola vez para todo el módulo: **positivo = el cadete tiene plata nuestra**; negativo
 * = se la debemos.
 */
export type DiaDeCuenta = {
  fecha: string
  envios: number
  entregados: number
  /** Lo que cobró en las puertas. */
  cobrado: number
  /** Lo que entregó sin cobrar. No se lo debe él: se le debe a la clienta. Ver `cobroPendiente`. */
  sinCobrar: number
  /** Lo que le debemos por llevarlos, los cobrados y los que no. */
  tarifas: number
  /** `cobrado − tarifas`. Negativo = ese día le quedamos debiendo. */
  debeTraer: number
  /** Lo que entregó. `null` = el día no se cerró. */
  trajo: number | null
  pagadoAparte: number
  saldoDelDia: number
  /** El saldo después de ese día, arrastrando todos los anteriores. */
  acumulado: number
  cerrado: boolean
  cerradoPor: string | null
  nota: string | null
}

/** La cuenta entera: los días y el saldo de hoy. */
export type CuentaCadete = {
  dias: DiaDeCuenta[]
  /** El acumulado del último día. Positivo = tiene plata nuestra; negativo = le debemos. */
  saldo: number
  /**
   * Todo lo que se entregó sin cobrar, de todos los días. **No es deuda del cadete**: es la lista de
   * clientas a las que hay que llamar, y va aparte del saldo justamente para que no se confundan.
   */
  sinCobrar: number
}

/**
 * Lo que dejó una pasada del botón «Traer de Tienda Nube».
 *
 * 🔴 **Tiene que poder decir lo que NO se trajo.** Es el único cartel que ve quien aprieta, y quien
 * aprieta no tiene forma de saber cuántas órdenes había del otro lado: si sólo se cuenta lo que
 * entró, media hoja perdida y un día flojo se escriben exactamente igual.
 */
export type Traida = {
  agregados: number
  ya_estaban: number
  /** Entraron igual, pero hay que completarles la dirección a mano. */
  sinDireccion: number
  /** Las que despacha el correo: quedaron afuera a propósito. Ver `vaPorCorreo`. */
  porCorreo: number
  /**
   * Las órdenes del rango que **no llegaron**. Ver `ordenesQueNoLlegaron`: casi siempre es Tienda
   * Nube cortando por rate limit, que contesta `ok: true` con la mitad de la lista.
   */
  noLeidas: number
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
  /** El total de la orden, envío incluido. PostgREST y TN lo mandan como string. */
  total?: number | string | null
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
