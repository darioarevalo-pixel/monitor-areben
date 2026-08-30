/**
 * La tabla de efectos: qué movimientos genera cada resolución de un reclamo.
 *
 * En `.js` plano porque la lee `api/_reclamos.js` (rama `decidir`) y también la app, y los handlers
 * de `api/*.js` corren en Node sin el compilador de Next — mismo motivo que `lib/permisos.core.js`.
 *
 * # Por qué existe
 *
 * Los pendientes de un reclamo se derivaban con dos condiciones escritas a mano adentro de
 * `decidir`, una por columna:
 *
 *     reintegro_estado: compensacion === 'otra_unidad' || compensacion === 'ninguna' ? 'no_aplica' : 'pendiente'
 *     stock_estado:     esCambio || compensacion === 'otra_unidad' ? 'no_aplica' : 'pendiente'
 *
 * Escrito así, cada resolución nueva había que acordarse de agregarla a las dos listas, y **tres de
 * las siete no estaban**: con `reenvio`, con `cupon` y con `ninguna` se encendían *"devolver la
 * plata"* y *"anular la venta en Gestión Nube"*, y ninguna de las dos corresponde. En un reenvío el
 * cliente **se queda con lo que compró** —sólo que ahora sí lo recibe—, así que no hay plata que
 * devolver ni venta que anular; en un cupón tampoco; y `ninguna` es literalmente "no se compensa".
 *
 * El daño no era visible: son pendientes que nadie puede tildar nunca, en la columna que la gente
 * después aprende a no mirar. El comentario del código ya decía que el cupón no debía generarlos,
 * pero la condición nunca lo incluyó — que es exactamente lo que pasa cuando la regla vive repartida
 * en vez de en un solo lugar.
 *
 * # La forma
 *
 * Una fila por resolución y **siempre las mismas preguntas**. Agregar una resolución es agregar
 * una fila: si falta un campo, TypeScript y los tests lo marcan, en vez de quedar silenciosamente
 * fuera de una lista.
 *
 * ⚠️ Cambia lo que se DERIVA al decidir, no lo ya guardado: las filas viejas de `reenvio`, `cupon` y
 * `ninguna` siguen con sus pendientes imposibles hasta que se corran los `update` de
 * `sql/migrate-reclamos-efectos.sql`.
 */

import { deDondeVuelve, loQueFaltaLlegar, unidadesQueVuelven } from './unidades.core.js';

/** Las respuestas posibles de cada una de las seis preguntas. */
const SIEMPRE = 'siempre';
const NUNCA = 'nunca';
/** Sólo si la cuenta del cambio quedó a favor del cliente (diferencia negativa). */
const SI_QUEDA_A_FAVOR = 'si_queda_a_favor';
/** Sólo si quedó plata a cobrarle (diferencia positiva). */
const SI_QUEDA_A_COBRAR = 'si_queda_a_cobrar';

/**
 * @typedef {Object} EfectosResolucion
 * @property {string} plata       ¿Sale plata de la caja? → `reintegro_estado`
 * @property {string} anulaVenta  ¿Se anula la venta original en Gestión Nube? → `stock_estado`
 * @property {string} reingreso   ¿Hay que reingresar a mano lo devuelto? → `reingreso_estado`
 * @property {string} cobro       ¿Hay una diferencia a cobrar? → `cobro_estado`
 * @property {string} envioNuevo  ¿Sale un envío hacia el cliente?
 * @property {string} cupon       ¿Hay que emitir un cupón en la tienda? → `cupon_estado`
 * @property {string} ayuda       Qué significa esta resolución, en una línea.
 */

