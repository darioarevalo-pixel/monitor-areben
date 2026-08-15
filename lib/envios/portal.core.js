/**
 * El portal del cadete: lo que decide qué sale a internet.
 *
 * # Por qué es `.js` y no `.ts`
 *
 * Mismo motivo que `reglas.core.js`: lo importa `api/_cadete.js`, que corre en Node sin pasar por el
 * compilador de Next. Y acá pesa más que en ningún lado — **lo que el cadete ve tiene que ser la
 * misma cuenta que dice el papel y que muestra la pantalla interna**, o un día el ticket manda a
 * cobrar algo que el portal da por saldado, con la clienta esperando en la puerta.
 *
 * # Qué se defiende acá
 *
 * Esto es lo único de Envíos abierto a internet, y lo que hay del otro lado no es plata: son
 * **nombres, direcciones y teléfonos de clientas**. Las tres barreras, en orden:
 *
 *   1. `fechaDelPortal` — el link sirve para HOY, no para la agenda entera. Sin esto, un link
 *      filtrado devuelve todas las direcciones que pasaron por la moto.
 *   2. `paraElCadete` — la salida se arma campo por campo. Nunca `{...fila}`: `datos` tiene la orden
 *      de Tienda Nube completa (mail, total, medio de pago, ítems).
 *   3. `ACCIONES` — la escritura es una lista cerrada de cuatro parches fijos. El body no se copia.
 */

import { aCobrar, envioSaldado, ESTADO_LABEL } from './reglas.core.js';

/** Cuántos días de tolerancia tiene el link alrededor del día del servidor. Ver `fechaDelPortal`. */
const DIAS_DE_GRACIA = 1;

const esFechaIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

