/**
 * Canjes con influencers y creadoras — el dominio puro.
 *
 * Sin React, sin fetch, sin Supabase: todo acá es testeable con un objeto literal. La I/O vive en
 * `lib/canjes/cliente.ts` y el gate real en `api/_canjes.js`.
 *
 * Un canje es producto (o producto + plata) a cambio de contenido publicitario. Ver
 * `sql/migrate-canjes.sql` para el esquema y el porqué de que todo viva en la base de BDI.
 *
 * ⚠️ **El padrón de personas es único y transversal a las tres marcas**; los canjes sí son por
 * marca. Esa asimetría es el corazón del módulo: `CanjePersona` no tiene `store`, `CanjeRow` sí.
 *
 * 🔑 **Las reglas duras NO viven acá: vienen de `reglas.core.js`.** El grafo de estados, el tope,
 * el retiro en el local y los motivos son las mismas que corren en `api/_canjes.js` y en el portal
 * público, y hasta el 13-ago-2026 estaban escritas dos veces —una en TS para la pantalla, otra en
 * JS para el servidor— con un bloque de tests comparándolas. Este archivo les pone los tipos
 * encima y las re-exporta, así que quien importa de `tipos` sigue viendo lo mismo de siempre.
 */
import {
  buzonAbierto as buzonAbiertoJS,
  controlDelTope as controlDelTopeJS,
  esPedidoUgc as esPedidoUgcJS,
  esTerminal as esTerminalJS,
  ESTADOS as ESTADOS_JS,
  fechaISO as fechaISOJS,
  itemsVivos as itemsVivosJS,
  listoParaEntregar as listoParaEntregarJS,
  MOTIVO_NO_ACEPTO_OTRO as MOTIVO_NO_ACEPTO_OTRO_JS,
  MOTIVOS_NO_ACEPTO as MOTIVOS_NO_ACEPTO_JS,
  numeroCanje as numeroCanjeJS,
  puedeIr as puedeIrJS,
  RESULTADOS as RESULTADOS_JS,
  RESULTADOS_UGC as RESULTADOS_UGC_JS,
  resultadosDe as resultadosDeJS,
  retiroLocalDisponible as retiroLocalDisponibleJS,
  TERMINALES as TERMINALES_JS,
  TRANSICIONES as TRANSICIONES_JS,
} from './reglas.core.js'

// ── La marca ────────────────────────────────────────────────────────────────────

/**
 * Tres valores, no dos. Igual que `SkuStore` en `lib/sku-map/tipos.ts`: Stunned no es una marca de
 * primera clase en el monitor (es una línea de Zattia, por prefijo de SKU `STU`) pero acá se elige
 * como una más, porque desde el lado del canje se comporta como una: tiene su propia cuenta de
 * Instagram, sus propios acuerdos y su propio balance.
 *
 * Al leer costos, Stunned rutea a la base de **Zattia** — que es exactamente lo que ya hace
 * `api/sku-map.js`.
 */
export type CanjeStore = 'bdi' | 'zattia' | 'stunned'

export const CANJE_STORES: CanjeStore[] = ['bdi', 'zattia', 'stunned']

export const STORE_LABEL: Record<CanjeStore, string> = {
  bdi: 'BDI',
  zattia: 'Zattia',
  stunned: 'Stunned',
}

/** De qué base de Supabase salen los costos de esta marca. Stunned es Zattia. */
export function baseDeCostos(store: CanjeStore): 'bdi' | 'zattia' {
  return store === 'bdi' ? 'bdi' : 'zattia'
}

/**
 * Qué dato se le pide a la persona según la marca del canje. Es obligatorio: sin esto no se puede
 * armar el pedido. Los dos conviven en la misma ficha (la misma creadora puede tener talles por un
 * canje de Zattia y modelo por uno de BDI), pero el portal muestra sólo el que corresponde, para no
 * pedirle datos que no le sirven a nadie.
 */
export function queDatoPide(store: CanjeStore): 'modelo_celular' | 'talles' {
  return store === 'bdi' ? 'modelo_celular' : 'talles'
}

// ── Estados ─────────────────────────────────────────────────────────────────────

/**
 * Nueve estados y ni uno más. Lo que avanza a ritmos distintos **no es un estado sino un pendiente**
 * (`compra_estado`, `envio_estado`, `pago_estado`, `aviso_estado`, `contacto_estado`) — mismo
 * criterio que Reclamos, donde meter cada paso manual como estado dejaba casos trabados sin poder
 * cerrarse nunca.
 *
 * ⚠️ Hay **dos esperas distintas** y por eso son dos estados, no uno: `propuesta` es la nuestra (la
 * firma interna) y `enviada` es la de ella. Confundirlas era el agujero de la primera versión —
 * un canje que la creadora nunca contestó figuraba como acordado apenas alguien lo firmaba puertas
 * adentro, y encima le tapaba la cadencia 90 días.
 *
 * ⚠️ **No hay `borrador`**: la propuesta se cierra en una sola pantalla, así que ningún canje nace
 * a medias. "Ya la armé pero todavía no le escribí" es `contacto_estado`, un pendiente.
 */
export type EstadoCanje =
  | 'propuesta'
  | 'enviada'
  | 'rechazado'
  | 'no_acepto'
  | 'acuerdo'
  | 'preparando'
  | 'en_curso'
  | 'cerrado'
  | 'cancelado'

/** Los nueve, en el orden del grafo. Sale de `reglas.core.js`, no de una lista a mano. */
export const ESTADOS_CANJE = ESTADOS_JS as EstadoCanje[]

export const ESTADO_CANJE_LABEL: Record<EstadoCanje, string> = {
  propuesta: 'Esperando la firma interna',
  enviada: 'Esperando su respuesta',
  rechazado: 'Rechazado internamente',
  no_acepto: 'No aceptó',
  acuerdo: 'Acordado',
  preparando: 'Preparando el envío',
  en_curso: 'Esperando el contenido',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
}

/**
 * Los terminales: de acá no se sale. `cancelado` revoca el token del portal.
 *
 * `rechazado` y `no_acepto` son los dos "no" y tienen dueños distintos a propósito: el primero es
 * nuestro y lo firma quien tiene el sub; el segundo es de ella y lo registra quien lleva la
 * conversación. Uno dice algo de nosotros, el otro dice algo de la persona.
 */
export const ESTADOS_TERMINALES = TERMINALES_JS as EstadoCanje[]

export const esTerminal: (estado: EstadoCanje) => boolean = esTerminalJS

/**
 * El grafo. `cancelado` no figura acá porque se puede llegar desde **cualquier** estado no
 * terminal — lo resuelve `puedeIr`, no la tabla.
 */
export const TRANSICIONES = TRANSICIONES_JS as Record<EstadoCanje, EstadoCanje[]>

export const puedeIr: (desde: EstadoCanje, hasta: EstadoCanje) => boolean = puedeIrJS

/**
 * En qué está parado el canje **de verdad**, que no es lo mismo que su estado.
 *
 * Cuatro de los nueve tramos no son estados: salen de los *pendientes*. Un `preparando` puede estar
 * esperando que alguien compre, que alguien despache, o al correo — tres trabajos distintos, de tres
 * personas distintas, bajo el mismo enum.
 *
 * 🔑 **Esta es la única derivación.** La etiqueta que se lee (`estadoEnCriollo`) y el orden de la
 * lista (`PESO_TRAMO`) salen las dos de acá. Escritas por separado, el día que se agregue un matiz
 * la pantalla diría "Falta despachar" y lo ordenaría como si esperara a la creadora.
 */
export type TramoCanje =
  | 'firma'
  | 'escribirle'
  | 'acordado'
  | 'comprar'
  | 'despachar'
  | 'transito'
  | 'respuesta'
  | 'contenido'
  | 'terminal'

