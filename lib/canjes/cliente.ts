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
import { enviarVentaFetch } from '@/lib/sesionfotos/ventas'
import type { Credencial } from '@/lib/sesion'
import { baseDeCostos, numeroCanje } from './tipos'
import { notaVentaCanje } from './nota-gn.core.js'
import type { LineaVentaGn } from './venta-gn'
import type {
  Balance, CanjeConfig, CanjeEntregable, CanjeEvidencia, CanjeItem, CanjePersona, CanjeRow,
  CanjeStore, CanjeVitrina, EstadoCanje, EstadoVitrina, IntentoEntrega, NivelAprobacion,
  NotaCanje, OpcionVitrina, ResultadoCanje, TallesPersona, TipoCanje, TipoEntregable, TopeTipo, TopeUnidad,
  ViaEnvio,
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

/**
 * Un canje con material que ella subió y nadie miró. Mismo resumen que los vencidos, del otro lado:
 * aquél es lo que ella nos debe, éste es lo que le debemos nosotros.
 */
export type CanjeSinRevisar = {
  canjeId: number
  store: CanjeStore
  persona_id: number
  /** Cuántos archivos están esperando que alguien los mire. */
  cuantas: number
  /** Timestamp del más viejo: hace cuánto que están ahí. */
  desde: number
}

export type DatosCanjes = {
  personas: CanjePersona[]
  canjes: CanjeVisible[]
  vencidos: CanjeVencido[]
  sinRevisar: CanjeSinRevisar[]
  /** La de la marca en la que se está parado. */
  config: CanjeConfig | null
  /**
   * Las de **todas** las marcas visibles. El modal de propuesta deja elegir la marca —el padrón es
   * transversal, así que se propone desde donde uno esté— y necesita la unidad por defecto de
   * cualquiera de ellas, no sólo la de la sección.
   */
  configs: CanjeConfig[]
  /**
   * Las vitrinas **sin sus productos**: acá alcanza con el nombre para poder colgarle una a un
   * canje. Los productos, con sus fotos congeladas, salen por `leerVitrinas`.
   */
  vitrinas: VitrinaEnLista[]
  marcasVisibles: CanjeStore[]
}

/** Una vitrina en el selector: lo justo para elegirla. */
export type VitrinaEnLista = Pick<CanjeVitrina, 'id' | 'store' | 'nombre' | 'estado' | 'created_at'>

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
    sinRevisar: (d.sinRevisar as CanjeSinRevisar[]) || [],
    config: (d.config as CanjeConfig) || null,
    configs: (d.configs as CanjeConfig[]) || [],
    vitrinas: (d.vitrinas as VitrinaEnLista[]) || [],
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

/** Cómo terminó cada fila del alta masiva, en el mismo orden en que se tipearon. */
export type ResultadoAlta = {
  instagram: string
  instagram_raw: string
  estado: 'creada' | 'existia' | 'repetida' | 'invalida' | 'error'
  id: number | null
  /** De quién es la ficha, cuando ya estaba. */
  nombre: string | null
  error: string | null
}

export type ResumenLoteAlta = {
  resultados: ResultadoAlta[]
  creadas: number
  existian: number
  repetidas: number
  invalidas: number
  errores: number
}

/**
 * El alta de varias de una sola vez.
 *
 * ⚠️ **Lo que devuelve esto es el resultado; lo que muestra la grilla mientras se tipea es una
 * previsión.** Las dos usan normalizaciones distintas del @ —la de acá es TS, la que decide es la
 * copia JS del handler— y una divergencia entre ellas es invisible en el alta de a una pero en un
 * lote de cuarenta significa prometer 38 y crear 35. Por eso la pantalla de resultado se dibuja
 * desde `resultados`, fila por fila.
 */
export async function crearPersonasLote(
  store: CanjeStore,
  personas: Array<{ instagram: string; instagram_raw?: string; nombre?: string; telefono?: string; ciudad?: string }>,
): Promise<ResumenLoteAlta> {
  const d = await postear({ store, action: 'personas-crear-lote', personas })
  return {
    resultados: (d.resultados as ResultadoAlta[]) || [],
    creadas: Number(d.creadas) || 0,
    existian: Number(d.existian) || 0,
    repetidas: Number(d.repetidas) || 0,
    invalidas: Number(d.invalidas) || 0,
    errores: Number(d.errores) || 0,
  }
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
  /** La vitrina de la que elige, con sus productos. `null` si no tiene ninguna colgada. */
  vitrina: CanjeVitrina | null
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
    vitrina: (d.vitrina as CanjeVitrina) || null,
    config: d.config as CanjeConfig,
  }
}

