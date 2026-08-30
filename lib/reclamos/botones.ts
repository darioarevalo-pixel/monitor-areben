import {
  estaDecidido, laEtiquetaEstaDebida, ofertaEsperandoRespuesta, pideFotos,
  type EstadoReclamo, type ReclamoRow,
} from './tipos'
import { ESTADOS_CON_LINK as ESTADOS_CON_LINK_JS, elLinkSigueVivo } from './portal.core.js'

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
  /**
   * El acuse de recibo de los casos que ⛔ no piden fotos. Es el **complemento exacto** de
   * `pedir_fotos`: donde no hay evidencia que pedir, igual hay que contestarle.
   */
  | 'acuse'
  /** El de apertura, con el link para que el cliente suba las fotos. */
  | 'pedir_fotos'
  /** El mismo link, cuando ya cargó fotos y no alcanzan. Va en el detalle, ⛔ no en la columna. */
  | 'mas_fotos'
  /** Ya mandó lo suyo y nadie decidió todavía: se le dice que está en manos nuestras. */
  | 'revisando'
  /** La oferta de que se lo quede, mientras espera respuesta. El único que hace una PREGUNTA. */
  | 'propuesta'
  /** Qué se resolvió. Existe desde que hay resolución, ⛔ no desde que hay campos cargados. */
  | 'resolucion'
  /** La etiqueta todavía ⛔ no existe: se le avisa que no tiene que hacer nada. */
  | 'etiqueta_en_camino'
  /** El seguimiento del retorno, cuando ya hay etiqueta. */
  | 'etiqueta'
  /** Ya salió lo que se le manda: el cambio, la otra unidad o lo que faltaba. */
  | 'despacho_hecho'
  /** Lo que devolvió ya está acá. Es el único movimiento físico que ⛔ no se le contaba. */
  | 'retorno_recibido'
  /** El cupón ya existe en la tienda y tiene código. */
  | 'cupon_listo'
  /** La plata ya salió. */
  | 'plata_enviada'

/**
 * Los estados en los que el link del cliente todavía sirve.
 *
 * 🔴 **Hasta el 29-ago-2026 esta lista estaba escrita DOS veces**, y este comentario lo decía:
 * *«tiene que ser el mismo conjunto que `ABIERTO` en `api/_reclamo.js`»*. Ya habían dejado de
 * coincidir (D16). Ahora sale del núcleo, que es el que leen los dos lados.
 */
export const ESTADOS_CON_LINK = ESTADOS_CON_LINK_JS as EstadoReclamo[]

/**
 * ¿El portal del cliente todavía contesta para esta fila?
 *
 * ⚠️ Mira **el estado y la decisión**, ⛔ no sólo el estado: `borrador` significa también «cambio
 * decidido esperando el pago». La regla entera —y por qué es la misma del servidor— está en
 * `portal.core.js`.
 */
export function linkVivo(d: ReclamoRow): boolean {
  return elLinkSigueVivo(d)
}

