/**
 * Cliente de Canjes. Entra por el router `/api/postventa?recurso=canjes` (Vercel cuenta una
 * función por archivo de ruta y el proyecto vive cerca del tope del plan Hobby: hay 9 rutas de 12).
 *
 * Todo va con `apiFetch`, que manda la credencial del Monitor en `x-monitor-auth`.
 *
 * ⚠️ El `store` que se manda **no elige base de datos**: el handler habla siempre con la de BDI,
 * para las tres marcas. Lo que elige es qué canjes vuelven enteros y cuáles en modo ciego, y qué
 * fila de `canje_config` se lee. Ver el encabezado de `api/_canjes.js`.
 */

import { apiFetch } from '@/lib/api-fetch'
import { baseDeCostos, numeroCanje } from './tipos'
import type {
  Balance, CanjeConfig, CanjeEntregable, CanjeEvidencia, CanjeItem, CanjePersona, CanjeRow,
  CanjeStore, EstadoCanje, NivelAprobacion, TallesPersona, TipoCanje, TipoEntregable, TopeTipo,
  TopeUnidad, ViaEnvio,
} from './tipos'

const API = '/api/postventa?recurso=canjes'

/** Un canje de otra marca: sólo marca, fecha y estado. La plata no viaja al browser. */
export type CanjeCiego = Pick<CanjeRow, 'id' | 'persona_id' | 'store' | 'estado' | 'acordado_at' | 'entregado_at' | 'cerrado_at' | 'created_at'> & {
  numero: string
  ciego: true
}

export type CanjeVisible = (CanjeRow & { ciego?: false }) | CanjeCiego

/** El discriminante. Un canje ciego no se puede abrir ni sumar al balance. */
export function esCiego(c: CanjeVisible): c is CanjeCiego {
  return (c as CanjeCiego).ciego === true
}

async function postear(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await apiFetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok || !d.ok) throw new Error(String(d.error || `Error ${r.status}`))
  return d
}

async function leer(qs: string): Promise<Record<string, unknown>> {
  // `nc` para saltear el caché del browser: la lista cambia mientras se la mira.
  const r = await apiFetch(`${API}&${qs}&nc=${Date.now()}`)
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok || !d.ok) throw new Error(String(d.error || `Error ${r.status}`))
  return d
}

/** Un canje con entregables obligatorios vencidos. Lo resume el servidor para el aviso. */
export type CanjeVencido = {
  canjeId: number
  store: CanjeStore
  persona_id: number
  /** Cuántas piezas faltan publicar. */
  cuantas: number
  /** Timestamp del vencimiento más viejo: es lo que ordena el aviso. */
  desde: number
}

export type DatosCanjes = {
  personas: CanjePersona[]
  canjes: CanjeVisible[]
  vencidos: CanjeVencido[]
  /** La de la marca en la que se está parado. */
  config: CanjeConfig | null
  /**
   * Las de **todas** las marcas visibles. El modal de propuesta deja elegir la marca —el padrón es
   * transversal, así que se propone desde donde uno esté— y necesita la unidad por defecto de
   * cualquiera de ellas, no sólo la de la sección.
   */
  configs: CanjeConfig[]
  marcasVisibles: CanjeStore[]
}

/**
 * El padrón entero más los canjes que este perfil puede ver. El padrón **no se filtra por marca**:
 * es transversal, y esa es toda la gracia — que la creadora que trabajó para BDI aparezca cuando
 * marketing de Zattia busca a quién llamar.
 */
export async function leerCanjes(store: CanjeStore): Promise<DatosCanjes> {
  const d = await leer(`store=${store}`)
  return {
    personas: (d.personas as CanjePersona[]) || [],
    canjes: (d.canjes as CanjeVisible[]) || [],
    vencidos: (d.vencidos as CanjeVencido[]) || [],
    config: (d.config as CanjeConfig) || null,
    configs: (d.configs as CanjeConfig[]) || [],
    marcasVisibles: (d.marcasVisibles as CanjeStore[]) || [],
  }
}

export type FichaPersonaDatos = { persona: CanjePersona; canjes: CanjeVisible[] }

export async function leerPersona(store: CanjeStore, id: number): Promise<FichaPersonaDatos> {
  const d = await leer(`vista=persona&store=${store}&id=${id}`)
  return { persona: d.persona as CanjePersona, canjes: (d.canjes as CanjeVisible[]) || [] }
}

