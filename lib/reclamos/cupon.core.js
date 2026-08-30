/**
 * **El cupón del reclamo: su vencimiento, y por qué es obligatorio.**
 *
 * # Por qué existe
 *
 * `cupon-emitido` exigía **el código** desde el 25-ago-2026 —lo único que prueba que el cupón se
 * creó de verdad en la tienda— y ⛔ nada más. O sea que el módulo prometía *«te dejamos un cupón»*
 * sin saber **hasta cuándo**, y el que se entera de que venció es el cliente, en la caja, en su
 * próxima compra. Un cupón sin fecha ⛔ no es un cupón: es una discusión postergada.
 *
 * 🔑 **Y sin fecha ⛔ no se puede medir el argumento con el que se elige el cupón sobre la plata.**
 * El cupón conviene porque ⛔ no hay salida de caja, se gasta a precio de lista, y una parte ⛔ no
 * se usa nunca (*breakage*). **El breakage ⛔ no existe sin vencimiento**: sin fecha, un cupón sin
 * usar ⛔ no está perdido, está pendiente para siempre — y la cuenta ⛔ no cierra nunca.
 * ▶️ **Cuánto vale y cuánto dura sigue siendo decisión de Bruno (B6)**: acá ⛔ no hay ningún plazo
 * por default, justamente para ⛔ no inventar política. Lo que hay es que **la fecha ⛔ no puede
 * faltar**.
 *
 * ⛔ **Éste ⛔ no es el cupón de `components/cupones/`**, y ⛔ no se conecta. Aquél lo aplica una
 * persona en el mostrador al cobrar; éste se usa **online**, en la tienda, y lo crea a mano
 * Administración. Son dos instrumentos, y mezclarlos es prometerle al cliente un cupón que ⛔ no va
 * a poder usar.
 *
 * Archivo `.core.js` porque lo aplica **el servidor** —una pantalla que valida es una sugerencia,
 * ⛔ no una regla, y este módulo ya lo pagó cuatro veces— y `api/*.js` ⛔ no puede importar
 * TypeScript.
 */

/** A partir de cuántos años una fecha deja de ser un plazo y pasa a ser un error de tipeo. */
export const ANIOS_ABSURDOS = 5;

const DOS = (n) => String(n).padStart(2, '0');

/** `2026-09-30` → `30/09/2026`, que es como se lee acá y como se le escribe al cliente. */
export function vencimientoEnCriollo(iso) {
  if (typeof iso !== 'string') return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * ¿Esto puede ser el vencimiento de un cupón?
 *
 * Devuelve `{ ok: true, fecha }` con la fecha normalizada a `aaaa-mm-dd` —que es como la guarda la
 * columna `date`— o `{ ok: false, error }` **en criollo y diciendo qué se rompe**.
 *
 * Acepta `dd/mm/aaaa`, `dd-mm-aaaa` y `aaaa-mm-dd`: la primera es como se escribe una fecha acá, y
 * la última es la que sale de un `<input type="date">` y de la propia base.
 *
 * 🔴 **Una fecha ya pasada se rechaza, y ⛔ no es un capricho de formato**: emitir un cupón vencido
 * es mandarle al cliente un código que ⛔ no anda, con un mensaje que dice que sí. Es el mismo
 * defecto que el código inventado, un paso más adelante.
 *
 * ⚠️ **El tope de {@link ANIOS_ABSURDOS} ⛔ no es política: es un guard de TIPEO.** Un año mal
 * tecleado (2062 por 2026) pasa todas las demás validaciones y le promete al cliente treinta y seis
 * años. Cuánto **debe** durar un cupón lo decide Bruno, y acá ⛔ no hay ningún default.
 */
export function leerVencimiento(entrada, hoy = new Date()) {
  const limpio = typeof entrada === 'string' ? entrada.trim() : entrada == null ? '' : String(entrada).trim();
  if (!limpio) {
    return { ok: false, error: 'Falta hasta cuándo vale el cupón. Sin fecha ⛔ no se sabe qué se le prometió, y el que se entera de que venció es el cliente en la caja.' };
  }

  let anio, mes, dia;
  const iso = limpio.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const criollo = limpio.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (iso) [, anio, mes, dia] = iso;
  else if (criollo) [, dia, mes, anio] = criollo;
  else {
    return { ok: false, error: `«${limpio}» ⛔ no es una fecha: va dd/mm/aaaa (por ejemplo 30/09/2026).` };
  }

  const fecha = `${anio}-${DOS(Number(mes))}-${DOS(Number(dia))}`;
  const d = new Date(`${fecha}T00:00:00`);
  // 🔑 El round-trip es el oráculo: `new Date` acomoda solo el 31 de febrero, así que compararlo
  // contra lo que se escribió es lo único que caza un día que ⛔ no existe.
  const vuelta = `${d.getFullYear()}-${DOS(d.getMonth() + 1)}-${DOS(d.getDate())}`;
  if (isNaN(d.getTime()) || vuelta !== fecha) {
    return { ok: false, error: `«${limpio}» ⛔ no es un día que exista.` };
  }

  const hoyISO = `${hoy.getFullYear()}-${DOS(hoy.getMonth() + 1)}-${DOS(hoy.getDate())}`;
  if (fecha < hoyISO) {
    return { ok: false, error: `El ${vencimientoEnCriollo(fecha)} ya pasó: un cupón vencido es un código que ⛔ no anda, con un mensaje que dice que sí.` };
  }
  if (Number(anio) - hoy.getFullYear() > ANIOS_ABSURDOS) {
    return { ok: false, error: `${anio} está a más de ${ANIOS_ABSURDOS} años: ¿el año quedó mal tipeado?` };
  }
  return { ok: true, fecha };
}
