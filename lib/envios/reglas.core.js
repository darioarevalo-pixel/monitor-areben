/**
 * Las reglas de un envío del día: qué valores son válidos, qué tiene que traer una fila, y **cuánto
 * se cobra en cada puerta**.
 *
 * # Por qué es `.js` y no `.ts`
 *
 * Mismo motivo que `lib/permisos.core.js` y `lib/tienda.core.js`: `api/_envios.js` corre en Node
 * sin pasar por el compilador de Next y no puede importar TypeScript. Si esto fuera `.ts`, el
 * handler tendría que repetir las listas de estados y turnos, y el día que se agregue un estado
 * habría dos verdades. `lib/envios/core.ts` lo re-exporta tipado para la app.
 *
 * 🔑 **Por eso también vive acá la cuenta de la puerta** (`aCobrar`, `tarifaCadete`, `netoDelEnvio`).
 * Empezó en `core.ts`, pero la lee gente que no puede importar TypeScript: el handler, y el portal
 * que el cadete abre en la calle. Lo que el papel dice que hay que cobrar, lo que la pantalla
 * muestra y lo que el portal deja marcar tienen que salir de **una sola** implementación — dos
 * copias que se contradicen es la forma de que el ticket mande a cobrar algo que la pantalla da por
 * pagado, con el cadete ya en la puerta.
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

// ── La plata ─────────────────────────────────────────────────────────────────────────────────

/** PostgREST devuelve `numeric` como string. Mismo criterio que `lib/crm/core.js`. */
export function num(v) {
  return parseFloat(String(v)) || 0;
}

/**
 * **Lo que el cadete tiene que cobrar en esta puerta.**
 *
 * Es la única cuenta que importa de todo el módulo, y son dos sumandos:
 *   · el envío, salvo que ya esté saldado —pagado por adelantado o bonificado—;
 *   · el saldo del pedido, si quedó algo por cobrar.
 *
 * 🔴 El caso "no hay que cobrar nada" es lo normal, no el borde: se midió sobre dos años de la
 * planilla que **en la mediana el 100% de lo que el cadete cobra es el envío** —el producto ya se
 * pagó por transferencia antes de despachar—. Un ticket que cobre de más un pedido ya pagado es un
 * problema con el cliente en la puerta, no un error de redondeo.
 */
export function aCobrar(e) {
  const envio = envioSaldado(e) ? 0 : num(e.monto_envio);
  return envio + num(e.monto_pedido_a_cobrar);
}

/**
 * ¿El envío ya está saldado, sea quien sea el que lo pagó?
 *
 * 🔑 **Son dos hechos distintos y por eso son dos tildes, pero en la puerta valen lo mismo**: el
 * cadete no cobra el envío ni cuando la clienta ya lo transfirió (`envio_pagado`) ni cuando se lo
 * regalamos (`envio_bonificado`). Se guardan separados porque después hay que poder preguntar
 * cuánta plata regalamos en envíos, que es una pregunta distinta de cuánta se cobró por adelantado
 * — y esa diferencia se pierde para siempre si se colapsan en un booleano.
 */
export function envioSaldado(e) {
  return !!e.envio_pagado || !!e.envio_bonificado;
}

/** ¿Esta puerta no se cobra? Lo que decide si el ticket dice PAGADO en vez de un monto. */
export function estaTodoPago(e) {
  return aCobrar(e) === 0;
}

/**
 * **Lo que le debemos al cadete por llevar este paquete**, que es el costo del reparto y nada más.
 *
 * 🔑 **`monto_envio` es el costo del envío, exista o no cobro en la puerta.** Hubo una versión con
 * una segunda columna (`pago_cadete`) para el caso bonificado, porque entonces el bonificado se
 * escribía poniendo el precio en cero: el reparto figuraba gratis y la diferencia se la comía él.
 * Se fue el 15-ago-2026, y lo que la reemplaza es más simple y más difícil de romper — el precio
 * **nunca** se borra; lo que cambia es quién lo paga (`envio_pagado` / `envio_bonificado`). Dos
 * columnas para el mismo número es la enfermedad que este módulo persigue en todos lados.
 */
export function tarifaCadete(e) {
  return num(e.monto_envio);
}

/**
 * **Lo que el cadete tiene que traer por este envío**, y el corazón de toda la cuenta.
 *
 * Cobró `aCobrar(e)` en la puerta y le debemos `tarifaCadete(e)` por haberlo llevado. La resta es lo
 * que sobra, y **puede dar negativo**: ahí le debemos nosotros.
 *
 * Los tres casos reales, para que se vea que no hay ninguno raro:
 *   · envío cobrado en la puerta, producto ya pagado → cobra el envío y se lo queda: **0**.
 *   · el envío ya estaba pago o iba bonificado → lo llevó y no cobró nada: **le debemos**.
 *   · cobró el producto en efectivo → **trae esa plata**, menos su envío.
 *
 * Que el caso normal dé cero es la razón por la que la planilla nunca necesitó una cuenta: mientras
 * todo se cobre en la puerta, nadie se debe nada. Los otros dos son los que se arrastraban de
 * memoria.
 */
export function netoDelEnvio(e) {
  return aCobrar(e) - tarifaCadete(e);
}

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
  // 🔑 Los dos tildes dicen que el cadete no cobra el envío, pero por motivos opuestos: uno es que
  // la clienta ya lo pagó, el otro que no lo paga nadie. Juntos son dos verdades sobre la misma
  // plata, y el día que haya que contestar «cuánto regalamos en envíos» esas filas no se pueden
  // contar ni dejar afuera. En la puerta no se nota —`aCobrar` da lo mismo—, así que si no se
  // rechaza acá no se rechaza en ningún lado.
  if (e.envio_pagado && e.envio_bonificado) {
    return 'Un envío no puede estar pagado y bonificado a la vez: o lo pagó la clienta, o se lo regalamos.';
  }
  return null;
}

