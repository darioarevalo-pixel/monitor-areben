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
 * Lo que puede venir de la base hoy.
 *
 * Fue `EstadoEnvio | EstadoLegado` mientras existieron `despachado` y `reintento`. Desde el
 * 17-ago-2026 el check de `envios_reparto` sólo admite los cinco, así que **los dos tipos coinciden**
 * — el alias queda porque lo nombran la pantalla y el portal, y porque el día que se agregue un
 * estado hay que volver a preguntarse si la base y la app dicen lo mismo.
 */
export type EstadoEnBase = EstadoEnvio

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
   * **¿Cobró él en la puerta?** Lo marca el cadete desde el portal, y desde el 17-ago-2026 también se
   * puede corregir desde la pantalla interna (`action: 'cobrado'`), que es lo único que hay cuando
   * pasó el día: la ventana de escritura del portal es de ±1.
   *
   * 🔑 **Tres valores, no dos.** `null` es "no dijo nada" —todas las filas anteriores al portal, y
   * todas las que nadie tildó— y NO es `false`. `false` es un hecho reportado: entregó y la plata no
   * pasó por su mano, o sea que **se pagó al local por transferencia** —un pedido no se entrega si no
   * está pago—. Es el único valor que le saca esa plata de la cuenta. Ver `pagoAlLocal`.
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

/**
 * Un botón de la columna «Pago del envío»: qué dice y qué escribe.
 *
 * 🔑 **El texto y el destino viajan juntos.** `campo` elige a cuál de los dos tildes excluyentes le
 * escribe (`marcarPagado` o `marcarBonificado`) y `siguiente` es el booleano que se manda, así que la
 * pantalla no puede dibujar «Bonificar» y terminar marcando el envío como pago. Sale de
 * `pagoDelEnvio`, que es el único lugar donde se decide.
 */