export function tramoDeCanje(
  // `contacto_estado` va opcional a propósito: un canje ciego (el de otra marca) no lo trae, y sin
  // él la respuesta correcta igual es "falta escribirle".
  c: Pick<CanjeRow, 'estado' | 'compra_estado' | 'envio_estado'> & Partial<Pick<CanjeRow, 'contacto_estado'>>,
): TramoCanje {
  // Mientras no se le haya escrito, decir "esperando su respuesta" sería mentir: la pelota es
  // nuestra. Es el mismo desdoble que hace `preparando` con la compra y el despacho.
  if (c.estado === 'enviada') return c.contacto_estado === 'hecho' ? 'respuesta' : 'escribirle'
  if (c.estado === 'preparando') {
    if (c.compra_estado !== 'hecho') return 'comprar'
    if (c.envio_estado !== 'hecho') return 'despachar'
    return 'transito'
  }
  if (c.estado === 'propuesta') return 'firma'
  if (c.estado === 'acuerdo') return 'acordado'
  if (c.estado === 'en_curso') return 'contenido'
  return 'terminal'
}

/**
 * Cuánto traba cada tramo. **Arriba lo que espera algo NUESTRO**, abajo lo que espera a la creadora,
 * y al fondo lo que ya terminó (decisión de Bruno, 5-ago-2026).
 *
 * `acordado` va con los nuestros: ella ya dijo que sí y nadie empezó a prepararlo, así que la pelota
 * está de este lado aunque el estado no lo diga.
 */
export const PESO_TRAMO: Record<TramoCanje, number> = {
  firma: 0, // sin firma no hay link, y sin link ella no manda la dirección: traba todo lo demás
  escribirle: 1,
  acordado: 2,
  comprar: 3,
  despachar: 4,
  transito: 5,
  respuesta: 6,
  contenido: 7,
  terminal: 8,
}

/** Sólo los ocho que siguen pidiendo trabajo de alguien. `terminal` se etiqueta por estado. */
const TRAMO_LABEL: Record<Exclude<TramoCanje, 'terminal'>, string> = {
  firma: ESTADO_CANJE_LABEL.propuesta,
  escribirle: 'Falta escribirle',
  acordado: ESTADO_CANJE_LABEL.acuerdo,
  comprar: 'Falta comprar',
  despachar: 'Falta despachar',
  transito: 'En tránsito',
  respuesta: ESTADO_CANJE_LABEL.enviada,
  contenido: ESTADO_CANJE_LABEL.en_curso,
}

/**
 * El estado en criollo, con el matiz que el label solo no da. Mismo patrón que
 * `estadoEnCriollo` de `lib/reclamos/tipos.ts:163`: la UI muestra esto, no el enum.
 */
export function estadoEnCriollo(
  c: Pick<CanjeRow, 'estado' | 'compra_estado' | 'envio_estado'> & Partial<Pick<CanjeRow, 'contacto_estado'>>,
): string {
  const tramo = tramoDeCanje(c)
  if (tramo === 'terminal') return ESTADO_CANJE_LABEL[c.estado] ?? c.estado
  return TRAMO_LABEL[tramo]
}

/**
 * La cola de tránsito: **despachado y todavía sin llegar**. Es lo que la encargada revisa todos los
 * días, y por eso es un filtro y no un estado nuevo — el canje ya está en `preparando` con el envío
 * hecho, y `estadoEnCriollo` ya lo llama "En tránsito".
 *
 * Anotar un intento de entrega **no lo saca de acá**: mientras el pedido no llegó, sigue siendo
 * trabajo de alguien. El único evento que lo saca es `entregado_at`.
 */
export function enTransito(c: Pick<CanjeRow, 'envio_estado' | 'entregado_at'>): boolean {
  return c.envio_estado === 'hecho' && !c.entregado_at
}

// ── Retiro en el local ──────────────────────────────────────────────────────────

/**
 * Qué marcas pueden ofrecer "lo retira en el local". Hoy **sólo BDI**: es el único que tiene local
 * (Rosario), y la venta a $0 se crea contra el `store_id` de ese local en Gestión Nube.
 *
 * Es una función y no una constante suelta para que la pantalla y el servidor pregunten lo mismo:
 * si un día Zattia abre local, se agrega acá y no en dos lados.
 */
/**
 * El resultado comercial de un canje. Cuatro valores, y `no_se` es el que evita que «no sé» se
 * registre como «nada» — la diferencia entre las dos es lo que dice si la pregunta se está usando.
 */
export type ResultadoCanje =
  | 'vendio' | 'algo' | 'nada'
  | 'uso_pauta' | 'sirvio' | 'no_sirvio'
  | 'no_se'

export const RESULTADOS = RESULTADOS_JS as ResultadoCanje[]

/**
 * El juego de un canje **UGC**: lo que se le pidió no se publica, así que preguntarle si vendió no
 * tiene respuesta. 🔴 Ningún valor se pisa con los de venta —salvo `no_se`— para que la columna
 * siga diciendo **qué pregunta** se contestó. El porqué, en `reglas.core.js`.
 */
export const RESULTADOS_UGC = RESULTADOS_UGC_JS as ResultadoCanje[]

/** ¿Todo lo que se le pidió es material para nosotros, sin publicación? Deriva de los entregables. */
export const esPedidoUgc: (entregables: { tipo: TipoEntregable }[]) => boolean = esPedidoUgcJS

/** Qué juego de respuestas corresponde. La pantalla y el handler preguntan lo mismo. */
export const resultadosDe: (entregables: { tipo: TipoEntregable }[]) => ResultadoCanje[] =
  resultadosDeJS as (e: { tipo: TipoEntregable }[]) => ResultadoCanje[]

/**
 * Lo que se lee en la pantalla. ⚠️ Ninguno afirma una medición: son las palabras con las que se
 * contesta a ojo, porque a ojo es como se contesta.
 */
export const RESULTADO_LABEL: Record<ResultadoCanje, string> = {
  vendio: 'Sí, se notó en la venta',
  algo: 'Algo movió',
  nada: 'No se notó',
  // Los tres de UGC. La pregunta no es qué vendió: es si el material sirvió, y «se usó en pauta» es
  // la única de las cuatro que además dice dónde terminó.
  uso_pauta: 'Se usó en pauta',
  sirvio: 'Sirvió, todavía no se usó',
  no_sirvio: 'No sirvió',
  no_se: 'No sabría decir',
}

export const retiroLocalDisponible: (store: string | null | undefined) => boolean = retiroLocalDisponibleJS

/**
 * ¿Ya puede subir el contenido por su link? Con retiro en el local, desde que aceptó; con envío,
 * recién cuando el pedido llegó. El porqué está en `reglas.core.js`.
 */
export const buzonAbierto: (
  c: Pick<CanjeRow, 'retiro_local' | 'entregado_at'> | null | undefined,
) => boolean = buzonAbiertoJS

/**
 * Si el local ya puede entregarlo. **De acá salen el botón habilitado y la validación del handler**,
 * que es todo el punto: escritas por separado, la pantalla ofrece algo que el servidor rechaza.
 *
 * Los items tienen que estar linkeados a Gestión Nube (`product_id` + `size_id`) porque sin eso la
 * venta no se puede crear y el stock no baja: entregar sin descontar es peor que no entregar.
 *
 * ⛔ **No exige llegar al tope.** Si se autorizaron 3 fundas y se lleva 2, se cierra con 2 — el tope
 * es un techo, no una cuota.
 */
export const listoParaEntregar: (
  c: Pick<CanjeRow, 'store' | 'estado' | 'retiro_local' | 'entregado_at' | 'tope_tipo' | 'tope_pvp' | 'tope_unidades'>,
  items: CanjeItem[],
) => { ok: boolean; motivo: string | null } = listoParaEntregarJS