/** @type {Record<string, EfectosResolucion>} */
export const EFECTOS_RESOLUCION = {
  // Se le devuelve todo lo que pagó. La venta original se anula: el cliente ya no compró nada.
  plata_total: {
    plata: SIEMPRE, anulaVenta: SIEMPRE, reingreso: NUNCA, cobro: NUNCA, envioNuevo: NUNCA, cupon: NUNCA,
    ayuda: 'Se le devuelve todo y la compra se deshace.',
  },
  // Se le devuelve una parte y se queda con el producto. La venta igual se anula: la unidad vuelve
  // al stock en Gestión Nube y la falla la vuelve a sacar, que es lo que la deja valuada como falla.
  plata_parcial: {
    plata: SIEMPRE, anulaVenta: SIEMPRE, reingreso: NUNCA, cobro: NUNCA, envioNuevo: NUNCA, cupon: NUNCA,
    ayuda: 'Se le devuelve una parte y se queda con el producto.',
  },
  // El cambio. ⚠️ **La venta original NO se anula**: el cliente se queda con la compra y sólo cambia
  // el artículo. Exigir la anulación dejaba todo cambio trabado sin poder cerrarse nunca. Lo que sí
  // hay es reingresar a mano lo que devolvió — Gestión Nube no acepta una venta negativa por API.
  otro_producto: {
    plata: SI_QUEDA_A_FAVOR, anulaVenta: NUNCA, reingreso: SIEMPRE, cobro: SI_QUEDA_A_COBRAR,
    envioNuevo: SIEMPRE, cupon: NUNCA,
    ayuda: 'Lo cambia por otro producto.',
  },
  // Reposición: otra unidad del mismo producto. La venta original queda en pie —el cliente se queda
  // con lo que compró— y por eso no se anula: anularla devolvería al stock una unidad que nunca
  // volvió, y dejaría la venta sin registrar.
  otra_unidad: {
    plata: NUNCA, anulaVenta: NUNCA, reingreso: NUNCA, cobro: NUNCA, envioNuevo: SIEMPRE, cupon: NUNCA,
    ayuda: 'Se le manda otra unidad igual.',
  },
  // 🔧 Se le manda lo que le corresponde y nunca llegó a tener (faltante, producto equivocado, no
  // llegó). Igual que la reposición: la compra sigue en pie. **Antes encendía plata y anulación.**
  reenvio: {
    plata: NUNCA, anulaVenta: NUNCA, reingreso: NUNCA, cobro: NUNCA, envioNuevo: SIEMPRE, cupon: NUNCA,
    ayuda: 'Se le manda lo que corresponde.',
  },
  // 🔧 Crédito para la próxima compra. No sale plata de la caja hoy y la venta queda como está.
  // **Antes encendía plata y anulación.**
  //
  // 🔑 **Lo que sí deja es el pendiente de EMITIRLO.** El cupón se crea a mano en la tienda y el
  // código se tipea acá: hasta el 25-ago-2026 nada avisaba si nunca se creó, así que un reclamo se
  // cerraba "con cupón" y el cliente se quedaba con la promesa de un código que no existía.
  cupon: {
    plata: NUNCA, anulaVenta: NUNCA, reingreso: NUNCA, cobro: NUNCA, envioNuevo: NUNCA, cupon: SIEMPRE,
    ayuda: 'Se le da un cupón para la próxima compra.',
  },
  // 🔧 No se compensa: se registra y se explica. Es la salida de una demora del transporte, donde el
  // pedido llegó y no hay nada que mover. **Antes encendía la anulación de la venta.**
  ninguna: {
    plata: NUNCA, anulaVenta: NUNCA, reingreso: NUNCA, cobro: NUNCA, envioNuevo: NUNCA, cupon: NUNCA,
    ayuda: 'Sin compensación: se registra y se explica.',
  },
};

export const RESOLUCIONES = Object.keys(EFECTOS_RESOLUCION);

export function esResolucion(v) {
  return Object.prototype.hasOwnProperty.call(EFECTOS_RESOLUCION, String(v));
}

/**
 * Las seis columnas que `pendientesDe` PISA al rehacer una decisión, y qué quiere decir tenerlas
 * tildadas. 🔑 **Es la misma lista que devuelve `pendientesDe`**: si mañana se agrega una columna
 * ahí y no acá, se puede volver a pisar un pendiente hecho — por eso hay un test que compara las
 * dos claves por clave.
 */
const EJECUTADO_EN_CRIOLLO = {
  reintegro_estado: 'ya se le devolvió la plata',
  stock_estado: 'ya se anuló la venta original en Gestión Nube',
  reingreso_estado: 'ya se reingresó en Gestión Nube el producto devuelto',
  cobro_estado: 'ya se cobró la diferencia',
  envio_nuevo_estado: 'ya se despachó lo que se le manda',
  cupon_estado: 'ya se emitió el cupón',
};

