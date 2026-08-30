/**
 * **Cuándo contesta el portal del cliente** — la única regla del módulo que decide algo abierto a
 * internet.
 *
 * # Por qué existe este archivo
 *
 * 🔴 La regla estaba escrita **dos veces**, y el propio código lo decía: `ESTADOS_CON_LINK`
 * (`botones.ts`) llevaba de comentario *«tiene que ser el mismo conjunto que `ABIERTO` en
 * `api/_reclamo.js`»*. Dos listas a mano, una en cada lado de la puerta — la forma exacta del
 * defecto que este módulo ya pagó cuatro veces ⇒
 * [[feedback_areben_dos_lados_bien_y_la_pregunta_del_medio]].
 *
 * 🔴 **Y ya habían dejado de coincidir** (D16 de la auditoría del 28-ago-2026). La lista dejó de
 * ofrecer el link de un cambio decidido —`linkVivo(d) && !estaDecidido(d)`—, pero el **servidor**
 * se quedó mirando sólo el estado. Y `borrador` significa dos cosas: un cambio decidido **vuelve a
 * `borrador` a propósito**, a esperar que el cliente pague. ⇒ **un link mandado antes seguía
 * abriendo**, y ⛔ no sólo para mirar: `accion: 'enviar'` le ponía `estado: 'en_revision'` a un
 * cambio ya resuelto, o sea que **el cliente podía mover para atrás una fila decidida**, desde
 * afuera y sin sesión.
 *
 * ⇒ La regla vive **acá sola**, y la leen los dos lados. Es `.core.js` y ⛔ no `.ts` porque
 * `api/*.js` ⛔ no puede importar TypeScript — mismo arreglo que `permisos.core.js`,
 * `faltantesParaCerrar` y `destinoDe`.
 *
 * ⚠️ **El vencimiento del token ⛔ no está acá**, y es a propósito: es un eje distinto (el reloj,
 * ⛔ no el caso) y del lado del Monitor tiene su propia salida —`reemitir-token` regenera el link
 * vencido—. Acá se contesta *«¿este reclamo todavía admite que el cliente cargue?»*.
 */

/**
 * Los estados en los que el portal puede contestar. **`cerrado` y todo lo posterior quedan
 * afuera**: una vez decidido el reclamo, lo que corresponde es contarle la resolución por WhatsApp.
 */
export const ESTADOS_CON_LINK = ['borrador', 'esperando_cliente', 'en_revision'];

/**
 * Las columnas que `elLinkSigueVivo` necesita leer.
 *
 * 🔑 **Una sola lista, como `COLUMNAS_PARA_CERRAR` y `ENTRADAS_DEL_COSTO`**: un `select` escrito a
 * mano al lado de una regla que mira otra cosa deja el freno mirando `undefined` — o sea **dejando
 * pasar justo lo que vino a frenar**, callado y en verde. Acá eso sería dejar abierto a internet un
 * reclamo que ya se decidió.
 */
export const COLUMNAS_DEL_PORTAL = ['estado', 'compensacion'];

/**
 * ¿El link del cliente todavía sirve para este reclamo?
 *
 * Las **dos** mitades hacen falta, y ⛔ no son la misma:
 *
 * 1. que el estado esté entre los tres abiertos;
 * 2. que el reclamo ⛔ **no esté decidido**. `borrador` significa dos cosas —«ni lo miré» y «cambio
 *    decidido esperando el pago»— y sin esta mitad el segundo queda abierto a internet.
 *
 * 🔑 «Decidido» es **tener compensación**, que es lo único que escribe `decidir`. Se lee el campo
 * y ⛔ no una lista de estados, por lo mismo de siempre: un dato que existe ⛔ no es una decisión
 * tomada, y al revés —una decisión tomada ⛔ no siempre mueve el estado—.
 */
export function elLinkSigueVivo(fila) {
  if (!fila) return false;
  return ESTADOS_CON_LINK.includes(fila.estado) && !fila.compensacion;
}

// ── La llave del portal: el token ───────────────────────────────────────────────
//
// 🔴 Se acuña en **tres** lugares —`crear` y `reemitir-token` (`api/_reclamos.js`) y ahora el alta
// pública (`api/_reclamo.js`)— y hasta el 30-ago-2026 estaba escrita **dos veces, a mano, en la
// misma línea**: `randomUUID().replace(...) + randomUUID().replace(...)`. Es la forma exacta del
// defecto que este módulo ya pagó cuatro veces ⇒ una tercera copia acá adentro sería el número que
// se despega. La regla del link vive con el link.
//
// ⚠️ Se usa `globalThis.crypto` y ⛔ **no** `node:crypto`: este archivo lo importa `botones.ts`, o
// sea que **entra al bundle del navegador**. Web Crypto está en los dos lados desde Node 19; un
// `import 'node:crypto'` acá rompería el build del cliente por una línea que el cliente ⛔ no usa.

/** El día que el link deja de servir. Un reclamo ⛔ no debería tardar más que esto. */
export const DIAS_DEL_LINK = 15;

/**
 * Un token nuevo: **64 hex aleatorios**, que es lo que exige `api/_reclamo.js` (`{32,128}`).
 *
 * ⚠️ El largo ⛔ no es decorativo: es la única defensa del portal, porque ⛔ no hay sesión. Bajarlo
 * ⛔ no rompe ningún test que mire el comportamiento — por eso lo mira uno que cuenta caracteres.
 */
export function nuevoToken() {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Hasta cuándo vale el link que se acuña ahora. */
export function venceElLink(desde = Date.now()) {
  return new Date(desde + DIAS_DEL_LINK * 86400000).toISOString();
}
