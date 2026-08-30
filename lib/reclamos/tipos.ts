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
  loEjecutado as loEjecutadoJs,
  pendientesDe as pendientesDeJs,
  saleUnEnvio as saleUnEnvioJs,
  seAnulaLaVenta as seAnulaLaVentaJs,
  faltaAnularAntesDeDescontar as faltaAnularAntesDeDescontarJs,
  faltaRecibirAntesDeDevolver as faltaRecibirAntesDeDevolverJs,
} from './efectos.core.js'
import {
  CASOS as CASOS_JS,
  PERFIL_MOTIVO as PERFIL_MOTIVO_JS,
  casoDe as casoDeJs,
  escenarioDe as escenarioDeJs,
  destinoDe as destinoDeJs,
  destinosDe as destinosDeJs,
  escenariosDe as escenariosDeJs,
  esEscenarioDe as esEscenarioDeJs,
  esSoloSeguimiento as esSoloSeguimientoJs,
  ESTADOS_ABIERTOS as ESTADOS_ABIERTOS_JS,
  estaAbierto as estaAbiertoJs,
  faltantesParaCerrar as faltantesParaCerrarJs,
  ofreceRetencion as ofreceRetencionJs,
  perfilDe as perfilDeJs,
  FORMAS_RETENCION as FORMAS_RETENCION_JS,
  registroDeRetencion as registroDeRetencionJs,
  ofertaEsperandoRespuesta as ofertaEsperandoRespuestaJs,
  salidaAlAceptarRetencion as salidaAlAceptarRetencionJs,
  camposAlContestarLaOferta as camposAlContestarLaOfertaJs,
  RESPUESTAS_RETENCION as RESPUESTAS_RETENCION_JS,
  pideReclamoAlTransportista as pideReclamoAlTransportistaJs,
  productoEnJuego as productoEnJuegoJs,
  reclasificaA as reclasificaAJs,
} from './casos.core.js'
import {
  costoDelCaso as costoDelCasoJs,
  costoDeLaFila as costoDeLaFilaJs,
  montoADevolver as montoADevolverJs,
  ENTRADAS_DEL_COSTO as ENTRADAS_DEL_COSTO_JS,
  positivo,
  redondear,
} from './plata.core.js'
import {
  anotarLaOtraVenta as anotarLaOtraVentaJs,
  aplicarDestinos as aplicarDestinosJs,
  deDondeVuelve as deDondeVuelveJs,
  descontarUnidades as descontarUnidadesJs,
  destinoDeUnidad as destinoDeUnidadJs,
  laUnidadVuelve as laUnidadVuelveJs,
  loQueFaltaDescontar as loQueFaltaDescontarJs,
  loQueFaltaLlegar as loQueFaltaLlegarJs,
  recibirUnidades as recibirUnidadesJs,
  sinLaOtraVenta as sinLaOtraVentaJs,
  trabaParaRecibir as trabaParaRecibirJs,
  unidadesQueVuelven as unidadesQueVuelvenJs,
} from './unidades.core.js'
import { MOMENTOS_DEL_MENSAJE as MOMENTOS_DEL_MENSAJE_JS, yaSeLeEscribio } from './mensajes.core.js'

/**
 * **Los momentos que se le pueden contar al cliente**, en runtime y tipados.
 *
 * La lista vive en `mensajes.core.js` porque la valida el handler, y `api/*.js` ⛔ no puede importar
 * TypeScript. Acá queda la cara tipada, igual que `EFECTOS_RESOLUCION` y `faltantesParaCerrar`.
 */
export type MomentoDelMensaje =
  | 'acuse' | 'pedir_fotos' | 'mas_fotos' | 'revisando' | 'propuesta' | 'resolucion'
  | 'etiqueta_en_camino' | 'etiqueta' | 'despacho_hecho' | 'retorno_recibido'
  | 'cupon_listo' | 'plata_enviada'
  | 'detalle_cambio'

export const MOMENTOS_DEL_MENSAJE = MOMENTOS_DEL_MENSAJE_JS as MomentoDelMensaje[]

/**
 * Cómo se llama cada momento **de cara a quien lee el reclamo**, ⛔ no la clave que se guarda.
 *
 * ⚠️ Dice *«se le copió»* y ⛔ no *«se le mandó»*: lo que el sistema vio fue el copiado. Que de ahí
 * vaya derecho a WhatsApp es la decisión que este módulo ya tomó (`Reclamos.tsx`, el mensaje de
 * apertura), pero el registro cuenta lo que efectivamente ocurrió de este lado.
 */
export const MOMENTO_MENSAJE_LABEL: Record<MomentoDelMensaje, string> = {
  acuse: 'Acuse: recibimos el reclamo',
  pedir_fotos: 'Apertura: el link para las fotos',
  mas_fotos: 'Le pedimos más fotos',
  revisando: 'Le avisamos que lo estamos revisando',
  propuesta: 'La propuesta de que se lo quede',
  resolucion: 'La resolución',
  etiqueta_en_camino: 'La etiqueta va en camino',
  etiqueta: 'La etiqueta, con su seguimiento',
  despacho_hecho: 'Ya le despachamos lo suyo',
  retorno_recibido: 'Le avisamos que nos llegó lo que devolvió',
  cupon_listo: 'El cupón, con su código',
  plata_enviada: 'La plata ya salió',
  detalle_cambio: 'El detalle del cambio',
}

/** Un mensaje que ya se le mandó al cliente: cuál, cuándo, quién y **con qué texto**. */
export type MensajeRegistrado = {
  tipo: MomentoDelMensaje
  at: string
  por?: string | null
  texto: string
}

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
/**
 * Dónde termina la unidad. 🔑 **`falla` y `regalada` son las dos mitades de un mismo destino que
 * hasta el 26-ago-2026 era uno solo**, y separarlas es lo que deja que el descuento de stock vaya
 * a dos clientes distintos de Gestión Nube:
 *
 *   - `falla`    → la unidad **es** una falla: ledger de Post-venta, valuada a PVP de feria, y su
 *                  venta técnica va al cliente FALLA.
 *   - `regalada` → la unidad está **sana** y se la queda el cliente: sale del stock con una venta
 *                  técnica al cliente RECLAMO, y ⛔ **no entra a Fallas**.
 *
 * Mientras fueron una sola, sacar del stock una unidad sana obligaba a darla de alta en Fallas, o
 * sea a afirmar dos cosas falsas sobre un producto impecable: que está fallado y que se va a
 * revender como tal.
 */
export type DestinoPrenda = 'stock' | 'falla' | 'regalada' | 'no_salio' | 'perdida'

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

/**
 * **Las que se ofrecen hoy.** ⛔ No es lo mismo que `VIA_LABEL`: el mapa tiene las cuatro para que
 * una fila vieja siga leyéndose, y esto es lo que se puede elegir de acá en adelante.
 *
 * 🔴 La revisión del 27-ago-2026 sacó **`cadete` y `presencial`**. 📊 Medido antes de sacarlas:
 * **0 filas** las usaban, en BDI y en Zattia, así que no hay nada viejo que se rompa.
 *
 * ⚠️ **Tiene una consecuencia y hay que saberla**: `presencial` era lo único que hacía que el
 * reclamo dijera *«Esperando que lo traiga»* en vez de inventar un envío (`hayEnvio`). Sin ella,
 * **todo retorno cuesta envío** y el que quiere acercarse al local se resuelve como cambio de
 * mostrador, fuera del circuito de retornos. El código de las dos vías sigue vivo: volver a
 * ofrecerlas es agregarlas a esta lista.
 */
export const VIAS_VIGENTES: ViaRetorno[] = ['correo', 'andreani']

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

/**
 * 🔴 **Éste ⛔ NO es sólo presentación, al revés que `DESTINO_LABEL`.** Dos cadenas se escriben
 * literales y quedan fuera de este repo:
 *
 *   1. **Viaja a Gestión Nube** — `nota.ts` arma `Motivo: …` y sale como `comments` de la venta
 *      técnica ⇒ queda en el sistema contable.
 *   2. **Queda en el `historial`** de la fila, al reclasificar.
 *
 * ⇒ Renombrar ⛔ no toca lo ya escrito: las notas viejas conservan el rótulo viejo, y eso es
 * aceptable pero hay que saberlo. Los de hoy salieron de la revisión del 27-ago-2026: se acortaron
 * para que la columna de la tabla se lea de un vistazo («Demoras», «Faltante», «Talle») y ⛔ no para
 * cambiar lo que significan.
 */
export const MOTIVO_LABEL: Record<MotivoReclamo, string> = {
  arrepentimiento: 'Arrepentimiento',
  no_esperaba: 'No era lo que esperaba',
  talle: 'Talle',
  no_como_publicado: 'No es como en la publicación',
  falla: 'Fallado',
  faltante: 'Faltante',
  mal_armado: 'Mal armado',
  excedente: 'Excedente en el pedido',
  demora: 'Demoras',
  no_llego: 'No recibido',
  sin_stock: 'Sin stock',
  no_era_lo_esperado: 'No era lo que esperaba', // histórico
  // Catch-all histórico, y hoy también lo que se guarda cuando un cambio va SIN motivo:
  // cambiar es un derecho del comprador y no hace falta justificarlo.
  otro: 'Sin motivo',
}

/**
 * Los casos que se pintan en ROJO en la lista.
 *
 * 🔑 **Uno solo, y no es cosmético**: `sin_stock` es el único caso del repertorio que ⛔ no lo trae
 * el cliente ni el transporte — **le vendimos algo que no teníamos**. Los otros diez son cosas que
 * pasan; éste es un error nuestro, evitable, y la lista lo enterraba entre los demás.
 *
 * ⚠️ Va acá y ⛔ no en el JSX para que la pantalla no tenga que saber cuál es el caso feo, que es
 * como dos pantallas del mismo módulo terminan pintando cosas distintas.
 */
