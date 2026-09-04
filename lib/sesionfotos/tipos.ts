/**
 * Tipos del dominio Sesión de fotos, escritos contra la forma REAL que guarda el
 * legacy en el KV (`kind=sesionfotos`, index.html:9900-9923), no idealizados: los
 * campos opcionales lo son porque en el KV hay solicitudes viejas sin ellos.
 *
 * Una solicitud es un retiro de productos para fotografiar. El eje del módulo es
 * que el retiro es reversible: sale (venta en GN o control a mano), se fotografía
 * y vuelve (devolución). Por eso cada ítem se cuenta dos veces —preparado y
 * devuelto— y la solicitud no cierra hasta que volvió todo.
 */

/** Ubicación física de la que se retira una variante. */
export type Origen = 'deposito' | 'local'

/**
 * El ciclo de vida de una solicitud. El estado avanza casi siempre solo: al
 * completar el escaneo de preparado → `preparada`; al crear las ventas en GN →
 * `cargada`; al completar la devolución → `devuelta`; cuando GN confirma que la
 * venta se anuló → `cerrada`.
 *
 * Es la UNIÓN de los ciclos de Sesión de fotos y Solicitudes internas (convergencia
 * Fase A): fotos usa pendiente/preparada/cargada/devuelta/cerrada; internas suma
 * `aprobada`/`retirada`(=cargada)/`rechazada`. Que sea un solo type deja a
 * `SolicitudInterna` asignable a `Solicitud` para el motor/componente compartido.
 */
export type EstadoSolicitud = 'pendiente' | 'preparada' | 'cargada' | 'devuelta' | 'cerrada' | 'aprobada' | 'retirada' | 'rechazada'

/** Retornable (vuelve, se repone) o consumo (baja definitiva). Solo aplica a solicitudes internas. */
export type TipoSol = 'retornable' | 'consumo'

/** Una venta creada en Gestión Nube por un origen de la solicitud. */
export type VentaGN = {
  id: number | string
  number?: number | string
  [k: string]: unknown
}

export type ItemSolicitud = {
  /** `pid_sid` para variantes reales; `bc_<barcode>` para nuevos; `man_<mid>` para los "a mano". */
  vid: string
  pid: string | null
  sid: string | null
  nombre: string
  variante: string
  sku: string
  qty: number
  origen: Origen
  /** Stock de sistema al momento de armar (informativo). */
  stockDep?: number
  stockLoc?: number
  /** Código de barras de un ítem escaneado que todavía no está en GN. */
  barcode?: string
  /** Producto escaneado que aún no existe en GN: se guarda por código de barras. */
  nuevo?: boolean
  /** Un `nuevo` todavía sin vincular a su producto de GN. */
  pendiente?: boolean
  /** Un `nuevo` ya vinculado a su producto de GN (apareció por barcode). */
  vinculado?: boolean
  /** Prenda sin código: control a mano, no genera venta ni toca stock. */
  manual?: boolean
  /**
   * De qué proceso vino ESTE ítem, cuando no es el de la solicitud entera. Ausente = el de
   * la solicitud, que es el caso normal. Existe para el caso que no se podía escribir: el
   * faltante de catálogo que se suma a una sesión ya armada por un ingreso o una campaña.
   * Ver `lib/solicitudes/disparador.ts`.
   */
  disparador?: string
  /**
   * Bolsa (1..N) a la que se asigna el ítem para el armado/packing de la sesión: se
   * reparten los productos en bolsas numeradas, cada una un look/outfit. Ausente =
   * sin asignar. Organizativo: no toca GN ni stock. Un ítem entero va a una bolsa.
   */
  bolsa?: number
}

/** Motivos predefinidos de un cambio en la solicitud (edición). */
export const MOTIVOS_CAMBIO = ['Sin stock', 'Error de selección', 'Cambio de Marketing', 'Producto defectuoso', 'Otro'] as const

/**
 * Una entrada del historial de cambios de la solicitud (edición: agregar/quitar/
 * cambiar cantidad/editar). Lleva hora (`ts`), a diferencia de `eliminados` (fecha sola).
 */
export type Cambio = {
  ts: number
  por: string
  accion: 'agregó' | 'sacó' | 'cambió cantidad' | 'editó'
  detalle: string
  motivo?: string
}

