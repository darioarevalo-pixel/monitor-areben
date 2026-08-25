/**
 * Tipos y matemática de Devoluciones (tabla `devoluciones`, ver sql/migrate-devoluciones.sql).
 *
 * Este archivo es PURO —sin React, sin fetch— porque es donde vive la plata: cuánto se le
 * devuelve a cada persona y si conviene pagar el envío para que el producto vuelva. Todo lo que
 * está acá tiene test (`tests/devoluciones.test.ts`).
 *
 * Las tres decisiones que modela un reclamo, y que son independientes entre sí:
 *   - **el producto**: vuelve · se lo queda el cliente · nunca salió   (la decidimos nosotros, es económica)
 *   - **la compensación**: plata total · parte · otra unidad · cupón · nada
 *   - **la evidencia**: fotos + relato que carga el cliente por un link
 */

import type { Marca } from '@/lib/nav.datos'
import {
  EFECTOS_RESOLUCION as EFECTOS_RESOLUCION_JS,
  pendientesDe as pendientesDeJs,
  saleUnEnvio as saleUnEnvioJs,
} from './efectos.core.js'
import {
  CASOS as CASOS_JS,
  PERFIL_MOTIVO as PERFIL_MOTIVO_JS,
  casoDe as casoDeJs,
  escenarioDe as escenarioDeJs,
  escenariosDe as escenariosDeJs,
  esEscenarioDe as esEscenarioDeJs,
  esSoloSeguimiento as esSoloSeguimientoJs,
  perfilDe as perfilDeJs,
  pideReclamoAlTransportista as pideReclamoAlTransportistaJs,
  productoEnJuego as productoEnJuegoJs,
  reclasificaA as reclasificaAJs,
} from './casos.core.js'

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
  /**
   * No le quedó el talle. Es **qué pasó**, no qué quiere: la mayoría termina en cambio, pero el
   * dato que importa es otro. Agrupados por este motivo, los reclamos señalan la **guía de talles
   * y la ficha del producto** — exactamente igual que `mal_armado` señala el picking. Mezclado
   * dentro de `no_esperaba`, ese dato no existe.
   */
  | 'talle'
  /**
   * Lo que recibió **no coincide con lo que publicamos**. Salió de adentro de `no_esperaba` el
   * 25-ago-2026, y no es un matiz: son dos cosas distintas y una es culpa nuestra. Mezclados, el
   * motivo no medía nada limpio — adentro convivían "no me gustó" y "la ficha está mal".
   */
  | 'no_como_publicado'
  | 'falla'
  | 'faltante'
  | 'mal_armado'
  /** Le llegó algo **de más**. El único caso que toca DOS ventas. */
  | 'excedente'
  /**
   * Llegó tarde. **No hay producto en juego**: no vuelve nada, no se mueve stock, y la única
   * pregunta es de quién fue la demora — la contestan las fechas, no el cliente.
   */
  | 'demora'
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
 * Cómo se lee cada opción **según el caso**. La etiqueta genérica alcanza para la mayoría, pero en
 * algunos motivos dice cualquier cosa: "que le manden lo que falta" en un pedido que nunca llegó, o
 * "cambiarlo por otro" en algo que el cliente todavía no tiene.
 *
 * Sólo se listan los motivos donde la genérica está mal. El resto usa `EXPECTATIVA_LABEL`.
 */
const EXPECTATIVA_LABEL_POR_MOTIVO: Partial<Record<MotivoReclamo, Partial<Record<Expectativa, string>>>> = {
  no_llego: {
    completar: 'Que le mandemos el pedido de nuevo',
    plata: 'Que le devolvamos la plata',
  },
  faltante: { completar: 'Que le mandemos el producto que faltó' },
  mal_armado: { completar: 'Que le mandemos el producto que faltó' },
  // Acá no es "qué espera": el cliente todavía no sabe que hay un problema. Es qué ELIGIÓ cuando
  // se le avisó, que es el único caso donde la decisión es suya.
  sin_stock: {
    otro_producto: 'Cambiarlo por otro producto',
    plata: 'Que le devolvamos la plata',
  },
}

export function expectativaLabel(e: Expectativa, m?: MotivoReclamo | null): string {
  return (m && EXPECTATIVA_LABEL_POR_MOTIVO[m]?.[e]) || EXPECTATIVA_LABEL[e]
}

/**
 * El rótulo de la pregunta. En `sin_stock` no es "qué espera" —no recibió nada, ni sabe que hay un
 * problema— sino qué eligió cuando se le ofrecieron las dos salidas.
 */
export function tituloExpectativa(m?: MotivoReclamo | null): string {
  return m && decideElCliente(m) && !PERFIL_MOTIVO[m].recibioAlgo ? '¿Qué eligió?' : '¿Qué esperaba?'
}

/**
 * Qué pasa con el producto:
 *   - `stock`    vuelve sano y se revende.
 *   - `falla`    vuelve pero no se revende como nuevo: va al ledger de Fallas.
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
 * Cómo vuelve el producto. `presencial` es el cliente acercándose al local: **no hay envío**, así
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
 * y falta que Administración decida. `en_transito`/`recibido` solo aplican si el producto vuelve.
 */
export type EstadoReclamo =
  | 'borrador' | 'esperando_cliente' | 'en_revision' | 'resuelto'
  | 'en_transito' | 'recibido' | 'cerrado' | 'anulado'

/** Los tres pendientes que se cierran por separado, porque avanzan a ritmos distintos. */
export type PendienteEstado = 'pendiente' | 'hecho' | 'no_aplica'

/** El cobro de la diferencia de un cambio. Solo aplica cuando queda plata a cobrar. */
export type CobroEstado = 'no_aplica' | 'pendiente' | 'cobrado'

export const MOTIVO_LABEL: Record<MotivoReclamo, string> = {
  arrepentimiento: 'Arrepentimiento',
  no_esperaba: 'No era lo que esperaba',
  talle: 'No le quedó el talle',
  no_como_publicado: 'No es como en la publicación',
  falla: 'Falla',
  faltante: 'Faltante de producto',
  mal_armado: 'Pedido mal armado',
  excedente: 'Le llegó de más',
  demora: 'Demora en la entrega',
  no_llego: 'No le llegó nunca',
  sin_stock: 'No tenemos stock',
  no_era_lo_esperado: 'No era lo que esperaba', // histórico
  // Catch-all histórico, y hoy también lo que se guarda cuando un cambio va SIN motivo:
  // cambiar es un derecho del comprador y no hace falta justificarlo.
  otro: 'Sin motivo',
}

/**
 * Los que se ofrecen al cargar, en el orden en que pasan de verdad. **Once**, desde el 25-ago-2026.
 *
 * ⚠️ La cancelación NO está y no falta: es el escenario "todavía se puede frenar" de
 * `arrepentimiento`. Lo único que la separa es el estado del pedido, y eso lo contesta el sistema
 * — hacerla un motivo aparte obligaría a alguien a elegir entre dos casillas que significan lo
 * mismo en dos momentos distintos.
 */
export const MOTIVOS_VIGENTES: MotivoReclamo[] = [
  'talle', 'arrepentimiento', 'no_esperaba', 'no_como_publicado', 'falla', 'faltante',
  'mal_armado', 'excedente', 'demora', 'no_llego', 'sin_stock',
]

/**
 * Los motivos que entran por el **mostrador**, o sea por la puerta Cambios.
 *
 * Son los tres en que no hay nada que evaluar: llegó lo que pidió, en buen estado, y no lo quiere.
 * Todo el resto (falla, faltante, mal armado, no llegó, sin stock) implica una decisión nuestra o
 * una gestión, así que **entra por Reclamos**. Antes el POS ofrecía los ocho y eso invitaba a
 * resolver de mostrador casos que necesitan expediente.
 *
 * ⚠️ El motivo del cambio es **opcional de verdad**: cambiar es un derecho del comprador y no hace
 * falta justificarlo. Antes decía "opcional" pero el select no tenía opción vacía y arrancaba en
 * `talle`, así que en la práctica se guardaba `talle` aunque nadie lo hubiera elegido — y eso
 * ensuciaba la única señal que el campo existe para dar.
 */