export const MOTIVOS_EN_ROJO: MotivoReclamo[] = ['sin_stock']

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
 * La foto sirve para **ver en qué estado vuelve el producto**, así que hace falta siempre que el
 * producto vuelva — y sólo el motivo dice si vuelve algo o no hay nada que fotografiar.
 *
 * 🔴 **Corregido el 27-ago-2026 por Bruno**: *«la de que quiere cambiar la prenda, si es con envío,
 * sí necesitamos fotos para ver el estado de la prenda»*. Hasta ese día, querer un cambio
 * (`otro_producto` / `mismo_producto`) **apagaba** el pedido de fotos, con la premisa escrita
 * *«si lo quiere cambiar, lo trae al mostrador y se ve ahí»*. La premisa es falsa acá: **por esta
 * lista entran órdenes ONLINE**, o sea que la prenda viaja igual, y el cambio de mostrador —donde
 * sí se ve en persona— se arma en la pestaña Cambios y ⛔ nunca pasa por esta función. Con la
 * premisa puesta, el único caso en que la prenda vuelve **sin que nadie la haya visto** era
 * justamente el cambio.
 *
 * ⚠️ Por eso `si_quiere_plata` quedó **equivalente a `siempre`** y se deja como estaba a propósito:
 * la distinción vuelve a tener sentido el día que exista *«la trae al local»*, y ese día se decide
 * **por la VÍA del retorno, ⛔ no por la expectativa** — que es el dato que no dice si viaja.
 */
export function pideFotos(m: MotivoReclamo, _expectativa?: Expectativa | null): boolean {
  return PERFIL_MOTIVO[m].fotos !== 'nunca'
}

/**
 * **Qué productos vienen tildados al abrir un reclamo.**
 *
 * 🔴 Hasta el 27-ago-2026 venía **todo tildado, siempre**, con la regla «casi siempre se devuelve
 * todo». Es cierta cuando la orden tiene un producto y deja de serlo apenas tiene dos: ahí el
 * default convierte **«no leí la lista» en «el cliente devuelve las dos cosas»**, y eso después se
 * paga o se anula en Gestión Nube.
 *
 * ⚠️ Con **uno** viene tildado: no hay nada que elegir, y dejarlo vacío sería un paso obligatorio
 * con una sola respuesta posible.
 *
 * ⚠️ ⛔ No aplica a los casos de venta completa (`sobreLaVentaCompleta`): ahí la selección los toma
 * todos igual y los tildes están bloqueados.
 */
export function preseleccionDelAlta(cuantosProductos: number): number[] {
  return cuantosProductos === 1 ? [0] : []
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
  // La regla vive en `casos.core.js`: la lee también `api/_reclamos.js`, que es el que valida que
  // una oferta registrada corresponda al caso. Acá quedó sólo la cara tipada.
  return ofreceRetencionJs(m, escenario)
}

/** Qué contestó a la oferta de quedárselo. ⚠️ Ausente ⛔ no es "no se le ofreció": es sin registrar. */
export type RespuestaRetencion = 'acepto' | 'rechazo'

export const RESPUESTAS_RETENCION = RESPUESTAS_RETENCION_JS as Record<RespuestaRetencion, string>

/**
 * **En qué se le ofrece que se lo quede.** Las dos cuestan cosas distintas: la plata sale de la
 * caja **hoy**; el cupón sale **sólo si el cliente vuelve a comprar**. ⚠️ Ausente ⛔ no es «fue
 * plata»: es **sin registrar**.
 */
export type FormaRetencion = 'plata' | 'cupon'

export const FORMAS_RETENCION = FORMAS_RETENCION_JS as Record<FormaRetencion, string>

/**
 * En qué termina el reclamo cuando acepta quedárselo. 🔴 De la resolución cuelga
 * `EFECTOS_RESOLUCION`, y `cupon` es la única que deja el pendiente de **crearlo en la tienda**.
 */
export function salidaAlAceptarRetencion(forma: FormaRetencion): Compensacion {
  return salidaAlAceptarRetencionJs(forma) as Compensacion
}

/**
 * Lo que se guarda de la oferta de retención, ya validado.
 *
 * Los datos son **obligatorios** aunque varios puedan valer `null` — mismo motivo que el
 * escenario: un llamador al que le falta uno no puede terminar guardando media oferta sin
 * enterarse. Media oferta es lo que después hace que la cuenta de cuántas veces funciona mienta.
 *
 * 🔴 **Una oferta SIN respuesta ya no es un error**: es el estado «se la mandamos y no contestó».
 * La regla entera —y por qué— está en `casos.core.js`.
 *
 * ⚠️ `ahora: null` = **sólo estoy validando** (es lo que manda la pantalla). Quien va a ESCRIBIR
 * manda su fecha, y la de una oferta que ya estaba esperando ⛔ no se reescribe.
 */
export function registroDeRetencion(o: {
  motivo: MotivoReclamo
  escenario: string | null
  respuesta: RespuestaRetencion | null
  monto: number | null
  forma: FormaRetencion | null
  retornoDecidido: boolean
  /** La que ya tiene la fila, si la oferta se registró antes. */
  retencionAt: string | null
  /** ISO de ahora si se va a escribir; `null` si sólo se está validando. */
  ahora: string | null
}): { error?: string; campos?: CamposRetencion } {
  // `campos` vacío = no hay nada que registrar y ⛔ no se toca lo ya guardado.
  return registroDeRetencionJs(o) as { error?: string; campos?: CamposRetencion }
}

/** ¿Hay una oferta hecha esperando que el cliente conteste? La regla vive en el núcleo. */
export function ofertaEsperandoRespuesta(
  d: Pick<ReclamoRow, 'retencion_monto' | 'retencion_respuesta'>,
): boolean {
  return ofertaEsperandoRespuestaJs(d)
}

type CamposRetencion = {
  /** `null` = la oferta está hecha y **esperando**. Ausente = no se toca lo que hubiera. */
  retencion_respuesta?: RespuestaRetencion | null
  retencion_monto?: number
  retencion_forma?: FormaRetencion
  retencion_at?: string
}

/** ¿Decide el cliente en vez de nosotros? Hoy sólo en `sin_stock`, que es el caso raro. */
export function decideElCliente(m: MotivoReclamo): boolean {
  return PERFIL_MOTIVO[m].decideCliente
}

// ── Qué falta para poder decidir ────────────────────────────────────────────────

/** Los tres momentos de la decisión, que son las tres pestañas de la pantalla. */
export type PasoDecision = 'que-paso' | 'producto' | 'cliente'

export const PASO_LABEL: Record<PasoDecision, string> = {
  'que-paso': 'Qué pasó',
  producto: 'El producto',
  cliente: 'El cliente',
}

/**
 * **El orden de los tres pasos**, que ⛔ no es alfabético ni casual: cada uno usa números que se
 * cargaron en el anterior.
 *
 * 🔑 Vive acá porque lo leen **dos lugares** —la pantalla, para las pestañas y para saber dónde
 * abrir, y `botonDecidir`, para contar cuántos hay hechos—. Escrito dos veces sería el modo de
 * falla propio de este módulo: la misma decisión en dos lados, y un día uno cambia y el otro no.
 */
export const PASOS_DECISION: PasoDecision[] = ['que-paso', 'producto', 'cliente']

export type FaltaDecision = {
  paso: PasoDecision
  /** En criollo, para ponerlo en pantalla tal cual: "la salida", "el envío de vuelta". */
  que: string
  /** `true` = el servidor lo rechaza, así que no tiene sentido ni intentar guardar. */
  bloquea: boolean
}

/**
 * **Qué falta para poder decidir, y en qué paso está.**
 *
 * Vive acá y no en la pantalla por lo mismo que el resto del módulo: es una regla, y una regla
 * que vive en el JSX no se puede probar sin montar un modal con un portal adentro.
 *
 * 🔑 **⛔ NO es la lista de obligatorios del servidor.** De los dos que exige `api/_reclamos.js`
 * —la compensación y el destino—, **el destino sigue siendo inalcanzable desde esta pantalla**:
 * `destinoDe` devuelve `null` sólo cuando no hay producto en juego, que es exactamente el caso
 * donde el servidor tampoco lo pide. Agregarlo acá sería un aviso que nadie puede ver nunca.
 *
 * ⚠️ La compensación **sí** se chequea, y es un cambio del 27-ago-2026: antes la pantalla caía en
 * `opciones[0]` y nunca quedaba vacía. Esa caída silenciosa convirtió dos reclamos reales en
 * cambios, así que ahora arranca sin elegir — y por eso hay que exigirla.
 *
 * Lo que sí puede faltar es otra cosa: **datos con los que las cuentas mienten**. Un PVP de feria
 * vacío deja a `cuentaDescuento` contestando techo 0 y a `convieneRetorno` contestando "no se sabe
 * cuánto se recupera" — dos veredictos con cara de veredicto que en realidad son "falta un dato".
 *
 * ⚠️ **Casi nada bloquea, a propósito.** Este módulo ya tuvo el defecto de exigir de más: hasta el
 * 25-ago-2026 se pedía siempre el destino y **una demora no se podía cerrar nunca**. Traban sólo
 * las dos cosas que dejan una fila incoherente: media oferta de retención y una devolución parcial
 * de $0. El resto avisa.
 */
