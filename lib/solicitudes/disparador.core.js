/**
 * **Los tres disparadores de una solicitud, en JS plano.** El relato de por qué existe el eje está
 * en `disparador.ts`, que re-exporta esto tipado y le suma lo que sólo mira la pantalla.
 *
 * # Por qué bajó a `.js` el 29-ago-2026
 *
 * Mismo motivo que `puertas.core.js` y `formato.core.js`: **`api/_agenda.js` corre en Node sin
 * pasar por el compilador de Next y no puede importar TypeScript**. Y lo necesita porque el
 * disparador dejó de ser un rótulo del historial: es **el eje del 2º disparador de la Agenda** —la
 * sesión de fotos—, el que decide de quién es el primer renglón, igual que la puerta decide de
 * quién es el nombre en el ingreso. Filtrar los moldes pasa en el handler, antes de insertar.
 *
 * ⛔ **La lista no se copia en `api/`.** Dos listas de los mismos tres valores es la forma exacta en
 * que el catálogo de la pantalla y el del handler terminan diciendo cosas distintas.
 */

export const DISPARADORES = ['ingreso', 'campania', 'faltante'];

/**
 * El rótulo en la palabra del negocio. `campania` se escribe sin ñ en el código (es una clave que
 * viaja al KV y vuelve) y con ñ en la pantalla.
 */
export const DISPARADOR_LABEL = {
  ingreso: 'Ingreso de mercadería',
  campania: 'Campaña',
  faltante: 'Faltante de catálogo',
};

/** ¿Es uno de los tres? Se usa al leer del KV, donde puede haber cualquier cosa. */
export function esDisparador(v) {
  return typeof v === 'string' && DISPARADORES.includes(v);
}

/**
 * El nombre del disparador en castellano, o la clave cruda si alguien guardó algo que ya no existe.
 *
 * 🔑 Existe por lo mismo que `rotuloPuerta`: el error de «hay moldes pero ninguno corre para esto»
 * lo lee una persona, y `campania` en un mensaje de error se lee como un typo.
 */
export function rotuloDisparador(key) {
  return Object.prototype.hasOwnProperty.call(DISPARADOR_LABEL, key)
    ? DISPARADOR_LABEL[key]
    : String(key || '');
}