export const MOTIVOS_CAMBIO: MotivoReclamo[] = ['talle', 'arrepentimiento', 'no_esperaba']

/**
 * ¿El producto salió del depósito alguna vez? Los casos en que NO define medio flujo: no hay
 * etiqueta de vuelta, no hay tránsito, y no hay nada que reingresar — solo plata y stock.
 *
 * ⚠️ **No alcanza con esto para saber qué hacer con el stock**, y confundirlo cuesta caro: en
 * `faltante` la unidad ESTÁ en el depósito (hay que reingresarla en GN) y en `sin_stock` NO EXISTE
 * (hay que darla de baja). Mismo "nunca salió", movimiento opuesto. Eso lo responde
 * `hayUnidadFisica`.
 */
export const NUNCA_SALIO: MotivoReclamo[] = ['faltante', 'sin_stock']

/**
 * ⚠️ **`NUNCA_SALIO` es la lista del CASO y no alcanza para decidir**: en la cancelación el pedido
 * tampoco salió, y eso lo dice el escenario. Lo que manda es `perfilDe(motivo, escenario).salio`.
 */

// ── El perfil de cada motivo ────────────────────────────────────────────────────
//
// Todo lo que cambia de un caso a otro sale de acá, y sale de **dos preguntas físicas**: ¿el
// producto salió del depósito? ¿la unidad existe? Con eso se derivan el stock, la plata, las fotos
// y qué se le puede ofrecer. Antes cada una de esas respuestas era un `includes` suelto en un
// archivo distinto, y por eso se contradecían.

/** Cuándo hace falta una foto, y de qué. */
export type PideFotos =
  /** La foto ES la prueba: sin ella no se decide (falla, mal armado). */
  | 'siempre'
  /** Solo si el producto vuelve por plata. Si lo cambia, se ve en el mostrador. */
  | 'si_quiere_plata'
  /** No del producto reclamado —no lo tiene— sino de lo que SÍ recibió, para verificar. */
  | 'de_lo_recibido'
  /** No hay nada que fotografiar. */
  | 'nunca'

export type PerfilMotivo = {
  /** Cuándo se usa este motivo. Es el texto del ⓘ, y lo leen las tres pantallas. */
  ayuda: string
  /** ¿El pedido salió del depósito? */
  salio: boolean
  /** ¿La unidad existe físicamente? Separa `faltante` (sí, reingresar) de `sin_stock` (no, dar de baja). */
  unidadExiste: boolean
  /**
   * ¿Hay un producto en juego?
   *
   * La tercera pregunta física, y la que deja que el final quede **vacío**: en una demora y en una
   * cancelación no hay nada que devolver, reingresar ni dar de baja, así que no hay destino de
   * producto que elegir. Hasta el 25-ago-2026 `decidir` exigía uno siempre y una demora no se
   * podía cerrar nunca.
   */
  productoEnJuego: boolean
  /** ¿El cliente llegó a recibir algo? Junto con `errorPropio` decide si se le devuelve el envío. */
  recibioAlgo: boolean
  /**
   * ¿El error fue NUESTRO?
   *
   * No es lo mismo que "hay un problema": que a alguien no le entre el talle es un problema y no es
   * culpa nuestra. Lo que define esta pregunta es **quién paga el envío de ida**.
   */
  errorPropio: boolean
  /** ¿El reclamo es sobre la venta entera? Entonces no se destildan productos. */
  ventaCompleta: boolean
  /** ¿Quién decide? En casi todos nosotros, con la evidencia. En `sin_stock`, el cliente. */
  decideCliente: boolean
  fotos: PideFotos
  /** Las salidas que se le pueden ofrecer, en el orden en que conviene. */
  expectativas: Expectativa[]
  /** ¿Se le puede ofrecer un descuento para que se lo quede en vez de devolverlo? */
  retencion: boolean
}

/**
 * El perfil de cada caso. **La tabla vive en `lib/reclamos/casos.core.js`**, en JS plano, porque la
 * necesita `api/_reclamos.js` para saber si la decisión puede quedar vacía — y los handlers de
 * `api/*.js` no pueden importar TypeScript. Mismo arreglo que `permisos.core.js` y
 * `efectos.core.js`, y por la misma razón: cuando la regla se copia, las copias se despegan.
 *
 * ⛔ **No leerlo directo para decidir nada**: el perfil de un caso puede cambiar según el
 * escenario, y eso lo resuelve `perfilDe(motivo, escenario)`. Esta constante es la fila base.
 */
export const PERFIL_MOTIVO = PERFIL_MOTIVO_JS as Record<MotivoReclamo, PerfilMotivo>

// ── El escenario: el nivel del medio ────────────────────────────────────────────

/** Quién contesta la pregunta que decide. `sistema` = las fechas y los estados del envío. */
export type Contesta = 'nosotros' | 'cliente' | 'sistema'

/**
 * Un escenario del caso. La lista es **cerrada**: es lo que separa un dato de un campo libre.
 *
 * `perfil` es lo único que puede mover, y sólo las preguntas físicas — ahí está la plata.
 */
export type EscenarioCaso = {
  clave: string
  label: string
  perfil?: Partial<Pick<PerfilMotivo, 'salio' | 'unidadExiste' | 'recibioAlgo' | 'errorPropio' | 'productoEnJuego'>>
  /** El caso que corresponde de verdad. Se muda conservando número, fotos e historia. */
  reclasificaA?: MotivoReclamo
  /** Todavía no hay caso que decidir: hay algo que mirar. Sólo en `no_llego`. */
  soloSeguimiento?: boolean
}

/** La ficha del centro de un caso: una pregunta, quién la contesta, y su lista cerrada. */
export type CasoCentro = {
  pregunta: string
  contesta: Contesta
  detalle: string
  escenarios: EscenarioCaso[]
}

export const CASOS = CASOS_JS as Partial<Record<MotivoReclamo, CasoCentro>>

/** La ficha del centro, o null si el caso no tiene escenarios (los históricos). */
export function casoDe(motivo: MotivoReclamo): CasoCentro | null {
  return casoDeJs(motivo) as CasoCentro | null
}

/** Los escenarios de un caso, en el orden en que se preguntan. */
export function escenariosDe(motivo: MotivoReclamo): EscenarioCaso[] {
  return escenariosDeJs(motivo) as EscenarioCaso[]
}

/** Un escenario concreto. Uno de OTRO caso no cuenta: la lista es cerrada. */
export function escenarioDe(motivo: MotivoReclamo, escenario: string | null | undefined): EscenarioCaso | null {
  return escenarioDeJs(motivo, escenario) as EscenarioCaso | null
}

/** ¿Este escenario pertenece a este caso? Es lo que valida el handler antes de guardar. */
export function esEscenarioDe(motivo: MotivoReclamo, escenario: string | null | undefined): boolean {
  return esEscenarioDeJs(motivo, escenario)
}

/**
 * **El perfil con el escenario aplicado.** Todo lo que decide plata o stock sale de acá.
 *
 * El escenario es un parámetro **obligatorio aunque valga `null`**, y eso no es ceremonia: en
 * `no_como_publicado`, en `demora` y en la cancelación el perfil lo fija el escenario, así que un
 * llamador que no lo pase estaría contestando con el default seguro **sin enterarse de que le
 * falta el dato**. Con el parámetro obligatorio, agregar una pantalla obliga a conseguirlo.
 */
export function perfilDe(motivo: MotivoReclamo, escenario: string | null | undefined): PerfilMotivo {
  return perfilDeJs(motivo, escenario) as PerfilMotivo
}

/**
 * ¿Hay un producto en juego? La **tercera pregunta física**, al lado de "¿salió?" y "¿existe?".
 *
 * En una demora y en una cancelación es que NO, y con eso el final puede quedar vacío sin ser un
 * error: no hay destino de producto que elegir.
 */