/**
 * Los mensajes que corresponden **en este momento**, en el orden en que se ofrecen.
 *
 * ⚠️ `pedir_fotos` mira **tres** cosas, y las tres hacen falta:
 *
 * 1. que el link siga vivo (`linkVivo`), que ya son **dos** preguntas y ⛔ no son la misma: fuera
 *    de los tres estados abiertos el portal contesta 404, y un **cambio decidido vuelve a
 *    `borrador` a propósito** (lo termina el POS) ⇒ sin la segunda mitad, el caso ya resuelto
 *    volvía a ofrecer el link. Decidido, lo que corresponde es contar la resolución. ⚠️ **Las dos
 *    viven juntas en `portal.core.js` desde el 29-ago-2026**, porque el servidor tenía sólo la
 *    primera y ésa era la mitad que dejaba el portal abierto (D16);
 * 2. que el caso **pida** fotos (`pideFotos`): en «no le llegó nunca», «demora» y «sin stock» no
 *    hay nada que fotografiar, y el alta ya decía *«acá no hacen falta fotos»* mientras la lista lo
 *    contradecía. ⚠️ **El que quiere cambiar la prenda SÍ entra** — lo corrigió Bruno el
 *    27-ago-2026: por esta lista entran órdenes online, así que la prenda **viaja**, y hay que ver
 *    en qué estado vuelve. El cambio de mostrador se arma en la pestaña Cambios;
 * 3. que **no haya llegado ninguna**. Con fotos adentro, el pedido ya se cumplió.
 *
 * `mas_fotos` pide **las mismas menos la última**, ⛔ no sólo «hay fotos»: en un caso que no
 * las necesita —«no le llegó nunca»— alguien del equipo igual puede haber subido una, y ofrecer
 * «pedir más» ahí es el mismo ruido que se está sacando, por la otra punta.
 *
 * 🔴 🔑 **Con una oferta esperando respuesta, el momento es ÉSE — y ⛔ desplaza a los otros dos.**
 * `propuesta` ⛔ no se suma a la columna: la **reemplaza**. Mientras el cliente no conteste, la
 * resolución guardada es la salida *«por si dice que no»*, así que ofrecer los dos mensajes a la
 * vez es ofrecerle a quien atiende **prometer dos cosas distintas sobre el mismo reclamo** —«te
 * devolvemos todo» y «quedátelo por una parte»—, y la que salga primero es la que el cliente va a
 * reclamar después. Por el mismo motivo se calla `pedir_fotos`: quien ya armó una propuesta tiene
 * la evidencia que necesitaba. ⚠️ `mas_fotos` **sí** sigue —vive en el detalle, ⛔ no en la
 * columna—: es de quien está mirando el caso, no de quien habla con el cliente.
 *
 * 🔴 🔑 **`etiqueta_en_camino` y `etiqueta` son EXCLUYENTES, y el que los separa es el DATO.** El
 * mismo `seguimiento_vuelta` que enciende el segundo apaga el primero: mientras no existe, lo único
 * que se le puede decir al cliente es *«te la mandamos apenas la tengamos y hasta entonces no hacés
 * nada»*; cuando existe, se le manda. ⛔ Sin el primero, el reclamo que el cliente **no** acepta
 * quedaba mudo justo en el rato en que él cree que la pelota es suya — y el reloj de «hace N días
 * que no llega» arrancaba sobre una espera que nunca fue de él.
 *
 * 🔴 **Y `etiqueta_en_camino` cae del lado de las PROMESAS, ⛔ no de los hechos** — se corrigió el
 * 28-ago-2026, el día después de escribirlo: con una oferta esperando salían **los dos**, o sea
 * *«¿te lo querés quedar por $13.491?»* y *«te mando la etiqueta para que lo devuelvas»* en la
 * misma columna. La regla estaba escrita acá arriba y el código no la cumplía ⇒
 * [[feedback_areben_invariante_escrito_no_frena]]. Por eso mira `laEtiquetaEstaDebida` y ⛔ no
 * `faltaMandarLaEtiqueta`: **que falte es un hecho de la fila; que sea nuestro turno, ⛔ no.**
 *
 * ⚠️ **`etiqueta`, `despacho_hecho` y `plata_enviada` ⛔ no se callan**, y la diferencia es la que
 * separa este archivo de una lista de condiciones: los otros tres son **promesas** y ésos son
 * **hechos que ya ocurrieron** en el mundo. Un hecho ⛔ no se contradice con una propuesta.
 *
 * 🔴 🔑 **`despacho_hecho` es el que faltaba, y el agujero era del CABLE, ⛔ no de la regla**
 * (28-ago-2026): `mensajeSeguimiento(…, 'reenvio')` existía, estaba probado, y su único llamador
 * era el test — o sea que **cuando le mandábamos algo al cliente, el cliente no se enteraba por el
 * sistema**, en las tres resoluciones que mandan algo (el cambio, la reposición y el reenvío) ⇒
 * [[feedback_areben_pendiente_derivado_sin_gesto]], la misma forma que el botón «Despaché» del
 * 25-ago. Se lee de `envio_nuevo_estado === 'hecho'` —el pendiente que deja `saleUnEnvio` y que
 * tilda Depósito—, exactamente como `plata_enviada` se lee de `reintegro_estado`: **el hecho lo
 * cuenta quien lo hizo**, ⛔ no un campo de texto aparte.
 *
 * 🔴 🔑 **`acuse` es el COMPLEMENTO EXACTO de `pedir_fotos`, y por eso tapa el agujero más grande
 * que tenía este archivo** (29-ago-2026, I1 del mapa operativo). `demora`, `no_llego` y `sin_stock`
 * tienen `fotos: 'nunca'` ⇒ `pide` es `false` ⇒ **la columna quedaba en cero mensajes**: el local
 * abría el reclamo y ⛔ no tenía una sola cosa para copiarle a un cliente que ya había escrito
 * enojado. Y peor: el gesto de copiar la apertura **es** el único que saca la fila de `borrador`, así
 * que esos tres ⛔ **no podían salir nunca** — mientras el aviso les gritaba *«abierto hace N días y
 * todavía no se le escribió»*, que sólo apagaba que Administración decidiera. Tres de once casos, y
 * los dos que más duelen. ⇒ [[feedback_areben_modulo_que_nace_mudo]], entrando por la puerta del
 * texto.
 *
 * 🔑 **`revisando` es el estado de la decisión dicho en criollo**, y ⛔ no contradice la regla de
 * «ni uno de más»: `en_revision` significa *el cliente ya mandó lo suyo*, puede durar días
 * (`DIAS_ALERTA.sinDecidir`), y hasta hoy era el único momento abierto **sin nada que decir** — la
 * escapatoria era `mas_fotos`, que vive adentro del `⋯` porque es una decisión, ⛔ no una respuesta.
 * ⚠️ Se calla si `pedir_fotos` está pidiendo: el cliente puede apretar «enviar» sin subir nada, y ahí
 * lo que corresponde es volver a pedirlas, ⛔ no decirle que las estamos mirando.
 *
 * 🔑 **`retorno_recibido` y `cupon_listo` son HECHOS, y los dos venían de la misma forma de
 * defecto**: un pendiente que alguien tilda y el cliente ⛔ no se entera, que es exactamente D5.
 * `recibido` era el único movimiento **físico** del ciclo sin mensaje —el cliente despachó, pagó la
 * espera, y del otro lado nadie le decía que llegó—; y el cupón se prometía *«te pasamos el código
 * apenas lo tengamos»* y después `cupon-emitido` lo sellaba **en silencio**. Los dos se leen del
 * pendiente que los cuenta (`estado` y `cupon_estado`+`cupon_codigo`), ⛔ no de un campo nuevo: el
 * hecho lo cuenta quien lo hizo.
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
  const esperando = ofertaEsperandoRespuesta(d)
  // `linkVivo` ya contesta las dos mitades de «abierto»: el estado Y que nadie haya decidido.
  const abierto = linkVivo(d)
  const pide = abierto && pideFotos(d.motivo, d.expectativa)
  const pidiendoFotos = pide && !fotos && !esperando
  if (abierto && !pide && !esperando) ms.push('acuse')
  if (pidiendoFotos) ms.push('pedir_fotos')
  if (pide && !!fotos) ms.push('mas_fotos')
  if (abierto && d.estado === 'en_revision' && !esperando && !pidiendoFotos) ms.push('revisando')
  if (esperando) ms.push('propuesta')
  if (estaDecidido(d) && !esperando) ms.push('resolucion')
  if (laEtiquetaEstaDebida(d)) ms.push('etiqueta_en_camino')
  if (d.seguimiento_vuelta) ms.push('etiqueta')
  if (d.envio_nuevo_estado === 'hecho') ms.push('despacho_hecho')
  if (d.estado === 'recibido') ms.push('retorno_recibido')
  if (d.cupon_estado === 'hecho' && d.cupon_codigo) ms.push('cupon_listo')
  if (d.reintegro_estado === 'hecho') ms.push('plata_enviada')
  return ms
}