/**
 * Resuelve una de las seis preguntas a `true`/`false` con el contexto del caso.
 *
 * Las dos condicionales son del cambio, y las dos miran el mismo número: la **diferencia** entre lo
 * que devuelve y lo que se lleva. Negativa, la plata va para el cliente; positiva, se le cobra.
 */
function resolver(regla, diferencia) {
  if (regla === SIEMPRE) return true;
  if (regla === NUNCA) return false;
  if (diferencia == null) return false;
  if (regla === SI_QUEDA_A_FAVOR) return diferencia < 0;
  if (regla === SI_QUEDA_A_COBRAR) return diferencia > 0;
  return false;
}

/**
 * Los pendientes que deja una decisión, listos para escribir en la fila.
 *
 * Es la única función que sabe traducir una resolución a las cuatro columnas de estado. `decidir`
 * la llama y guarda lo que devuelve; nadie más deriva pendientes por su cuenta.
 *
 * @param {{ compensacion: string, diferencia?: number|null }} opciones
 * @returns {{ reintegro_estado: string, stock_estado: string, reingreso_estado: string, cobro_estado: string, envio_nuevo_estado: string, cupon_estado: string }}
 */
export function pendientesDe({ compensacion, diferencia = null }) {
  const efectos = EFECTOS_RESOLUCION[compensacion];
  // Una resolución que no está en la tabla no puede derivar nada. Antes caía en el `else` de los
  // ternarios y encendía pendientes al azar; ahora no enciende ninguno y se ve en la pantalla.
  if (!efectos) {
    return {
      reintegro_estado: 'no_aplica',
      stock_estado: 'no_aplica',
      reingreso_estado: 'no_aplica',
      cobro_estado: 'no_aplica',
      envio_nuevo_estado: 'no_aplica',
      cupon_estado: 'no_aplica',
    };
  }
  const marca = (regla) => (resolver(regla, diferencia) ? 'pendiente' : 'no_aplica');
  return {
    reintegro_estado: marca(efectos.plata),
    stock_estado: marca(efectos.anulaVenta),
    reingreso_estado: marca(efectos.reingreso),
    cobro_estado: marca(efectos.cobro),
    envio_nuevo_estado: marca(efectos.envioNuevo),
    cupon_estado: marca(efectos.cupon),
  };
}

/**
 * **¿Esta resolución anula la venta original en Gestión Nube?**
 *
 * 🔴 Existe porque **la respuesta se estaba contestando en dos lados**, y desde el 27-ago-2026 los
 * dos ⛔ no dicen lo mismo. `laFallaDescuentaStock` razonaba *«se le devolvió la plata ⇒ la venta se
 * anula ⇒ la unidad volvió al stock ⇒ hay que volver a sacarla»* y lo escribía como
 * `compensacion !== 'otra_unidad'`: una copia de la tabla, hecha a mano, cuando **las cinco
 * resoluciones menos el cambio anulaban**. Ese día `reenvio`, `cupon` y `ninguna` dejaron de anular
 * —encendían pendientes que nadie podía tildar— y la copia se quedó como estaba.
 *
 * ⚠️ **El daño ⛔ no se ve**: el alta en Fallas descontaba una unidad que la venta original ya había
 * descontado, y el stock quedaba corto por uno hasta el próximo conteo. Es *la regla más delicada
 * del módulo*, dicha por ella misma.
 *
 * 🔑 Sin resolución todavía **se asume que sí**, que es el caso más común y el que ya asumía la
 * copia vieja: la mayoría de los reclamos terminan devolviendo plata.
 */
export function seAnulaLaVenta(compensacion) {
  const efectos = EFECTOS_RESOLUCION[compensacion];
  return !efectos || efectos.anulaVenta === SIEMPRE;
}