/** Los días entre dos fechas ISO, sin husos: se comparan a mediodía UTC para que no muerda el borde. */
function distanciaEnDias(a, b) {
  const ms = Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`);
  return Math.round(ms / 86400000);
}

/**
 * Qué día puede pedir el portal.
 *
 * 🔴 **Es la barrera más importante de toda la tanda.** Sin esto, cualquiera con el link pide
 * `?fecha=2026-01-05` y se lleva la agenda entera: nombre, dirección y teléfono de cada clienta que
 * pasó por la moto. Con esto, el link sirve para el día que el cadete está repartiendo y nada más.
 *
 * 🔑 **La tolerancia de un día no es holgura: es el huso.** El servidor corre en UTC y a las 21:00
 * de Argentina ya devuelve mañana, así que sin el ±1 el portal se vaciaría solo justo en el medio
 * del turno tarde — el mismo motivo por el que la pantalla interna manda el día desde el navegador.
 *
 * Sin fecha pedida, contesta el día del servidor: es lo que hace que el link pelado funcione.
 */
export function fechaDelPortal(pedida, hoyDelServidor) {
  if (!esFechaIso(hoyDelServidor)) return null;
  if (pedida == null || pedida === '') return hoyDelServidor;
  if (!esFechaIso(pedida)) return null;
  return Math.abs(distanciaEnDias(pedida, hoyDelServidor)) <= DIAS_DE_GRACIA ? pedida : null;
}

/**
 * Un envío, visto desde la moto.
 *
 * 🔴 **Se arma campo por campo, y ese es todo el punto.** El mutante es `{...fila}` o un `select *`:
 * `datos` tiene la orden de Tienda Nube entera —mail de la clienta, total, medio de pago, cuotas,
 * ítems— y `vendedor`, `autor` y `cadete` son nombres de gente que trabaja acá. Nada de eso tiene
 * que ver con dejar un paquete en una puerta.
 *
 * 🔑 **`aCobrar` se calcula acá y no se manda `monto_envio` crudo.** Es la misma función que usa el
 * ticket impreso y la pantalla interna: si el portal hiciera su propia resta, el papel y el teléfono
 * podrían decir números distintos sobre la misma puerta.
 */
export function paraElCadete(fila) {
  return {
    id: fila.id,
    marca: fila.store,
    orden: fila.orden_numero,
    cliente: fila.cliente,
    direccion: fila.direccion,
    piso: fila.piso_depto,
    localidad: fila.localidad,
    anotacion: fila.anotacion,
    telefono: fila.telefono,
    turno: fila.turno,
    estado: fila.estado,
    estadoTexto: ESTADO_LABEL[fila.estado] || fila.estado,
    // La plata, ya resuelta: cuánto pedir en esta puerta y por qué.
    aCobrar: aCobrar(fila),
    envioSaldado: envioSaldado(fila),
    // `null` = el cadete todavía no dijo nada. No es `false`: "no cobré" es una respuesta.
    cobrado: fila.cobrado == null ? null : !!fila.cobrado,
  };
}

/**
 * Lo único que el portal puede escribir.
 *
 * 🔴 **Parches fijos, no campos del body.** El mutante es copiar lo que llegó
 * (`{ ...req.body }`): con eso, cualquiera con el link reescribe precios, nombres y direcciones.
 * Acá la acción elige de esta lista y el resto del cuerpo se ignora, exista o no.
 *
 * `no_cobrado` escribe `false` y no borra: "no me pagó" es un hecho que el cadete reporta, distinto
 * de "todavía no dijo nada" (`null`). Sin esa diferencia, la rendición del día no puede distinguir
 * un envío que falta cobrar de uno que nadie tocó.
 */
export const ACCIONES = {
  entregado: { estado: 'entregado' },
  no_entregado: { estado: 'no_entregado' },
  cobrado: { cobrado: true },
  no_cobrado: { cobrado: false },
};

/** El parche de una acción, o `null` si no existe. */
export function parcheDeAccion(accion) {
  return Object.prototype.hasOwnProperty.call(ACCIONES, accion) ? { ...ACCIONES[accion] } : null;
}

// ── El link y su PIN ─────────────────────────────────────────────────────────────────────────

/** Cuántos fallos de PIN antes de trabar, y por cuánto. Ver `pinTrabado`. */
export const MAX_FALLOS_PIN = 10;
export const MINUTOS_TRABADO = 15;

/**
 * ¿El PIN está trabado por intentos fallidos?
 *
 * 🔴 **Sin contador, cuatro dígitos son 10.000 combinaciones y eso es un rato de script.** El PIN no
 * es una contraseña de persona: es un segundo factor sobre 64 hex, y su trabajo es que un link
 * reenviado por WhatsApp no alcance solo. Pero sin traba, no hace ni ese trabajo.
 */
export function pinTrabado(fila, ahora) {
  const hasta = fila && fila.pin_bloqueado_hasta ? Date.parse(fila.pin_bloqueado_hasta) : 0;
  return !!hasta && hasta > Date.parse(ahora);
}

/**
 * Hasta cuándo vale un link que se genera hoy: **el 1º del mes que viene**.
 *
 * 🔑 Lo decidió Bruno así, y la fecha fija es mejor que "30 días" por un motivo práctico: el día que
 * hay que renovarlo es siempre el mismo y se puede poner en la agenda, en vez de depender de cuándo
 * se generó el anterior.
 *
 * 🔴 **Con el piso de 15 días**, que es lo que evita el caso bobo: un link generado el 29 moriría a
 * los dos días, y el cadete se quedaría sin la hoja un martes a la mañana. Ahí salta al 1º del mes
 * siguiente.
 */
export function venceElProximoPrimero(hoyIso) {
  if (!esFechaIso(hoyIso)) return null;
  const [a, m] = hoyIso.split('-').map(Number);
  const primero = (anio, mes) => `${anio + Math.floor((mes - 1) / 12)}-${String(((mes - 1) % 12) + 1).padStart(2, '0')}-01`;
  const proximo = primero(a, m + 1);
  return distanciaEnDias(proximo, hoyIso) >= 15 ? proximo : primero(a, m + 2);
}
