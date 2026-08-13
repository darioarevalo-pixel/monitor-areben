/**
 * Las reglas de un envío del día: qué valores son válidos y qué tiene que traer una fila.
 *
 * # Por qué es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js` y `lib/tienda.core.js`: `api/_envios.js` corre en Node
 * sin pasar por el compilador de Next y no puede importar TypeScript. Si esto fuera `.ts`, el
 * handler tendría que repetir las listas de estados y turnos, y el día que se agregue un estado
 * habría dos verdades. `lib/envios/core.ts` lo re-exporta tipado para la app.
 *
 * # Por qué la validación es del servidor y no sólo del formulario
 *
 * Es la lección de la agenda: una regla mal formada se guarda igual, no aparece nunca en la
 * pantalla, y nadie entiende por qué. Acá es peor —un `turno` mal escrito hace que el envío
 * desaparezca de la hoja del cadete y el paquete no salga— así que el handler valida ANTES de
 * escribir. La base tiene los mismos `check`, pero un error de constraint llega como un 500 críptico
 * en vez de decir qué campo está mal.
 */

/** Los dos turnos de reparto. Cerrado a propósito: en la planilla el 53,8% no decía cuál era. */
export const TURNOS = ['mañana', 'tarde'];

/**
 * De dónde salió el envío. El 90% son órdenes de Tienda Nube y entran solas; el 10% son ventas por
 * WhatsApp que se cargan a mano y tienen que seguir existiendo.
 */
export const ORIGENES = ['tn', 'manual'];

/**
 * El estado del envío, que en la planilla no existía —y por eso no se pudo medir una sola entrega
 * fallida en dos años de datos—.
 *
 * `no_entregado` es el que cierra el turno mal (nadie en casa, dirección equivocada); `reintento` es
 * el que vuelve a salir. Están separados porque son dos hechos distintos: el primero es el resultado
 * de hoy, el segundo es una decisión de mañana.
 */
export const ESTADOS = ['pendiente', 'preparado', 'despachado', 'entregado', 'no_entregado', 'reintento'];

/** Los estados en los que el paquete todavía no salió: son los que las chicas preparan. */
export const ESTADOS_EN_CASA = ['pendiente', 'preparado'];

/** Un envío que ya no vuelve a la lista del día. */
export const ESTADOS_CERRADOS = ['entregado', 'no_entregado'];

export const MARCAS = ['bdi', 'zattia'];

function esTexto(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/** Un número de plata: no negativo y finito. `null`/`''` cuentan como 0. */
function montoValido(v) {
  if (v == null || v === '') return true;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

/**
 * ¿Se puede guardar esta fila? Devuelve `null` si está bien, o el motivo en castellano si no.
 *
 * El mensaje es el que va a leer quien está cargando un envío a mano con el cliente esperando, así
 * que dice qué falta, no qué constraint se violó.
 */
export function validarEnvio(e) {
  if (!e || typeof e !== 'object') return 'Falta el envío.';
  if (!MARCAS.includes(e.store)) return 'Falta la marca (bdi o zattia).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.fecha || ''))) return 'Falta la fecha del reparto (YYYY-MM-DD).';
  if (!TURNOS.includes(e.turno)) return `El turno tiene que ser ${TURNOS.join(' o ')}.`;
  if (!ORIGENES.includes(e.origen)) return `El origen tiene que ser ${ORIGENES.join(' o ')}.`;
  if (e.estado != null && !ESTADOS.includes(e.estado)) return `Ese estado no existe. Los válidos son: ${ESTADOS.join(', ')}.`;
  if (!esTexto(e.direccion)) return 'Falta la dirección: sin eso el cadete no puede salir.';
  // Una orden de TN sin número no se puede volver a encontrar ni evitar que se duplique.
  if (e.origen === 'tn' && !esTexto(String(e.orden_numero == null ? '' : e.orden_numero))) {
    return 'Un envío de Tienda Nube necesita su número de orden.';
  }
  if (!montoValido(e.monto_envio)) return 'El monto del envío tiene que ser un número de cero para arriba.';
  if (!montoValido(e.monto_pedido_a_cobrar)) return 'El saldo a cobrar tiene que ser un número de cero para arriba.';
  return null;
}