/**
 * **La venta técnica ⛔ no puede salir antes que la anulación.** Devuelve el aviso, o `null` si se
 * puede.
 *
 * 🔴 **Es el orden del que cuelga que el stock quede bien, y hasta el 28-ago-2026 lo cuidaba una
 * sola de las dos puertas.** Cuando la venta original se anula, GN **devuelve +1** y esa unidad
 * —fallada o regalada— hay que volver a sacarla: para eso está la venta técnica. Pero si sale
 * ANTES de que la anulación esté hecha, descuenta una unidad que todavía no volvió y **el stock
 * queda uno abajo del real**, sin ningún error y hasta el próximo conteo.
 *
 * ⚠️ El aviso estaba escrito **sólo en `Reclamos.tsx`, y sólo en el camino de Fallas**. El de la
 * unidad sana —el que aprieta hoy Administración en R-0022, con la anulación pendiente y dos
 * productos por descontar— ⛔ no lo tenía: el mismo defecto, en el botón de al lado. Por eso la
 * regla vive acá y la ejercen las dos, y **el freno de verdad va antes de escribir en GN**
 * (`pasarAFallas`, `descontarRegaladas`), ⛔ no sólo en el toast: una pantalla que esconde un
 * botón es una sugerencia, no una regla.
 *
 * 🔑 **Y sólo muerde cuando la venta se anula.** Si queda en pie, la unidad nunca vuelve al stock:
 * ahí no hay orden que respetar porque ⛔ no hay nada que descontar.
 */
export function faltaAnularAntesDeDescontar(fila) {
  if (!fila || !seAnulaLaVenta(fila.compensacion) || fila.stock_estado !== 'pendiente') return null;
  return 'Primero anulá la venta en GN y tildá "Anulé en GN". Recién ahí la unidad vuelve al stock, y es la que se saca.';
}

/**
 * **Las columnas que `faltaRecibirAntesDeDevolver` mira.** Misma forma que `COLUMNAS_PARA_CERRAR`
 * y que `ENTRADAS_DEL_COSTO`, y por el mismo motivo: el handler lee la fila con un `select`, y un
 * `select` escrito a mano al lado de una regla nace con su propio agujero — el día que la regla
 * mire una columna más, el `select` ⛔ no la trae, la función la ve `undefined` y **deja pasar
 * justo lo que vino a frenar**, callada y en verde. La lista y la función se atan por test.
 *
 * ⚠️ Son las que lee la CADENA entera (`loQueFaltaLlegar` → `unidadesQueVuelven` → `deDondeVuelve`
 * + `destinoDeUnidad` + `laUnidadVuelve`), ⛔ no sólo las que aparecen escritas acá abajo.
 */
export const COLUMNAS_PARA_DEVOLVER = ['motivo', 'destino_prenda', 'retorno_decidido', 'items', 'items_correctos'];

/**
 * **La plata ⛔ no sale hasta que el producto vuelva.** Devuelve el texto de lo que falta, o `null`
 * si se puede devolver.
 *
 * 🔴 Hasta el 30-ago-2026 `reintegro` era **el único verbo que mueve plata sin leer la fila**: se
 * podía devolver la plata de un reclamo `en_transito`, con el producto en la calle. Y era peor que
 * un descuido, porque tildarlo **apaga** el aviso *«hace N días que la plata no sale»* ⇒ el caso se
 * quedaba **mudo**: plata afuera, producto afuera, y ni un reloj corriendo.
 *
 * 🔑 **⛔ No hace falta ninguna columna nueva**: `laUnidadVuelve` + `retorno_decidido` ya contestan
 * si algo tiene que volver, y `loQueFaltaLlegar` ya dice qué falta. Lo único que faltaba era que el
 * verbo lo leyera. Por eso la regla se apoya en la unidad —`recibida_at` por producto— y ⛔ no en
 * `estado`: en un reclamo de dos productos, uno puede haber llegado y el otro no, y el estado es
 * uno solo.
 *
 * 🔑 **El texto vive acá adentro** para que las dos puertas —el 409 del handler y el diálogo de la
 * pantalla— digan lo mismo porque es **el mismo string**, no porque alguien copió bien.
 *
 * ⚠️ **Vacío ⛔ no es "falta todo": es que no se espera nada.** Un reembolso en el que la unidad se
 * regala, o una demora sin producto en juego, ⛔ no tienen nada que esperar y la plata sale sin
 * traba. El cero de `loQueFaltaLlegar` acá **afirma**, y afirma bien: `unidadesQueVuelven` sale de
 * los destinos decididos, ⛔ no de una lista vacía por falta de carga.
 */