// ══ LA VITRINA ═════════════════════════════════════════════════════════════════
//
// Un espejo curado de Tienda Nube: se trae de la tienda lo que se quiere promocionar, se saca el
// resto, y eso es lo que la creadora ve al abrir su link. **De acá no vuelve nada a TN.**

/** Las vitrinas de la marca **con sus productos**: es la pantalla de armado. */
export async function leerVitrinas(store: CanjeStore): Promise<CanjeVitrina[]> {
  const d = await leer(`vista=vitrinas&store=${store}`)
  return (d.vitrinas as CanjeVitrina[]) || []
}

export async function crearVitrina(store: CanjeStore, nombre: string, nota?: string): Promise<CanjeVitrina> {
  const d = await postear({ store, action: 'vitrina-crear', nombre, nota })
  return d.vitrina as CanjeVitrina
}

export async function editarVitrina(
  store: CanjeStore, vitrinaId: number, campos: { nombre?: string; nota?: string | null },
): Promise<void> {
  await postear({ store, action: 'vitrina-editar', vitrina_id: vitrinaId, ...campos })
}

export async function cambiarEstadoVitrina(
  store: CanjeStore, vitrinaId: number, estado: EstadoVitrina,
): Promise<void> {
  await postear({ store, action: 'vitrina-estado', vitrina_id: vitrinaId, estado })
}

/**
 * Suma o refresca productos. Llegan **ya congelados** desde acá, que es el único lado con sesión
 * para preguntarle a Tienda Nube: el portal no tiene ninguna.
 *
 * Se upsertean por producto, así que traer una categoría que se pisa con otra ya traída es
 * inofensivo, y re-traer es también el botón "actualizar" (vuelve a congelar la foto y el precio de
 * hoy). Lo que alguien haya apagado a mano **no se vuelve a prender**.
 */
export async function sumarAVitrina(
  store: CanjeStore, vitrinaId: number, items: ProductoParaVitrina[],
): Promise<{ sumados: number; actualizados: number }> {
  const d = await postear({ store, action: 'vitrina-items', vitrina_id: vitrinaId, items })
  return { sumados: (d.sumados as number) || 0, actualizados: (d.actualizados as number) || 0 }
}

/** Lo que se manda al congelar un producto en la vitrina. Sale de `traerAudit`. */
export type ProductoParaVitrina = {
  tn_product_id: string
  sku?: string | null
  nombre: string
  /** La tapa: la de la grilla y la de la hoja. */
  foto_url?: string | null
  /** Las demás fotos del producto, para verlas grandes desde el link. */
  fotos?: string[]
  pvp?: number | null
  opciones: OpcionVitrina[]
}

/**
 * Saca un producto. Sin `activo` lo **borra**, que el servidor sólo permite mientras la vitrina
 * está en borrador; con `activo: false` lo apaga, que es lo que corresponde una vez que salió.
 */
/**
 * Revisa la vitrina entera contra la tienda de hoy: refresca lo que sigue en pie y **apaga lo que
 * se agotó**. La comparación la hace el panel (`revisarStock`), que es el único lado que puede leer
 * el catálogo de Tienda Nube.
 */
export async function revisarStockDeVitrina(
  store: CanjeStore, vitrinaId: number, items: ProductoParaVitrina[], apagar: string[],
): Promise<{ actualizados: number; apagados: number }> {
  const d = await postear({ store, action: 'vitrina-stock', vitrina_id: vitrinaId, items, apagar })
  return { actualizados: (d.actualizados as number) || 0, apagados: (d.apagados as number) || 0 }
}