/**
 * El número que ve la gente. Derivado del id, **no es una columna**: mismo criterio que
 * `numeroReclamo` en `lib/reclamos/tipos.ts:799` — que sigue con la deuda de espejo que ésta ya no
 * tiene.
 */
export const numeroCanje: (id: number) => string = numeroCanjeJS

// ── Los pendientes (no son estados) ─────────────────────────────────────────────

export type Pendiente = 'pendiente' | 'hecho' | 'no_aplica'
export type PagoEstado = 'pendiente' | 'pagado' | 'no_aplica'

export const PENDIENTES: Pendiente[] = ['pendiente', 'hecho', 'no_aplica']
export const PAGO_ESTADOS: PagoEstado[] = ['pendiente', 'pagado', 'no_aplica']

/**
 * Un intento de entrega del correo. Se guardan **todos**, en `canjes.intentos`: con una sola fecha
 * el segundo intento pisa al primero y se pierde justo lo que explica por qué un pedido tardó tres
 * semanas.
 */
export type IntentoEntrega = { at: string; nota?: string | null; usuario?: string | null }

// ── El tipo de canje y el tope ──────────────────────────────────────────────────

export type TipoCanje = 'producto' | 'producto_plata'

export const TIPO_CANJE_LABEL: Record<TipoCanje, string> = {
  producto: 'Solo producto',
  producto_plata: 'Producto + plata',
}

/**
 * Dos modos, y la diferencia importa al cargar los productos:
 * - `monto`: "elegí hasta $80.000". Control **duro** sobre la suma de PVP.
 * - `unidades`: "2 fundas, 1 jean, 1 remera". Control **duro sobre el total de unidades** y
 *   **blando sobre el detalle** — el operador ve la lista acordada al lado de lo que carga y valida
 *   a ojo. No se intenta adivinar si algo "es un jean": la categoría de GN no es lo bastante
 *   prolija para colgar de ahí un bloqueo, y una validación que se equivoca la mitad de las veces
 *   se termina apagando.
 */
export type TopeTipo = 'monto' | 'unidades'

export type TopeUnidad = { cantidad: number; descripcion: string }

// ── Entregables ─────────────────────────────────────────────────────────────────

/**
 * Lista **cerrada en código**, a propósito (Bruno, 27-jul). Una lista abierta se llena de
 * duplicados (`Reel`, `reel ig`, `REEL`) y estos tipos alimentan el puntaje y los avisos. Sumar uno
 * es una línea más un deploy; si en tres meses faltan tipos, ahí se hace configurable.
 */
export type TipoEntregable = 'historia_ig' | 'reel_ig' | 'post_ig' | 'video_tiktok' | 'contenido'

export const TIPOS_ENTREGABLE: TipoEntregable[] = ['historia_ig', 'reel_ig', 'post_ig', 'video_tiktok', 'contenido']

export const ENTREGABLE_LABEL: Record<TipoEntregable, string> = {
  historia_ig: 'Historia de Instagram',
  reel_ig: 'Reel de Instagram',
  post_ig: 'Post de Instagram',
  video_tiktok: 'Video de TikTok',
  contenido: 'Contenido para nosotros',
}

/** El plural, para no escribir "2 Historia de Instagram". */
export const ENTREGABLE_LABEL_PLURAL: Record<TipoEntregable, string> = {
  historia_ig: 'Historias de Instagram',
  reel_ig: 'Reels de Instagram',
  post_ig: 'Posts de Instagram',
  video_tiktok: 'Videos de TikTok',
  contenido: 'Contenidos para nosotros',
}

/** "1 historia" / "2 historias": la concordancia se resuelve acá, no en cada componente. */
export function entregableEnCriollo(tipo: TipoEntregable, cantidad: number): string {
  const label = cantidad === 1 ? ENTREGABLE_LABEL[tipo] : ENTREGABLE_LABEL_PLURAL[tipo]
  return `${cantidad} ${label.toLowerCase()}`
}

// ── Motivos ─────────────────────────────────────────────────────────────────────

/** El "no" nuestro, en la firma interna. Es placeholder: el motivo se escribe libre. */
export const MOTIVOS_RECHAZO = [
  'No encaja con la marca',
  'El costo no lo justifica',
  'Ya hicimos algo parecido hace poco',
  'No hay stock de lo que pide',
  'Otro',
]

/**
 * El "no" de ella. **Lista cerrada**, a diferencia de `MOTIVOS_RECHAZO`, porque esto es información
 * sobre la persona: alimenta filtros y el día de mañana el puntaje, y una lista abierta se llena de
 * `no contestó` / `No respondio` / `ni bola`. Espejo en `api/_canjes.js`.
 *
 * `'Ahora no, más adelante'` está para que el registro no se ensucie: no es un no, y sin esa opción
 * termina anotado como "No le interesó", que es lo que después mira quien la vuelva a proponer.
 */
export const MOTIVOS_NO_ACEPTO: string[] = MOTIVOS_NO_ACEPTO_JS

/** El único que exige nota: sin eso, "Otro" no dice nada dentro de seis meses. */
export const MOTIVO_NO_ACEPTO_OTRO: string = MOTIVO_NO_ACEPTO_OTRO_JS

export const MOTIVOS_QUITAR_ITEM = ['Sin stock', 'Se cambió por otro', 'Se pasaba del tope', 'Otro']

// ── Las filas ───────────────────────────────────────────────────────────────────

export type NotaCanje = {
  /**
   * ⚠️ El id existe **a propósito**: `lib/crm/leads.ts` borra notas por índice posicional y ya borró
   * la equivocada cuando la lista se había reordenado. Acá se borra por id.
   */
  id: string
  texto: string
  at: string
  usuario?: string | null
}

export type ArchivoCanje = {
  url: string
  nombre?: string | null
  tipo?: string | null
  at: string
  usuario?: string | null
}

export type CanjeEvento = {
  estado?: EstadoCanje | null
  at: string
  usuario?: string | null
  nota?: string | null
}

export type TallesPersona = {
  remera?: string | null
  pantalon?: string | null
  calzado?: string | null
}

/**
 * El padrón. **No tiene `store`**: es transversal a las tres marcas, y esa es la razón por la que
 * todo el módulo vive en una sola base.
 */
export type CanjePersona = {
  id: number
  /** Normalizado (minúsculas, sin @, sin URL) y único. Es el único campo obligatorio. */
  instagram: string
  /** Lo que se tipeó, con sus mayúsculas. Se muestra; no se compara. */
  instagram_raw?: string | null

  nombre?: string | null
  apellido?: string | null
  telefono?: string | null
  email?: string | null
  tiktok?: string | null
  ciudad?: string | null

  /** La dirección vive acá, no en el canje: se muda una vez cada tres años. */
  dni?: string | null
  calle?: string | null
  numero?: string | null
  piso?: string | null
  depto?: string | null
  cp?: string | null
  provincia?: string | null
  localidad?: string | null
  direccion_nota?: string | null

  /** Zattia y Stunned. Convive con `modelo_celular`. */
  talles?: TallesPersona | null
  /** BDI. Convive con `talles`. */
  modelo_celular?: string | null

  seguidores_ig?: number | null
  seguidores_tt?: number | null
  /** Sin esta fecha el número de seguidores miente. */
  seguidores_at?: string | null

  destacada: boolean
  destacada_nota?: string | null
  vetada: boolean
  vetada_motivo?: string | null

  cadencia_dias: number

  notas?: NotaCanje[]
  archivos?: ArchivoCanje[]
  historial?: CanjeEvento[]

  usuario?: string | null
  created_at: string
  updated_at?: string | null
}