export function faltaRecibirAntesDeDevolver(fila) {
  const faltan = fila ? loQueFaltaLlegar(fila) : [];
  if (!faltan.length) return null;
  const que = faltan.map((u) => (u.item && u.item.producto) || 'el producto').join(' · ');
  return `La plata sale cuando el producto vuelva al depósito, y todavía falta que llegue: ${que}.`;
}

/**
 * ¿Esta resolución manda algo al cliente?
 *
 * Son las tres en que el cliente termina teniendo algo que antes no tenía: el cambio, la reposición
 * y el reenvío. Las tres dejan el pendiente `envio_nuevo_estado`.
 *
 * ⚠️ Cerrar un reclamo **no miraba el envío en ningún caso**. En el cambio existía la solicitud
 * EM#### como requisito para *facturar*, que es otra cosa: se puede facturar y no despachar nunca.
 * En la reposición y el reenvío no había absolutamente nada — el envío era un cartel en pantalla.
 */
export function saleUnEnvio(compensacion) {
  const efectos = EFECTOS_RESOLUCION[compensacion];
  return !!efectos && efectos.envioNuevo === SIEMPRE;
}

/**
 * **Lo que la decisión ya mandó a hacer y alguien HIZO**, en criollo y sin repetir.
 *
 * Existe para contestar una sola pregunta: **¿todavía se puede rehacer esta decisión?** Rehacerla
 * vuelve a pasar por `pendientesDe`, así que un pendiente ya tildado **vuelve a `pendiente`** — o
 * sea que la plata que se devolvió aparece otra vez como si no se hubiera devuelto, y la venta que
 * se anuló en Gestión Nube vuelve a pedir que la anulen. El 27-ago-2026 el botón «Volver a decidir»
 * salió sin ningún freno: se podía pisar una decisión ya ejecutada y nadie se enteraba.
 *
 * 🔑 **Mira exactamente las seis columnas que `pendientesDe` PISA**, ⛔ ni una más:
 * `tn_stock_estado` se decide en el alta y `reclamo_correo_estado` corre en paralelo (y `decidir`
 * ya respeta su `'hecho'` a propósito) ⇒ ninguna de las dos se pierde al rehacer, así que ninguna
 * de las dos es motivo para cerrar la puerta. Meterlas acá sería congelar decisiones por algo que
 * rehacerlas no rompe.
 *
 * 🔑 **Y los dos gestos FÍSICOS, que no son columnas**: el producto que ya volvió al depósito y el
 * que ya se descontó de Gestión Nube. Los dos pasaron en el mundo, no en la fila.
 *
 * ⚠️ Devuelve **por qué**, no un `true`/`false`: un botón que desaparece sin decir nada es el
 * defecto que este módulo ya tuvo dos veces (el pendiente sin gesto, el botón del lado equivocado
 * de la puerta). La pantalla muestra esta lista en el lugar donde estaba el botón.
 *
 * @param {object} fila
 * @returns {string[]}
 */
export function loEjecutado(fila) {
  if (!fila) return [];
  const hechos = [];
  for (const [columna, criollo] of Object.entries(EJECUTADO_EN_CRIOLLO)) {
    if (fila[columna] === 'hecho') hechos.push(criollo);
  }
  const vuelven = unidadesQueVuelven(fila).unidades;
  const recibidas = vuelven.filter((u) => u.item && u.item.recibida_at).length;
  if (recibidas === 1) hechos.push('ya volvió el producto');
  else if (recibidas > 1) hechos.push(`ya volvieron ${recibidas} productos`);
  const campo = deDondeVuelve(fila.motivo);
  const lista = Array.isArray(fila[campo]) ? fila[campo] : [];
  const descontadas = lista.filter((item) => item && item.baja_at).length;
  if (descontadas === 1) hechos.push('ya se descontó de Gestión Nube el producto que se queda el cliente');
  else if (descontadas > 1) hechos.push(`ya se descontaron de Gestión Nube ${descontadas} productos`);
  return hechos;
}