export async function sacarDeVitrina(
  store: CanjeStore, vitrinaId: number, itemId: number, activo?: boolean,
): Promise<void> {
  await postear({ store, action: 'vitrina-item', vitrina_id: vitrinaId, item_id: itemId, activo })
}

export async function borrarVitrina(store: CanjeStore, vitrinaId: number): Promise<void> {
  await postear({ store, action: 'vitrina-borrar', vitrina_id: vitrinaId })
}

/** De qué vitrina elige este canje. `null` la saca y el link vuelve a pedir sólo los datos. */
export async function colgarVitrina(store: CanjeStore, id: number, vitrinaId: number | null): Promise<void> {
  await postear({ store, action: 'canje-vitrina', id, vitrina_id: vitrinaId })
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
  /** De qué vitrina elige. `null` = ninguna: los productos los carga el equipo, como siempre. */
  vitrina_id?: number | null
  /** Lo retira en el local en vez de recibirlo por correo. Sólo BDI (`retiroLocalDisponible`). */
  retiro_local?: boolean
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

/** La misma propuesta, sin de quién es: en el lote la persona la pone cada fila. */
export type PropuestaSinPersona = Omit<NuevoCanje, 'persona_id'>

export type CanjeDelLote = { persona_id: number; id: number; numero: string; estado: EstadoCanje }

export type ResumenLoteCanjes = {
  creados: CanjeDelLote[]
  /** Las que el servidor dejó afuera, con el motivo ya escrito en criollo. */
  rechazadas: Array<{ persona_id: number; motivo: string }>
  errores: Array<{ persona_id: number; error: string }>
}

/**
 * Un canje **igual** para varias personas: misma marca, misma vitrina, mismo tope y los mismos
 * entregables. Cada una conserva su propio canje, su propio link y sus propios datos.
 *
 * Una persona vetada o con vencidos **no aborta el lote**: vuelve en `rechazadas` con el motivo.
 *
 * ⚠️ Si esto se corta por red o por timeout, **no reintentar**: no hay nada que impida crear los
 * mismos canjes dos veces. Lo correcto es recargar y mirar qué quedó.
 */
export async function crearCanjesLote(
  store: CanjeStore, personaIds: number[], datos: PropuestaSinPersona,
): Promise<ResumenLoteCanjes> {
  const d = await postear({ store, action: 'canjes-crear-lote', persona_ids: personaIds, ...datos })
  return {
    creados: (d.creados as CanjeDelLote[]) || [],
    rechazadas: (d.rechazadas as ResumenLoteCanjes['rechazadas']) || [],
    errores: (d.errores as ResumenLoteCanjes['errores']) || [],
  }
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
  /**
   * ⚠️ **Puede no venir, y ése es un caso normal**: un item cargado a mano (un regalo, algo de
   * afuera del catálogo) no tiene id de Gestión Nube. Sin él el servidor deja `costo_unit` en
   * `null` y el balance lo estima con `factor_costo_estimado`, que es el mismo camino que ya
   * recorre todo lo que elige ella desde la vitrina.
   */
  product_id?: string | null
  size_id?: string | null
  nombre?: string | null
  variante?: string | null
  cantidad: number
  costo_unit?: number | null
  pvp_unit?: number | null
  /** Va POR ENCIMA de lo acordado: no cuenta al tope, sí al balance. El mostrador no lo puede poner. */
  extra?: boolean
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

/**
 * Las notas del canje. Mismo contrato que `agregarNota`/`borrarNota` de la persona: devuelven la
 * lista ya actualizada, así la ficha se re-pinta sin volver a leerla entera.
 *
 * ⚠️ La de la **persona** es del vínculo («no contesta los martes»); ésta es de **este canje**
 * («pidió que llegue antes del viernes»). Se puede escribir en cualquier estado, cerrados incluidos.
 */
export async function agregarNotaCanje(store: CanjeStore, id: number, texto: string): Promise<NotaCanje[]> {
  const d = await postear({ store, action: 'canje-nota', id, texto })
  return (d.notas as NotaCanje[]) || []
}

/** ⚠️ Por `nota_id`, nunca por índice: ver el comentario en `api/_canjes.js`. */
export async function borrarNotaCanje(store: CanjeStore, id: number, notaId: string): Promise<NotaCanje[]> {
  const d = await postear({ store, action: 'canje-nota-borrar', id, nota_id: notaId })
  return (d.notas as NotaCanje[]) || []
}

/** No borra: marca `quitado` o `sin_stock`. Que algo se haya caído es información. */
/**
 * Confirma un producto que eligió ella. Sólo mueve los que están en `propuesto`.
 *
 * `costo` es opcional y es la única forma de que un item de la vitrina lo tenga: el precio viene
 * congelado de Tienda Nube, pero el costo vive en Gestión Nube y no se cruza confiable.
 */
export async function confirmarItem(
  store: CanjeStore, id: number, itemId: number, costo?: number | null,
): Promise<void> {
  await postear({ store, action: 'item-confirmar', id, item_id: itemId, costo_unit: costo })
}

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

/**
 * El correo pasó y no había nadie. **No cambia el estado**: el canje sigue en la cola de tránsito
 * hasta que llegue de verdad.
 */
export async function anotarIntentoEntrega(
  store: CanjeStore, id: number, nota?: string,
): Promise<IntentoEntrega[]> {
  const d = await postear({ store, action: 'intento-entrega', id, nota: nota || null })
  return (d.intentos as IntentoEntrega[]) || []
}

/** ⚠️ Es el pivote: acá el servidor **congela** el `vence_el` de cada entregable. */
export async function marcarEntregado(store: CanjeStore, id: number): Promise<void> {
  await postear({ store, action: 'entregado', id })
}

// ── Retiro en el local ──────────────────────────────────────────────────────────

/** Lo que el local ve del mostrador: sin plata, sin balance, sin historial. */
export type CanjeEnElLocal = {
  id: number
  numero: string
  store: CanjeStore
  estado: EstadoCanje
  titulo: string | null
  acordado_at: string | null
  persona: {
    id: number; nombre: string | null; apellido: string | null
    instagram: string | null; telefono: string | null
    /** Qué celular tiene: es lo que dice QUÉ funda va. Lo carga marketing antes de confirmar. */
    modelo_celular: string | null
  }
  tope_tipo: TopeTipo
  tope_unidades: TopeUnidad[]
  unidad: string
  items: CanjeItem[]
}

/**
 * Cambiar entre "se lo enviamos" y "lo retira en el local".
 *
 * Va por su propia acción y no por `editarCanje`: eso último sólo corre antes del acuerdo porque
 * protege lo pactado, y esto es logística. Se puede cambiar mientras no haya salido.
 */
export async function cambiarRetiroLocal(store: CanjeStore, id: number, retiroLocal: boolean): Promise<void> {
  await postear({ store, action: 'retiro', id, retiro_local: retiroLocal })
}

/** Los canjes que hay para entregar en el mostrador. La lista sale filtrada del servidor. */
export async function leerCanjesDelLocal(): Promise<CanjeEnElLocal[]> {
  // `store` va explícito aunque la vista sea sólo de BDI: el handler lo exige SIEMPRE, antes de
  // mirar la vista, y sin él contesta "store inválido".
  const d = await leer('vista=local&store=bdi')
  return (d.canjes || []) as CanjeEnElLocal[]
}

/**
 * Entregarlo en el mostrador: **crea la venta a $0 en Gestión Nube y recién después la registra**.
 *
 * Ese orden es el de `registrarVentaGN` (Fallas) y no es casual: si primero se marcara entregado y
 * la venta fallara, el canje quedaría cerrado con el stock sin descontar y nadie se enteraría. Al
 * revés, el error se ve y la venta existe con su número.
 *
 * 🔴 **La venta de GN es irreversible por API** —GN no permite anularla— así que si el registro
 * falla, la venta ya está hecha. El mensaje lo dice con el número, que es lo único que sirve para
 * arreglarlo a mano en GN.
 *
 * La credencial va adentro del pedido porque `/api/crear-venta` valida la identidad server-side, y
 * apunta siempre a producción: los tokens de ventas de GN viven sólo ahí.
 */
export async function entregarEnLocal(
  canje: Pick<CanjeEnElLocal, 'id' | 'numero' | 'store'>,
  items: CanjeItem[],
  persona: { nombre?: string | null; apellido?: string | null },
  cred: Credencial,
): Promise<{ gn_venta_number: string | null }> {
  const quien = nombreDe(persona)
  const r = await enviarVentaFetch({
    store: canje.store,
    origen: 'local',
    proposito: 'canje',
    items: items.map((i) => ({
      product_id: i.product_id ?? null,
      size_id: i.size_id ?? null,
      quantity: Number(i.cantidad) || 1,
      unit_price: i.pvp_unit ?? 0,
    })),
    comments: notaVentaCanje({ numero: canje.numero, quien, modo: 'local' }),
    solicitudId: `canje-${canje.id}`,
    ...cred,
  })
  if (!r.ok) throw new Error(`No se pudo crear la venta en Gestión Nube — ${r.error || ''}`)

  const numero = r.venta?.number != null ? String(r.venta.number) : null
  try {
    await postear({
      store: canje.store, action: 'entrega-local', id: canje.id,
      gn_venta_id: r.venta?.id ?? null, gn_venta_number: numero,
    })
  } catch (e) {
    throw new Error(
      `La venta se creó en Gestión Nube (nº ${numero || '?'}) pero no se pudo registrar en el canje: ` +
      `${(e as Error)?.message || e}. Anulala a mano en GN antes de reintentar.`,
    )
  }
  return { gn_venta_number: numero }
}

/**
 * El nombre con el que la venta queda en Gestión Nube. Es lo único que en GN dice de quién era el
 * canje: todas se atribuyen al mismo cliente `Canjes BDI`.
 */
function nombreDe(persona: { nombre?: string | null; apellido?: string | null }): string {
  return [persona.nombre, persona.apellido].filter(Boolean).join(' ').trim() || 'sin nombre'
}

/**
 * **La compra del canje que se ENVÍA: escribe la venta directo en Gestión Nube.**
 *
 * Es lo que pidió Bruno el 1-sep-2026 — *«poder escribir los canjes de las personas en ventas de
 * Gestión Nube con el nombre de canjes bdi, en la nota que diga el nombre de la persona, y luego le
 * genero etiqueta por afuera»*— y **reemplaza tipear la orden a mano en el admin de Tienda Nube**.
 *
 * Mismo orden y mismo modo de falla que `entregarEnLocal` y que `registrarVentaGN` de Fallas: se
 * crea la venta y **recién después** se registra. Al revés, un canje quedaría marcado como comprado
 * con el stock sin descontar y nadie se enteraría.
 *
 * 🔴 **La venta de GN es irreversible por API** —GN no permite anularla— así que si el registro
 * falla, la venta ya existe. El mensaje lo dice con el número, que es lo único que sirve para
 * arreglarlo a mano en GN.
 *
 * ⚠️ **Las líneas vienen resueltas de afuera** (`resolverLineas`, en `venta-gn.ts`) y no se arman
 * acá a partir de los ítems: lo que la creadora elige trae ids de **Tienda Nube**, y mandarlos a GN
 * descontaría el producto equivocado. Que la pantalla las muestre antes de apretar es el punto:
 * quien aprieta ve exactamente qué se va a descontar.
 */
export async function comprarEnGn(
  canje: Pick<CanjeRow, 'id' | 'store'>,
  lineas: LineaVentaGn[],
  persona: { nombre?: string | null; apellido?: string | null },
  cred: Credencial,
): Promise<{ gn_venta_number: string | null }> {
  if (!lineas.length) throw new Error('No hay ningún producto que vender.')
  const numero = numeroCanje(canje.id)
  const r = await enviarVentaFetch({
    store: canje.store,
    // 🔑 Del DEPÓSITO, no del local: es de donde sale lo que se despacha (decisión de Bruno,
    // 1-sep-2026). El retiro en el mostrador es el otro camino y ese sí descuenta del local.
    origen: 'deposito',
    proposito: 'canje',
    items: lineas.map((l) => ({
      product_id: l.product_id,
      size_id: l.size_id,
      quantity: l.cantidad,
      unit_price: l.unit_price,
    })),
    comments: notaVentaCanje({ numero, quien: nombreDe(persona), modo: 'envio' }),
    solicitudId: `canje-${canje.id}`,
    ...cred,
  })
  if (!r.ok) throw new Error(`No se pudo crear la venta en Gestión Nube — ${r.error || ''}`)

  const gnNumero = r.venta?.number != null ? String(r.venta.number) : null
  try {
    await postear({
      store: canje.store, action: 'compra-gn', id: canje.id,
      gn_venta_id: r.venta?.id ?? null, gn_venta_number: gnNumero,
    })
  } catch (e) {
    throw new Error(
      `La venta se creó en Gestión Nube (nº ${gnNumero || '?'}) pero no se pudo registrar en el canje: ` +
      `${(e as Error)?.message || e}. Anulala a mano en GN antes de reintentar.`,
    )
  }
  return { gn_venta_number: gnNumero }
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

/**
 * El archivo ya quedó en Drive ⇒ se anota el link y **el servidor lo borra del buzón**.
 *
 * ⚠️ Se llama **de a un archivo, y recién cuando Drive confirmó ese archivo**. Avisar de a tandas
 * dejaría un video que falló contado como archivado, y el borrado del Blob es lo que lo volvería
 * imposible de recuperar.
 *
 * `carpetaId` viaja para que el canje se quede con la subcarpeta de Drive: el que archive después
 * escribe adentro de ésa, aunque su sesión de Google no la vea (ver `lib/drive/subir.ts`).
 */
export async function archivadaEnDrive(
  store: CanjeStore, id: number, evidenciaId: number, driveUrl: string, carpetaId?: string,
): Promise<void> {
  await postear({ store, action: 'evidencia-archivada', id, evidencia_id: evidenciaId, drive_url: driveUrl, carpeta_id: carpetaId })
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

/**
 * ¿Rindió? **Se contesta después de cerrar**, y es la única acción que escribe sobre un canje
 * terminal: la venta que empuja un canje llega días o semanas más tarde, así que preguntarlo dentro
 * del cierre lo condena a contestarse siempre «no sabría decir».
 */
export async function guardarResultado(
  store: CanjeStore, id: number, resultado: ResultadoCanje, nota?: string | null,
): Promise<void> {
  await postear({ store, action: 'resultado', id, resultado, resultado_nota: nota ?? null })
}

/** Devolvió o vendió lo que le mandamos. Un flag y nada más: sin flujo de reingreso. */
export async function marcarNoConservado(store: CanjeStore, id: number, motivo: string): Promise<void> {
  await postear({ store, action: 'no-conservado', id, motivo })
}

// ── La orden de Tienda Nube ─────────────────────────────────────────────────────

/**
 * El mismo endpoint que usan Cambios y Reclamos para traer una orden. Las credenciales de TN viven
 * en `bdi-catalogo`, ⛔ no acá.
 *
 * 🔴 **Va con `apiFetch`, ⛔ no con `fetch` pelado** (30-ago-2026): ver el 🔴 gemelo en
 * `lib/reclamos/cliente.ts`. Esta rama del audit pide usuario del padrón desde el mismo día, y
 * ⛔ **no** es «lectura de TN» inocua: devuelve quién compró, cuánto pagó y el seguimiento.
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
  const r = await apiFetch(`${ORDEN_API}?orden=${encodeURIComponent(numero)}&store=${marca}&nc=${Date.now()}`)
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