export async function leerConfig(store: CanjeStore): Promise<CanjeConfig | null> {
  const d = await leer(`vista=config&store=${store}`)
  return (d.config as CanjeConfig) || null
}

/**
 * Alta con **un solo campo: el @**. Si esa persona ya existe devuelve la ficha que hay con
 * `existia: true` en vez de tirar error: la UI abre esa ficha. Es el caso normal, no el
 * excepcional — la misma creadora vuelve, y que el alta sea barata es lo que hace que el padrón se
 * llene en vez de quedar en la planilla.
 */
export async function crearPersona(
  store: CanjeStore,
  datos: { instagram: string; nombre?: string; apellido?: string; telefono?: string; email?: string; tiktok?: string; ciudad?: string },
): Promise<{ persona: CanjePersona; existia: boolean }> {
  const d = await postear({ store, action: 'persona-crear', ...datos, instagram_raw: datos.instagram })
  return { persona: d.persona as CanjePersona, existia: d.existia === true }
}

export type CamposPersona = Partial<{
  instagram: string
  nombre: string | null
  apellido: string | null
  telefono: string | null
  email: string | null
  tiktok: string | null
  ciudad: string | null
  dni: string | null
  calle: string | null
  numero: string | null
  piso: string | null
  depto: string | null
  cp: string | null
  provincia: string | null
  localidad: string | null
  direccion_nota: string | null
  talles: TallesPersona
  modelo_celular: string | null
  seguidores_ig: number | null
  seguidores_tt: number | null
  cadencia_dias: number
  destacada: boolean
  destacada_nota: string | null
  vetada: boolean
  vetada_motivo: string | null
}>

export async function editarPersona(store: CanjeStore, id: number, campos: CamposPersona): Promise<void> {
  await postear({ store, action: 'persona-editar', id, ...campos })
}

/**
 * Saca una persona del padrón. Es para el error de tipeo y la ficha duplicada.
 *
 * ⚠️ Con canjes encima el servidor lo rechaza con el motivo en criollo: eso ya es historial, y para
 * "no la llamemos más" está el veto, que deja el porqué escrito.
 */
export async function borrarPersona(store: CanjeStore, id: number): Promise<void> {
  await postear({ store, action: 'persona-borrar', id })
}

/** Devuelve las notas ya actualizadas: la lista se re-pinta sin volver a leer la ficha entera. */
export async function agregarNota(store: CanjeStore, id: number, texto: string): Promise<CanjePersona['notas']> {
  const d = await postear({ store, action: 'persona-nota', id, texto })
  return (d.notas as CanjePersona['notas']) || []
}

/** ⚠️ Por `nota_id`, nunca por índice: ver el comentario en `api/_canjes.js`. */
export async function borrarNota(store: CanjeStore, id: number, notaId: string): Promise<CanjePersona['notas']> {
  const d = await postear({ store, action: 'persona-nota-borrar', id, nota_id: notaId })
  return (d.notas as CanjePersona['notas']) || []
}

export async function agregarArchivo(
  store: CanjeStore, id: number, archivo: { url: string; nombre?: string; tipo?: string },
): Promise<CanjePersona['archivos']> {
  const d = await postear({ store, action: 'persona-archivo', id, ...archivo })
  return (d.archivos as CanjePersona['archivos']) || []
}

export async function borrarArchivo(store: CanjeStore, id: number, url: string): Promise<CanjePersona['archivos']> {
  const d = await postear({ store, action: 'persona-archivo-borrar', id, url })
  return (d.archivos as CanjePersona['archivos']) || []
}

/** Los números del módulo. Requiere administración: el servidor lo vuelve a chequear. */
export async function guardarConfig(store: CanjeStore, campos: Partial<Omit<CanjeConfig, 'store'>>): Promise<void> {
  await postear({ store, action: 'config', ...campos })
}

/** El número visible, para cuando el canje viene de la API sin él (los ciegos ya lo traen). */
export function numeroDe(c: { id: number; numero?: string }): string {
  return c.numero || numeroCanje(c.id)
}

// ══ EL CANJE ═══════════════════════════════════════════════════════════════════

export type FichaCanjeDatos = {
  canje: CanjeRow
  items: CanjeItem[]
  entregables: CanjeEntregable[]
  evidencias: CanjeEvidencia[]
  persona: CanjePersona | null
  config: CanjeConfig
}