export function productoEnJuego(motivo: MotivoReclamo, escenario: string | null | undefined): boolean {
  return productoEnJuegoJs(motivo, escenario)
}

/** El caso al que hay que mudarlo, si el escenario dice que en realidad es otro. */
export function reclasificaA(motivo: MotivoReclamo, escenario: string | null | undefined): MotivoReclamo | null {
  return reclasificaAJs(motivo, escenario) as MotivoReclamo | null
}

/** ¿El escenario dice que todavía es seguimiento y no un caso? Sólo en `no_llego`. */
export function esSoloSeguimiento(motivo: MotivoReclamo, escenario: string | null | undefined): boolean {
  return esSoloSeguimientoJs(motivo, escenario)
}

/**
 * ¿Hay que presentarle un reclamo al transportista? Es plata recuperable **nuestra** y corre en
 * paralelo a todo lo demás: `no_llego` siempre, y `demora` sólo si fue del transporte.
 */
export function pideReclamoAlTransportista(motivo: MotivoReclamo, escenario: string | null | undefined): boolean {
  return pideReclamoAlTransportistaJs(motivo, escenario)
}

/**
 * Motivos donde el error es NUESTRO. Separa lo que se puede corregir de lo que no, y **decide si se
 * le devuelve el envío de ida** — ver `devuelveElEnvioDeIda`.
 *
 * ⚠️ Era una lista escrita a mano, al lado de un perfil que ya contestaba todo lo demás. Nadie la
 * usaba, así que nunca se despegó; pero es exactamente la forma que produjo el bug de los
 * pendientes. Ahora **sale del perfil**: agregar un motivo obliga a contestar si el error es
 * nuestro, en vez de dejarlo silenciosamente afuera de una lista.
 */
export const ERROR_PROPIO: MotivoReclamo[] = (Object.keys(PERFIL_MOTIVO) as MotivoReclamo[])
  .filter((m) => PERFIL_MOTIVO[m].errorPropio)

/** El texto del ⓘ de cada motivo: cuándo se usa, para no tener que adivinar cuál asignar. */
export function ayudaDeMotivo(m: MotivoReclamo): string {
  return PERFIL_MOTIVO[m].ayuda
}

/**
 * Qué se le puede ofrecer, según el motivo.
 *
 * Antes era una lista fija de cuatro opciones que no dependía de nada, así que en un "no le llegó
 * nunca" se ofrecía "el mismo producto en buen estado" y en una falla "que le manden lo que falta".
 */
export function expectativasDe(m: MotivoReclamo): Expectativa[] {
  return PERFIL_MOTIVO[m].expectativas
}

/**
 * ¿Hay que pedirle fotos, y de qué?
 *
 * **Depende del motivo Y de qué quiere el cliente**, no sólo del motivo: la foto sirve para ver en
 * qué estado vuelve el producto, así que sólo hace falta cuando el producto vuelve. Si lo quiere
 * cambiar, lo trae al mostrador y se ve ahí.
 */
export function pideFotos(m: MotivoReclamo, expectativa?: Expectativa | null): boolean {
  const modo = PERFIL_MOTIVO[m].fotos
  if (modo === 'nunca') return false
  if (modo === 'si_quiere_plata') return expectativa !== 'otro_producto' && expectativa !== 'mismo_producto'
  return true
}

/** El reclamo es sobre la venta entera: no se pueden destildar productos. */
export function sobreLaVentaCompleta(m: MotivoReclamo): boolean {
  return PERFIL_MOTIVO[m].ventaCompleta
}

/**
 * ¿La unidad reclamada existe físicamente?
 *
 * Es la pregunta que separa dos casos que parecen el mismo: en `faltante` el producto está en el
 * depósito y si se devuelve la plata hay que **reingresarlo** en GN; en `sin_stock` no existe y
 * hay que **darlo de baja**. Los dos "nunca salieron" y el movimiento es opuesto.
 */
export function hayUnidadFisica(m: MotivoReclamo, escenario: string | null | undefined): boolean {
  return perfilDe(m, escenario).unidadExiste
}

/**
 * ¿Se le devuelve también el envío de ida?
 *
 * Por **dos razones distintas**, y alcanza con una:
 *
 *   - **El error fue nuestro** (falla, faltante, producto equivocado, falta de stock). Cobrarle el
 *     envío de algo que salió mal por culpa nuestra es cobrarle nuestro error.
 *   - **No recibió nada** (`no_llego`, `sin_stock`). No hay servicio que cobrar: el paquete no llegó.
 *
 * Si no se cumple ninguna —se arrepintió, no le gustó, no le entró— la devolución es **del producto
 * únicamente**: el envío prestó su servicio y llegó.
 *
 * 🔑 `no_llego` entra por la segunda y no por la primera: el error es del transportista. Que sean
 * dos preguntas y no una es lo que deja pedirle esa plata al correo sin dejar de devolvérsela al
 * cliente.
 *
 * ⚠️ Hasta el 24-ago-2026 esto era sólo `!recibioAlgo`, así que una falla o un pedido mal armado se
 * devolvían **sin** el envío. Antes de eso era un checkbox libre, y el mismo caso se resolvía
 * distinto según quién lo tocara.
 */
export function devuelveElEnvioDeIda(m: MotivoReclamo, escenario: string | null | undefined): boolean {
  const p = perfilDe(m, escenario)
  return p.errorPropio || !p.recibioAlgo
}

/**
 * ¿Se le puede ofrecer un descuento para que se lo quede?
 *
 * Sólo tiene sentido si el producto está en su poder. La cuenta la hace `cuentaDescuento`: el techo
 * es lo que perdemos porque vuelva — la logística si está sano, la depreciación más el envío si
 * está fallado.
 */
export function ofreceRetencion(m: MotivoReclamo, escenario: string | null | undefined): boolean {
  // La retención sólo tiene sentido si el producto está en su poder: en una demora o en una
  // cancelación no hay nada que quedarse.
  return PERFIL_MOTIVO[m].retencion && productoEnJuego(m, escenario)
}

/** ¿Decide el cliente en vez de nosotros? Hoy sólo en `sin_stock`, que es el caso raro. */
export function decideElCliente(m: MotivoReclamo): boolean {
  return PERFIL_MOTIVO[m].decideCliente
}

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
 * lo trae en mano, "En camino de vuelta" es mentira — no hay nada viajando, hay alguien que
 * todavía no vino.
 */
export function estadoEnCriollo(d: Pick<ReclamoRow, 'estado' | 'via_retorno'>): string {
  if (d.estado === 'en_transito' && d.via_retorno === 'presencial') return 'Esperando que lo traiga'
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
  /**
   * **El que no salió.** Sólo en los motivos que van sobre la venta completa: el reclamo cubre el
   * pedido entero, pero el inconveniente es de un producto puntual.
   *
   * Sin esto no se puede resolver la devolución parcial: haría falta saber cuál de los dos
   * productos es el que falta para devolver sólo ése y despachar el resto.
   */
  falto?: boolean
}

export const COMPENSACION_LABEL: Record<Compensacion, string> = {
  plata_total: 'Se le devuelve todo',
  plata_parcial: 'Se le devuelve una parte y se queda con el producto',
  otra_unidad: 'Se le manda otra unidad igual',
  otro_producto: 'Lo cambia por otro producto',
  reenvio: 'Se le manda lo que corresponde',
  cupon: 'Se le da un cupón',
  ninguna: 'Sin compensación',
}

export const DESTINO_LABEL: Record<DestinoPrenda, string> = {
  stock: 'Vuelve y se revende',
  falla: 'Vuelve como falla (no se revende)',
  no_salio: 'Nunca salió del depósito',
  perdida: 'Se perdió o se la queda el cliente',
}

/** Una línea del resumen de lo decidido: qué se resolvió y por qué. */
export type LineaResumen = { que: string; valor: string }