export function faltantesDeLaDecision(o: {
  motivo: MotivoReclamo
  escenario: string | null
  /**
   * ⚠️ `''` = **sin elegir**, y desde el 27-ago-2026 es alcanzable: la pantalla dejó de
   * preseleccionar la primera del repertorio porque en varios casos esa primera —«lo cambia por
   * otro producto»— convertía el reclamo en un CAMBIO sin que nadie lo eligiera.
   */
  compensacion: Compensacion | ''
  /** ¿Se le pidió al cliente que lo devuelva? */
  retorno: boolean
  /**
   * Lo tipeado en "Envío de vuelta ($)": `''` = sin cargar, que ⛔ no es lo mismo que 0.
   *
   * ⚠️ Se pide en todo caso donde el producto **pueda** volver, no sólo cuando se pidió que
   * vuelva: el techo de la oferta es *"cuánto perderías SI volviera"*, así que sin este número la
   * caja de retención no puede contestar aunque al final el producto se lo quede el cliente.
   */
  envioVuelta: number | ''
  pvpFeria: number | ''
  montoAcordado: number | ''
  envioIda: number | ''
  /**
   * Lo tipeado en «Cuánto se le ofrece». `''` = **nadie lo tocó**, y ⛔ no es lo mismo que el número
   * que la calculadora muestra prellenado: ésa es toda la diferencia entre una oferta y una cuenta.
   */
  retencionMonto: number | ''
  retencionRespuesta: RespuestaRetencion | null
  retencionForma: FormaRetencion | null
  /** ¿Se afirmó que la oferta ya se le mandó al cliente, aunque todavía no haya contestado? */
  ofertaMandada: boolean
}): FaltaDecision[] {
  const faltas: FaltaDecision[] = []
  const cargado = (n: number | '') => n !== '' && Number(n) > 0

  // ① Qué pasó — el escenario no es obligatorio para el servidor, pero en tres de los once casos
  // es LO QUE DECIDE LA PLATA (ver docs/secciones/reclamos.md). Se avisa, no se traba.
  if (casoDe(o.motivo) && !o.escenario) {
    faltas.push({ paso: 'que-paso', que: 'contestar la pregunta que decide', bloquea: false })
  }

  // ② El producto
  const vuelve = puedeVolverLaPrenda(o.motivo, o.escenario)
  // Sin el PVP de feria las DOS cuentas de esta pestaña contestan cualquier cosa: el techo da 0 y
  // el "conviene pedirlo" da "no se sabe cuánto se recupera".
  if (o.motivo === 'falla' && productoEnJuego(o.motivo, o.escenario) && !cargado(o.pvpFeria)) {
    faltas.push({ paso: 'producto', que: 'el PVP de feria', bloquea: false })
  }
  // ⚠️ **Dice para qué es el número, ⛔ no cómo se llama la columna.** «El envío de vuelta» se lee
  // como si hubiera un envío que organizar, y en el caso normal —el cliente se lo queda— no lo hay:
  // lo que hace ese número es fijar **hasta cuánto se le puede ofrecer para que no vuelva**. Con el
  // rótulo viejo, un chip naranja permanente en una pestaña que nunca trabó nada se leía como un
  // impedimento (*«no puedo salir del envío»*, 27-ago-2026).
  if (vuelve && !cargado(o.envioVuelta)) {
    faltas.push({ paso: 'producto', que: 'cuánto saldría traerlo (define hasta cuánto podés ofrecerle)', bloquea: false })
  }
  // La oferta y su respuesta, con la regla del núcleo: acá sólo se le pregunta, así que ⛔ no
  // puede quedar desincronizada, y el texto que se muestra es el suyo.
  //
  // ⚠️ **Una oferta sin contestar ⛔ ya no traba** (27-ago-2026): «le ofrecí $13.491 y todavía no
  // sé qué dijo» es el estado más común del circuito y hasta hoy era un error de validación, así
  // que la decisión no se podía guardar hasta que el cliente contestara.
  //
  // `ahora: null` porque acá **⛔ no se escribe nada**: sólo se le pide el veredicto. La fecha de
  // la oferta la sella el handler.
  const oferta = registroDeRetencion({
    motivo: o.motivo,
    escenario: o.escenario,
    respuesta: o.retencionRespuesta,
    monto: o.retencionMonto === '' ? null : Number(o.retencionMonto),
    forma: o.retencionForma ?? null,
    retornoDecidido: o.retorno,
    retencionAt: null,
    ahora: null,
  })
  if (oferta.error) faltas.push({ paso: 'producto', que: oferta.error, bloquea: true })
  /**
   * 🔴 **Un monto tipeado que nadie afirmó se PERDÍA en silencio** (27-ago-2026, la noche del mismo
   * día). Bruno cargó los $13.491 de R-0022, apretó «Confirmar paso» y la pantalla guardó todo lo
   * demás y **tiró el número**: sin un botón apretado la oferta ⛔ no viaja, y lo único que lo decía
   * era una línea en letra chica debajo del campo. La fila quedó con `retencion_monto` en null y el
   * `updated_at` movido — o sea, con toda la cara de haber guardado.
   *
   * 🔑 **El discriminador es `''`, ⛔ no el valor.** El campo se dibuja prellenado con lo que sugiere
   * la cuenta, así que «hay un número» ⛔ no significa «alguien ofreció algo»; lo que significa eso
   * es que **lo tipeó una persona**. Sin esa distinción, trabar acá le pediría contestar por una
   * oferta que nadie hizo cada vez que se abre la calculadora.
   *
   * ⚠️ **Traba, y es una de las poquísimas que traba**, contra la regla general de este módulo de
   * avisar y no exigir. Se gana el lugar porque la alternativa ⛔ no es una fila incoherente: es
   * **descartar en silencio lo que la persona escribió**, y eso ya pasó una vez. Se satisface con
   * un click de tres.
   */
  if (o.retencionMonto !== '' && !o.retencionRespuesta && !o.ofertaMandada) {
    faltas.push({
      paso: 'producto',
      que: 'decir si la oferta ya se la mandaste o qué contestó (si no, el monto ⛔ no se guarda)',
      bloquea: true,
    })
  }

  // ③ El cliente
  //
  // 🔴 **Sin salida elegida no se puede guardar.** Esto era inalcanzable hasta el 27-ago-2026,
  // porque la pantalla caía siempre en la primera del repertorio — y esa caída silenciosa fue
  // justamente lo que convirtió dos reclamos reales en cambios sin que nadie lo pidiera.
  if (!o.compensacion) {
    faltas.push({ paso: 'cliente', que: 'elegir qué recibe el cliente', bloquea: true })
  }
  // Una parcial de $0 no es una decisión, es un formulario a medio llenar.
  if (o.compensacion === 'plata_parcial' && !cargado(o.montoAcordado)) {
    faltas.push({ paso: 'cliente', que: 'cuánto se le devuelve', bloquea: true })
  }
  if (o.compensacion === 'otra_unidad' && !cargado(o.envioIda)) {
    faltas.push({ paso: 'cliente', que: 'el envío del reemplazo', bloquea: false })
  }

  return faltas
}

/** Lo primero que traba de verdad, o `null` si se puede guardar. */
export function loQueTraba(faltas: FaltaDecision[]): FaltaDecision | null {
  return faltas.find((f) => f.bloquea) ?? null
}