/** El canje con sus cuatro tablas de una. Pedirlas de a una serían cuatro round-trips por click. */
export async function leerCanje(store: CanjeStore, id: number): Promise<FichaCanjeDatos> {
  const d = await leer(`vista=canje&store=${store}&id=${id}`)
  return {
    canje: d.canje as CanjeRow,
    items: (d.items as CanjeItem[]) || [],
    entregables: (d.entregables as CanjeEntregable[]) || [],
    evidencias: (d.evidencias as CanjeEvidencia[]) || [],
    persona: (d.persona as CanjePersona) || null,
    config: d.config as CanjeConfig,
  }
}

/**
 * El link del portal, a pedido y de a uno.
 *
 * El token **nunca** viaja en un listado: un listado se loguea, se cachea y se comparte. Esto es
 * lo mismo que hace Reclamos con el link del cliente.
 */
export async function leerToken(store: CanjeStore, id: number): Promise<{ token: string | null; vence: string | null }> {
  const d = await leer(`vista=token&store=${store}&id=${id}`)
  return { token: (d.token as string) || null, vence: (d.vence as string) || null }
}

/** La URL que se le manda por WhatsApp. Mismo patrón que `/reclamo/<token>`. */
export function linkDelPortal(token: string): string {
  const origen = typeof window === 'undefined' ? '' : window.location.origin
  return `${origen}/canje/${token}`
}

/** Lo que se le pide publicar, tal como sale de la grilla: un tipo y una cantidad. */
export type EntregablePedido = { tipo: TipoEntregable; cantidad: number }

export type NuevoCanje = {
  persona_id: number
  tipo: TipoCanje
  titulo?: string
  nota?: string
  tope_tipo: TopeTipo
  tope_pvp?: number | null
  tope_unidades?: TopeUnidad[]
  monto_plata?: number | null
  /**
   * Viajan en el MISMO request que el canje: son parte de la propuesta, no un agregado posterior.
   * Mandarlos de a uno dejaría un canje a medias si falla el tercero.
   */
  entregables?: EntregablePedido[]
}

/**
 * Devuelve también **en qué estado nació**: si el que propone ya podía firmarlo sale directo a
 * `enviada` y hay un mensaje para copiar; si no, quedó esperando la firma y no hay nada que mandar
 * todavía. La UI necesita saber cuál de las dos cosas pasó.
 */
export async function crearCanje(
  store: CanjeStore, datos: NuevoCanje,
): Promise<{ id: number; numero: string; estado: EstadoCanje }> {
  const d = await postear({ store, action: 'canje-crear', ...datos })
  return { id: d.id as number, numero: d.numero as string, estado: d.estado as EstadoCanje }
}

export async function editarCanje(store: CanjeStore, id: number, campos: Partial<NuevoCanje>): Promise<void> {
  await postear({ store, action: 'canje-editar', id, ...campos })
}

/**
 * Borra el canje. **No es cancelar**: cancelar deja el rastro de que existió y por qué se cayó;
 * esto no deja nada. Es para la prueba y el error de carga.
 *
 * De `acuerdo` en adelante arrastra items, entregables y evidencias (cascada) y lo rechaza el
 * servidor salvo Administración. Pedí antes `queSeLlevaElCanje` para poder decir cuánto se va.
 */
export async function borrarCanje(store: CanjeStore, id: number): Promise<void> {
  await postear({ store, action: 'canje-borrar', id })
}

export type LoQueSeLleva = { items: number; entregables: number; evidencias: number }

export async function queSeLlevaElCanje(store: CanjeStore, id: number): Promise<LoQueSeLleva> {
  const d = await postear({ store, action: 'canje-borrar-que-se-lleva', id })
  return { items: d.items as number, entregables: d.entregables as number, evidencias: d.evidencias as number }
}

/** Las transiciones las valida el servidor contra `TRANSICIONES`: esto no es el único control. */
export async function cambiarEstadoCanje(store: CanjeStore, id: number, estado: EstadoCanje, motivo?: string): Promise<void> {
  await postear({ store, action: 'canje-estado', id, estado, motivo })
}

/** Devuelve con qué nivel se aprobó, que es lo que queda guardado en el canje. */
export async function aprobarCanje(store: CanjeStore, id: number): Promise<NivelAprobacion> {
  const d = await postear({ store, action: 'canje-aprobar', id })
  return d.nivel as NivelAprobacion
}