/**
 * Lo que se decidió, en criollo, para mostrarlo junto al historial.
 *
 * Existe porque la fila del reclamo era **puro botón de acción**: `compensacion`, `destino_prenda`,
 * `retorno_decidido` y `costo_caso` se guardaban y **no se leían en ninguna pantalla**. Sin esto,
 * para saber qué se había resuelto en un caso había que deducirlo de qué botones quedaban.
 */
export function resumenDeLoDecidido(d: ReclamoRow): LineaResumen[] {
  const l: LineaResumen[] = []
  const money = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

  l.push({ que: 'Motivo', valor: MOTIVO_LABEL[d.motivo] + (d.motivo_detalle ? ` — ${d.motivo_detalle}` : '') })
  // El escenario va JUNTO al motivo y no al final: es la mitad de lo que se decidió, y es lo que
  // explica por qué en dos reclamos del mismo caso salió plata distinta.
  const esc = escenarioDe(d.motivo, d.escenario)
  if (esc) l.push({ que: 'Qué se encontró', valor: esc.label })
  if (d.expectativa) l.push({ que: tituloExpectativa(d.motivo).replace(/[¿?]/g, ''), valor: expectativaLabel(d.expectativa, d.motivo) })

  if (!d.compensacion) {
    l.push({ que: 'Decisión', valor: 'Todavía sin decidir' })
    return l
  }

  l.push({ que: 'Qué recibe', valor: COMPENSACION_LABEL[d.compensacion] })
  if (d.monto_total != null) l.push({ que: 'Se le devuelve', valor: money(Number(d.monto_total)) })
  if (d.cupon_codigo) l.push({ que: 'Cupón', valor: d.cupon_codigo })

  if (d.destino_prenda) l.push({ que: 'El producto', valor: DESTINO_LABEL[d.destino_prenda] })
  // Se guarda lo que sugirió la cuenta además de lo que se hizo: sirve para ver cuándo se va en
  // contra y si valió la pena.
  if (d.retorno_decidido != null) {
    const contra = d.retorno_sugerido != null && d.retorno_sugerido !== d.retorno_decidido
    l.push({
      que: '¿Se pidió que vuelva?',
      valor: (d.retorno_decidido ? 'Sí' : 'No')
        + (d.via_retorno ? `, por ${VIA_LABEL[d.via_retorno]}` : '')
        + (contra ? ' — en contra de lo que sugería la cuenta' : ''),
    })
  }
  if (d.costo_caso != null) l.push({ que: 'Lo que nos costó', valor: money(Number(d.costo_caso)) })
  return l
}

/** Los que no salieron. Si no hay ninguno marcado son todos: el reclamo cubre la venta entera. */
export function itemsQueFaltaron(items: ItemReclamo[]): ItemReclamo[] {
  const marcados = items.filter((i) => i.falto)
  return marcados.length ? marcados : items
}

/** ¿Se puede devolver sólo una parte, o el pedido es indivisible? */
export function admiteDevolucionParcial(items: ItemReclamo[]): boolean {
  return items.length > 1 && items.some((i) => i.falto) && items.some((i) => !i.falto)
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
 * precio de lista, se le está devolviendo plata que nunca pagó. **Era el hueco del motor viejo de
 * Cambios**, que tomaba el precio del devuelto sin descuentos.
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
  // En "se lo queda + parte de la plata" manda el monto acordado con el cliente, no la cuenta.
  const acordado = opciones?.montoAcordado
  const total = typeof acordado === 'number' && isFinite(acordado) && acordado >= 0
    ? redondear(acordado)
    : redondear(producto + envio)
  return { producto, envio, total }
}

// ── ¿Conviene que el producto vuelva? ─────────────────────────────────────────────

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
 * Lo recuperable **depende del estado de el producto**, y esa es la parte que se pasa por alto:
 *   - **sano** → vuelve a stock y se revende a precio completo: se recupera el precio de venta.
 *   - **fallado** → NO vuelve a stock (va al ledger de Fallas). Lo único que se saca de esa
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

export const FORMA_PAGO_DEF: Record<FormaPago, { label: string; descuento: number }> = {
  tarjeta: { label: 'Tarjeta', descuento: DESCUENTO_FORMA.tarjeta },
  transferencia: { label: 'Transferencia', descuento: DESCUENTO_FORMA.transferencia },
}

/**
 * Quién paga el envío del cambio. **No es un detalle de logística: cambia el total a cobrar.**
 * El envío queda solo en el Monitor y NO viaja a la venta de Gestión Nube (decisión de Bruno en el
 * motor viejo), pero si lo paga el cliente hay que cobrárselo en el mostrador.
 */
export type EnvioPaga = 'cliente' | 'nosotros'

/** Días que el cliente tiene para cambiar desde la compra. Regla del negocio. */
export const DIAS_CAMBIO = 30

export type CuentaCambio = {
  /** Lo que se lleva, a precio de lista. */
  nuevos: number
  /** Lo que devuelve, a lo que REALMENTE pagó (con los descuentos de la orden prorrateados). */
  devueltos: number
  /** Σnuevos − Σdevueltos, antes de descuentos y de envío. Es el "Subtotal productos" del ticket. */
  diferencia: number
  descuentoManual: number
  descuentoForma: number
  /** Los dos descuentos juntos: lo que se resta del subtotal. */
  descuento: number
  /** El envío, solo si lo paga el cliente. Si lo pagamos nosotros no entra en el total. */
  envioACobrar: number
  /** Positivo: lo paga el cliente. Negativo: se le devuelve. Cero: parejo. */
  total: number
  /** En criollo, para la pantalla y para el mensaje. */
  quienPaga: 'cliente' | 'nosotros' | 'nadie'
}

/**
 * La cuenta de un cambio por otro producto — la del ticket del POS, de arriba hacia abajo:
 *
 *     Subtotal productos   Σnuevos − Σdevueltos
 *     − Descuento          manual en $, y después el % por forma de pago sobre lo que queda
 *     = Total productos    esto es lo único que viaja a la venta de Gestión Nube
 *     + Envío              solo si lo paga el cliente; queda únicamente en el Monitor
 *     = Total a pagar
 *
 * # Cuánto vale lo que entrega: LISTA CONTRA LISTA
 *
 * Un cambio se cuenta **lista contra lista**, o sea que el cliente **conserva el descuento** que
 * había conseguido en la compra original. Cambiar una funda por la misma funda da **cero**, que es
 * lo que cualquiera espera parado en el mostrador. Si se le acreditara lo que pagó, cambiar algo
 * comprado con cupón por su equivalente le saldría plata — el castigo justo al revés.
 *
 * ⚠️ **Pero eso sólo vale mientras la diferencia esté a favor NUESTRO.** Si se lleva algo más
 * barato y el crédito fuera el precio de lista, se le devolvería plata que nunca puso: es
 * exactamente el hueco del motor viejo de Cambios. Con la funda de la orden #20700 —lista $8.990,
 * pagada $7.641,50— cambiada por algo de $6.000, lista contra lista devolvería $2.990 cuando
 * corresponden $1.641,50.
 *
 * Entonces la cuenta corre **dos veces**: primero lista contra lista; si da a favor del cliente,
 * se rehace valuando lo devuelto a **lo que pagó**, y ése es el número que vale. Así el cliente
 * conserva su descuento cuando pone plata, y nunca sale de la caja más de lo que entró.
 *
 * Los dos descuentos solo aplican sobre una diferencia **a cobrar**: si el cambio da a favor del
 * cliente no hay nada que descontar. El envío, en cambio, se suma siempre que lo pague él —
 * incluso sobre una diferencia a favor, donde achica lo que le devolvemos.
 */