export type CanjeRow = {
  id: number
  /** Derivado del id con `numeroCanje`, no una columna. */
  numero?: string
  persona_id: number
  store: CanjeStore

  tipo: TipoCanje
  estado: EstadoCanje
  titulo?: string | null
  nota?: string | null

  tope_tipo: TopeTipo
  tope_pvp?: number | null
  tope_unidades?: TopeUnidad[]

  monto_plata?: number | null
  pago_estado: PagoEstado
  pago_at?: string | null
  pago_nota?: string | null

  aprobado_por?: string | null
  aprobado_at?: string | null
  /** Se **guarda**, no se recalcula: si mañana cambia el umbral, lo aprobado sigue diciendo con qué regla se aprobó. */
  aprobacion_nivel?: NivelAprobacion | null
  rechazado_motivo?: string | null
  rechazado_por?: string | null
  rechazado_at?: string | null
  /**
   * Se estampa cuando **ella acepta**, no cuando firmamos nosotros. Es la fecha que
   * `fechaDeAccion()` lee como "última acción con esta persona": si se estampara en la firma
   * interna, una propuesta que nunca contestó le taparía la cadencia 90 días.
   */
  acordado_at?: string | null

  /** ¿Ya se le escribió? Es un pendiente, no un estado: el canje ya está armado igual. */
  contacto_estado: Pendiente
  contacto_at?: string | null
  /** De `MOTIVOS_NO_ACEPTO`, lista cerrada. `nota` es obligatoria sólo si el motivo es "Otro". */
  respuesta_motivo?: string | null
  respuesta_nota?: string | null
  respuesta_at?: string | null

  /** Nunca sale en listados: es la llave del link público. Se pide aparte, de a uno. */
  token?: string | null
  token_vence?: string | null
  /** Distingue "nunca lo miró" de "lo miró y estaba bien", que no es lo mismo al despachar. */
  datos_confirmados_at?: string | null

  /** Qué vitrina ve al abrir el link. **La vitrina se reusa entre canjes; el link no.** */
  vitrina_id?: number | null
  /** Cuándo mandó su elección. Al mandar se cierra: si vuelve a entrar, la ve en lectura. */
  seleccion_cerrada_at?: string | null

  /**
   * Lo retira en el local en vez de recibirlo por correo. **Se decide al proponer**, y de eso
   * dependen tres cosas: la ficha no ofrece cargar una orden de Tienda Nube ni despachar, el portal
   * no le pide la dirección, y el canje aparece en la pantalla del local.
   */
  retiro_local?: boolean | null

  tn_orden?: string | null
  compra_estado: Pendiente
  compra_at?: string | null
  compra_por?: string | null
  gn_venta_number?: string | null
  /** El `id` interno de GN, con el que se le puede preguntar si la venta sigue viva. */
  gn_venta_id?: number | null
  stock_estado: Pendiente

  envio_via?: string | null
  envio_seguimiento?: string | null
  envio_costo?: number | null
  envio_estado: Pendiente
  envio_at?: string | null
  /** Copia congelada al despachar, para que el histórico no mienta si después se mudó. */
  envio_direccion?: Record<string, unknown> | null
  aviso_estado: Pendiente
  aviso_at?: string | null
  /** El pivote: al setearlo se congelan los `vence_el` de cada entregable. */
  entregado_at?: string | null
  /**
   * Los intentos de entrega del correo. Es una lista porque el correo intenta más de una vez y una
   * fecha sola se pisa. Anotar uno **no cambia el estado**: el canje sigue en la cola de tránsito.
   */
  intentos?: IntentoEntrega[] | null

  cupon_codigo?: string | null
  cupon_desde?: string | null
  cupon_hasta?: string | null

  balance_costo_productos?: number | null
  balance_costo_envio?: number | null
  balance_costo_plata?: number | null
  balance_costo_total?: number | null
  balance_alcance?: number | null
  balance_interacciones?: number | null
  balance_cpm?: number | null
  /** 1–5, el único número manual del balance. */
  balance_puntaje_manual?: number | null
  balance_nota?: string | null

  cerrado_incompleto: boolean
  cierre_motivo?: string | null
  cerrado_por?: string | null
  cerrado_at?: string | null

  /** Devolvió o vendió lo que le mandamos. Penaliza el puntaje; sin flujo de reingreso. */
  /** ¿Rindió? Se contesta **después** de cerrar. `null` = todavía no lo contestó nadie. */
  resultado?: ResultadoCanje | null
  resultado_nota?: string | null
  resultado_por?: string | null
  resultado_at?: string | null
  producto_no_conservado: boolean
  producto_no_conservado_motivo?: string | null
  producto_no_conservado_por?: string | null
  producto_no_conservado_at?: string | null

  cancelado_motivo?: string | null

  /**
   * La subcarpeta de Drive donde se archiva el contenido de este canje. La guarda el **primer**
   * archivado y la reusa el resto: Google da el permiso por archivo y por persona, así que la
   * carpeta que creó una sesión no la ve la app de otra y buscarla por nombre haría una gemela.
   */
  drive_carpeta_id?: string | null

  usuario?: string | null
  historial?: CanjeEvento[]
  created_at: string
  updated_at?: string | null
}

export type EstadoItem = 'propuesto' | 'confirmado' | 'sin_stock' | 'quitado'

export type CanjeItem = {
  id: number
  canje_id: number
  sku?: string | null
  /**
   * ⚠️ **De qué sistema son estos ids lo dice `origen`.** Con `'equipo'` salen del buscador de
   * Gestión Nube (`product_id` + `size_id` de GN); con `'persona'` salen de la vitrina, que es un
   * espejo de Tienda Nube, así que son ids de TN. No se unifican porque no hay cruce confiable
   * entre los dos —el SKU falta o se repite— y porque para la tanda 3, que es tipear la venta en el
   * admin de TN, los útiles son justamente los de TN.
   */
  product_id?: string | null
  size_id?: string | null
  nombre?: string | null
  variante?: string | null
  cantidad: number
  /** Congelados al cargarlos: el balance necesita el costo **de ese día**, no el de hoy. */
  costo_unit?: number | null
  pvp_unit?: number | null
  origen: 'persona' | 'equipo'
  estado: EstadoItem
  motivo?: string | null
  usuario?: string | null
  created_at: string
  updated_at?: string | null
}

export type CanjeEntregable = {
  id: number
  canje_id: number
  tipo: TipoEntregable
  cantidad_comprometida: number
  /** En **días desde la entrega**, no una fecha: al acordar no se sabe cuándo llega el pedido. */
  plazo_dias?: number | null
  /** Se calcula al setear `entregado_at` y se congela ahí. */
  vence_el?: string | null
  obligatorio: boolean
  nota?: string | null
  created_at: string
  updated_at?: string | null

  // ⚠️ `cantidad_cumplida` NO existe: se deriva contando evidencias verificadas. Un contador
  // denormalizado se desincroniza el día que alguien borre una evidencia.
}

export type CanjeEvidencia = {
  id: number
  canje_id: number
  entregable_id?: number | null
  url_publicacion?: string | null
  /** Las historias vencen a las 24 h: la captura **es** la prueba. */
  captura_url?: string | null
  archivo_url?: string | null
  archivo_tipo?: string | null
  /** Se compara contra `vence_el` → de ahí sale la puntualidad. */
  fecha_publicacion?: string | null
  metricas?: Record<string, number | string | null>
  subido_por: 'persona' | 'equipo'
  /** Una evidencia sin verificar **no cuenta**: si no, un link roto cierra el canje. */
  verificada: boolean
  verificada_por?: string | null
  verificada_at?: string | null
  rechazada_motivo?: string | null
  /**
   * Dónde quedó archivado en Drive. **Con esto cargado, el archivo ya NO está en el buzón**: el
   * Blob se borra apenas Drive confirma, así que `archivo_url` apunta a una URL muerta y queda
   * sólo como registro de por dónde entró.
   */
  drive_url?: string | null
  drive_at?: string | null
  drive_por?: string | null
  usuario?: string | null
  created_at: string
  updated_at?: string | null
}