export async function rechazarCanje(store: CanjeStore, id: number, motivo: string): Promise<void> {
  await postear({ store, action: 'canje-rechazar', id, motivo })
}

/** "Ya le escribí". Pendiente, no estado: el canje no se mueve. Se dispara al copiar el mensaje. */
export async function marcarContactada(store: CanjeStore, id: number): Promise<void> {
  await postear({ store, action: 'contacto', id })
}

/**
 * Lo que contestó ella. `acepto` es lo que **genera el link del portal**: antes del sí no hay nada
 * que mostrarle. Va por acción propia y no por `cambiarEstadoCanje` justamente por eso.
 */
export async function registrarRespuesta(
  store: CanjeStore, id: number,
  respuesta: 'acepto' | 'no_acepto',
  datos?: { motivo?: string; nota?: string },
): Promise<void> {
  await postear({ store, action: 'canje-respuesta', id, respuesta, ...datos })
}

// ── Los productos ───────────────────────────────────────────────────────────────

export type NuevoItem = {
  sku?: string | null
  product_id?: string | null
  size_id?: string | null
  nombre?: string | null
  variante?: string | null
  cantidad: number
  costo_unit?: number | null
  pvp_unit?: number | null
}

/**
 * ⚠️ El control del tope lo hace **el servidor** con la lista real. Si el canje se pasa, esto tira
 * un error con el motivo en criollo — la UI lo muestra tal cual. Dos operadores cargando a la vez
 * se pasarían del tope sin que ninguno lo viera si el único control fuera el del browser.
 */
export async function agregarItem(store: CanjeStore, id: number, item: NuevoItem): Promise<CanjeItem> {
  const d = await postear({ store, action: 'item-agregar', id, ...item })
  return d.item as CanjeItem
}

/** No borra: marca `quitado` o `sin_stock`. Que algo se haya caído es información. */
export async function quitarItem(
  store: CanjeStore, id: number, itemId: number, motivo: string, sinStock = false,
): Promise<void> {
  await postear({ store, action: 'item-quitar', id, item_id: itemId, motivo, sin_stock: sinStock })
}

// ── Compra y envío ──────────────────────────────────────────────────────────────

export async function registrarCompra(
  store: CanjeStore, id: number, datos: { tn_orden: string; gn_venta_number?: string },
): Promise<void> {
  await postear({ store, action: 'compra', id, ...datos })
}

export async function registrarEnvio(
  store: CanjeStore, id: number,
  datos: { envio_via: ViaEnvio; envio_seguimiento?: string | null; envio_costo?: number | null },
): Promise<void> {
  await postear({ store, action: 'envio', id, ...datos })
}

export async function marcarAvisada(store: CanjeStore, id: number): Promise<void> {
  await postear({ store, action: 'aviso', id })
}

/** ⚠️ Es el pivote: acá el servidor **congela** el `vence_el` de cada entregable. */
export async function marcarEntregado(store: CanjeStore, id: number): Promise<void> {
  await postear({ store, action: 'entregado', id })
}

// ── Entregables y evidencias ────────────────────────────────────────────────────

export async function agregarEntregable(
  store: CanjeStore, id: number,
  datos: { tipo: TipoEntregable; cantidad_comprometida: number; plazo_dias?: number | null; obligatorio?: boolean; nota?: string },
): Promise<CanjeEntregable> {
  const d = await postear({ store, action: 'entregable-agregar', id, ...datos })
  return d.entregable as CanjeEntregable
}

export async function quitarEntregable(store: CanjeStore, id: number, entregableId: number): Promise<void> {
  await postear({ store, action: 'entregable-quitar', id, entregable_id: entregableId })
}

export type NuevaEvidencia = {
  entregable_id?: number | null
  url_publicacion?: string | null
  captura_url?: string | null
  fecha_publicacion?: string | null
  metricas?: Record<string, number | string | null>
}

/** La carga **el equipo**, no ella: al portal no se le agrega esta pantalla (es mucho pedirle). */
export async function agregarEvidencia(store: CanjeStore, id: number, ev: NuevaEvidencia): Promise<CanjeEvidencia> {
  const d = await postear({ store, action: 'evidencia-agregar', id, ...ev })
  return d.evidencia as CanjeEvidencia
}

