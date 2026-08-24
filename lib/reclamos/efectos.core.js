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
 * Una fila por resolución y **siempre las mismas seis preguntas**. Agregar una resolución es agregar
 * una fila: si falta un campo, TypeScript y los tests lo marcan, en vez de quedar silenciosamente
 * fuera de una lista.
 *
 * ⚠️ Cambia lo que se DERIVA al decidir, no lo ya guardado: las filas viejas de `reenvio`, `cupon` y
 * `ninguna` siguen con sus pendientes imposibles hasta que se corran los `update` de
 * `sql/migrate-reclamos-efectos.sql`.
 */

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
 * @property {string} ayuda       Qué significa esta resolución, en una línea.
 */

/** @type {Record<string, EfectosResolucion>} */
export const EFECTOS_RESOLUCION = {
  // Se le devuelve todo lo que pagó. La venta original se anula: el cliente ya no compró nada.
  plata_total: {
    plata: SIEMPRE, anulaVenta: SIEMPRE, reingreso: NUNCA, cobro: NUNCA, envioNuevo: NUNCA,
    ayuda: 'Se le devuelve todo y la compra se deshace.',
  },
  // Se le devuelve una parte y se queda con el producto. La venta igual se anula: la unidad vuelve
  // al stock en Gestión Nube y la falla la vuelve a sacar, que es lo que la deja valuada como falla.
  plata_parcial: {
    plata: SIEMPRE, anulaVenta: SIEMPRE, reingreso: NUNCA, cobro: NUNCA, envioNuevo: NUNCA,
    ayuda: 'Se le devuelve una parte y se queda con el producto.',
  },
  // El cambio. ⚠️ **La venta original NO se anula**: el cliente se queda con la compra y sólo cambia
  // el artículo. Exigir la anulación dejaba todo cambio trabado sin poder cerrarse nunca. Lo que sí
  // hay es reingresar a mano lo que devolvió — Gestión Nube no acepta una venta negativa por API.
  otro_producto: {
    plata: SI_QUEDA_A_FAVOR, anulaVenta: NUNCA, reingreso: SIEMPRE, cobro: SI_QUEDA_A_COBRAR,
    envioNuevo: SIEMPRE,
    ayuda: 'Lo cambia por otro producto.',
  },
  // Reposición: otra unidad del mismo producto. La venta original queda en pie —el cliente se queda
  // con lo que compró— y por eso no se anula: anularla devolvería al stock una unidad que nunca
  // volvió, y dejaría la venta sin registrar.
  otra_unidad: {
    plata: NUNCA, anulaVenta: NUNCA, reingreso: NUNCA, cobro: NUNCA, envioNuevo: SIEMPRE,
    ayuda: 'Se le manda otra unidad igual.',
  },
  // 🔧 Se le manda lo que le corresponde y nunca llegó a tener (faltante, producto equivocado, no
  // llegó). Igual que la reposición: la compra sigue en pie. **Antes encendía plata y anulación.**
  reenvio: {
    plata: NUNCA, anulaVenta: NUNCA, reingreso: NUNCA, cobro: NUNCA, envioNuevo: SIEMPRE,
    ayuda: 'Se le manda lo que corresponde.',
  },
  // 🔧 Crédito para la próxima compra. No sale plata de la caja hoy y la venta queda como está.
  // **Antes encendía plata y anulación.**
  cupon: {
    plata: NUNCA, anulaVenta: NUNCA, reingreso: NUNCA, cobro: NUNCA, envioNuevo: NUNCA,
    ayuda: 'Se le da un cupón para la próxima compra.',
  },
  // 🔧 No se compensa: se registra y se explica. Es la salida de una demora del transporte, donde el
  // pedido llegó y no hay nada que mover. **Antes encendía la anulación de la venta.**
  ninguna: {
    plata: NUNCA, anulaVenta: NUNCA, reingreso: NUNCA, cobro: NUNCA, envioNuevo: NUNCA,
    ayuda: 'Sin compensación: se registra y se explica.',
  },
};

export const RESOLUCIONES = Object.keys(EFECTOS_RESOLUCION);

export function esResolucion(v) {
  return Object.prototype.hasOwnProperty.call(EFECTOS_RESOLUCION, String(v));
}

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
 * @returns {{ reintegro_estado: string, stock_estado: string, reingreso_estado: string, cobro_estado: string, envio_nuevo_estado: string }}
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
    };
  }
  const marca = (regla) => (resolver(regla, diferencia) ? 'pendiente' : 'no_aplica');
  return {
    reintegro_estado: marca(efectos.plata),
    stock_estado: marca(efectos.anulaVenta),
    reingreso_estado: marca(efectos.reingreso),
    cobro_estado: marca(efectos.cobro),
    envio_nuevo_estado: marca(efectos.envioNuevo),
  };
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