/**
 * Los números que si no serían constantes escondidas en el código que en seis meses nadie va a
 * saber dónde tocar. Se **lee, nunca se asume**: las funciones del dominio la reciben por
 * parámetro, así siguen siendo puras y testeables con cualquier valor.
 */
export type CanjeConfig = {
  store: CanjeStore
  /** `null` = **todo** va a la firma alta. Es el default seguro; el monto no está definido todavía. */
  umbral_aprobacion_alta: number | null
  cadencia_dias_default: number
  plazo_entregable_dias_default: number
  tope_evidencias_por_canje: number
  /** El ratio costo/PVP para estimar la plata antes de que haya items, que es cuando se aprueba. */
  factor_costo_estimado: number
  /** ⚠️ Arranca **apagado**. Ver §8 del plan: si nadie carga evidencias, frena a quien sí cumplió. */
  bloquear_por_vencidos: boolean
  /** Cierres incompletos para caer solo en la banda `no_repetir`. Derivado: también se sale solo. */
  cierres_incompletos_no_repetir: number
  /** Una sola carpeta general por marca. El sistema no la organiza ni pretende hacerlo. */
  drive_url: string | null
  /**
   * Con qué palabra se cuentan las unidades en esta marca: BDI habla de fundas, Zattia de prendas.
   * Va en la config y no en código para que cambiarla no cueste un deploy — es un texto que se
   * mira todos los días y que el sector va a querer afinar.
   */
  unidad_default: string | null
  /** Las otras palabras que aparecen seguido, para no tipearlas. Nunca es una lista cerrada. */
  unidades_sugeridas: string[]
  /**
   * El cupón de 100% con el que la orden de canje se tipea en $0 en el admin de Tienda Nube.
   * **Uno solo por marca, genérico y sin vencimiento**: es interno de marketing y su único trabajo
   * es que la venta marque $0. Se crea a mano en TN — el monitor no puede crear cupones.
   */
  cupon_codigo: string | null
  /**
   * El mail con el que se tipea la orden del canje en Tienda Nube. **No es el de la creadora**: la
   * orden es un trámite interno para que el envío salga y la venta marque $0, y su mail es una
   * herramienta de contacto nuestra que vive en el padrón. Con el de la marca, además, TN no le
   * manda a ella los mails de la orden.
   */
  email_pedido: string | null
  updated_at?: string | null
}

export const CONFIG_DEFAULT: Omit<CanjeConfig, 'store'> = {
  umbral_aprobacion_alta: null,
  cadencia_dias_default: 90,
  plazo_entregable_dias_default: 10,
  tope_evidencias_por_canje: 30,
  factor_costo_estimado: 0.4,
  bloquear_por_vencidos: false,
  cierres_incompletos_no_repetir: 2,
  drive_url: null,
  unidad_default: null,
  unidades_sugeridas: [],
  cupon_codigo: null,
  email_pedido: null,
}

/** Si la marca no configuró la suya. Genérico a propósito: es mejor que adivinar mal. */
export const UNIDAD_FALLBACK = 'productos'

export function unidadDeLaMarca(cfg?: Pick<CanjeConfig, 'unidad_default'> | null): string {
  return cfg?.unidad_default?.trim() || UNIDAD_FALLBACK
}

// ── La vitrina ──────────────────────────────────────────────────────────────────
//
// Una vitrina es **un espejo curado de Tienda Nube**: se trae de la tienda lo que se quiere
// promocionar, se saca el resto, y eso es lo que la creadora ve al abrir su link. No vuelve nada a
// TN — lo que ella elige se escribe sólo en `canje_items`.
//
// Todo viaja congelado, foto incluida, porque **el portal no tiene sesión** y no puede pedirle nada
// a la tienda. Ver el encabezado de la sección 8 de `sql/migrate-canjes.sql`.

export type EstadoVitrina = 'borrador' | 'activa' | 'archivada'

export const ESTADOS_VITRINA: EstadoVitrina[] = ['borrador', 'activa', 'archivada']

export const ESTADO_VITRINA_LABEL: Record<EstadoVitrina, string> = {
  borrador: 'Armándose',
  activa: 'Activa',
  archivada: 'Archivada',
}

/**
 * Una variante de Tienda Nube, congelada. Es **lo que ella elige**: el producto la lleva a esto.
 *
 * ⚠️ `valores` viene tal como lo manda la tienda y **no se puede nombrar de antemano**. Medido
 * sobre los dos catálogos: en BDI 181 productos tienen un solo eje (`['iPhone 12']`) y 19 tienen
 * dos (`['iPhone 11/12/12 Mini', 'Rosa']`); en Zattia son 495 y 42 (`['Negro', 'XS']`). Poner
 * "modelo" y "color" en la pantalla sería mentira la mitad de las veces, así que se muestran los
 * valores crudos y la palabra la pone la tienda.
 *
 * `id` es el de la variante en TN y es la llave: el SKU no alcanza —en BDI falta en 4 de cada 10
 * variantes y en Zattia se repite igual en las 24 de un mismo producto—.
 */
export type OpcionVitrina = {
  id: string
  valores: string[]
  /** La foto propia de la variante, si TN la tiene. Si no, se usa la del producto. */
  foto?: string | null
  sku?: string | null
  barcode?: string | null
}

export type CanjeVitrinaItem = {
  id: number
  vitrina_id: number
  orden: number
  /** El id del PRODUCTO en Tienda Nube. */
  tn_product_id: string
  sku?: string | null
  nombre: string
  /** La tapa: la de la grilla, la de la hoja y el fallback de una variante sin foto propia. */
  foto_url?: string | null
  /** Las demás fotos del producto. Vacío en las vitrinas armadas antes del 5-ago-2026. */
  fotos?: string[]
  /** Precio de lista, de TN. El **costo no está**: vive en Gestión Nube y no se cruza confiable. */
  pvp?: number | null
  opciones: OpcionVitrina[]
  activo: boolean
  created_at?: string
  updated_at?: string | null
}

export type CanjeVitrina = {
  id: number
  store: CanjeStore
  nombre: string
  estado: EstadoVitrina
  nota?: string | null
  usuario?: string | null
  created_at?: string
  updated_at?: string | null
  /**
   * Cuándo se revisó la vitrina **entera** contra la tienda. Aparte de `updated_at`, que también se
   * mueve al renombrarla: lo que hay que poder mirar es qué tan vieja es la foto del stock.
   * `null` = nunca desde que se armó.
   */
  stock_at?: string | null
  /** Viajan con la vitrina: sin los productos no hay nada que mirar. */
  items?: CanjeVitrinaItem[]
}

/** "Negro · XS", "iPhone 12". Una sola implementación: es lo que se guarda en `canje_items.variante`. */
export function opcionEnCriollo(o: Pick<OpcionVitrina, 'valores'>): string {
  return (o.valores || []).filter(Boolean).join(' · ')
}

/** La foto que se dibuja: la propia de la variante gana, y si no hay, la del producto. */
export function fotoDeLaOpcion(item: Pick<CanjeVitrinaItem, 'foto_url'>, o?: Pick<OpcionVitrina, 'foto'> | null): string {
  return (o?.foto || item.foto_url || '') as string
}

/** Lo que se le ofrece de verdad: apagado no se muestra, y sin opciones no hay nada que elegir. */
export function itemsOfrecidos(items: CanjeVitrinaItem[]): CanjeVitrinaItem[] {
  return items.filter((i) => i.activo && (i.opciones || []).length > 0)
}