export type AccionDePago = {
  texto: string
  campo: 'pagado' | 'bonificado'
  siguiente: boolean
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
   * Lo que se pagó **al local por transferencia** (el cadete marcó «No cobré» en la puerta). No hay
   * nada que reclamar —un pedido no se entrega si no está pago—: la plata entró, sólo que no por su
   * mano, y por eso sale de `cobrado` y no entra en `debeTraer`. Ver `pagoAlLocal`.
   */
  sinCobrar: number
  /** Lo que le debemos por haber llevado esos paquetes. Los transferidos también: los llevó igual. */
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
 * El cierre del DÍA. La ausencia de fila es "todavía no se revisó".
 *
 * 🔑 Es del día y no del turno porque el cadete es uno solo: sale a la mañana y a la tarde con la
 * misma plata en el bolsillo, y partir la caja en dos obligaría a repartir a mano un saldo que en la
 * calle nunca estuvo partido.
 *
 * 🔑 **Desde la tanda G no guarda plata.** `trajo` y `pagado_aparte` eran un solo casillero por día
 * de reparto, y el cadete no rinde así: rinde cuando pasa, a veces tres días juntos, a veces dos
 * veces el mismo día. Eso vive ahora en `MovimientoCuenta`, y cerrar el día quedó siendo lo que
 * siempre fue en la práctica: **alguien lo revisó**.
 */
export type CierreDia = {
  fecha: string
  nota: string | null
  cerrado_por: string | null
  cerrado_en: string | null
}

/**
 * **Un movimiento de plata entre el cadete y el local.**
 *
 * 🔑 `monto` es el efecto sobre el saldo, con signo: rindió ⇒ negativo, le pagamos ⇒ positivo. No
 * hay columna `tipo` — la clase se deriva del signo (`claseDelMovimiento`), porque dos datos que
 * dicen lo mismo se pueden contradecir y no habría forma de saber cuál manda.
 *
 * La fecha es la del movimiento, que **no** tiene por qué ser un día de reparto: el jueves que rinde
 * lo del lunes al miércoles es un movimiento del jueves.
 */
/**
 * Las dos cosas que le pueden pasar a la plata. **No se guarda**: se deriva del signo del monto
 * (`claseDelMovimiento`). Es lo que dicen los dos botones de la pantalla.
 */
export type ClaseMovimiento = 'rindio' | 'le_pagamos'

export type MovimientoCuenta = {
  id: string
  fecha: string
  monto: number | string
  nota: string | null
  autor: string | null
  created_at?: string
  /** Anulado, no borrado: puede haber un recibo impreso en la mano del cadete. No suma al saldo. */
  anulado_en: string | null
  anulado_por: string | null
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
  /** Lo que se pagó al local por transferencia. Entró, pero no por su mano. Ver `pagoAlLocal`. */
  sinCobrar: number
  /** Lo que le debemos por llevarlos, los cobrados y los que no. */
  tarifas: number
  /** `cobrado − tarifas`. Negativo = ese día le quedamos debiendo. */
  debeTraer: number
  /** Los movimientos de plata de ese día, anulados incluidos: la pantalla los muestra tachados. */
  movimientos: MovimientoCuenta[]
  /** La suma de los movimientos **vivos**, con su signo. Es lo que el día movió por fuera del reparto. */
  movido: number
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
   * Todo lo que se pagó al local por transferencia, de todos los días. **No es deuda de nadie**: la
   * plata entró, sólo que no por la mano del cadete. Va aparte del saldo para que no se sume a lo que
   * él tiene que traer — y **no es una lista de clientas a las que llamar**, que es lo que decía acá
   * y lo que la pantalla mostraba en rojo. Ver `pagoAlLocal`.
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

/**
 * Una zona del mapa de reparto.
 *
 * `poligono` viaja entero desde la base: es lo que se evalúa para saber en qué zona cae una
 * dirección. Se declara `unknown` a propósito — es GeoJSON crudo y quien lo entiende es
 * `zonas.core.js`, que valida la forma; tiparlo acá sería una segunda verdad sobre el mismo dato.
 */
export type ZonaDeReparto = {
  id: string
  nombre: string
  tipo: 'servicio' | 'exclusion'
  /** `null` sólo en las de exclusión. En una de servicio la base no deja que falte ni que sea cero. */
  precio: number | null
  prioridad: number
  /** Se reparte, con el precio de la zona; lo que se coordina es **cuándo se va**. */
  coordinar: boolean
  /** `getDay()`: 0 es domingo. `null` es sin restricción, que es el caso de quince de las dieciséis. */
  dias: number[] | null
  turnos: Turno[] | null
  poligono: unknown
  autor?: string | null
  updated_at?: string | null
}

/**
 * **El precio que el mapa propone para una fila de la bandeja.** No es un dato guardado: se calcula
 * cuando alguien aprieta «Sugerir precios» y vive hasta que se recarga la pantalla.
 *
 * 🔑 **`sugerido` es el único estado con precio.** Los otros siete dicen por qué no lo hay, y esa
 * fila se tipea a mano exactamente como hasta ahora — que es la mitad barata del error. Los motivos
 * están escritos en `MOTIVO_SUGERENCIA` (`direccion.core.js`), una sola vez para el handler y la
 * pantalla.
 */
export type SugerenciaDePrecio = {
  id: string
  estado:
    | 'sugerido'
    | 'ambigua'
    | 'sin_zona'
    | 'no_vamos'
    | 'sin_direccion'
    | 'sin_localidad'
    | 'sin_altura'
    | 'no_ubicada'
    | 'punto_impreciso'
  precio: number | null
  zona: { id: string; nombre: string; coordinar: boolean } | null
  /** Los nombres de todas las zonas que contienen el punto: con `ambigua`, cuáles son las dos. */
  zonas?: string[]
  motivo: string | null
  /** Cómo se lo escribió Georef y qué contestó. Es lo que deja entender una propuesta rara. */
  consulta?: string | null
  encontrado?: string | null
}

/** Lo que va a pasar si se importa el archivo del mapa, antes de escribir nada. */
export type PlanDeImportacion = {
  nuevas: { nombre: string; tipo: string; precio: number | null }[]
  actualizadas: { nombre: string; cambios: string[]; precio: number | null }[]
  iguales: string[]
  ausentes: string[]
  problemas: { zona: string; motivo: string }[]
}