/** Registro de un ítem quitado de la solicitud antes de crear las ventas. */
export type ItemEliminado = {
  vid: string
  pid: string | null
  nombre: string
  variante: string
  sku: string
  qty: number
  origen: Origen
  fecha: string
  por: string
  motivo: string
}

export type Solicitud = {
  id: string
  /** YYYY-MM-DD. */
  fecha: string
  /** Date.now() al crearla. */
  creado: number
  creadoPor: string
  descripcion: string
  estado: EstadoSolicitud
  items: ItemSolicitud[]
  /** Ventas creadas en GN, por origen. Su presencia marca "ya salió" (SEPARADO, no retirado). */
  ventas?: Partial<Record<Origen, VentaGN>>
  /**
   * Retiro FÍSICO confirmado por origen. Crear la venta en GN solo SEPARA el stock; el
   * retiro real (que la mercadería salió del depósito/local) se marca acá aparte, por
   * sector. Ausente/false = separado pero sin retirar.
   */
  retirado?: Partial<Record<Origen, boolean>>
  /** Conteo de preparado por vid (fase retiro). */
  verif?: Record<string, number>
  /** Conteo de devolución por vid (fase devolución). */
  devuelto?: Record<string, number>
  /**
   * Qué se fotografió, por vid. **La ausencia de una clave significa «sin contestar»**, que es una
   * respuesta de primera y no un cero: ver `lib/sesionfotos/fotografiado.ts`.
   *
   * ⛔ No confundir con `faltantes()`, que es lo que salió y no volvió: una prenda puede volver sin
   * fotografiarse y fotografiarse sin volver.
   */
  fotos?: Record<string, RegistroFoto>
  /**
   * Quién fue la modelo y **qué talle usa**. Sólo en el cajón de fotos. Ausente en todas las
   * sesiones anteriores al 3-sep-2026 y en las que nadie contestó — la regla y el porqué del
   * campo, en `lib/sesionfotos/modelo.ts`.
   */
  modelo?: ModeloSesion
  eliminados?: ItemEliminado[]
  /** Historial de cambios (edición): agregar/quitar/cambiar cantidad/editar, con hora y motivo. */
  cambios?: Cambio[]
  /**
   * Capa de Solicitudes internas (opcional; ausente en las de fotos). Motivo del retiro,
   * tipo (retornable/consumo) y datos de aprobación de los consumos. Convergencia Fase A:
   * viven acá para que `Solicitud` sea el superset y el motor sea uno solo.
   */
  motivo?: string
  tipo?: TipoSol
  /**
   * Qué proceso hizo nacer la solicitud: `ingreso` | `campania` | `faltante`. Es un eje
   * aparte del motivo y del destino, y NO cambia el cajón ni la aprobación — ver
   * `lib/solicitudes/disparador.ts`. Ausente en todas las solicitudes anteriores al
   * 24-ago-2026 y en las que se crean por una puerta que no sabe de dónde vienen.
   */
  disparador?: string
  aprobadoPor?: string
  aprobadoFecha?: string
  rechazadoMotivo?: string
}

/** Lo que se anota por variante al contestar si se fotografió. */
export type RegistroFoto = { ok: boolean; motivo?: string; por?: string; ts?: number }

/**
 * La modelo de la sesión. `talle` es lo único obligatorio: es lo que va a la descripción del
 * producto, y exigir el nombre —que en el momento no siempre se sabe cómo se escribe— perdería el
 * dato que sirve por el que no. `altura` se guarda ya normalizada (`1,70 m`).
 *
 * `id` es **la ficha del padrón de la que salió** (Model Management, 3-sep-2026). Está ausente en
 * las sesiones anteriores y en las que se tipearon a mano, y eso ⛔ no es un defecto: el talle
 * escrito sirve igual. Lo que ⛔ no se puede hacer sin él es contar cuántas sesiones hizo cada
 * modelo — por eso el selector existe.
 */
export type ModeloSesion = { id?: string; nombre?: string; talle: string; altura?: string; por?: string; ts?: number }

/** Fase de verificación por escaneo. */
export type Fase = 'retiro' | 'devolucion'