/**
 * ¿Sigue abierta su elección?
 *
 * Las tres condiciones son distintas y ninguna sobra: que haya vitrina colgada, que el canje esté
 * en un tramo donde el link sirve, y que todavía no haya mandado. **Al mandar se cierra**: si
 * vuelve a entrar ve lo que eligió, en lectura.
 */
export function puedeElegir(
  c: Pick<CanjeRow, 'estado' | 'vitrina_id' | 'seleccion_cerrada_at'>,
): boolean {
  return !!c.vitrina_id && !c.seleccion_cerrada_at && ['acuerdo', 'preparando'].includes(c.estado)
}

// ── Aprobación ──────────────────────────────────────────────────────────────────

export type NivelAprobacion = 'aprobar' | 'aprobar-plata'

/** Los items que cuentan: un quitado o un sin stock no está en el pedido. */
export const itemsVivos: (items: CanjeItem[]) => CanjeItem[] = itemsVivosJS

/**
 * Lo que **cuesta** el canje, para que gerencia apruebe mirando un número.
 *
 * Devuelve `null` cuando **no se puede estimar**, que no es lo mismo que cero: un canje con tope
 * por unidades y sin items todavía no tiene monto (por eso el tope es por unidades). Ese `null`
 * lo lee `quienApruebaCanje` y manda el caso a la firma alta, que es el default seguro.
 *
 * Con items cargados se usa el **costo real acumulado**, que es lo que va a salir de verdad. Sin
 * items y con tope por monto se estima con `factor_costo_estimado` (el ratio costo/PVP): el tope
 * está en PVP y lo que a la empresa le cuesta es el costo.
 */
export function costoEstimado(
  c: Pick<CanjeRow, 'tope_tipo' | 'tope_pvp'>,
  items: CanjeItem[],
  cfg: Pick<CanjeConfig, 'factor_costo_estimado'>,
): number | null {
  const vivos = itemsVivos(items)
  if (vivos.length) {
    return vivos.reduce((a, i) => a + (Number(i.costo_unit) || 0) * (Number(i.cantidad) || 0), 0)
  }
  if (c.tope_tipo === 'monto' && c.tope_pvp != null) {
    return Number(c.tope_pvp) * (Number(cfg.factor_costo_estimado) || 0)
  }
  return null
}

/**
 * Quién tiene que firmar.
 *
 * ⚠️ **El umbral NO es una constante**: entra por parámetro desde la config editable. Arranca en
 * `null`, que significa **todo pasa por la firma alta** — el default seguro mientras el monto no
 * esté definido.
 *
 * Los dos niveles son sub-permisos de `canjes`, no una función nueva: el monitor no tiene el
 * concepto "gerente", y agregar una función tocaría `ACCESO_POR_FUNCION`, la pantalla de Usuarios
 * y sus tests para modelar lo mismo que un tilde en Config.
 */
export function quienApruebaCanje(
  c: Pick<CanjeRow, 'tipo' | 'tope_tipo' | 'tope_pvp'>,
  items: CanjeItem[],
  cfg: Pick<CanjeConfig, 'umbral_aprobacion_alta' | 'factor_costo_estimado'>,
): NivelAprobacion {
  // Hay plata de por medio: no importa cuánta.
  if (c.tipo === 'producto_plata') return 'aprobar-plata'
  if (cfg.umbral_aprobacion_alta == null) return 'aprobar-plata'
  const costo = costoEstimado(c, items, cfg)
  // Si no se puede estimar, va a la firma alta. Prefiero molestar a un gerente que dejar pasar un
  // canje caro por una firma baja.
  if (costo == null) return 'aprobar-plata'
  return costo > Number(cfg.umbral_aprobacion_alta) ? 'aprobar-plata' : 'aprobar'
}

/**
 * Quien firma alto firma bajo; al revés no. Una sola implementación para las dos preguntas que se
 * hacen sobre la firma: si alguien puede aprobar un canje ajeno, y si el suyo propio sale directo.
 *
 * ⚠️ Espejo en `api/_canjes.js` (`cubreNivel`).
 */
export function cubreNivel(tiene: NivelAprobacion[], necesita: NivelAprobacion): boolean {
  if (tiene.includes('aprobar-plata')) return true
  return tiene.includes(necesita)
}

/**
 * En qué estado **nace** el canje: la firma interna se saltea sola cuando quien lo propone ya podía
 * firmarlo. Es un control, así que la decide el servidor — pero la función es pura y el modal la
 * usa para anticipar el camino ("se manda directo" vs. "va a la firma"), porque un salteo
 * silencioso se lee como que el sistema hizo algo raro.
 *
 * Que se saltee **no borra la firma**: el handler igual estampa `aprobado_por/at/nivel`. Queda
 * asentado quién se hizo cargo, que es de lo que sirve una aprobación.
 */
export function naceEn(
  c: Pick<CanjeRow, 'tipo' | 'tope_tipo' | 'tope_pvp'>,
  items: CanjeItem[],
  cfg: Pick<CanjeConfig, 'umbral_aprobacion_alta' | 'factor_costo_estimado'>,
  susNiveles: NivelAprobacion[],
): { estado: Extract<EstadoCanje, 'propuesta' | 'enviada'>; nivel: NivelAprobacion } {
  const nivel = quienApruebaCanje(c, items, cfg)
  return { estado: cubreNivel(susNiveles, nivel) ? 'enviada' : 'propuesta', nivel }
}

// ── El tope ─────────────────────────────────────────────────────────────────────

export type ControlTope = {
  /** `false` frena el botón de agregar. */
  ok: boolean
  /** En criollo, para mostrar al lado de la lista. */
  mensaje: string
  /** Lo consumido y el techo, para la barra de progreso. */
  usado: number
  tope: number | null
  /** `'$'` o `'u'`, según el modo. */
  unidad: '$' | 'u'
}

/**
 * ¿Entra un producto más?
 *
 * **Modo monto:** control **duro** sobre la suma de PVP. "Elegí hasta $80.000" es un número y se
 * compara con un número.
 *
 * **Modo unidades:** control **duro sobre el total de unidades** (4, en `2 fundas + 1 jean + 1
 * remera`) y **blando sobre el detalle**. Deliberadamente no se intenta adivinar si algo "es un
 * jean": la categoría de Gestión Nube no es lo bastante prolija para colgar de ahí un bloqueo, y
 * una validación que se equivoca la mitad de las veces se termina apagando. El operador ve la
 * lista acordada al lado de lo que carga y valida a ojo.
 */
// El `as` es por `unidad`, que del lado JS se infiere `string` y acá es `'$' | 'u'`. Es el único
// lugar del re-export que necesita uno: los dos literales están tres líneas más arriba, en
// `reglas.core.js`, y `ControlTope` es quien manda sobre ellos.
export const controlDelTope = controlDelTopeJS as (
  c: Pick<CanjeRow, 'tope_tipo' | 'tope_pvp' | 'tope_unidades'>,
  items: CanjeItem[],
) => ControlTope

// ── El cumplimiento ─────────────────────────────────────────────────────────────

export type CumplimientoEntregable = {
  entregable: CanjeEntregable
  comprometidas: number
  /** Sólo evidencias **verificadas**. Una sin verificar no cuenta. */
  cumplidas: number
  completo: boolean
  /** Obligatorio, con fecha pasada y sin cumplir. */
  vencido: boolean
}

export type Cumplimiento = {
  comprometidas: number
  cumplidas: number
  /** 0–1. `1` si no se comprometió nada (no hay nada que incumplir). */
  fraccion: number
  completo: boolean
  porEntregable: CumplimientoEntregable[]
  vencidos: CumplimientoEntregable[]
}

/**
 * Cuánto de lo que prometió publicó de verdad.
 *
 * ⚠️ Se **deriva** contando evidencias verificadas: `cantidad_cumplida` no es columna a propósito.
 * Un contador denormalizado se desincroniza el día que alguien borre una evidencia, y ese día el
 * canje cierra sin que nadie note que falta algo.
 *
 * Una evidencia **sin verificar no cuenta**. Sin eso, pegar un link roto cierra el canje.
 */