/** Sin verificar no cuenta: si no, pegar un link roto cerraría el canje. */
export async function verificarEvidencia(
  store: CanjeStore, id: number, evidenciaId: number, ok: boolean, motivo?: string,
): Promise<void> {
  await postear({ store, action: 'evidencia-verificar', id, evidencia_id: evidenciaId, ok, motivo })
}

export async function borrarEvidencia(store: CanjeStore, id: number, evidenciaId: number): Promise<void> {
  await postear({ store, action: 'evidencia-borrar', id, evidencia_id: evidenciaId })
}

// ── Plata y cierre ──────────────────────────────────────────────────────────────

export async function registrarPago(store: CanjeStore, id: number, nota?: string): Promise<void> {
  await postear({ store, action: 'pago', id, pago_nota: nota })
}

/**
 * Cierra y **congela el balance**.
 *
 * El balance lo calcula `calcularBalance` (puro, con tests) y se manda ya hecho; el servidor
 * valida rangos. Es la regla de `api/_reclamos.js`: replicar aritmética en JS es la fuente
 * conocida de desincronización, así que el cálculo vive en un solo lugar.
 */
export async function cerrarCanje(
  store: CanjeStore, id: number,
  datos: {
    balance: Balance
    balance_alcance?: number | null
    balance_interacciones?: number | null
    balance_puntaje_manual?: number | null
    balance_nota?: string | null
    incompleto?: boolean
    cierre_motivo?: string | null
  },
): Promise<void> {
  await postear({
    store, action: 'cerrar', id,
    balance_costo_productos: datos.balance.costo_productos,
    balance_costo_envio: datos.balance.costo_envio,
    balance_costo_plata: datos.balance.costo_plata,
    balance_costo_total: datos.balance.costo_total,
    balance_cpm: datos.balance.cpm,
    balance_alcance: datos.balance_alcance,
    balance_interacciones: datos.balance_interacciones,
    balance_puntaje_manual: datos.balance_puntaje_manual,
    balance_nota: datos.balance_nota,
    incompleto: datos.incompleto === true,
    cierre_motivo: datos.cierre_motivo,
  })
}

/** Devolvió o vendió lo que le mandamos. Un flag y nada más: sin flujo de reingreso. */
export async function marcarNoConservado(store: CanjeStore, id: number, motivo: string): Promise<void> {
  await postear({ store, action: 'no-conservado', id, motivo })
}

// ── La orden de Tienda Nube ─────────────────────────────────────────────────────

/**
 * El mismo endpoint que usan Cambios y Reclamos para traer una orden. Sin auth: es lectura de TN,
 * y las credenciales viven en `bdi-catalogo`, no acá.
 *
 * ⚠️ Stunned lee por **Zattia**: es una línea de esa tienda, no una tienda propia.
 */
const ORDEN_API = 'https://bdi-catalogo.vercel.app/api/tiendanube-audit'

export type VerificacionOrden = {
  encontrada: boolean
  total: number | null
  /** El canje se crea con 100% de descuento: un total distinto de cero es una señal, no un error. */
  esGratis: boolean
  aviso: string | null
}

/**
 * Verifica la orden que el operador creó **a mano** en el admin de Tienda Nube.
 *
 * El monitor no puede crearla: no hay credenciales de TN en este repo y `bdi-catalogo` sólo
 * escribe categorías, visibilidad, stock e imágenes — nunca órdenes. Lo único que se puede hacer
 * es leerla por número y avisar si algo no cuadra.
 */
export async function verificarOrden(store: CanjeStore, numero: string): Promise<VerificacionOrden> {
  const marca = baseDeCostos(store)
  const r = await fetch(`${ORDEN_API}?orden=${encodeURIComponent(numero)}&store=${marca}&nc=${Date.now()}`)
  const d = (await r.json().catch(() => null)) as { orden?: { total?: number | string }; error?: string } | null
  if (!d) throw new Error('No se pudo consultar Tienda Nube.')
  if (d.error) throw new Error(String(d.error))
  if (!d.orden) return { encontrada: false, total: null, esGratis: false, aviso: 'No se encontró esa orden en Tienda Nube.' }

  const total = d.orden.total == null ? null : Number(d.orden.total)
  const esGratis = total != null && total === 0
  return {
    encontrada: true,
    total,
    esGratis,
    aviso: esGratis || total == null
      ? null
      : `Ojo: la orden figura con un total de $${total.toLocaleString('es-AR')}. Un canje va con 100% de descuento.`,
  }
}
