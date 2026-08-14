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

import { diaDeSemanaDe } from '../calendario/fechas.core.js';

/** Los dos turnos de reparto. Cerrado a propósito: en la planilla el 53,8% no decía cuál era. */
export const TURNOS = ['mañana', 'tarde'];

/**
 * **Qué turnos existen cada día.** El cadete no sale cualquier día: de lunes a viernes por la tarde,
 * y martes y jueves también por la mañana. Sábado y domingo no hay reparto.
 *
 * 🔴 **Se indexa con `getDay()`: 0 es domingo.** No se reordena para que arranque en lunes. Es la
 * misma convención que `dias` en la agenda (`lib/agenda/reglas.core.js`) y que `DIAS_CORTOS` en
 * `lib/fechas/semana.ts`, donde ya se cometió el error una vez: dar vuelta el array corrió todas las
 * etiquetas un día **sin que fallara nada ni se rompiera un test**.
 */
export const TURNOS_POR_DIA = {
  0: [],                    // domingo
  1: ['tarde'],             // lunes
  2: ['mañana', 'tarde'],   // martes
  3: ['tarde'],             // miércoles
  4: ['mañana', 'tarde'],   // jueves
  5: ['tarde'],             // viernes
  6: [],                    // sábado
};

/** Los turnos que existen ese día. `[]` es "no hay reparto". */
export function turnosDe(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) return [];
  return TURNOS_POR_DIA[diaDeSemanaDe(fecha)] || [];
}

/**
 * ¿Ese día tiene ese turno?
 *
 * 🔑 **Esto NO se valida en el servidor, y es a propósito.** La grilla es lo normal, no una ley: un
 * envío especial un sábado tiene que poder salir sin que haya que tocar el código un día que el
 * local está laburando. La pantalla ofrece sólo los turnos que existen y avisa si se elige otro; el
 * handler lo guarda igual.
 */
export function esTurnoDeGrilla(fecha, turno) {
  return turnosDe(fecha).includes(turno);
}

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
  // 🔑 Fecha y turno son **los dos o ninguno**. Sin ninguno es la bandeja de pendientes: el pedido
  // ya se cotizó y todavía no tiene día porque lo confirma el cliente. Con fecha y sin turno es el
  // estado que la planilla vieja tenía en el 53,8% de sus filas, y por eso se rechaza acá y también
  // en la base (`envios_fecha_turno_juntos`).
  const conFecha = e.fecha != null && e.fecha !== '';
  const conTurno = e.turno != null && e.turno !== '';
  if (conFecha && !/^\d{4}-\d{2}-\d{2}$/.test(String(e.fecha))) return 'La fecha del reparto va como YYYY-MM-DD.';
  if (conFecha && !TURNOS.includes(e.turno)) return `Si tiene día, el turno tiene que ser ${TURNOS.join(' o ')}.`;
  if (conTurno && !conFecha) return 'Un turno sin día no se puede repartir: falta la fecha.';
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

