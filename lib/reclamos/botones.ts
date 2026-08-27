import { estaDecidido, pideFotos, type EstadoReclamo, type ReclamoRow } from './tipos'

/**
 * **Qué mensajes se le ofrecen a quien atiende, en cada momento del reclamo.**
 *
 * # Por qué existe
 *
 * Bruno, 27-ago-2026: *«tiene que haber un mensaje para cada estado, y tienen que dejar de estar
 * botones que no sirven en cada estado»* — y el motivo es más grande que el orden de la pantalla:
 * *«para que pueda ejecutar la comunicación el local sin pensar o preguntar»*.
 *
 * ⇒ El criterio de aceptación ⛔ **no es «que exista el mensaje»**: es que en cada momento estén
 * **exactamente los que corresponden, ni uno de más**. Un botón de mensaje que no aplica cuesta lo
 * mismo que uno que falta — los dos obligan a decidir a alguien que no tendría que estar decidiendo
 * nada. Por eso esto devuelve una **lista cerrada** y los tests se escriben por momento (qué hay
 * y, la mitad que importa, qué ⛔ no), en vez de una condición suelta por botón adentro del JSX.
 *
 * # El caso que lo abrió
 *
 * `en_revision` significa literalmente **«el cliente ya cargó las fotos»**, y era el único estado
 * donde el local tenía un botón: **«Msj: pedir fotos»**, sobre alguien que ya las mandó. Bruno:
 * *«si ya cargó fotos, y estamos en la parte de decisión, no hay más fotos que cargar»*.
 * 📊 Medido con la fila real de R-0022 (BDI, una foto cargada, estado `borrador`): el botón
 * aparecía igual.
 *
 * 🔑 **Y la escapatoria se resuelve, ⛔ no se ignora**: a veces sí hacen falta más fotos. Por eso
 * `mas_fotos` sigue existiendo — pero **fuera de la columna de acciones**, que es la de «qué toca
 * ahora»: vive en el detalle de la fila, que es adonde va quien está mirando el caso y concluye
 * que lo que hay no alcanza. Es el mismo mensaje y el mismo link; lo que cambia es dónde está.
 */
export type MensajeDeLaFila =
  /** El de apertura, con el link para que el cliente suba las fotos. */
  | 'pedir_fotos'
  /** El mismo link, cuando ya cargó fotos y no alcanzan. Va en el detalle, ⛔ no en la columna. */
  | 'mas_fotos'
  /** Qué se resolvió. Existe desde que hay resolución, ⛔ no desde que hay campos cargados. */
  | 'resolucion'
  /** El seguimiento del retorno, cuando ya hay etiqueta. */
  | 'etiqueta'
  /** La plata ya salió. */
  | 'plata_enviada'

/**
 * Los estados en los que el link del cliente todavía sirve.
 *
 * Tiene que ser **el mismo conjunto** que `ABIERTO` en `api/_reclamo.js`: el portal devuelve 404
 * fuera de esos tres. Antes se usaba `ESTADOS_ABIERTOS` (seis estados) y la lista ofrecía copiar un
 * link que el backend ya rechazaba. Una vez decidido el reclamo el link muere a propósito, y de
 * ahí en más se le avisa al cliente por WhatsApp con el mensaje de resolución.
 */
export const ESTADOS_CON_LINK: EstadoReclamo[] = ['borrador', 'esperando_cliente', 'en_revision']

/** ¿El portal del cliente todavía contesta para esta fila? */
export function linkVivo(d: ReclamoRow): boolean {
  return ESTADOS_CON_LINK.includes(d.estado)
}

/**
 * Los mensajes que corresponden **en este momento**, en el orden en que se ofrecen.
 *
 * ⚠️ `pedir_fotos` mira **tres** cosas, y las tres hacen falta:
 *
 * 1. que el link siga vivo **y el reclamo no esté decidido**. Los dos hacen falta y ⛔ no son el
 *    mismo: fuera de los tres estados abiertos el portal contesta 404, y un **cambio decidido
 *    vuelve a `borrador` a propósito** (lo termina el POS) ⇒ sin la segunda mitad, el caso ya
 *    resuelto volvía a ofrecer el link. Decidido, lo que corresponde es contar la resolución;
 * 2. que el caso **pida** fotos (`pideFotos`) — depende del motivo **y** de qué quiere el cliente:
 *    en «no le llegó nunca» no hay nada que fotografiar, y el que viene a cambiar la prenda la
 *    trae al mostrador. El alta ya decía *«acá no hacen falta fotos»* y la lista lo contradecía;
 * 3. que **no haya llegado ninguna**. Con fotos adentro, el pedido ya se cumplió.
 *
 * `mas_fotos` pide **las mismas menos la última**, ⛔ no sólo «hay fotos»: en un caso que no
 * las necesita —«no le llegó nunca»— alguien del equipo igual puede haber subido una, y ofrecer
 * «pedir más» ahí es el mismo ruido que se está sacando, por la otra punta.
 *
 * 🔑 `resolucion` se gatea por `estaDecidido`, ⛔ no por «hay campos cargados»: desde que
 * «Confirmar paso» guarda por `editar`, el reclamo tiene datos mucho antes de tener decisión, y
 * un mensaje de resolución es una **promesa al cliente** — es la clase de botón que ⛔ no puede
 * adelantarse a la decisión. (Hoy `estaDecidido` es exactamente `!!compensacion`, que es lo que
 * escribe sólo `decidir`; queda dicho acá para que no se vuelva a leer un campo suelto.)
 */
export function mensajesDeLaFila(d: ReclamoRow): MensajeDeLaFila[] {
  const fotos = (d.fotos || []).length
  const ms: MensajeDeLaFila[] = []
  const pide = linkVivo(d) && !estaDecidido(d) && pideFotos(d.motivo, d.expectativa)
  if (pide && !fotos) ms.push('pedir_fotos')
  if (pide && !!fotos) ms.push('mas_fotos')
  if (estaDecidido(d)) ms.push('resolucion')
  if (d.seguimiento_vuelta) ms.push('etiqueta')
  if (d.reintegro_estado === 'hecho') ms.push('plata_enviada')
  return ms
}