/** Cómo se pinta el chip de una pestaña: `null` = no le falta nada. */
export function estadoDelPaso(faltas: FaltaDecision[], paso: PasoDecision): 'traba' | 'falta' | null {
  const suyas = faltas.filter((f) => f.paso === paso)
  if (!suyas.length) return null
  return suyas.some((f) => f.bloquea) ? 'traba' : 'falta'
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
 * 🔴 **El paso que existía en la realidad y ⛔ no en la pantalla: la etiqueta todavía no salió.**
 *
 * Pedido de Bruno, 28-ago-2026: *«si no acepta, y se procede a la devolución, le mandamos que
 * apenas tengamos la etiqueta se la estamos enviando para que pueda despachar el paquete… y el
 * estado cambia en administración a pendiente etiqueta devolución o algo así»*.
 *
 * Al decidir con retorno, la fila pasa a `en_transito` — pero **por correo o Andreani el cliente
 * todavía ⛔ no puede despachar nada**: le falta la etiqueta, que se carga después, cuando existe.
 * O sea que «En camino de vuelta» afirmaba un paquete viajando **antes de que nadie lo despachara**.
 * Es exactamente la mentira que ya se había corregido para el `presencial`, entrando por la otra
 * puerta: [[feedback_areben_premisa_escrita_nunca_medida]].
 *
 * 🔑 **Sin columna nueva: el dato ya estaba.** Que la etiqueta exista lo dice `seguimiento_vuelta`,
 * que es justo lo que carga «Cargar seguimiento». ⛔ No hay estado nuevo en la máquina de estados
 * —`en_transito` sigue siendo uno solo, y la bandeja de Depósito filtra por ahí—: lo que cambia es
 * **cómo se lee**, que es donde estaba el error.
 *
 * ⚠️ Sólo para las vías **con** seguimiento: el cadete y el «lo trae al local» ⛔ no tienen etiqueta
 * que mandar, y ese último ya tiene su propia lectura.
 */
export function faltaMandarLaEtiqueta(
  d: Pick<ReclamoRow, 'estado' | 'via_retorno' | 'seguimiento_vuelta'>,
): boolean {
  return d.estado === 'en_transito' && pideSeguimiento(d.via_retorno) && !d.seguimiento_vuelta
}

/**
 * **¿La etiqueta es NUESTRO turno?** — que ⛔ no es lo mismo que que falte.
 *
 * 🔴 🔑 **Falta ⛔ no significa debida.** Con una oferta esperando respuesta, la etiqueta ⛔ todavía
 * no corresponde: se le propuso que se lo quede, y mandarle la etiqueta antes de que conteste es
 * dar por hecho que dijo que no. La espera, ahí, **es del cliente** — y esa distinción es la misma
 * de `desdeQueEsta`, una vuelta más arriba: **⛔ no se arranca un reloj contra nosotros por una
 * espera que es de otro.**
 *
 * ⇒ De acá cuelgan **las dos cosas que sí son nuestro turno**: el mensaje de que la etiqueta va en
 * camino (que es una **promesa**, y por eso se calla mientras hay otra promesa en el aire) y el
 * reloj de `alertasDe`. ⛔ El rótulo del estado ⛔ NO cuelga de acá: que la etiqueta **falte** es un
 * hecho de la fila, lo diga quien lo diga.
 */
export function laEtiquetaEstaDebida(
  d: Pick<ReclamoRow, 'estado' | 'via_retorno' | 'seguimiento_vuelta' | 'retencion_monto' | 'retencion_respuesta'>,
): boolean {
  return faltaMandarLaEtiqueta(d) && !ofertaEsperandoRespuesta(d)
}

/**
 * El estado como lo lee alguien del local. Cambia en dos casos, y los dos son la misma mentira:
 * "En camino de vuelta" sobre algo que **nadie despachó todavía** — porque el cliente lo trae en
 * mano y no vino, o porque le falta la etiqueta para poder despacharlo.
 */
export function estadoEnCriollo(d: Pick<ReclamoRow, 'estado' | 'via_retorno' | 'seguimiento_vuelta'>): string {
  if (d.estado === 'en_transito' && d.via_retorno === 'presencial') return 'Esperando que lo traiga'
  if (faltaMandarLaEtiqueta(d)) return 'Falta mandarle la etiqueta'
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
  /**
   * **El destino de ESTA unidad.** Ausente = el del reclamo (`destino_prenda`), que es el default
   * explícito — mismo patrón que el `disparador` de Solicitudes.
   *
   * Existe porque el reclamo de dos productos no es raro: en BDI son **3 de 10**, y con un solo
   * destino no se puede decir que uno vuelve sano a stock y el otro entra como falla.
   */
  destino?: DestinoPrenda | null
  /**
   * Cuándo se vio esta unidad. Ausente = **no llegó**. Antes la recepción era del reclamo entero
   * (`estado='recibido'`), así que un reclamo de dos productos no podía decir que llegó uno.
   */
  recibida_at?: string | null
  /**
   * **De qué OTRA venta salió este producto de más.** Sólo en `excedente` con escenario
   * `otra_venta`: es el número de orden del cliente al que le falta esta unidad.
   *
   * 🔑 Es el único dato del módulo que apunta **afuera del reclamo**. Sin él, «se guarda cuál y se
   * avisa» era una promesa de la pantalla: la otra venta quedaba sin faltante y su cliente se
   * enteraba solo. Va por unidad porque dos productos de más pueden venir de dos ventas distintas.
   */
  otra_orden?: string | null
  /**
   * **Cuándo salió del stock de Gestión Nube esta unidad regalada**, con el número de la venta
   * técnica que la sacó. Ausente = todavía está contada en GN.
   *
   * 🔑 Va en el ítem y ⛔ no en una columna nueva **por el mismo motivo que `destino` y
   * `recibida_at`**: el descuento es por unidad. Un reclamo de dos productos donde uno vuelve a
   * stock y el otro se lo queda el cliente no lo puede decir una columna sola — y en BDI los de dos
   * productos son 3 de 10. Viaja en el jsonb, así que ⛔ **no lleva migración**.
   */
  baja_at?: string | null
  baja_venta?: string | null
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

/**
 * ⚠️ **Sólo presentación**: lo que se persiste es la CLAVE, así que renombrar acá ⛔ no toca ni una
 * fila. Los de hoy salieron de la revisión del 27-ago-2026 con Administración: los viejos
 * describían el circuito («Vuelve y se revende») y lo que la persona necesita leer es **en qué
 * estado queda el producto**.
 *
 * 🔴 **Sin género ni sujeto.** «Se **la** queda el cliente» y la clave `regalada` son femeninos por
 * «prenda», y en BDI son fundas: el rótulo se leía mal en media empresa. «Sale de stock» lo dice
 * igual y no supone ni el producto ni quién es el cliente.
 */
export const DESTINO_LABEL: Record<DestinoPrenda, string> = {
  stock: 'Disponible para venta',
  falla: 'Fallado',
  regalada: 'Sale de stock',
  no_salio: 'Nunca salió del depósito',
  // ⚠️ Decía "Se perdió o se la queda el cliente", y ese "o" era el parche de no tener `regalada`:
  // el que quería anotar que el cliente se la quedaba elegía acá y el caso terminaba contado como
  // una pérdida del transporte. Ahora `perdida` significa una sola cosa.
  perdida: 'Se perdió en el transporte',
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
/**
 * 🔑 **Quién está mirando, y es OBLIGATORIO.** Es el mismo patrón que el `escenario` de `decidir`:
 * un parámetro con default seguro deja que el llamador conteste sin enterarse de que le faltaba el
 * dato, y acá el dato decide si en la pantalla del local aparece **cuánta plata perdimos con este
 * caso**. Volverlo obligatorio hizo que el compilador listara solo los puntos donde había que
 * elegir.
 *
 * ⚠️ **`'local'` recorta, ⛔ no miente.** Las líneas que se van son las tres de plata y el escenario;
 * lo que queda —el caso, qué recibe el cliente, qué pasa con el producto, si se pidió que vuelva—
 * es todo lo que quien atiende necesita para contestarle. Si en vez de sacarlas se pusieran en
 * cero, el resumen afirmaría que no costó nada.
 */
export type QuienMira = 'admin' | 'local'

export function resumenDeLoDecidido(d: ReclamoRow, quien: QuienMira): LineaResumen[] {
  const conPlata = quien === 'admin'
  const l: LineaResumen[] = []
  const money = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

  l.push({ que: 'Motivo', valor: MOTIVO_LABEL[d.motivo] + (d.motivo_detalle ? ` — ${d.motivo_detalle}` : '') })
  // El escenario va JUNTO al motivo y no al final: es la mitad de lo que se decidió, y es lo que
  // explica por qué en dos reclamos del mismo caso salió plata distinta.
  // ⛔ El escenario ⛔ NO va al local: es la mitad de lo que decide la plata («la publicación es
  // culpa nuestra sólo si la diferencia es objetiva»), y el local ⛔ no decide. Verlo invita a
  // discutir el veredicto con el cliente en el mostrador.
  const esc = conPlata ? escenarioDe(d.motivo, d.escenario) : null
  if (esc) l.push({ que: 'Qué se encontró', valor: esc.label })
  if (d.expectativa) l.push({ que: tituloExpectativa(d.motivo).replace(/[¿?]/g, ''), valor: expectativaLabel(d.expectativa, d.motivo) })

  /**
   * La oferta de retención, si hay alguna registrada. Se arma **una sola vez** y se coloca en dos
   * lugares distintos según el caso: en un reclamo decidido va al lado de lo que recibe (es la
   * resolución que se intentó antes de ésta), y en uno **sin decidir** es lo único que hay para
   * contar — desde que la oferta se puede registrar sin respuesta, existe antes que la decisión.
   *
   * ⚠️ Un solo armado, dos ubicaciones: dos `push` con el mismo texto es exactamente el modo de
   * falla de esta sección.
   */
  const oferta = conPlata && (d.retencion_respuesta || ofertaEsperandoRespuesta(d))
    ? {
        que: '¿Se le ofreció que se lo quede?',
        // ⚠️ La forma se nombra siempre. Sin ella la línea dice un monto y calla en qué estaba
        // expresado, que es justo lo que hace que dos ofertas de costo muy distinto se lean
        // iguales. «sin registrar» es lo de las filas anteriores a la columna: ⛔ no «plata».
        valor: `Sí, por ${money(Number(d.retencion_monto ?? 0))} (${
          d.retencion_forma ? FORMAS_RETENCION[d.retencion_forma].toLowerCase() : 'sin registrar en qué'
        }) — ${
          d.retencion_respuesta === 'acepto' ? 'aceptó'
            : d.retencion_respuesta === 'rechazo' ? 'no aceptó'
            : `esperando respuesta${diasEsperandoLaOferta(d) ? ` hace ${diasEsperandoLaOferta(d)} días` : ''}`
        }`,
      }
    : null

  if (!d.compensacion) {
    if (oferta) l.push(oferta)
    l.push({ que: 'Decisión', valor: 'Todavía sin decidir' })
    return l
  }

  l.push({ que: 'Qué recibe', valor: COMPENSACION_LABEL[d.compensacion] })
  if (conPlata && d.monto_total != null) l.push({ que: 'Se le devuelve', valor: money(Number(d.monto_total)) })
  if (d.cupon_codigo) l.push({ que: 'Cupón', valor: d.cupon_codigo })
  // La oferta va acá, al lado de lo que recibe: es la resolución que se intentó antes de ésta. La
  // rechazada es la que importa — es la única forma de saber cuántas veces funciona.
  if (oferta) l.push(oferta)

  if (d.destino_prenda) l.push({ que: 'El producto', valor: DESTINO_LABEL[d.destino_prenda] })
  /**
   * Se guarda lo que sugirió la cuenta además de lo que se hizo: sirve para ver cuándo se va en
   * contra y si valió la pena.
   *
   * 🔴 **«En contra» es alguien que decidió distinto que la cuenta, ⛔ no el sistema apagando el
   * retorno solo.** Cuando el cliente ACEPTA quedárselo, `camposAlContestarLaOferta` pone
   * `retorno_decidido: false` —tenerlo prendido contaría el producto dos veces, en la bandeja de
   * Depósito y en poder del cliente—, y `retorno_sugerido` se queda con el `true` de la decisión
   * vieja. R-0022 leía *«No — en contra de lo que sugería la cuenta»* sobre algo que nadie
   * decidió: **acusaba a Administración de una decisión que tomó el cliente.** Es el mismo *un dato
   * que existe ⛔ no es una decisión tomada* de la columna «A devolver».
   */
  if (d.retorno_decidido != null) {
    const loApagoElCliente = d.retencion_respuesta === 'acepto' && d.retorno_decidido === false
    const contra = !loApagoElCliente && d.retorno_sugerido != null && d.retorno_sugerido !== d.retorno_decidido
    l.push({
      que: '¿Se pidió que vuelva?',
      valor: (d.retorno_decidido ? 'Sí' : 'No')
        + (d.via_retorno ? `, por ${VIA_LABEL[d.via_retorno]}` : '')
        + (loApagoElCliente ? ' — el cliente aceptó quedárselo' : '')
        + (contra ? ' — en contra de lo que sugería la cuenta' : ''),
    })
  }
  if (conPlata && d.costo_caso != null) l.push({ que: 'Lo que nos costó', valor: money(Number(d.costo_caso)) })
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
//
// 🔑 `redondear`, `positivo` y `costoDelCaso` viven en `lib/reclamos/plata.core.js`: los necesita
// también `casos.core.js` —y por ahí `api/_reclamos.js`, que ⛔ no puede importar TypeScript—.
// Acá quedan la cara tipada y el resto de la matemática, que sólo usa la app.

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

/**
 * ¿Se puede rehacer la decisión de este reclamo?
 *
 * 🔴 **Existe por un caso real.** El 27-ago-2026 se confirmó un reclamo desde el primer paso de
 * `Decidir`, y como la salida arranca en la primera del repertorio quedó guardado «lo cambia por
 * otro producto» — o sea, convertido en un CAMBIO. Los cambios están excluidos de «Decidir» a
 * propósito (ofrecerlo ahí invita a resolverlo dos veces), así que el caso quedó **sin ninguna
 * puerta**: ni decidir ni rehacer. Arreglarlo pedía un script contra producción.
 *
 * ⚠️ **Un cambio en `borrador` todavía no existe como cambio**: le falta qué se lleva, la forma de
 * pago y el cobro, que se arman en el POS. Ése sí se rehace. Uno más avanzado ⛔ no, porque ahí ya
 * hay una venta y un cobro de por medio.
 *
 * ⚠️ Y en un reclamo que ⛔ no es cambio, `borrador` significa lo contrario —**todavía no se
 * decidió**—, así que ése va por «Decidir», no por acá.
 *
 * 🔴 **Y se cierra cuando ya se ejecutó algo.** Rehacer vuelve a pasar por `pendientesDe`, o sea
 * que un pendiente tildado **vuelve a `pendiente`**: la plata devuelta aparecería otra vez como si
 * no se hubiera devuelto. La lista de lo que ya se hizo la da `loEjecutado`, y ⛔ la pantalla no la
 * infiere por su cuenta — el mismo servidor la usa para frenar el POST.
 */
export function puedeRehacerseLaDecision(d: ReclamoRow): boolean {
  const decidido = esCambio(d)
    ? d.estado === 'borrador'
    : (d.estado === 'resuelto' || d.estado === 'en_transito')
  return decidido && loEjecutado(d).length === 0
}

/**
 * ¿Este paso de `Decidir` ya tiene algo guardado?
 *
 * 🔑 Es lo que hace que el tilde **sobreviva a cerrar el modal**. ⛔ No dice "alguien lo revisó":
 * dice **"esto ya está en la base"**, que es lo único que se puede afirmar mirando la fila — y es
 * exactamente lo que la persona necesita saber al volver a entrar.
 *
 * ⚠️ Por eso un paso que no tenía nada que guardar ⛔ no queda tildado: sería decir que se guardó
 * algo que no existe.
 *
 * 🔴 **`rehaciendo` es obligatorio, y es el arreglo de un bucle real.** El 27-ago-2026 Bruno abrió
 * R-0022 con «Volver a decidir», confirmó el primer paso, salió, y la fila seguía ofreciéndole
 * «Volver a decidir». La pantalla no estaba rota: le había marcado **«El cliente» con un ✓**,
 * porque la compensación de la decisión VIEJA estaba en la base. O sea que el único paso que
 * decide —el tercero, el que tiene «Confirmar la decisión»— se leía como **ya hecho**, y salir
 * después de tildar el que decía «falta» era exactamente lo que la pantalla le estaba pidiendo.
 *
 * 🔑 La regla que lo cierra: **el ✓ sale de lo que ESTE recorrido escribió.** Los pasos ① y ② los
 * escribe «Confirmar paso» —el valor de la base es el mismo que se está por reguardar—, así que su
 * tilde sigue siendo cierto al rehacer. El ③ ⛔ **no lo escribe nadie más que «Confirmar la
 * decisión»**: mientras no se apriete, la decisión nueva no está guardada, y decir que sí es la
 * mentira que armó el bucle.
 *
 * ⛔ No tiene default a propósito: un llamador que no conteste si está rehaciendo volvería a caer
 * en el caso de arriba sin enterarse — es el mismo motivo por el que `registroDeRetencion` pide
 * todos sus campos.
 */
export function pasoGuardado(
  d: Pick<ReclamoRow, 'escenario' | 'envio_costo' | 'compensacion'>,
  paso: PasoDecision,
  rehaciendo: boolean,
): boolean {
  if (paso === 'que-paso') return d.escenario != null
  if (paso === 'producto') return d.envio_costo != null
  return !rehaciendo && d.compensacion != null
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

/**
 * **Los destinos que tiene sentido ofrecer para este caso.** Vacío = no hay producto en juego.
 *
 * 🔴 Hasta el 27-ago-2026 la pantalla ofrecía **los cinco siempre**: se podía marcar «Se perdió en
 * el transporte» sobre un producto que el cliente tenía en la mano, o «Nunca salió del depósito»
 * sobre uno que llegó. La regla vive en `casos.core.js` con el escenario obligatorio, como todo lo
 * que deriva plata o stock — ⛔ no en el JSX.
 */
export function destinosDe(motivo: MotivoReclamo, escenario: string | null | undefined): DestinoPrenda[] {
  return destinosDeJs(motivo, escenario) as DestinoPrenda[]
}

/**
 * El destino de el producto queda determinado por el motivo, salvo en la falla.
 *
 * 🔑 **El cuerpo se mudó a `casos.core.js` el 28-ago-2026** —acá quedó la cara tipada— porque ahora
 * lo necesita también `api/_reclamos.js`, que ⛔ no puede importar TypeScript. Mismo arreglo que
 * `perfilDe` y que `permisos.core.js`.
 */
export function destinoDe(motivo: MotivoReclamo, vuelve: boolean, escenario: string | null | undefined): DestinoPrenda | null {
  return destinoDeJs(motivo, vuelve, escenario) as DestinoPrenda | null
}

/**
 * Lo que hay que escribir cuando el cliente contesta la oferta. La regla —y por qué las dos
 * respuestas ⛔ no son simétricas— vive en `casos.core.js`.
 */
export function camposAlContestarLaOferta(o: {
  respuesta: RespuestaRetencion
  motivo: MotivoReclamo
  escenario: string | null
  monto: number | null
  forma: FormaRetencion | null
  diferencia: number | null
  /** Los del reclamo: es de donde sale la unidad perdida de `costo_caso`. Sin ellos vale 0. */
  items?: ItemReclamo[]
}): { error?: string; campos?: Partial<ReclamoRow> } {
  return camposAlContestarLaOfertaJs(o) as { error?: string; campos?: Partial<ReclamoRow> }
}

// ── La unidad: el destino y la recepción, por PRODUCTO ──────────────────────────
//
// Las reglas viven en `lib/reclamos/unidades.core.js` porque las necesita también `api/_reclamos.js`
// (`recibir` tiene que saber en qué lista escribir). Acá está la cara tipada.

/** Una unidad que estamos esperando: su índice en la lista donde vive, el ítem y su destino. */
export type UnidadQueVuelve = { i: number; item: ItemReclamo; destino: DestinoPrenda | null }

/**
 * Lo mínimo que hace falta para saber qué vuelve. Se pide **esto y no `ReclamoRow`** porque la
 * bandeja de retornos trabaja con `RetornoRow`, que es un recorte deliberado: Depósito no ve el
 * relato del cliente ni los montos.
 */
export type FilaConUnidades = Pick<ReclamoRow, 'motivo' | 'items'>
  & Partial<Pick<ReclamoRow, 'items_correctos' | 'destino_prenda' | 'retorno_decidido' | 'escenario'>>

/** En qué lista viven las unidades que VUELVEN. En `mal_armado` es lo que llegó por error. */
export function deDondeVuelve(motivo: MotivoReclamo): 'items' | 'items_correctos' {
  return deDondeVuelveJs(motivo) as 'items' | 'items_correctos'
}

/** El destino de una unidad. **Ausente = el del reclamo.** */
export function destinoDeUnidad(item: ItemReclamo, fila: FilaConUnidades): DestinoPrenda | null {
  return destinoDeUnidadJs(item, fila) as DestinoPrenda | null
}

/** ¿Esta unidad vuelve al depósito? `'falla'` sólo vuelve si se pidió el retorno. */
export function laUnidadVuelve(destino: DestinoPrenda | null | undefined, retornoDecidido: boolean): boolean {
  return laUnidadVuelveJs(destino, retornoDecidido)
}

/** Las unidades que estamos esperando, con su índice. */
export function unidadesQueVuelven(fila: FilaConUnidades): { campo: 'items' | 'items_correctos'; unidades: UnidadQueVuelve[] } {
  return unidadesQueVuelvenJs(fila) as { campo: 'items' | 'items_correctos'; unidades: UnidadQueVuelve[] }
}

/** Las que todavía no aparecieron. Vacío = llegó todo lo que se esperaba. */
export function loQueFaltaLlegar(fila: FilaConUnidades): UnidadQueVuelve[] {
  return loQueFaltaLlegarJs(fila) as UnidadQueVuelve[]
}

/** Las regaladas que todavía siguen contadas en Gestión Nube. Vacío = no falta descontar nada. */
export function loQueFaltaDescontar(fila: FilaConUnidades): UnidadQueVuelve[] {
  return (loQueFaltaDescontarJs(fila) as { unidades: UnidadQueVuelve[] }).unidades
}

/**
 * **Los productos de más que todavía no dicen de qué otra venta salieron.** Vacío = no falta
 * ninguno, o el escenario no es `otra_venta` (en `sin_identificar` no se puede saber cuál es).
 */
export function sinLaOtraVenta(fila: FilaConUnidades): UnidadSinOtraVenta[] {
  return (sinLaOtraVentaJs(fila) as { unidades: UnidadSinOtraVenta[] }).unidades
}

/** Una unidad de más a la que le falta el número de la venta de la que salió. */
export type UnidadSinOtraVenta = { i: number; item: ItemReclamo }

/** Anota de qué otra venta salió. `indices` en `null` = todas las que faltaban. */
export function anotarLaOtraVenta(
  fila: FilaConUnidades,
  indices: number[] | null,
  orden: string,
): { campo: 'items' | 'items_correctos'; lista: ItemReclamo[]; anotadas: number; faltan: number } {
  return anotarLaOtraVentaJs(fila, indices, orden) as {
    campo: 'items' | 'items_correctos'; lista: ItemReclamo[]; anotadas: number; faltan: number
  }
}

/** Sella las regaladas que ya salieron de GN. `indices` en `null` = todas las que faltaban. */
export function descontarUnidades(
  fila: FilaConUnidades,
  indices: number[] | null,
  at: string,
  venta: string | number | null,
): { campo: 'items' | 'items_correctos'; lista: ItemReclamo[]; descontadas: number; faltan: number; seDescontoTodo: boolean } {
  return descontarUnidadesJs(fila, indices, at, venta) as {
    campo: 'items' | 'items_correctos'
    lista: ItemReclamo[]
    descontadas: number
    faltan: number
    seDescontoTodo: boolean
  }
}

/**
 * Pisar el destino de algunas unidades, por índice. `null` devuelve la unidad al del reclamo.
 *
 * 🔑 Va como **mapa índice → destino** y ⛔ no reenviando los productos: salen de la orden de Tienda
 * Nube, y dejar que la decisión los reescriba abre la puerta a pisarlos con menos datos.
 */
export function aplicarDestinos(
  items: ItemReclamo[],
  destinos: Record<number, DestinoPrenda | null> | null | undefined,
): { error?: string; lista?: ItemReclamo[] } {
  return aplicarDestinosJs(items, destinos) as { error?: string; lista?: ItemReclamo[] }
}

/** Lo que impide recibir, en criollo, o `null` si se puede. */
export function trabaParaRecibir(fila: FilaConUnidades): string | null {
  return trabaParaRecibirJs(fila)
}

/** Marca unidades como llegadas. `indices` en `null` = todas las esperadas. */
export function recibirUnidades(fila: FilaConUnidades, indices: number[] | null, at: string): {
  campo: 'items' | 'items_correctos'
  lista: ItemReclamo[]
  recibidas: number
  faltan: number
  todoLlego: boolean
} {
  return recibirUnidadesJs(fila, indices, at) as {
    campo: 'items' | 'items_correctos'
    lista: ItemReclamo[]
    recibidas: number
    faltan: number
    todoLlego: boolean
  }
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
  /**
   * 🔑 **El veredicto: ¿conviene ofrecerle que se lo quede?** Es lo que la cuenta ya sabía y no
   * decía, y por no decirlo la pantalla quedaba preguntando algo que se contesta solo con los
   * datos que tiene delante — o sea, una calculadora con un campo en cero.
   *
   * ⚠️ `false` tiene **dos causas distintas** y no se pueden mezclar: o no hay nada que perder
   * porque vuelva (y entonces no hay descuento que convenga), o **falta un dato** para saberlo.
   * Las separa `falta`: sin eso, "no conviene" se leería como veredicto cuando en realidad es
   * "todavía no se sabe".
   */
  conviene: boolean
  /** Qué dato falta para poder contestar, si es que falta alguno. `null` = la cuenta está completa. */
  falta: 'pvp_feria' | null
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
    return {
      techo: 0, sugerido: 0, seePierdeSiVuelve: 0, convieneRegalar: false,
      conviene: false, falta: 'pvp_feria',
      motivo: 'Falta el PVP de feria: sin eso no se puede saber cuánto se pierde si vuelve.',
    }
  }

  // Lo que se pierde si vuelve. En una fallada, la depreciación es la parte grande.
  const depreciacion = fallada ? Math.max(precio - feria, 0) : 0
  const seePierdeSiVuelve = redondear(depreciacion + envio + operativo)
  const techo = seePierdeSiVuelve
  const sugerido = redondear(Math.min(techo * FRACCION_SUGERIDA, precio))
  const convieneRegalar = techo >= precio && precio > 0
  /**
   * 🔑 **Conviene ofrecer exactamente cuando hay algo que perder porque vuelva.** Con techo 0 no
   * es que la oferta sea chica: es que **no hay oferta que no sea regalar plata**, porque el
   * producto vuelve sano, se revende entero y la vuelta no cuesta nada.
   */
  const conviene = techo > 0

  const motivo = fallada
    ? `Si vuelve perdés ${seePierdeSiVuelve} (se deprecia ${depreciacion} más ${envio} de envío).` +
      (convieneRegalar ? ' Es más que el precio: regalarlo sale más barato que pedirlo.' : '')
    // ⚠️ Con 0 la frase de siempre decía "lo único que perdés es 0 de logística": un número que
    // existe y no significa nada, leído como si fuera una pérdida. Con 0 no se pierde NADA.
    : conviene
      ? `Vuelve sano y se revende a precio completo, así que lo único que perdés es ${seePierdeSiVuelve} de logística.`
      : 'Vuelve sano y se revende entero, y la vuelta no te cuesta nada: no perdés plata porque vuelva.'

  return { techo, sugerido, seePierdeSiVuelve, convieneRegalar, conviene, falta: null, motivo }
}

/**
 * Qué nos costó el caso. Sin esto no se puede responder después "cuánto nos costaron las
 * devoluciones este mes" ni con qué proveedor se van en fallas.
 *
 * La unidad perdida se valúa **a costo**: es lo que se fue por la puerta cuando el producto se le
 * regala al cliente. Si vuelve (a stock o a fallas) no se perdió, se recuperó.
 *
 * 🔑 **El cuerpo se mudó a `plata.core.js` el 28-ago-2026** —acá quedó la cara tipada— porque ahora
 * lo necesita también `camposAlContestarLaOferta`, que corre en `api/_reclamos.js`. Mismo arreglo
 * que `destinoDe`. Antes lo calculaba **sólo la pantalla**, y la rama que resuelve el reclamo sin
 * pasar por ella dejaba `costo_caso` en el de la decisión vieja.
 */
/**
 * Las columnas que lee `costoDeLaFila`: su contrato, escrito una sola vez en `plata.core.js`.
 * De ahí salen el `select` del handler y la pregunta «¿este gesto cambió el costo?».
 */
export const ENTRADAS_DEL_COSTO: readonly string[] = ENTRADAS_DEL_COSTO_JS

/**
 * **Lo que costó el caso, derivado de la FILA.** La regla —las tres condiciones que deciden cuánto
 * entra de cada envío, y que vivían sueltas adentro de `DecidirReclamo.tsx`— vive en
 * `plata.core.js`, porque la necesita también `casos.core.js` y `api/_reclamos.js`.
 */
/**
 * Lo que se le devuelve al cliente, o `null` si todavía ⛔ no se decidió. La regla —y por qué ⛔ no
 * puede ser 0— vive en `plata.core.js`.
 */
export function montoADevolver(d: Pick<ReclamoRow, 'compensacion' | 'monto_total' | 'monto_producto'>): number | null {
  return montoADevolverJs(d) as number | null
}

export function costoDeLaFila(
  fila: Partial<Pick<ReclamoRow,
    'compensacion' | 'monto_total' | 'retorno_decidido' | 'envio_costo' | 'envio_ida_costo' | 'items' | 'destino_prenda'>>,
): number {
  return costoDeLaFilaJs(fila)
}

export function costoDelCaso(opciones: {
  montoDevuelto: number
  envioVuelta?: number | null
  envioReemplazo?: number | null
  items: ItemReclamo[]
  /**
   * 🔑 **`null` = no hay producto en juego** (una demora, una cancelación), y eso vale CERO. Antes
   * este parámetro no aceptaba `null` y la pantalla tapaba el hueco mandando `'falla'`: una demora
   * —donde el cliente recibió lo que compró y se lo queda porque es suyo— se contaba con el costo
   * entero de la mercadería como si la hubiéramos perdido.
   */
  destino: DestinoPrenda | null
}): number {
  return costoDelCasoJs(opciones)
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
  /**
   * **La oferta de retención**: cuánto se le ofreció para que se lo quede y qué contestó.
   *
   * Las dos van juntas o no va ninguna. La oferta ACEPTADA se podía adivinar por la resolución
   * (`plata_parcial` o `cupon`); la RECHAZADA no dejaba rastro, y sin ella no se sabe cuántas
   * veces funciona la retención — que es lo único que dice si conviene seguir ofreciéndola.
   *
   * ⚠️ Nulas ⛔ NO significan "no se le ofreció": significan **sin registrar**. Los reclamos
   * anteriores al 25-ago-2026 no contestaron nada.
   */
  retencion_respuesta?: RespuestaRetencion | null
  retencion_monto?: number | null
  retencion_forma?: FormaRetencion | null
  /**
   * **Cuándo se le hizo la oferta**, que es desde cuándo se espera la respuesta. Se sella una sola
   * vez: ⛔ no la mueve volver a guardar. Ver `registroDeRetencion` en `casos.core.js`.
   */
  retencion_at?: string | null
  expectativa?: Expectativa | null
  /** El número de reclamo al transportista, cuando el pedido se perdió en el camino. */
  reclamo_correo?: string | null
  reclamo_correo_estado?: PendienteEstado
  /**
   * Lo que se le mandó al cliente, con su texto y su fecha.
   *
   * ⚠️ **⛔ No viene en el listado**: pesa (283 bytes por mensaje, medido) y lo lee una sola
   * pantalla. Se pide aparte con `leerMensajes`, como el token. Ver `mensajes.core.js`.
   */
  mensajes?: MensajeRegistrado[]
  /**
   * En "pedido mal armado": **lo que le llegó POR ERROR**, o sea lo que sí salió del depósito.
   *
   * ⚠️ **El nombre miente** y se conserva porque la columna ya está en producción. Lo dice la
   * pantalla que lo carga ("¿Qué recibió realmente?") y de ahí lo lee `deDondeVuelve`: en este
   * caso lo que VUELVE es esta lista, ⛔ no `items`. Este comentario decía lo contrario ("lo que
   * se le tendría que haber mandado") y era justo la confusión que hizo que la bandeja de
   * retornos le mostrara a Depósito el producto equivocado.
   */
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
  /**
   * **El cupón todavía no existe en la tienda.** Se crea a mano y el código se tipea en
   * `cupon_codigo`; hasta el 25-ago-2026 nada avisaba si nunca se creó, así que un reclamo se
   * cerraba "con cupón" y el cliente se quedaba con la promesa de un código inexistente.
   */
  cupon_estado?: PendienteEstado | null
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
 *   - **La venta original se anula** → al anularla la unidad vuelve al stock. Está fallada y no se
 *     puede vender: hay que volver a sacarla. **Descuenta.**
 *   - **La venta original queda en pie** (el cambio, la reposición, el reenvío, el cupón) → esa
 *     unidad ya salió del stock con la venta. Descontarla otra vez restaría **dos veces** por un
 *     solo producto. **No descuenta.**
 *
 * 🔴 **La pregunta es `anulaVenta`, y hasta el 28-ago-2026 estaba escrita a mano acá como
 * `compensacion !== 'otra_unidad'`.** Era una copia fiel de la tabla del día en que se escribió
 * —anulaban las cinco menos el cambio—, y el 27-ago `reenvio`, `cupon` y `ninguna` dejaron de
 * anular sin que esta línea se enterara: cuatro filas donde los dos lados contestaban distinto
 * sobre el mismo stock. Ahora sale de `EFECTOS_RESOLUCION`, que es donde vive.
 */
export function laFallaDescuentaStock(compensacion: Compensacion | null | undefined): boolean {
  return seAnulaLaVentaJs(compensacion)
}

/**
 * **La venta técnica ⛔ no puede salir antes que la anulación.** El aviso, o `null` si se puede.
 * La regla —y por qué el freno de verdad va antes de escribir en GN— vive en `efectos.core.js`.
 */
export function faltaAnularAntesDeDescontar(
  fila: Pick<ReclamoRow, 'compensacion' | 'stock_estado'>,
): string | null {
  return faltaAnularAntesDeDescontarJs(fila)
}

/**
 * **La plata ⛔ no sale hasta que el producto vuelva.** El aviso, o `null` si se puede devolver.
 * La regla —y por qué existe la salida explicada— vive en `efectos.core.js`.
 */
export function faltaRecibirAntesDeDevolver(fila: FilaConUnidades): string | null {
  return faltaRecibirAntesDeDevolverJs(fila)
}

// ── Alertas por antigüedad ──────────────────────────────────────────────────────

/**
 * Los días a partir de los cuales un reclamo deja de estar "en curso" y pasa a estar dormido.
 * Son distintos a propósito: que un cliente tarde en mandar fotos es normal, que la plata no
 * salga en cinco días no.
 */
/**
 * ⚠️ `despacho: 2` y `sinMandar: 2` son lo único de acá que ⛔ no salió de la operación sino de una
 * propuesta: despachar es trabajo del día siguiente, no un tránsito de quince, y contestarle a
 * quien se quejó tampoco espera una semana. Se cambian en esta línea.
 */
/**
 * ⚠️ `oferta: 3` es de la misma clase que los dos de arriba: **propuesta, ⛔ no medida**. Se eligió
 * igual que `sinDecidir` porque es la misma espera vista del otro lado —nosotros ya contestamos y
 * el que no responde es el cliente—, y porque el reclamo se queda quieto mientras tanto. ▶️ Lo
 * confirma Bruno con los primeros casos reales: hoy ⛔ no hay ninguno cerrado del que sacarlo.
 */
export const DIAS_ALERTA = { cliente: 10, plata: 5, transito: 15, sinDecidir: 3, despacho: 2, sinMandar: 2, oferta: 3, etiqueta: 2, plataSinProducto: 0 } as const

/**
 * **El piso del retorno: por debajo de este monto no se pide que el producto vuelva**, aunque la
 * cuenta de `convieneRetorno` dé positiva — recibirlo, revisarlo y reingresarlo tampoco es gratis.
 *
 * 🔑 **Es un número de POLÍTICA, no un dato del caso**, y por eso vive acá y no en la pantalla.
 * Hasta el 27-ago-2026 el campo «Piso ($)» arrancaba vacío en cada reclamo, así que el corte
 * existía sólo si alguien se acordaba de tipearlo — o sea, casi nunca. En pantalla se sigue
 * pudiendo pisar para un caso puntual: lo que cambia es que ahora hay un default.
 *
 * ▶️ **`null` = todavía sin definir**, y con `null` la cuenta se comporta igual que antes (sin
 * corte por monto). Los dos números los tiene que dar Bruno: por debajo de cuánto no vale la pena
 * traer un producto de vuelta en cada marca. ⛔ Ponerlos yo sería inventar política.
 */
export const PISO_RETORNO: Record<Marca, number | null> = { bdi: null, zattia: null }

/**
 * 🔑 **`ts` es cuándo la alerta EMPEZÓ A EXISTIR**, no cuándo se creó el reclamo ni cuándo se lo
 * tocó por última vez: es el instante en que el reloj cruzó su plazo (`referencia + plazo`).
 *
 * Existe porque el aviso del sidebar lo usa para decidir si es **nuevo** (`contarNuevos` compara
 * contra el "visto hasta"). Con la fecha de creación, un reclamo que se duerme HOY pero se abrió
 * la semana pasada nacería ya marcado como visto — o sea que **el badge no se prendería nunca
 * justo para el caso que la alerta existe para mostrar**. La pantalla de Reclamos no lo usa.
 */
export type AlertaReclamo = { tono: Tono; texto: string; dias: number; ts: number }
type Tono = 'warning' | 'danger'

/**
 * Los estados en los que un reclamo **sigue vivo**. `cerrado` y `anulado` quedan afuera.
 *
 * La lista y el porqué viven en `casos.core.js`: la lee también `api/_reclamos.js`, que ⛔ no puede
 * importar TypeScript. Acá queda la cara tipada.
 */
export const ESTADOS_ABIERTOS = ESTADOS_ABIERTOS_JS as EstadoReclamo[]

/** ¿El reclamo sigue vivo? Ver `ESTADOS_ABIERTOS`. */
export function estaAbierto(d: Pick<ReclamoRow, 'estado'>): boolean {
  return estaAbiertoJs(d)
}

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
 * **Desde cuándo se le debe el paquete que sale.**
 *
 * Es el PRIMER evento que sacó al reclamo del borrador —la decisión, o la venta del cambio—, ⛔ no
 * el último de su estado actual. La diferencia es la de siempre en este módulo: tildar la plata o
 * emitir el cupón apila más eventos `resuelto` sobre la misma fila, y contando desde el último
 * **ocuparse de otra cosa del caso apagaría la alarma de que nadie despachó**. Es el mismo defecto
 * que ya tuvo `desdeQueEsta` con `updated_at`, una vuelta más adentro.
 *
 * Sirve para los tres caminos: el reenvío sin retorno queda en `resuelto`, el que espera algo de
 * vuelta en `en_transito`, y el cambio pasa por `borrador` antes de que exista la venta.
 */
export function desdeQueSeDecidio(d: Pick<ReclamoRow, 'historial' | 'updated_at' | 'created_at'>): string | null {
  const eventos = Array.isArray(d.historial) ? d.historial : []
  const enCurso = (e: { estado?: string }) => e?.estado === 'en_transito' || e?.estado === 'resuelto'
  for (const e of eventos) if (enCurso(e) && e.at) return e.at
  return d.created_at || d.updated_at || null
}

/**
 * **Hace cuántos días que se le hizo la oferta y no contestó.** `0` si no hay ninguna esperando.
 *
 * 🔴 Cuenta desde `retencion_at` —**el evento**— y ⛔ no desde `updated_at`, por lo mismo que
 * `desdeQueEsta`: el toque más probable sobre una oferta que no vuelve es ir a ver por qué no
 * vuelve, así que con el último toque **ocuparse del caso apagaría la alarma**.
 *
 * ⚠️ Una oferta registrada **sin fecha** (filas anteriores a la columna) da `0`: se ve en el
 * resumen y en la fila, pero ⛔ no dispara el reloj. Inventarle una fecha —`created_at`, el último
 * toque— sería afirmar una espera que nadie midió.
 */
export function diasEsperandoLaOferta(d: ReclamoRow, ahora = Date.now()): number {
  if (!ofertaEsperandoRespuesta(d) || !d.retencion_at) return 0
  return diasDesde(d.retencion_at, ahora)
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

  /**
   * El instante en que la alerta empezó a existir: la referencia desde la que se cuenta, más el
   * plazo. ⚠️ Sale de la MISMA referencia que el `dias` de al lado —⛔ no de `ahora`— o el aviso
   * del sidebar se "estrenaría" en cada refresco y el badge no se podría apagar nunca.
   */
  const cuando = (dias: number, plazo: number) => ahora - (dias - plazo) * 86400000

  if (d.reintegro_estado === 'pendiente' && d.compensacion && desdeToque >= DIAS_ALERTA.plata) {
    alertas.push({ tono: 'danger', texto: `Hace ${desdeToque} días que la plata no sale`, dias: desdeToque, ts: cuando(desdeToque, DIAS_ALERTA.plata) })
  }
  /**
   * 🔴 **El reloj que faltaba, y el que el de arriba APAGABA.** Tildar el reintegro pone
   * `reintegro_estado` en `'hecho'` ⇒ el aviso de que la plata no sale se calla. Hasta el
   * 30-ago-2026 eso era todo lo que había: con la plata afuera y el producto todavía en la calle,
   * el reclamo se quedaba **mudo** — ni un reloj corriendo sobre lo único que falta.
   *
   * 🔑 **A quién hay que ir a buscar es lo que un aviso tiene que decir.** Antes de la traba del
   * `reintegro` esto pasaba por descuido; con la traba pasa **a propósito** —la salida explicada—,
   * y justamente por eso hace falta el reloj: una excepción sin reloj es una excepción que nadie
   * vuelve a mirar.
   *
   * ⚠️ **Cuenta desde `reintegro_at`, ⛔ no desde `updated_at`**: es el instante en que la plata
   * salió, y ⛔ no lo pisa ninguna edición del reclamo. Es la misma lección que la alerta de
   * tránsito, que contaba desde el último toque y se reiniciaba sola.
   *
   * ⚠️ **Plazo 0 a propósito**: ⛔ no es una demora que se tolera unos días, es un **estado** que
   * ⛔ no debería existir ⇒ avisa desde el día uno. Las filas viejas sin `reintegro_at` avisan
   * igual, sin número: `diasDesde(null)` da 0 y el texto ⛔ no inventa una espera.
   */
  const plataAfuera = diasDesde(d.reintegro_at, ahora)
  if (d.reintegro_estado === 'hecho' && faltaRecibirAntesDeDevolver(d) && plataAfuera >= DIAS_ALERTA.plataSinProducto) {
    alertas.push({
      tono: 'danger',
      texto: plataAfuera >= 1
        ? `La plata salió hace ${plataAfuera} días y el producto todavía no volvió`
        : 'La plata ya salió y el producto todavía no volvió',
      dias: plataAfuera,
      ts: cuando(plataAfuera, DIAS_ALERTA.plataSinProducto),
    })
  }
  if (d.estado === 'esperando_cliente' && desdeCreado >= DIAS_ALERTA.cliente) {
    alertas.push({ tono: 'warning', texto: `El cliente no responde hace ${desdeCreado} días`, dias: desdeCreado, ts: cuando(desdeCreado, DIAS_ALERTA.cliente) })
  }
  // ⚠️ Ésta NO cuenta desde el último toque sino desde que el producto salió de vuelta
  // (`desdeQueEsta`): editar el reclamo mientras se espera no puede reiniciar la espera.
  const enCamino = diasDesde(desdeQueEsta(d, 'en_transito'), ahora)
  /**
   * 🔴 **«Hace N días que no llega» ⛔ no se le puede cobrar al transporte si la etiqueta ⛔ nunca
   * salió.** Hasta el 28-ago-2026 este reloj era **uno solo** sobre `en_transito`, y por correo o
   * Andreani corría desde el minuto en que se decidió — o sea que a los 15 días acusaba a un
   * transporte que ⛔ nunca recibió el paquete, porque el cliente no tenía con qué despacharlo.
   *
   * 🔑 **La partición ⛔ no es cosmética: separa una demora NUESTRA de una AJENA**, que es lo único
   * que decide a quién hay que ir a buscar. Y por eso los dos plazos y los dos tonos son distintos:
   * la que depende de nosotros es `danger` a los 2 días; la del transporte, `warning` a los 15.
   *
   * ⚠️ El `presencial` y el cadete siguen entrando por abajo: ahí no hay etiqueta que mandar, y
   * «no llega» es lo que efectivamente pasa.
   */
  const sinEtiqueta = diasDesde(desdeQueEsta(d, 'en_transito'), ahora)
  if (laEtiquetaEstaDebida(d) && sinEtiqueta >= DIAS_ALERTA.etiqueta) {
    alertas.push({ tono: 'danger', texto: `Hace ${sinEtiqueta} días que no le mandamos la etiqueta`, dias: sinEtiqueta, ts: cuando(sinEtiqueta, DIAS_ALERTA.etiqueta) })
  }
  if (d.estado === 'en_transito' && !faltaMandarLaEtiqueta(d) && enCamino >= DIAS_ALERTA.transito) {
    alertas.push({ tono: 'warning', texto: `Hace ${enCamino} días que no llega`, dias: enCamino, ts: cuando(enCamino, DIAS_ALERTA.transito) })
  }
  // Ya cargó las fotos y nadie decidió: es el único que depende de nosotros y no del cliente.
  if (d.estado === 'en_revision' && desdeToque >= DIAS_ALERTA.sinDecidir) {
    alertas.push({ tono: 'danger', texto: `Esperando una decisión hace ${desdeToque} días`, dias: desdeToque, ts: cuando(desdeToque, DIAS_ALERTA.sinDecidir) })
  }
  /**
   * 🔴 **El estado en el que el reclamo NACE, y el único abierto que no tenía reloj.** `borrador`
   * quiere decir literalmente *"ni lo miré"*: la fila pasa a `esperando_cliente` recién cuando
   * alguien copia el mensaje, que es el gesto de escribirle. Sin esta alerta, un reclamo abierto y
   * nunca enviado **no aparece en ninguna parte nunca más** — y es el que más duele, porque del
   * otro lado hay un cliente que ya se quejó y todavía no recibió una sola respuesta.
   *
   * 🔑 **Cuenta desde `created_at` y ⛔ no desde el último toque**, que acá es lo que más importa:
   * `updated_at` lo pisa cualquier edición del borrador, y editarlo ⛔ no es escribirle. Es el
   * mismo defecto que ya tuvo la alerta de tránsito, con la diferencia de que `created_at` no lo
   * puede pisar nadie.
   *
   * ⚠️ **`!d.compensacion` ⛔ no es un detalle: `borrador` significa dos cosas distintas.** Un
   * cambio decidido vuelve a `borrador` a esperar que el cliente pague (`decidir` lo deja ahí a
   * propósito), y ése ⛔ no es un reclamo olvidado — es una espera legítima, con su propia pestaña
   * en Armar cambio. Sin decisión no hay compensación, así que el guard separa las dos poblaciones
   * por el dato que las distingue y no por una lista de motivos.
   */
  /**
   * 🔴 **La oferta que se mandó y nadie contestó.** Es el único reloj del módulo que corre sobre un
   * reclamo que puede estar **ya decidido**: se le ofreció que se lo quede, se guardó la salida por
   * si dice que no, y el caso queda quieto esperando una respuesta que capaz no llega nunca. Sin
   * esto, la única forma de acordarse es que alguien abra el reclamo — y el resto de los relojes
   * (`sinDecidir`, `plata`) ⛔ no lo agarran, porque desde su punto de vista está todo hecho.
   */
  const esperandoOferta = diasEsperandoLaOferta(d, ahora)
  if (esperandoOferta >= DIAS_ALERTA.oferta) {
    alertas.push({ tono: 'warning', texto: `Le ofrecimos que se lo quede hace ${esperandoOferta} días y no contestó`, dias: esperandoOferta, ts: cuando(esperandoOferta, DIAS_ALERTA.oferta) })
  }
  /**
   * 🔴 🔑 **`yaSeLeEscribio` es el tercer guard, y sin él este aviso ACUSABA DE ALGO QUE LA PANTALLA
   * ⛔ NO DEJABA HACER** (29-ago-2026, I1 del mapa operativo). Hasta acá lo único que lo apagaba era
   * que la fila saliera de `borrador`, y el único gesto que la saca es **copiar el mensaje de
   * apertura** — que **sólo existe en los casos que piden fotos**. En `demora`, `no_llego` y
   * `sin_stock` no había un solo mensaje para copiar ⇒ el aviso quedaba prendido en rojo para
   * siempre, y lo único que lo callaba era que Administración decidiera. Tres de los once casos.
   *
   * 🔑 Ahora pregunta lo que el texto del aviso dice: **si se le escribió**. Es lo que anota
   * `NOTA_SE_LE_ESCRIBIO` en el `historial` —el hecho—, y ⛔ no `mensajes`, que salió de `COLS` a
   * propósito por peso y acá ⛔ no llegaría. ⚠️ Las filas viejas ⛔ no tienen la nota, así que siguen
   * avisando exactamente igual que antes: esto ⛔ no calla nada retroactivamente.
   */
  if (d.estado === 'borrador' && !d.compensacion && !yaSeLeEscribio(d) && desdeCreado >= DIAS_ALERTA.sinMandar) {
    alertas.push({ tono: 'danger', texto: `Abierto hace ${desdeCreado} días y todavía no se le escribió`, dias: desdeCreado, ts: cuando(desdeCreado, DIAS_ALERTA.sinMandar) })
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
  /** ¿Hay que emitir un cupón en la tienda y anotar el código? Sólo la resolución `cupon`. */
  cupon: string
  ayuda: string
}

export const EFECTOS_RESOLUCION = EFECTOS_RESOLUCION_JS as Record<Compensacion, EfectosResolucion>

export type PendientesDerivados = {
  reintegro_estado: PendienteEstado
  stock_estado: PendienteEstado
  reingreso_estado: PendienteEstado
  cobro_estado: PendienteEstado
  envio_nuevo_estado: PendienteEstado
  cupon_estado: PendienteEstado
}

/** Los pendientes que deja una decisión. Es lo que `decidir` guarda en la fila. */
export function pendientesDe(opciones: {
  compensacion: Compensacion
  diferencia?: number | null
}): PendientesDerivados {
  return pendientesDeJs(opciones) as PendientesDerivados
}

/**
 * Lo que la decisión ya mandó a hacer y alguien HIZO, en criollo. Vacío = todavía no se ejecutó
 * nada y la decisión se puede rehacer entera. Ver `puedeRehacerseLaDecision`.
 */
export function loEjecutado(d: ReclamoRow): string[] {
  return loEjecutadoJs(d) as string[]
}

/** ¿Esta resolución manda algo al cliente? Son el cambio, la reposición y el reenvío. */
export function saleUnEnvio(compensacion: Compensacion): boolean {
  return saleUnEnvioJs(compensacion)
}

export function estaDecidido(d: ReclamoRow): boolean {
  return !!d.compensacion
}

/**
 * **Cómo se llama el botón que abre «Decidir», según dónde está el trabajo.**
 *
 * 🔴 Hasta el 27-ago-2026 el botón decía **qué pantalla abre**, ⛔ no dónde está el trabajo: era
 * «Decidir» desde el minuto cero hasta el final. Con una decisión que se hace en tres pasos y que
 * se puede dejar por la mitad —*«puede ser que termine el primer paso, pero después sigo más
 * tarde»*, Bruno— eso deja fuera de la fila el único dato que la persona necesita para saber si
 * tiene que abrirlo: **si ya empezó**.
 *
 * ⚠️ Cuenta pasos **guardados**, ⛔ no revisados: es lo único que se puede afirmar mirando la fila.
 * Y con `rehaciendo: false`, porque un reclamo sin decidir ⛔ no está rehaciendo nada.
 */
export function botonDecidir(d: ReclamoRow): { label: string; hechos: number } {
  const hechos = PASOS_DECISION.filter((p) => pasoGuardado(d, p, false)).length
  return {
    label: hechos ? `Continuar — ${hechos} de ${PASOS_DECISION.length}` : 'Decidir',
    hechos,
  }
}

/**
 * Lo que falta para poder cerrar el reclamo. Vacío = se puede cerrar.
 *
 * 🔑 **El cuerpo se mudó a `casos.core.js` el 28-ago-2026** —acá quedó la cara tipada— porque el
 * freno tiene que vivir también en `api/_reclamos.js`, que ⛔ no puede importar TypeScript: hasta
 * ese día esta lista la miraba **sólo la pantalla** y el handler cerraba igual. Mismo arreglo que
 * `destinoDe` y `perfilDe`.
 */
export function faltantesParaCerrar(d: ReclamoRow): string[] {
  return faltantesParaCerrarJs(d) as string[]
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

/**
 * **¿El link se lleva el código, o hay que pegarlo a mano del otro lado?**
 *
 * 🔴 Andreani es un portal y ⛔ no toma el código por URL, así que `trackingUrl` devuelve **la misma
 * dirección con código o sin él**: el link se abre en una pantalla vacía y quien lo apretó tiene que
 * volver, seleccionar el código y pegarlo. Es chico y pasa **todas** las veces.
 *
 * 🔑 **Se DERIVA de las dos funciones, ⛔ no es una segunda lista de transportistas.** El día que
 * Andreani acepte el código por URL —o que entre un correo nuevo— esto se contesta solo; una lista
 * a mano al lado de otra es el defecto que este módulo ya pagó cuatro veces.
 */
export function elCodigoNoViajaEnElLink(via: ViaRetorno | null | undefined, codigo: string): boolean {
  const con = trackingUrl(via, codigo)
  return !!con && con === trackingPortalUrl(via)
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
