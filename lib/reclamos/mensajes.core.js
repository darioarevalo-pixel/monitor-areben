/**
 * **Qué se le dijo al cliente, y cuándo.**
 *
 * # Por qué existe
 *
 * `lib/reclamos/mensajes.ts` dice desde el día uno, en su primer párrafo, que *«el texto sale con
 * los datos ya puestos y queda registrado qué se le dijo y cuándo»*. 🔴 **La segunda mitad de esa
 * frase era falsa**: la columna `mensajes` aparecía **una sola vez en todo el módulo** —en el
 * `select` del handler— y ⛔ **no la escribía nadie**. R-0022, el primer reclamo real de BDI, la
 * traía `[]` después de que se le mandaron el link, la propuesta y la resolución (D9 de la
 * auditoría del 28-ago-2026).
 *
 * 🔑 **Y lo que se pierde no es un log: es la promesa.** De los cinco momentos, el que más importa
 * es el de resolución —ahí se le dice al cliente cuánta plata se le devuelve y cómo—, y de ése
 * ⛔ no quedaba absolutamente nada. Cuando el cliente vuelve a escribir *«me dijeron otra cosa»*,
 * lo único que había para contestarle era la memoria de quien atendió.
 *
 * # Por qué copiar cuenta como decirlo
 *
 * ⚠️ Lo que el sistema observa es el **copiado**, ⛔ no el envío: el mensaje se pega en WhatsApp,
 * que está afuera. La decisión de tratarlos como lo mismo **ya estaba tomada en este módulo** y
 * está escrita en `Reclamos.tsx`, en el mensaje de apertura: *«Copiar el mensaje ES escribirle: de
 * acá va derecho a WhatsApp»* — es el gesto que mueve el reclamo a `esperando_cliente`. Esto sigue
 * esa misma línea, y ⛔ no inventa una segunda semántica para el mismo gesto.
 *
 * 🔑 **Por eso el registro se apila cuando el portapapeles ACEPTÓ, ⛔ no cuando se apretó.** Es la
 * lección del 27-ago: *«el cartel dice lo que PASÓ, no lo que se intentó»*. Un registro que dice
 * «se le mandó la resolución» sobre un `writeText` que falló afirma de más justo donde más duele.
 *
 * # Lo que este archivo ⛔ NO hace
 *
 * ⛔ **No toca `updated_at`**, y ⛔ no es un detalle. `alertasDe` cuenta *«hace N días que la plata
 * no sale»* y *«esperando una decisión hace N días»* desde el último toque de la fila: si copiar el
 * mensaje de resolución moviera `updated_at`, **contarle al cliente que la plata va a salir
 * reiniciaría el reloj de que la plata no salió**. Es exactamente
 * [[feedback_areben_updated_at_no_mide_la_espera]], que este módulo ya pagó una vez con el reloj de
 * «hace N días que no llega». Por eso el handler escribe la columna a mano y ⛔ no pasa por
 * `apilar()`.
 *
 * ⛔ **Tampoco apila en `historial`.** El historial lleva el **estado** en el que la fila queda
 * (D17) y se lee para saber qué pasó y desde cuándo; cinco mensajes por reclamo lo llenarían de
 * eventos que no mueven nada. Los mensajes son una lista propia, al lado.
 *
 * Archivo **`.core.js`** —⛔ no `.ts`— porque lo importa `api/_reclamos.js`, y `api/*.js` ⛔ no
 * puede importar TypeScript. Mismo arreglo que `permisos.core.js`, `faltantesParaCerrar` y
 * `destinoDe`: la regla vive acá y la cara tipada queda en `tipos.ts`.
 */

/**
 * Los momentos que se le pueden contar al cliente. **Lista cerrada.**
 *
 * Los doce primeros son los de `MensajeDeLaFila` (`botones.ts`), que es lo que la lista de Reclamos
 * ofrece en cada momento. El último es el **ticket del cambio** (`detalleCambioTexto`), que sale por
 * la otra pantalla —`ArmarCambio.tsx`— y es igual de cara al cliente: dice qué se le lleva, qué se
 * le entrega y cuánto tiene que pagar.
 *
 * 🔑 **Está acá y ⛔ no en `botones.ts` porque el que la tiene que validar es el servidor**, y un
 * `tipo` libre convierte esta columna en un campo de texto: dos pantallas escribiendo `resolucion`
 * y `resolución` son dos historias distintas del mismo reclamo. El cable que ata esta lista a los
 * botones que la mandan vive en `tests/reclamos-registro-mensajes.test.ts`.
 *
 * 🆕 **Los cuatro del 29-ago-2026 son los cuatro momentos que estaban MUDOS** (I1 a I4 del mapa
 * operativo). El orden de la lista es el del recorrido, ⛔ no el de cuándo se escribieron.
 */
export const MOMENTOS_DEL_MENSAJE = [
  'acuse',
  'pedir_fotos',
  'mas_fotos',
  'revisando',
  'propuesta',
  'resolucion',
  'etiqueta_en_camino',
  'etiqueta',
  'despacho_hecho',
  'retorno_recibido',
  'cupon_listo',
  'plata_enviada',
  'detalle_cambio',
];