export function cumplimiento(
  entregables: CanjeEntregable[],
  evidencias: CanjeEvidencia[],
  hoy: Date,
): Cumplimiento {
  const hoyISO = fechaISO(hoy)
  // Un solo barrido: contar con un `filter` por entregable sería cuadrático.
  const verificadasPorEntregable = new Map<number, number>()
  for (const e of evidencias) {
    if (!e.verificada || e.entregable_id == null) continue
    verificadasPorEntregable.set(e.entregable_id, (verificadasPorEntregable.get(e.entregable_id) ?? 0) + 1)
  }

  const porEntregable = entregables.map<CumplimientoEntregable>((e) => {
    const comprometidas = Number(e.cantidad_comprometida) || 0
    // Se topea en lo comprometido: subir cinco historias para dos prometidas no da 250%.
    const cumplidas = Math.min(verificadasPorEntregable.get(e.id) ?? 0, comprometidas)
    const completo = cumplidas >= comprometidas
    return {
      entregable: e,
      comprometidas,
      cumplidas,
      completo,
      vencido: Boolean(e.obligatorio && e.vence_el && e.vence_el < hoyISO && !completo),
    }
  })

  const comprometidas = porEntregable.reduce((a, e) => a + e.comprometidas, 0)
  const cumplidas = porEntregable.reduce((a, e) => a + e.cumplidas, 0)
  return {
    comprometidas,
    cumplidas,
    // Sin nada comprometido no hay nada que incumplir: 1, no 0. Un 0 haría que un canje sin
    // entregables se vea como un incumplimiento total.
    fraccion: comprometidas === 0 ? 1 : cumplidas / comprometidas,
    completo: porEntregable.every((e) => !e.entregable.obligatorio || e.completo),
    porEntregable,
    vencidos: porEntregable.filter((e) => e.vencido),
  }
}

/** `YYYY-MM-DD` en hora **local**. En UTC, un canje de la tarde vencería un día antes. */
export const fechaISO: (d: Date) => string = fechaISOJS

/**
 * Los entregables obligatorios que pasaron su fecha sin evidencia verificada. Alimenta el aviso
 * del sidebar y el bloqueo de §2 bis.
 */
export function entregablesVencidos(
  entregables: CanjeEntregable[],
  evidencias: CanjeEvidencia[],
  hoy: Date,
): CumplimientoEntregable[] {
  return cumplimiento(entregables, evidencias, hoy).vencidos
}

// ── §2 bis: qué pasa cuando no cumple ───────────────────────────────────────────

export type PuedeProponer = { ok: true } | { ok: false; motivo: string }

/**
 * ¿Se le puede proponer un canje nuevo?
 *
 * ⚠️ **Arranca apagado** (`bloquear_por_vencidos = false`) y eso es deliberado. El riesgo del
 * módulo no es técnico: es que la carga del cumplimiento se abandone a los dos meses. Si nadie
 * carga evidencias, **todo el mundo figura como incumplidor** y el sistema empieza a frenar canjes
 * con gente que sí cumplió. Se prende desde la config cuando la carga se haya sostenido un mes.
 *
 * ⚠️ El bloqueo es **transversal a las marcas**: si debe algo en BDI, tampoco se le propone en
 * Zattia. Es el sentido de tener padrón único — si no, se esquiva cambiando de marca. Por eso
 * `susCanjes` tiene que traer los de **todas** las marcas, no los de la que se está mirando.
 *
 * Se valida **server-side** en el handler, no sólo deshabilitando el botón.
 */
export function puedeProponerCanje(
  persona: Pick<CanjePersona, 'vetada' | 'vetada_motivo'>,
  susCanjes: { canje: Pick<CanjeRow, 'id' | 'estado'>; entregables: CanjeEntregable[]; evidencias: CanjeEvidencia[] }[],
  cfg: Pick<CanjeConfig, 'bloquear_por_vencidos'>,
  hoy: Date,
): PuedeProponer {
  // El veto manual frena siempre, esté como esté la config: alguien lo decidió a mano.
  if (persona.vetada) {
    return { ok: false, motivo: persona.vetada_motivo ? `Está vetada: ${persona.vetada_motivo}` : 'Está vetada.' }
  }
  if (!cfg.bloquear_por_vencidos) return { ok: true }

  for (const c of susCanjes) {
    if (esTerminal(c.canje.estado)) continue
    const vencidos = entregablesVencidos(c.entregables, c.evidencias, hoy)
    if (!vencidos.length) continue
    const cuantas = vencidos.reduce((a, v) => a + (v.comprometidas - v.cumplidas), 0)
    const detalle = vencidos.map((v) => entregableEnCriollo(v.entregable.tipo, v.comprometidas - v.cumplidas)).join(' y ')
    return {
      ok: false,
      motivo: `Tiene ${detalle} ${cuantas === 1 ? 'vencida' : 'vencidas'} del canje ${numeroCanje(c.canje.id)}. Resolvelo antes de proponerle otro.`,
    }
  }
  return { ok: true }
}

// ── El cierre ───────────────────────────────────────────────────────────────────

/**
 * Qué falta para poder cerrar. Devuelve la lista **en criollo**: si no está vacía, el botón va
 * deshabilitado y esto se muestra debajo como explicación. Es el patrón de `faltantesParaCerrar`
 * (`lib/reclamos/tipos.ts:815`), que resolvió el problema de los botones grises sin motivo.
 */
export function faltantesParaCerrarCanje(
  c: CanjeRow,
  entregables: CanjeEntregable[],
  evidencias: CanjeEvidencia[],
  hoy: Date,
): string[] {
  const faltan: string[] = []

  if (c.compra_estado === 'pendiente') faltan.push('marcar la compra como hecha')
  if (c.envio_estado === 'pendiente') faltan.push('despachar el pedido')
  if (!c.entregado_at) faltan.push('marcar que le llegó')
  // Sin el costo del envío el balance miente, y el balance es para lo que se hace todo esto.
  if (c.envio_costo == null) faltan.push('cargar el costo del envío')
  if (c.tipo === 'producto_plata' && c.pago_estado === 'pendiente') {
    faltan.push(c.monto_plata ? `pagar los $${Number(c.monto_plata).toLocaleString('es-AR')}` : 'registrar el pago')
  }

  const cump = cumplimiento(entregables, evidencias, hoy)
  for (const e of cump.porEntregable) {
    if (!e.entregable.obligatorio || e.completo) continue
    faltan.push(`verificar ${entregableEnCriollo(e.entregable.tipo, e.comprometidas - e.cumplidas)}`)
  }

  // Una evidencia cargada y sin mirar es trabajo a medio hacer: o se verifica o se rechaza.
  const sinMirar = evidencias.filter((e) => !e.verificada && !e.rechazada_motivo).length
  if (sinMirar) faltan.push(`revisar ${sinMirar === 1 ? '1 evidencia' : `${sinMirar} evidencias`} sin verificar`)

  return faltan
}

export type Balance = {
  costo_productos: number
  costo_envio: number
  costo_plata: number
  costo_total: number
  /** `null` si nadie cargó el alcance: no se inventa un CPM. */
  cpm: number | null
}

/**
 * El balance, que se congela al cerrar (`balance_*` en `canjes`) en vez de calcularse cada vez.
 *
 * No es una vista a propósito: el costo que importa es el del día del canje. Si dentro de un año
 * cambia el costo de esa remera, lo que se gastó en esta acción no cambia.
 */