export function calcularCambio(opciones: {
  devueltos: ItemReclamo[]
  nuevos: ItemReclamo[]
  orden?: OrdenTN | null
  formaPago?: FormaPago | null
  /** Un descuento extra acordado a mano, sobre la diferencia a cobrar. */
  descuentoManual?: number | null
  /** Lo que sale el envío del cambio. Solo entra al total si lo paga el cliente. */
  envioCosto?: number | null
  envioPaga?: EnvioPaga | null
}): CuentaCambio {
  const { devueltos, nuevos, orden } = opciones
  const totalNuevos = redondear(nuevos.reduce((s, it) => s + positivo(it.precio) * positivo(it.cantidad), 0))

  // Los dos valores de lo devuelto: a precio de vidriera y a lo que la persona realmente puso.
  const aLista = redondear(devueltos.reduce((s, it) => s + positivo(it.precio) * positivo(it.cantidad), 0))
  const aPagado = redondear(devueltos.reduce((s, it) => s + (it.pagado ?? pagadoPorItem(it, orden)), 0))

  // Lista contra lista mientras el cliente ponga plata: conserva el descuento que había conseguido.
  // En cuanto la cuenta queda a favor de él, se revalúa a lo pagado para no devolver de más — que
  // es la única regla innegociable del módulo.
  const totalDevueltos = totalNuevos - aLista >= 0 ? aLista : Math.min(aLista, aPagado)
  const diferencia = redondear(totalNuevos - totalDevueltos)

  // Los descuentos solo tienen sentido sobre lo que el cliente TIENE que poner.
  const descuentoManual = diferencia > 0 ? Math.min(positivo(opciones.descuentoManual), diferencia) : 0
  const base = Math.max(diferencia - descuentoManual, 0)
  const pct = opciones.formaPago ? DESCUENTO_FORMA[opciones.formaPago] : 0
  const descuentoForma = diferencia > 0 ? redondear((base * pct) / 100) : 0
  const descuento = redondear(descuentoManual + descuentoForma)
  const envioACobrar = opciones.envioPaga === 'cliente' ? redondear(positivo(opciones.envioCosto)) : 0
  const total = redondear(diferencia - descuento + envioACobrar)

  return {
    nuevos: totalNuevos,
    devueltos: totalDevueltos,
    diferencia,
    descuentoManual,
    descuentoForma,
    descuento,
    envioACobrar,
    total,
    quienPaga: total > 0 ? 'cliente' : total < 0 ? 'nosotros' : 'nadie',
  }
}

/** ¿Este reclamo es un cambio? Es la única condición: la salida es otro producto. */
export function esCambio(d: Pick<ReclamoRow, 'compensacion'>): boolean {
  return d.compensacion === 'otro_producto'
}

// ── Qué aplica a cada motivo ────────────────────────────────────────────────────

/**
 * Las salidas que tienen sentido según lo que pasó. No es cosmético: ofrecer "le mandamos otra
 * igual" en un arrepentimiento, o "le devolvemos una parte" en un pedido mal armado, invita a
 * resolver mal. Cada motivo tiene su repertorio.
 */
export function compensacionesDe(motivo: MotivoReclamo, escenario: string | null | undefined): Compensacion[] {
  // 🔑 La cancelación no es "un arrepentimiento más": el pedido no salió, así que no hay cambio
  // que armar contra un producto que el cliente no tiene. Vuelve la plata (con el envío, que
  // nunca prestó servicio) o no vuelve nada.
  if (motivo === 'arrepentimiento' && !productoEnJuego(motivo, escenario)) {
    return ['plata_total', 'cupon', 'ninguna']
  }
  switch (motivo) {
    // Se arrepintió o no era lo que esperaba: el producto está bien, lo que se discute es la plata.
    // El descuento parcial existe para retenerlo; mandarle otra igual no tendría sentido.
    case 'arrepentimiento':
    case 'no_esperaba':
    case 'no_era_lo_esperado':
    // La publicación mal: el producto está sano, lo que falló es lo que dijimos de él. Mismas
    // salidas que la expectativa; lo que cambia es quién paga el envío, y eso lo dice el perfil.
    case 'no_como_publicado':
      return ['otro_producto', 'plata_total', 'plata_parcial', 'cupon']
    // El talle: el producto está sana y casi siempre se lleva otra. Por eso el cambio va primero —
    // es la salida por defecto, no una más de la lista.
    case 'talle':
      return ['otro_producto', 'plata_total', 'plata_parcial', 'cupon']
    // Falla: es donde hay más margen: devolver, descontar para que se lo quede, o reponerla.
    case 'falla':
      return ['otra_unidad', 'otro_producto', 'plata_total', 'plata_parcial', 'cupon']
    // Faltante: el producto EXISTE, sólo no se metió en la caja. Se lo mandamos o se le devuelve
    // esa parte. No hay producto que negociar porque nunca lo tuvo.
    case 'faltante':
      return ['reenvio', 'plata_total', 'cupon']
    // Sin stock: ⚠️ **NO se puede reenviar, que es justamente lo único que no tenemos.** Las dos
    // salidas reales son cambiarlo por otro o devolverle la plata, y las elige el cliente. Ofrecer
    // 'reenvio' acá era prometer algo imposible; y sin 'otro_producto' la salida principal no
    // existía en el desplegable, aunque la expectativa sí la ofreciera.
    case 'sin_stock':
      return ['otro_producto', 'plata_total', 'cupon']
    // Le mandamos otra cosa: lo que corresponde es mandarle lo suyo. Devolver la plata es la
    // salida si ya no lo quiere.
    case 'mal_armado':
      return ['reenvio', 'plata_total', 'cupon']
    // Se perdió en el camino: se repone o se devuelve. El producto no está en ningún lado.
    case 'no_llego':
      return ['reenvio', 'plata_total']
    // Le llegó de más: **no hay nada que compensarle** —no pagó ese producto— y lo único que se
    // decide es si la unidad vuelve. Por eso la única salida es 'ninguna': el final del excedente
    // es de stock, no de plata.
    case 'excedente':
      return ['ninguna']
    // Demora: no se compensa, salvo que haya sido nuestra — y ahí es un cupón a compra futura.
    // El servicio de logística nacional no depende nuestro.
    case 'demora':
      return perfilDe(motivo, escenario).errorPropio ? ['cupon', 'ninguna'] : ['ninguna']
    default:
      return ['plata_total', 'plata_parcial', 'otra_unidad', 'reenvio', 'cupon', 'ninguna']
  }
}

/**
 * ¿Hay un producto que pueda volver? En los casos donde no, media pantalla sobra.
 *
 * Sale del perfil **con el escenario aplicado**, no de una lista: en una cancelación el pedido no
 * salió y en una demora no hay producto en juego, y las dos son escenarios, no motivos.
 */
export function puedeVolverLaPrenda(motivo: MotivoReclamo, escenario: string | null | undefined): boolean {
  const p = perfilDe(motivo, escenario)
  return p.salio && p.productoEnJuego && motivo !== 'no_llego'
}