/**
 * La nota del historial que dice **que ya se le escribió**, cuando escribirle ⛔ no mueve el estado.
 *
 * 🔴 **Por qué hace falta una nota y ⛔ no alcanza el estado.** El único gesto de toda la app que
 * saca un reclamo de `borrador` es copiar el mensaje de apertura, y ése **sólo existe en los casos
 * que piden fotos**. En `demora` y `no_llego` no hay fotos que pedir *y la pelota es nuestra* —
 * estamos siguiendo el envío—, así que la fila se queda en `borrador` con razón: mandarla a
 * `esperando_cliente` afirmaría una espera que ⛔ no es del cliente. Pero entonces el aviso
 * *«abierto hace N días y todavía no se le escribió»* (`DIAS_ALERTA.sinMandar`) **acusaba de algo
 * que la pantalla no dejaba hacer, y sólo lo apagaba que Administración decidiera**.
 *
 * 🔑 **Va al `historial` y ⛔ no a `mensajes`.** El historial lleva los **hechos** de la fila y ya
 * viaja en `COLS`; `mensajes` lleva las **palabras** y salió de `COLS` a propósito por peso (~1,9 KB
 * por fila). *Le escribimos* es un hecho, ⛔ no una palabra.
 */
export const NOTA_SE_LE_ESCRIBIO = 'se le escribió';

/**
 * ¿Ya se le escribió alguna vez a este cliente?
 *
 * Mira el historial: el evento del mensaje de apertura (que además mueve el estado) y el de
 * `NOTA_SE_LE_ESCRIBIO`. ⚠️ **⛔ No mira `mensajes`**, por lo de arriba.
 */
export function yaSeLeEscribio(fila) {
  const eventos = Array.isArray(fila && fila.historial) ? fila.historial : [];
  return eventos.some((e) => typeof (e && e.nota) === 'string' && e.nota.startsWith(NOTA_SE_LE_ESCRIBIO));
}

/**
 * El tope de un mensaje, en caracteres. El más largo que arma hoy el módulo —la resolución de un
 * cambio con varios productos— ronda los 900, así que esto es holgura, ⛔ no un límite de negocio.
 *
 * 🔑 **Se rechaza, ⛔ no se recorta.** Un registro recortado dice que se le dijo **menos** de lo que
 * se le dijo, y este archivo existe justamente para poder contestar *«esto fue lo que te dijimos»*.
 */
export const LARGO_MAXIMO_MENSAJE = 4000;

/**
 * La ventana en la que un mensaje idéntico ⛔ no se vuelve a apilar, en segundos.
 *
 * 🔑 **No es una regla de negocio: es un doble click.** Copiar el mismo texto dos veces con cinco
 * minutos de diferencia es contarle dos veces —y eso hay que verlo—; copiarlo dos veces en el mismo
 * segundo es la mano temblando sobre el botón, y dejar las dos entradas escribe una historia falsa:
 * *«se le mandó dos veces la resolución»*. El número es arbitrario y está elegido, ⛔ no medido.
 */
export const SEGUNDOS_DEL_REPETIDO = 60;

/** ¿Es uno de los momentos que el módulo sabe nombrar? */
export function esMomentoDelMensaje(tipo) {
  return MOMENTOS_DEL_MENSAJE.includes(tipo);
}

/**
 * Apila un mensaje sobre los que ya están, o dice por qué no.
 *
 * Devuelve **una** de estas tres cosas, y el llamador las distingue sin adivinar:
 *
 * - `{ error }` — el registro no se puede escribir. Es 400: el momento no existe, el texto está
 *   vacío o pasa el tope;
 * - `{ repetido: true }` — es el mismo texto del mismo momento dentro de la ventana. ⛔ No se
 *   escribe y ⛔ **no es un error**: para el que apretó, el mensaje se copió igual;
 * - `{ mensajes }` — la lista nueva, entera, lista para guardar.
 *
 * ⚠️ **Mira sólo el ÚLTIMO**, y alcanza: lo que se está tapando es el doble click, que deja las dos
 * entradas pegadas. Recorrer la lista entera taparía además el caso real de volver a contarle lo
 * mismo al cliente más tarde, que es un hecho y tiene que quedar.
 */
export function apilarMensaje(previos, entrada) {
  const { tipo, texto, usuario = null, at } = entrada || {};
  if (!esMomentoDelMensaje(tipo)) return { error: 'ese momento del mensaje no existe' };
  const limpio = typeof texto === 'string' ? texto.trim() : '';
  if (!limpio) return { error: 'no vino el texto del mensaje: sin él no queda registro de qué se le dijo' };
  if (limpio.length > LARGO_MAXIMO_MENSAJE) {
    return { error: `el mensaje pasa los ${LARGO_MAXIMO_MENSAJE} caracteres y ⛔ no se recorta: un registro recortado dice que se le dijo menos de lo que se le dijo` };
  }

  const lista = Array.isArray(previos) ? previos : [];
  const cuando = at || new Date().toISOString();
  const ultimo = lista[lista.length - 1];
  if (ultimo && ultimo.tipo === tipo && ultimo.texto === limpio) {
    const separacion = (Date.parse(cuando) - Date.parse(ultimo.at)) / 1000;
    if (Number.isFinite(separacion) && separacion >= 0 && separacion < SEGUNDOS_DEL_REPETIDO) {
      return { repetido: true };
    }
  }

  return { mensajes: lista.concat([{ tipo, at: cuando, por: usuario || null, texto: limpio }]) };
}