export function calcularBalance(
  c: Pick<CanjeRow, 'tipo' | 'monto_plata' | 'envio_costo' | 'balance_alcance'>,
  items: CanjeItem[],
): Balance {
  const costo_productos = itemsVivos(items)
    .reduce((a, i) => a + (Number(i.costo_unit) || 0) * (Number(i.cantidad) || 0), 0)
  const costo_envio = Number(c.envio_costo) || 0
  const costo_plata = c.tipo === 'producto_plata' ? Number(c.monto_plata) || 0 : 0
  const costo_total = costo_productos + costo_envio + costo_plata
  const alcance = Number(c.balance_alcance) || 0
  return {
    costo_productos,
    costo_envio,
    costo_plata,
    costo_total,
    // Costo por mil impresiones. Sin alcance cargado no hay CPM: un 0 se leería como "gratis".
    cpm: alcance > 0 ? (costo_total / alcance) * 1000 : null,
  }
}

// ── El envío ────────────────────────────────────────────────────────────────────

/** Las mismas vías que Reclamos. `presencial` = se lo damos en mano: sin envío ni seguimiento. */
export type ViaEnvio = 'correo' | 'andreani' | 'cadete' | 'presencial'

export const VIAS_ENVIO: ViaEnvio[] = ['correo', 'andreani', 'cadete', 'presencial']

export const VIA_ENVIO_LABEL: Record<ViaEnvio, string> = {
  correo: 'Correo Argentino',
  andreani: 'Andreani',
  cadete: 'Cadete',
  presencial: 'Se lo damos en mano',
}

/** Sólo Correo y Andreani tienen código que seguir. */
export function pideSeguimiento(via: ViaEnvio | string | null | undefined): boolean {
  return via === 'correo' || via === 'andreani'
}

/**
 * La fecha en que vence un entregable, congelada al marcar la entrega.
 *
 * El plazo se guarda **en días desde la entrega** y no como fecha porque al armar el acuerdo
 * todavía no se sabe cuándo va a llegar el pedido. Este es el momento en que se vuelve una fecha.
 */
export function vencimientoDe(entregadoISO: string, plazoDias: number | null | undefined, plazoDefault: number): string {
  const dias = plazoDias == null ? plazoDefault : Number(plazoDias)
  const d = new Date(entregadoISO)
  d.setDate(d.getDate() + (Number.isFinite(dias) ? dias : plazoDefault))
  return fechaISO(d)
}

// ── El nombre para mostrar ──────────────────────────────────────────────────────

/**
 * Cómo se la nombra en pantalla. El @ es lo único garantizado, así que es el fallback: una persona
 * recién dada de alta tiene sólo eso, y esa alta de un renglón es a propósito.
 */
export function nombrePersona(p: Pick<CanjePersona, 'nombre' | 'apellido' | 'instagram' | 'instagram_raw'>): string {
  const nombre = [p.nombre, p.apellido].filter(Boolean).join(' ').trim()
  if (nombre) return nombre
  return '@' + (p.instagram_raw || p.instagram)
}

/** ¿Tiene dirección suficiente para despachar? Es lo que decide si hace falta mandarle el link. */
export function tieneDireccion(p: Pick<CanjePersona, 'calle' | 'numero' | 'cp' | 'localidad'>): boolean {
  return Boolean(p.calle && p.numero && p.cp && p.localidad)
}

/**
 * ¿Están los datos que pide **esta** marca? BDI necesita el modelo de celular; Zattia y Stunned, al
 * menos un talle. Sin esto no se puede armar el pedido, y es lo que justifica el portal.
 */
export function tieneDatosDeMarca(p: Pick<CanjePersona, 'talles' | 'modelo_celular'>, store: CanjeStore): boolean {
  if (queDatoPide(store) === 'modelo_celular') return Boolean(p.modelo_celular)
  const t = p.talles || {}
  return Boolean(t.remera || t.pantalon || t.calzado)
}

// ── La carga a mano en el admin de Tienda Nube ──────────────────────────────────
//
// El monitor **no crea la orden en TN y no puede hacerlo**: no hay credenciales de la tienda en
// este repo. La orden con 100% de descuento se tipea a mano, y lo único que se puede hacer desde
// acá es que no haya que transcribir nada.

/** La dirección en un renglón, para pegarla de una cuando el formulario la acepta junta. */
export function direccionEnUnaLinea(p: CanjePersona): string {
  const calle = [p.calle, p.numero].filter(Boolean).join(' ')
  const puerta = [p.piso && `piso ${p.piso}`, p.depto && `depto ${p.depto}`].filter(Boolean).join(', ')
  return [calle, puerta, p.localidad, p.provincia, p.cp && `CP ${p.cp}`].filter(Boolean).join(', ')
}

export type CampoParaTN = { key: string; label: string; valor: string }

/**
 * Los datos de la persona **campo por campo, en el orden en que el admin de Tienda Nube los pide**.
 *
 * El formulario de TN los pide separados —nombre por un lado, apellido por otro, calle y altura en
 * dos casillas—, así que copiar "la dirección entera" no alcanza: hay que volver a partirla a mano,
 * que es exactamente donde se cuelan los errores de tipeo en una dirección de envío.
 *
 * Los vacíos **se devuelven igual**, con `valor: ''`. Esconderlos haría más corta la lista y más
 * difícil la pregunta que importa: qué le falta a esta persona para poder despacharle.
 *
 * ⚠️ **El mail NO es el de ella**, sale de la config de la marca (`email_pedido`). La orden es un
 * trámite interno para que el envío salga y la venta marque $0; el mail de la creadora es una
 * herramienta de contacto que vive en el padrón y no tiene por qué entrar a la tienda. Si la marca
 * todavía no lo configuró, el campo sale vacío como cualquier otro que falte: es lo que hace
 * visible que hay algo que cargar en Ajustes.
 */
export function camposParaTiendaNube(
  p: CanjePersona,
  cfg?: Pick<CanjeConfig, 'email_pedido'> | null,
): CampoParaTN[] {
  const txt = (v: unknown) => String(v ?? '').trim()
  return [
    { key: 'nombre', label: 'Nombre', valor: txt(p.nombre) },
    { key: 'apellido', label: 'Apellido', valor: txt(p.apellido) },
    { key: 'email', label: 'Mail', valor: txt(cfg?.email_pedido) },
    { key: 'telefono', label: 'Teléfono', valor: txt(p.telefono) },
    { key: 'dni', label: 'DNI', valor: txt(p.dni) },
    { key: 'calle', label: 'Calle', valor: txt(p.calle) },
    { key: 'numero', label: 'Altura', valor: txt(p.numero) },
    { key: 'piso', label: 'Piso', valor: txt(p.piso) },
    { key: 'depto', label: 'Depto', valor: txt(p.depto) },
    { key: 'cp', label: 'Código postal', valor: txt(p.cp) },
    { key: 'localidad', label: 'Localidad', valor: txt(p.localidad) },
    { key: 'provincia', label: 'Provincia', valor: txt(p.provincia) },
    { key: 'direccion_nota', label: 'Referencia', valor: txt(p.direccion_nota) },
  ]
}

/**
 * Qué se busca en el buscador del admin para encontrar este producto.
 *
 * ⚠️ **El SKU no siempre está.** Lo que ella elige por el link se congela por `id` de variante de
 * Tienda Nube, no por SKU: en BDI falta en 4 de cada 10 variantes y en Zattia se repite igual en
 * todas las de un mismo producto. Cuando no hay SKU se copia el nombre con la variante, que es lo
 * que de todas formas se termina tipeando en el buscador.
 */
export function textoDeBusquedaDelItem(i: Pick<CanjeItem, 'sku' | 'nombre' | 'variante'>): string {
  const sku = String(i.sku ?? '').trim()
  if (sku) return sku
  return [i.nombre, i.variante].map((v) => String(v ?? '').trim()).filter(Boolean).join(' · ')
}