/** El destino de el producto queda determinado por el motivo, salvo en la falla. */
export function destinoDe(motivo: MotivoReclamo, vuelve: boolean, escenario: string | null | undefined): DestinoPrenda | null {
  // 🔑 Devuelve `null` cuando no hay producto en juego (demora), y eso NO es un caso sin resolver:
  // es que no hay nada que decidir. El destino nulo es lo que deja cerrar una demora.
  if (!productoEnJuego(motivo, escenario)) return null
  // ⚠️ Sale del PERFIL y no de `NUNCA_SALIO` a propósito, aunque hoy las dos formas den lo mismo:
  // el único escenario que mueve `salio` es la cancelación, y esa ya salió por el `return null` de
  // arriba. O sea que **el mutante que lo vuelve a la lista de motivos sobrevive** — y se deja así
  // igual, porque el día que un escenario mueva `salio` sin apagar el producto, la lista contesta
  // mal y nadie lo va a ver.
  if (!perfilDe(motivo, escenario).salio) return 'no_salio'
  if (motivo === 'no_llego') return 'perdida'
  if (motivo === 'falla') return 'falla'
  // ⚠️ En el excedente `'falla'` NO significa que esté fallado: significa que la unidad sale del
  // stock con una venta técnica porque el cliente se la queda. La partición sano → cliente RECLAMO
  // / fallado → cliente FALLA está decidida pero **todavía no se puede construir**: falta que
  // exista el cliente RECLAMO en Gestión Nube, uno por marca.
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

// ── El descuento para que se lo quede ───────────────────────────────────────────

export type CuentaDescuento = {
  /** Hasta acá se puede ofrecer sin perder plata respecto de pedirlo de vuelta. */
  techo: number
  /** Lo que conviene ofrecer primero: deja margen para negociar. */
  sugerido: number
  /** Lo que se pierde si el producto vuelve, en positivo. */
  seePierdeSiVuelve: number
  /** Cuando el techo supera el precio: regalarlo sale más barato que pedirlo. */
  convieneRegalar: boolean
  motivo: string
}

/** Del techo, lo que se ofrece primero. El resto queda como margen de negociación. */
const FRACCION_SUGERIDA = 0.5

/**
 * Qué tan rota está. Es lo que decide **qué se le puede ofrecer** para que se la quede.
 *
 * La cuenta de la retención necesita el PVP de feria —lo único que se recupera de un producto
 * fallado— y hasta ahora se tipeaba a mano, sin ninguna referencia. Clasificar la falla da un punto
 * de partida: una a la que se le salió un botón se arregla y se vende casi como nueva, así que se
 * pierde poco si vuelve y con una oferta chica alcanza. Una manchada no se recupera, el techo sube,
 * y ahí conviene regalarla o devolver la plata entera.
 */
export type GravedadFalla = 'util' | 'inutil'

export const GRAVEDAD_DEF: Record<GravedadFalla, { label: string; ayuda: string; fraccionFeria: number }> = {
  util: {
    label: 'Se puede usar',
    ayuda: 'Se arregla y se usa: se le salió un botón, una costura chica, un hilo suelto.',
    fraccionFeria: 0.6,
  },
  inutil: {
    label: 'No se recupera',
    ayuda: 'Mancha grande, rotura, falla estructural. En feria sale por poco y nada.',
    fraccionFeria: 0.2,
  },
}

/**
 * Un PVP de feria de arranque según la gravedad. **Es una sugerencia, no un precio**: se ajusta a
 * mano si el producto lo amerita. Lo que evita es tener que inventar el número desde cero.
 */
export function pvpFeriaSugerido(items: ItemReclamo[], gravedad: GravedadFalla): number {
  const unidades = items.reduce((s, it) => s + positivo(it.cantidad), 0) || 1
  const lista = items.reduce((s, it) => s + positivo(it.precio) * positivo(it.cantidad), 0)
  if (lista <= 0) return 0
  return Math.round((lista / unidades) * GRAVEDAD_DEF[gravedad].fraccionFeria)
}

/**
 * Cuánto se le puede descontar al cliente para que se quede el producto, en vez de que vuelva.
 *
 * **La regla: el descuento máximo es lo que perdés porque vuelva.** Y eso cambia radicalmente
 * según en qué estado vuelve, que es lo que hace que un techo único sea caro:
 *
 *   - **Sana** (arrepentimiento, no era lo que esperaba): vuelve al stock y se revende a precio
 *     completo. Lo único que perdés es la logística → `techo = envío de vuelta`.
 *   - **Fallada**: NO se revende como nuevo, va a feria. Perdés el envío **y** la diferencia entre
 *     lo que vale nueva y lo que vas a sacar en feria → `techo = precio − PVP feria + envío`.
 *
 * El caso real de BDI que justifica esto: funda de $12.000, PVP feria $3.500, envío $6.000. Si
 * vuelve, se termina $2.500 en rojo; el techo da $14.500, o sea **más que el precio**: regalarlo
 * sale más barato que pedirlo. Con un techo del envío se perdían ~$8.500 por unidad.
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
      (convieneRegalar ? ' Es más que el precio: regalarlo sale más barato que pedirlo.' : '')
    : `Vuelve sano y se revende a precio completo, así que lo único que perdés es ${seePierdeSiVuelve} de logística.`

  return { techo, sugerido, seePierdeSiVuelve, convieneRegalar, motivo }
}

/**
 * Qué nos costó el caso. Sin esto no se puede responder después "cuánto nos costaron las
 * devoluciones este mes" ni con qué proveedor se van en fallas.
 *
 * La unidad perdida se valúa **a costo**: es lo que se fue por la puerta cuando el producto se le
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
  // Solo se pierde la unidad si el cliente se lo queda; si vuelve —sana o fallada— se recupera.
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
  /**
   * **El escenario**: cuál de las respuestas cerradas del caso se encontró. Es el nivel del medio
   * del chasis, y en tres casos **determina la plata** (ver `lib/reclamos/casos.core.js`).
   *
   * Null en las filas anteriores al 25-ago-2026 y en las que todavía no se miró: el perfil cae
   * entonces en el default del caso, que es siempre el que NO regala plata.
   */
  escenario?: string | null
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
  /** Cómo vuelve. Null si no vuelve (se lo queda el cliente) o si todavía no se decidió. */
  via_retorno?: ViaRetorno | null
  /**
   * El envío de VUELTA. En un reclamo común es siempre a nuestro cargo; en un **cambio** puede
   * pagarlo el cliente, y por eso existe `envio_paga`.
   */
  envio_costo?: number | null
  /** Quién paga el envío. Solo tiene sentido en un cambio; en el resto es siempre nuestro. */
  envio_paga?: EnvioPaga | null
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
  /**
   * ⚠️ **La columna se llama `tn_stock_estado` por historia, pero ya no tiene que ver con Tienda
   * Nube**: hoy es la traza de haber dado de baja **en Gestión Nube** la unidad que no existe.
   *
   * Escribir el stock en TN no servía para nada: TN está conectada a GN y **el stock de GN pisa el
   * de TN** en la próxima sincronización, así que la corrección se deshacía sola. Lo que sí hace
   * falta es bajar la unidad fantasma en GN —GN cree que hay 0 porque descontó la venta, pero esa
   * unidad no existe, y al sacar el producto de la venta va a devolver +1— y de TN se encarga la
   * sincronización.
   *
   * Se reusó la columna en vez de migrar porque sólo se enciende en `sin_stock` y significaba
   * exactamente el mismo paso del mismo caso.
   */
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
  /**
   * El cobro del cambio, en dos tiempos. `pagado` es el **gate** para generar la venta en GN: se
   * marca cuando el cliente puso la plata, y recién entonces se puede facturar. Sin esta separación
   * el cambio se armaba y se cobraba en el mismo gesto, que no es lo que pasa en el mostrador.
   */
  pagado?: boolean | null
  /** El pendiente de caja: la diferencia quedó a cobrar y todavía no entró. */
  cobro_estado?: CobroEstado | null
  /**
   * El producto que el cliente devuelve en un cambio vuelve al stock **a mano** en GN (la API no
   * acepta una venta negativa). No confundir con `stock_estado`, que traza la ANULACIÓN de la venta
   * original: en un cambio esa venta no se anula nunca, porque el cliente se queda con la compra y
   * solo cambia el artículo.
   */
  reingreso_estado?: PendienteEstado | null
  /**
   * Lo que sale HACIA el cliente: el cambio, la reposición y el reenvío. Se tilda cuando el paquete
   * se despachó de verdad.
   *
   * ⚠️ No lo cubría nada. En el cambio existe `solicitud_envio`, pero eso es el requisito para
   * **facturar** — se puede facturar y no despachar nunca, y el reclamo cerraba igual. En la
   * reposición y el reenvío no había ni eso: el envío era un cartel en pantalla.
   */
  envio_nuevo_estado?: PendienteEstado | null
  /** La solicitud de etiqueta (EM####) del envío del cambio. Se guarda SIN el prefijo. */
  solicitud_envio?: string | null
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
 *     una sola producto. **No descuenta.**
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

/** Cuántos días hace. **Nunca negativo**: un reloj corrido no puede mostrar "-2 días". */
export const diasDesde = (iso?: string | null, ahora = Date.now()): number => {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return isFinite(t) ? Math.max(0, Math.floor((ahora - t) / 86400000)) : 0
}

/**
 * Desde cuándo la fila está en ese estado, según el **historial** y no según `updated_at`.
 *
 * 🔴 No es cosmético: `updated_at` lo pisa **cualquier** acción sobre el reclamo. Cargarle el
 * código de seguimiento a un paquete que hace veinte días que no llega ponía el contador en cero
 * y **la alerta desaparecía justo cuando alguien se estaba ocupando** — el toque más probable
 * sobre un retorno que se demora es, precisamente, ir a ver por qué se demora.
 *
 * ⚠️ El `estado` de un evento del historial es de qué se trata el evento, y no siempre coincide
 * con el estado en que quedó la fila: tildar la plata apila un evento `resuelto` sin mover la
 * fila. Para `en_transito` los dos que lo escriben —`decidir` y `procesar`— sí mueven la fila. En
 * `recibido` el evento lo apila también `reingreso`, que pasa minutos después de recibirlo: para
 * contar días da lo mismo, y es el único uso.
 */
export function desdeQueEsta(d: Pick<ReclamoRow, 'historial' | 'updated_at' | 'created_at'>, estado: EstadoReclamo): string | null {
  const eventos = Array.isArray(d.historial) ? d.historial : []
  for (let i = eventos.length - 1; i >= 0; i--) {
    if (eventos[i]?.estado === estado && eventos[i]?.at) return eventos[i].at
  }
  // Sin historial (filas viejas) queda el último toque: peor, pero nunca cero.
  return d.updated_at || d.created_at || null
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
  // ⚠️ Ésta NO cuenta desde el último toque sino desde que el producto salió de vuelta
  // (`desdeQueEsta`): editar el reclamo mientras se espera no puede reiniciar la espera.
  const enCamino = diasDesde(desdeQueEsta(d, 'en_transito'), ahora)
  if (d.estado === 'en_transito' && enCamino >= DIAS_ALERTA.transito) {
    alertas.push({ tono: 'warning', texto: `Hace ${enCamino} días que no llega`, dias: enCamino })
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

/**
 * `R-0042`. **Un solo prefijo para todo el post-venta**, cambios incluidos.
 *
 * Antes convivían `D-` (de cuando la sección se llamaba Devoluciones) y `C-` (de Cambios). Ninguna
 * de las dos nombra lo que esto es hoy, y con dos prefijos Administración tiene que seguir dos
 * colas para lo mismo. Se unificó aprovechando que las tablas estaban vacías: después son mensajes
 * ya mandados a clientes.
 */
export function numeroReclamo(id: number): string {
  return 'R-' + String(id).padStart(4, '0')
}

/**
 * ¿Venció el link del cliente?
 *
 * El portal rechaza un token vencido con el mismo 404 que usa para uno inválido, así que del lado
 * del cliente "venció" y "no existe" se ven idénticos. Conviene chequearlo antes de copiar el
 * mensaje y regenerarlo en el acto, en vez de mandarle un link muerto.
 *
 * Sin fecha devuelve `false`: los reclamos viejos no tienen `token_vence` y no hay que tratarlos
 * como vencidos.
 */
export function tokenVencido(vence: string | null | undefined): boolean {
  if (!vence) return false
  const t = Date.parse(vence)
  return Number.isFinite(t) && t < Date.now()
}

/**
 * Qué falta para poder cerrar el reclamo. Devuelve la lista en criollo: si no está vacía, el
 * botón de cerrar va deshabilitado con esto como explicación.
 *
 * ⚠️ **Un cambio no cierra con las mismas condiciones que una devolución**, y esta es la
 * distinción que hay que tener a la vista:
 *   - La venta original **no se anula**: el cliente se queda con la compra y solo cambia el
 *     artículo. Exigir la anulación dejaba todo cambio trabado para siempre.
 *   - **No hay plata que devolver** salvo que la diferencia haya quedado a favor del cliente.
 *   - Lo que sí hay, y no existía como pendiente, es **reingresar a mano** el producto que volvió.
 */
/**
 * La tabla de efectos: qué movimientos deja cada resolución.
 *
 * ⚠️ **La lógica no vive acá: vive en `lib/reclamos/efectos.core.js`**, en JS plano, porque la
 * necesita `api/_reclamos.js` y los handlers no pueden importar TypeScript. Es el mismo arreglo que
 * `lib/permisos.ts` / `lib/permisos.core.js`, y por la misma razón: cuando la regla se copia, las
 * copias se despegan. Acá sólo se le ponen los tipos.
 *
 * `pendientesDe` es la contracara de `faltantesParaCerrar`: una **deriva** los pendientes al
 * decidir, la otra **lee** los que quedaron para decir qué falta. Nadie más los deriva.
 */
export type EfectosResolucion = {
  plata: string
  anulaVenta: string
  reingreso: string
  cobro: string
  envioNuevo: string
  ayuda: string
}

export const EFECTOS_RESOLUCION = EFECTOS_RESOLUCION_JS as Record<Compensacion, EfectosResolucion>

export type PendientesDerivados = {
  reintegro_estado: PendienteEstado
  stock_estado: PendienteEstado
  reingreso_estado: PendienteEstado
  cobro_estado: PendienteEstado
  envio_nuevo_estado: PendienteEstado
}

/** Los pendientes que deja una decisión. Es lo que `decidir` guarda en la fila. */
export function pendientesDe(opciones: {
  compensacion: Compensacion
  diferencia?: number | null
}): PendientesDerivados {
  return pendientesDeJs(opciones) as PendientesDerivados
}

/** ¿Esta resolución manda algo al cliente? Son el cambio, la reposición y el reenvío. */
export function saleUnEnvio(compensacion: Compensacion): boolean {
  return saleUnEnvioJs(compensacion)
}

export function estaDecidido(d: ReclamoRow): boolean {
  return !!d.compensacion
}

export function faltantesParaCerrar(d: ReclamoRow): string[] {
  const faltan: string[] = []
  const cambio = esCambio(d)

  // Mientras no haya decisión, el único pendiente real es decidir. Los de plata y stock salen de
  // la decisión, así que antes de tenerla no se sabe si van a existir — y en la mitad de los casos
  // no existen. Antes nacían en 'pendiente' y la fila mostraba "anular la venta original en
  // Gestión Nube · devolver la plata" desde el minuto cero: pendientes inventados, que es la forma
  // más rápida de que la gente aprenda a no mirar la columna.
  if (!estaDecidido(d) && d.estado !== 'anulado') {
    // 🔑 Hay un escenario en que todavía NO hay nada que decidir: el pedido sigue viajando. Decir
    // "decidir qué se hace" ahí es pedir que alguien resuelva un caso que todavía no existe —
    // hasta el 25-ago-2026 un `no_llego` se daba por perdido desde el minuto cero.
    faltan.push(esSoloSeguimiento(d.motivo, d.escenario)
      ? 'seguir el envío: el caso se abre cuando se dé por extraviado'
      : 'decidir qué se hace')
    // El reclamo al transportista corre en paralelo y no espera a nadie: es plata recuperable y si
    // el reclamo se cierra sin presentarlo, se perdió.
    if (d.reclamo_correo_estado === 'pendiente') faltan.push('presentar el reclamo al transportista')
    if (d.tn_stock_estado === 'pendiente') faltan.push('dar de baja el producto en Gestión Nube')
    return faltan
  }

  if (cambio) {
    if (d.reingreso_estado === 'pendiente') faltan.push('reingresar en Gestión Nube el producto devuelto')
    if (d.cobro_estado === 'pendiente') faltan.push('cobrar la diferencia')
    // Solo cuando la cuenta quedó a favor del cliente sale plata de la caja.
    if (d.reintegro_estado === 'pendiente' && (d.diferencia ?? 0) < 0) faltan.push('devolverle la diferencia')
  } else {
    if (d.stock_estado === 'pendiente') faltan.push('anular la venta original en Gestión Nube')
    if (d.reintegro_estado === 'pendiente') faltan.push('devolver la plata')
  }

  if (d.tn_stock_estado === 'pendiente') faltan.push('dar de baja el producto en Gestión Nube')
  // Lo que sale hacia el cliente. Va acá y no adentro del `if (cambio)` porque las tres
  // resoluciones que mandan algo —cambio, reposición, reenvío— tienen el mismo pendiente.
  if (d.envio_nuevo_estado === 'pendiente') faltan.push('despachar lo que se le manda')
  // Plata recuperable: si el reclamo se cierra sin esto, esa plata se perdió y nadie se entera.
  if (d.reclamo_correo_estado === 'pendiente') faltan.push('presentar el reclamo al transportista')
  if (d.destino_prenda === 'stock' && d.estado !== 'recibido' && d.estado !== 'cerrado') faltan.push('recibir el producto')
  // Cuando el producto se le queda al cliente, la foto es la única prueba de que la falla existió.
  if (d.destino_prenda === 'falla' && !(d.fotos || []).length) faltan.push('al menos una foto del producto')
  return faltan
}

// ── El POS del cambio ───────────────────────────────────────────────────────────

/**
 * Qué falta para poder **generar la venta** del cambio en Gestión Nube. Es el gate del botón
 * "Crear venta": mientras devuelva algo, no se factura.
 *
 * Portado de `faltantesParaVenta` del motor viejo. Deliberadamente **no exige nada para guardar el
 * borrador**: el cambio se arma en dos tiempos y a medio hacer tiene que poder guardarse.
 */
export function faltantesParaProcesar(d: {
  orden_tn?: string | null
  items?: ItemReclamo[]
  items_nuevos?: ItemReclamo[]
  forma_pago?: FormaPago | null
  via_retorno?: ViaRetorno | null
  envio_paga?: EnvioPaga | null
  solicitud_envio?: string | null
}): string[] {
  const faltan: string[] = []
  if (!d.orden_tn) faltan.push('la orden de venta asociada')
  if (!(d.items || []).length) faltan.push('el producto que devuelve')
  // Sin los ids de GN no se puede descontar stock: un nombre suelto no alcanza.
  if (!(d.items_nuevos || []).some((i) => i.product_id && i.size_id)) faltan.push('el producto que se lleva (de Gestión Nube)')
  if (!d.forma_pago) faltan.push('la forma de pago')
  if (!d.via_retorno) faltan.push('la vía de envío')
  if (!d.envio_paga) faltan.push('quién paga el envío')
  // La solicitud de etiqueta es del envío manual: la cadetería y el mostrador no la tienen.
  if (pideSeguimiento(d.via_retorno) && !d.solicitud_envio) faltan.push('la solicitud de envío (EM)')
  return faltan
}

/**
 * La solicitud de envío guarda **solo el número**: el `EM` es fijo y lo pone la pantalla.
 *
 * Antes se guardaba lo que la persona tipeara, `EM` incluido, y al armar la nota del pedido en GN
 * se le anteponía otro `EM ` — así que en Gestión Nube salía `EM EM1234`. Estas dos funciones son
 * el único lugar donde se decide el formato.
 */
export function numeroEM(v: string | null | undefined): string {
  return String(v || '').trim().replace(/^em[\s-]*/i, '')
}

/** Cómo se muestra: `EM 1234`. Lo que no tiene número se muestra tal cual. */
export function etiquetaEM(v: string | null | undefined): string {
  const raw = String(v || '').trim()
  if (!raw) return ''
  const n = numeroEM(raw)
  return n && /\d/.test(n) ? `EM ${n}` : raw
}

/** Link al seguimiento con el código. Andreani es un portal y no lo toma por URL. */
export function trackingUrl(via: ViaRetorno | null | undefined, codigo: string): string | null {
  const c = (codigo || '').trim()
  if (!c) return null
  if (via === 'andreani') return 'https://www.andreani.com/?tab=seguir-envio'
  if (via === 'correo') return `https://www.correoargentino.com.ar/formularios/e-commerce?id=${encodeURIComponent(c)}`
  return null
}

/** El portal de seguimiento, sin código: para el link que va al lado del campo. */
export function trackingPortalUrl(via: ViaRetorno | null | undefined): string | null {
  if (via === 'andreani') return 'https://www.andreani.com/?tab=seguir-envio'
  if (via === 'correo') return 'https://www.correoargentino.com.ar/formularios/e-commerce?id='
  return null
}

/**
 * Reparte lo que se pegó en el campo de seguimiento: un código va a la ida; dos, el primero a la
 * ida y el segundo a la vuelta. Es para poder pegar los dos de una en vez de abrir dos veces.
 */
export function repartirSeguimiento(entrada: string): { ida: string | null; vuelta: string | null } {
  const parts = (entrada || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return { ida: null, vuelta: null }
  if (parts.length === 1) return { ida: parts[0], vuelta: null }
  return { ida: parts[0], vuelta: parts[1] }
}

/**
 * El detalle del cambio para pasarle al cliente por WhatsApp: la cuenta itemizada, cada concepto
 * con su monto. Es el mismo ticket que muestra la pantalla, en texto — así nadie tiene que
 * transcribirlo a mano y prometer un número distinto del que quedó guardado.
 */
export function detalleCambioTexto(d: {
  id?: number | null
  cliente?: string | null
  items?: ItemReclamo[]
  items_nuevos?: ItemReclamo[]
  orden?: OrdenTN | null
  forma_pago?: FormaPago | null
  via_retorno?: ViaRetorno | null
  envio_costo?: number | null
  envio_paga?: EnvioPaga | null
  descuento_manual?: number | null
  seguimiento_ida?: string | null
  seguimiento_vuelta?: string | null
}): string {
  // `toLocaleString('es-AR')` mete un espacio DURO (U+00A0) antes del símbolo, y esto se pega en
  // WhatsApp: se normaliza a un espacio común.
  const money = (n: number) => n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).replace(/ /g, ' ')
  const devueltos = d.items || []
  const nuevos = d.items_nuevos || []
  const t = calcularCambio({
    devueltos, nuevos, orden: d.orden, formaPago: d.forma_pago,
    descuentoManual: d.descuento_manual, envioCosto: d.envio_costo, envioPaga: d.envio_paga,
  })
  const linea = (i: ItemReclamo, monto: number) =>
    `• ${i.cantidad}× ${i.producto}${i.variante ? ` (${i.variante})` : ''} — ${money(monto)}`

  const out: string[] = [`*CAMBIO ${d.id ? numeroReclamo(d.id) : 'nuevo'}*${d.cliente ? ` · ${d.cliente}` : ''}`]
  if (devueltos.length) {
    out.push('Devolvés:')
    devueltos.forEach((i) => out.push(linea(i, i.pagado ?? pagadoPorItem(i, d.orden))))
  }
  if (nuevos.length) {
    out.push('Te llevás:')
    nuevos.forEach((i) => out.push(linea(i, (Number(i.precio) || 0) * (Number(i.cantidad) || 1))))
  }
  out.push('———')
  out.push(`Subtotal productos: ${money(t.diferencia)}`)
  if (d.forma_pago && t.descuentoForma > 0) {
    out.push(`Descuento ${FORMA_PAGO_DEF[d.forma_pago].label} (−${FORMA_PAGO_DEF[d.forma_pago].descuento}%): −${money(t.descuentoForma)}`)
  }
  if (t.descuentoManual > 0) out.push(`Descuento: −${money(t.descuentoManual)}`)
  out.push(`Total productos: ${money(t.diferencia - t.descuento)}`)
  if (t.envioACobrar > 0) out.push(`Envío${d.via_retorno ? ` (${VIA_LABEL[d.via_retorno]})` : ''}: ${money(t.envioACobrar)}`)
  out.push(t.total < 0 ? `*Se te devuelven: ${money(Math.abs(t.total))}*` : `*Total a pagar: ${money(t.total)}*`)
  if (d.seguimiento_ida) out.push(`Seguimiento ida: ${d.seguimiento_ida}`)
  if (d.seguimiento_vuelta) out.push(`Seguimiento vuelta: ${d.seguimiento_vuelta}`)
  return out.join('\n')
}
