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
