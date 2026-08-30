/**
 * **El código de seguimiento del retorno, y por qué tiene un piso.**
 *
 * # Por qué existe
 *
 * 🔴 `seguimiento_vuelta` ⛔ **no es un dato de adorno: es el que mueve el caso.** El mismo campo
 * decide cuatro cosas a la vez (`tipos.ts`, `botones.ts`):
 *
 * | mientras está vacío | apenas tiene algo |
 * |---|---|
 * | el estado se lee **«Falta mandarle la etiqueta»** | **«En camino de vuelta»** |
 * | el mensaje es *«te la mandamos apenas la tengamos»* | es *«acá está tu etiqueta»* |
 * | corre el reloj **nuestro**: `danger` a los 2 días | corre el del **transporte**: `warning` a los 15 |
 *
 * ⇒ **un código mal tipeado ⛔ no es un dato feo: apaga la alarma que nos apura a nosotros, prende
 * la que acusa al correo, y le manda al cliente un seguimiento que ⛔ no existe.** Cambia a quién
 * hay que ir a buscar, que es justo lo único que un aviso tiene que decir.
 *
 * # Por qué un PISO y ⛔ no un formato
 *
 * ⚠️ Andreani y Correo Argentino ⛔ no publican un formato estable, y este repo ⛔ **no midió
 * ninguno**: los dos únicos códigos que existen en la base son de prueba. Un regex inventado
 * rechazaría códigos buenos —que es peor que aceptar uno malo, porque deja a alguien sin poder
 * cargar lo que tiene en la mano— ⇒ acá va **el piso que ningún código real puede no cumplir**, y
 * nada más. El día que haya veinte códigos de verdad se mide y se aprieta.
 *
 * ⛔ **Vaciarlo es legítimo y ⛔ no se frena**: se carga el equivocado, se borra, se pone el bueno.
 *
 * Archivo `.core.js` porque lo tiene que aplicar **el servidor** —una pantalla que valida es una
 * sugerencia, ⛔ no una regla, y este módulo ya lo pagó tres veces— y `api/*.js` ⛔ no puede
 * importar TypeScript.
 */

/** Cuántos caracteres útiles tiene, como mínimo, un código de correo o de Andreani. */
export const MINIMO_DEL_SEGUIMIENTO = 8;

/**
 * ¿Esto puede ser un código de seguimiento?
 *
 * Devuelve `{ ok: true, codigo }` con el código limpio (`null` si se está vaciando), o
 * `{ ok: false, error }` con el motivo **en criollo y diciendo qué se rompe**, ⛔ no «formato
 * inválido»: quien lo lee tiene el paquete adelante y necesita saber si el problema es suyo.
 */
export function leerSeguimiento(entrada) {
  const limpio = typeof entrada === 'string' ? entrada.trim() : entrada == null ? '' : String(entrada).trim();
  if (!limpio) return { ok: true, codigo: null };

  const utiles = (limpio.match(/[a-z0-9]/gi) || []).length;
  if (utiles < MINIMO_DEL_SEGUIMIENTO) {
    return {
      ok: false,
      error: `«${limpio}» ⛔ no parece un código de seguimiento: los de Andreani y Correo tienen al menos ${MINIMO_DEL_SEGUIMIENTO} caracteres. Con un código mal cargado el reclamo pasa a «en camino» y el aviso deja de apurarnos a nosotros.`,
    };
  }
  if (/[^a-z0-9 \-]/i.test(limpio)) {
    return {
      ok: false,
      error: `«${limpio}» tiene caracteres que un código de seguimiento ⛔ no lleva: van letras, números y guiones. Si lo copiaste de un mail, puede haberse venido pegado algo más.`,
    };
  }
  return { ok: true, codigo: limpio };
}
