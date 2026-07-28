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
 */

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
 * Ocho estados y ni uno más. Lo que avanza a ritmos distintos **no es un estado sino un pendiente**
 * (`compra_estado`, `envio_estado`, `pago_estado`, `aviso_estado`) — mismo criterio que Reclamos,
 * donde meter cada paso manual como estado dejaba casos trabados sin poder cerrarse nunca.
 */
export type EstadoCanje =
  | 'borrador'
  | 'propuesta'
  | 'rechazado'
  | 'acuerdo'
  | 'preparando'
  | 'en_curso'
  | 'cerrado'
  | 'cancelado'

export const ESTADOS_CANJE: EstadoCanje[] = [
  'borrador', 'propuesta', 'rechazado', 'acuerdo', 'preparando', 'en_curso', 'cerrado', 'cancelado',
]

export const ESTADO_CANJE_LABEL: Record<EstadoCanje, string> = {
  borrador: 'Borrador',
  propuesta: 'Esperando aprobación',
  rechazado: 'Rechazado',
  acuerdo: 'Acordado',
  preparando: 'Preparando el envío',
  en_curso: 'Esperando el contenido',
  cerrado: 'Cerrado',
  cancelado: 'Cancelado',
}

/** Los terminales: de acá no se sale. `cancelado` revoca el token del portal. */
export const ESTADOS_TERMINALES: EstadoCanje[] = ['rechazado', 'cerrado', 'cancelado']

export function esTerminal(estado: EstadoCanje): boolean {
  return ESTADOS_TERMINALES.includes(estado)
}

/**
 * El grafo. `cancelado` no figura acá porque se puede llegar desde **cualquier** estado no
 * terminal — lo resuelve `puedeIr`, no la tabla.
 */
export const TRANSICIONES: Record<EstadoCanje, EstadoCanje[]> = {
  borrador: ['propuesta'],
  propuesta: ['acuerdo', 'rechazado'],
  rechazado: [],
  acuerdo: ['preparando'],
  preparando: ['en_curso'],
  en_curso: ['cerrado'],
  cerrado: [],
  cancelado: [],
}

export function puedeIr(desde: EstadoCanje, hasta: EstadoCanje): boolean {
  if (hasta === 'cancelado') return !esTerminal(desde)
  return (TRANSICIONES[desde] ?? []).includes(hasta)
}

/**
 * El estado en criollo, con el matiz que el label solo no da. Mismo patrón que
 * `estadoEnCriollo` de `lib/reclamos/tipos.ts:163`: la UI muestra esto, no el enum.
 */
export function estadoEnCriollo(c: Pick<CanjeRow, 'estado' | 'compra_estado' | 'envio_estado'>): string {
  if (c.estado === 'preparando') {
    if (c.compra_estado !== 'hecho') return 'Falta comprar'
    if (c.envio_estado !== 'hecho') return 'Falta despachar'
    return 'En camino'
  }
  return ESTADO_CANJE_LABEL[c.estado] ?? c.estado
}

/**
 * El número que ve la gente. Derivado del id, **no es una columna**: mismo criterio (y misma deuda
 * de espejo TS/JS) que `numeroReclamo` en `lib/reclamos/tipos.ts:799`.
 *
 * ⚠️ Espejo en `api/_canjes.js` (`numeroCanje`). Si cambia el formato, cambian los dos.
 */
export function numeroCanje(id: number): string {
  return 'C-' + String(id).padStart(4, '0')
}

// ── Los pendientes (no son estados) ─────────────────────────────────────────────

export type Pendiente = 'pendiente' | 'hecho' | 'no_aplica'
export type PagoEstado = 'pendiente' | 'pagado' | 'no_aplica'

export const PENDIENTES: Pendiente[] = ['pendiente', 'hecho', 'no_aplica']
export const PAGO_ESTADOS: PagoEstado[] = ['pendiente', 'pagado', 'no_aplica']

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

export const MOTIVOS_RECHAZO = [
  'No encaja con la marca',
  'El costo no lo justifica',
  'Ya hicimos algo parecido hace poco',
  'No hay stock de lo que pide',
  'Otro',
]

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
  acordado_at?: string | null

  /** Nunca sale en listados: es la llave del link público. Se pide aparte, de a uno. */
  token?: string | null
  token_vence?: string | null
  /** Distingue "nunca lo miró" de "lo miró y estaba bien", que no es lo mismo al despachar. */
  datos_confirmados_at?: string | null

  tn_orden?: string | null
  compra_estado: Pendiente
  compra_at?: string | null
  compra_por?: string | null
  gn_venta_number?: string | null
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
  producto_no_conservado: boolean
  producto_no_conservado_motivo?: string | null
  producto_no_conservado_por?: string | null
  producto_no_conservado_at?: string | null

  cancelado_motivo?: string | null

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
}

// ── Aprobación ──────────────────────────────────────────────────────────────────

export type NivelAprobacion = 'aprobar' | 'aprobar-plata'

// Las funciones de negocio de la Fase 1 en adelante — `costoEstimado`, `quienApruebaCanje`,
// `controlDelTope`, `cumplimiento`, `faltantesParaCerrarCanje`, `calcularBalance`,
// `entregablesVencidos`, `puedeProponerCanje` — entran con su fase. La Fase 0 es el padrón: hasta
// que no haya canjes cargados no tienen nada que calcular.

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
